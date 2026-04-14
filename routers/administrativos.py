"""
routers/administrativos.py
Módulo de nómina para personal administrativo.

Reglas de asistencia:
  - Entrada válida (sin retardo): checada en [hora_entrada - 2h, hora_entrada + 10min]
  - Retardo: checada de entrada DESPUÉS de (hora_entrada + 10min), pero tiene salida
  - Presente: tiene entrada (puntual o con retardo) Y tiene salida (>= hora_salida - 10min)
  - Falta: ninguna checada en el día programado
  - Incompleto: tiene entrada pero no salida, o viceversa
  - 3 retardos en quincena = 1 día de descuento
  - Descuento/día = sueldo_quincenal / dias_periodo
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from datetime import date, timedelta, datetime

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual, solo_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["administrativos"])

DIAS_SEMANA_NOMBRES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"]
# EXTRACT(DOW): 0=domingo, 1=lunes, 2=martes, 3=miercoles, 4=jueves, 5=viernes, 6=sabado
DOW_TO_COL = {
    0: "domingo",
    1: "lunes",
    2: "martes",
    3: "miercoles",
    4: "jueves",
    5: "viernes",
    6: "sabado",
}


def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)


# ── Modelos ────────────────────────────────────────────────────────────────────

class HorarioBlock(BaseModel):
    lunes:        bool = False
    martes:       bool = False
    miercoles:    bool = False
    jueves:       bool = False
    viernes:      bool = False
    sabado:       bool = False
    domingo:      bool = False
    hora_entrada: str  # "HH:MM"
    hora_salida:  str  # "HH:MM"


class TrabajadorCreate(BaseModel):
    chec_id:          Optional[int] = None
    nombre:           str
    cargo:            Optional[str] = None
    sueldo_quincenal: Decimal
    activo:           bool = True
    horarios:         List[HorarioBlock] = []
    crear_portal:     bool = True
    password_portal:  Optional[str] = None


class TrabajadorUpdate(BaseModel):
    chec_id:          Optional[int] = None
    nombre:           Optional[str] = None
    cargo:            Optional[str] = None
    sueldo_quincenal: Optional[Decimal] = None
    activo:           Optional[bool] = None
    horarios:         Optional[List[HorarioBlock]] = None


class ActivoUpdate(BaseModel):
    activo: bool


class IncidenciaCreate(BaseModel):
    trabajador_id: int
    tipo:          str  # 'falta_justificada' | 'permiso' | 'vacaciones' | 'otro'
    fecha:         date
    descripcion:   Optional[str] = None


# ── Helpers internos ───────────────────────────────────────────────────────────

def _fetch_trabajador_con_horarios(cur, trabajador_id: int) -> Optional[dict]:
    """Devuelve dict de trabajador con lista de bloques de horario."""
    cur.execute(
        "SELECT id, chec_id, nombre, cargo, sueldo_quincenal, activo, creado_en "
        "FROM trabajadores WHERE id = %s",
        (trabajador_id,)
    )
    t = cur.fetchone()
    if not t:
        return None
    t = dict(t)
    cur.execute(
        "SELECT id, lunes, martes, miercoles, jueves, viernes, sabado, domingo, "
        "       hora_entrada::text AS hora_entrada, hora_salida::text AS hora_salida "
        "FROM horarios_trabajador WHERE trabajador_id = %s ORDER BY id",
        (trabajador_id,)
    )
    horarios = cur.fetchall()
    # hora_entrada / hora_salida llegan como HH:MM:SS — recortar a HH:MM
    t["horarios"] = [
        {**dict(h),
         "hora_entrada": str(h["hora_entrada"])[:5],
         "hora_salida":  str(h["hora_salida"])[:5]}
        for h in horarios
    ]
    t["sueldo_quincenal"] = float(t["sueldo_quincenal"])
    return t


def _insert_horarios(cur, trabajador_id: int, horarios: List[HorarioBlock]):
    for h in horarios:
        cur.execute(
            """INSERT INTO horarios_trabajador
               (trabajador_id, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
                hora_entrada, hora_salida)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                trabajador_id,
                h.lunes, h.martes, h.miercoles, h.jueves,
                h.viernes, h.sabado, h.domingo,
                h.hora_entrada, h.hora_salida,
            )
        )


def _calcular_asistencia_trabajador(cur, trabajador: dict, fecha_inicio: date, fecha_fin: date) -> dict:
    """
    Calcula asistencia de un trabajador en el período dado.
    Devuelve dict con dias_periodo, dias_presentes, retardos, faltas, incompletos, dias_descuento.
    Requiere que trabajador tenga 'id', 'chec_id', 'nombre', 'cargo'.
    """
    trabajador_id = trabajador["id"]
    chec_id       = trabajador.get("chec_id")

    # Obtener bloques de horario
    cur.execute(
        "SELECT lunes, martes, miercoles, jueves, viernes, sabado, domingo, "
        "       hora_entrada, hora_salida "
        "FROM horarios_trabajador WHERE trabajador_id = %s",
        (trabajador_id,)
    )
    horarios = [dict(r) for r in cur.fetchall()]

    if not horarios:
        return {
            "trabajador_id":  trabajador_id,
            "nombre":         trabajador["nombre"],
            "cargo":          trabajador.get("cargo"),
            "chec_id":        chec_id,
            "dias_periodo":   0,
            "dias_presentes": 0,
            "retardos":       0,
            "faltas":         0,
            "incompletos":    0,
            "dias_descuento": 0,
        }

    # Generar lista de días programados en el período
    scheduled_days = []
    current = fecha_inicio
    while current <= fecha_fin:
        # EXTRACT(DOW): 0=dom, 1=lun, ... 6=sab
        dow = current.weekday()  # Python: 0=lun ... 6=dom
        # Convertir weekday de Python al nombre de columna
        # Python weekday: 0=lunes,1=martes,2=miercoles,3=jueves,4=viernes,5=sabado,6=domingo
        py_dow_to_col = {
            0: "lunes", 1: "martes", 2: "miercoles", 3: "jueves",
            4: "viernes", 5: "sabado", 6: "domingo"
        }
        col = py_dow_to_col[dow]
        for h in horarios:
            if h[col]:
                scheduled_days.append({
                    "fecha":         current,
                    "col":           col,
                    "hora_entrada":  h["hora_entrada"],
                    "hora_salida":   h["hora_salida"],
                })
        current += timedelta(days=1)

    dias_periodo   = len(scheduled_days)
    dias_presentes = 0
    retardos       = 0
    faltas         = 0
    incompletos    = 0

    # Si no hay chec_id no podemos consultar checadas
    if chec_id is None:
        return {
            "trabajador_id":  trabajador_id,
            "nombre":         trabajador["nombre"],
            "cargo":          trabajador.get("cargo"),
            "chec_id":        None,
            "dias_periodo":   dias_periodo,
            "dias_presentes": 0,
            "retardos":       0,
            "faltas":         dias_periodo,
            "incompletos":    0,
            "dias_descuento": dias_periodo,
        }

    # Cargar todas las checadas del trabajador en el período de una sola vez
    cur.execute(
        """
        SELECT timestamp_checada::date AS fecha_dia,
               timestamp_checada::time AS hora,
               tipo_punch
        FROM asistencias_checadas
        WHERE user_id = %s
          AND timestamp_checada::date >= %s
          AND timestamp_checada::date <= %s
        ORDER BY timestamp_checada
        """,
        (chec_id, fecha_inicio, fecha_fin)
    )
    raw_checadas = cur.fetchall()

    # Agrupar checadas por fecha (con dedup 3 min)
    from collections import defaultdict

    def _hora_seg(t):
        if isinstance(t, timedelta):
            return int(t.total_seconds())
        return t.hour * 3600 + t.minute * 60 + t.second

    def _dedup_horas(horas):
        if not horas:
            return []
        result = [horas[0]]
        for h in horas[1:]:
            if _hora_seg(h) - _hora_seg(result[-1]) >= 180:
                result.append(h)
        return result

    checadas_por_dia = defaultdict(list)
    for c in raw_checadas:
        checadas_por_dia[c["fecha_dia"]].append(c["hora"])
    checadas_por_dia = {k: _dedup_horas(v) for k, v in checadas_por_dia.items()}

    for sd in scheduled_days:
        fecha         = sd["fecha"]
        hora_entrada  = sd["hora_entrada"]
        hora_salida   = sd["hora_salida"]
        checadas_dia  = checadas_por_dia.get(fecha, [])

        if not checadas_dia:
            faltas += 1
            continue

        # Ventanas
        # entrada válida: [hora_entrada - 2h, hora_entrada + 10min]
        # retardo: entrada DESPUÉS de hora_entrada + 10min
        # salida válida: >= hora_salida - 10min

        # Calcular ventana de entrada
        from datetime import datetime as dt
        base_date = date(2000, 1, 1)

        def to_dt(t):
            """Convierte timedelta o time a datetime para aritmética."""
            if isinstance(t, timedelta):
                total_sec = int(t.total_seconds())
                h, rem = divmod(total_sec, 3600)
                m, s = divmod(rem, 60)
                return dt(2000, 1, 1, h, m, s)
            return dt(2000, 1, 1, t.hour, t.minute, t.second)

        entrada_prog = to_dt(hora_entrada)
        salida_prog  = to_dt(hora_salida)
        ventana_entrada_min  = entrada_prog - timedelta(hours=2)
        ventana_entrada_max  = entrada_prog + timedelta(minutes=10)
        ventana_salida_min   = salida_prog  - timedelta(minutes=10)

        checadas_dt = [to_dt(c) for c in checadas_dia]

        # Buscar checada de entrada válida (más temprana dentro de la ventana)
        entradas_validas = [c for c in checadas_dt
                            if ventana_entrada_min <= c <= ventana_entrada_max]
        entradas_tarde   = [c for c in checadas_dt
                            if c > ventana_entrada_max]
        salidas_validas  = [c for c in checadas_dt if c >= ventana_salida_min]

        tiene_entrada_puntual = len(entradas_validas) > 0
        tiene_entrada_tarde   = len(entradas_tarde) > 0 and not tiene_entrada_puntual
        tiene_salida          = len(salidas_validas) > 0

        if tiene_entrada_puntual and tiene_salida:
            dias_presentes += 1
        elif tiene_entrada_tarde and tiene_salida:
            # Retardo pero presente
            dias_presentes += 1
            retardos += 1
        elif tiene_entrada_puntual or tiene_entrada_tarde or tiene_salida:
            # Tiene algo pero incompleto
            incompletos += 1
        else:
            # Checadas fuera de ventana — tratar como falta
            faltas += 1

    dias_descuento = faltas + (retardos // 3)

    return {
        "trabajador_id":  trabajador_id,
        "nombre":         trabajador["nombre"],
        "cargo":          trabajador.get("cargo"),
        "chec_id":        chec_id,
        "dias_periodo":   dias_periodo,
        "dias_presentes": dias_presentes,
        "retardos":       retardos,
        "faltas":         faltas,
        "incompletos":    incompletos,
        "dias_descuento": dias_descuento,
    }


# ── Endpoints: Trabajadores ────────────────────────────────────────────────────

@router.get("/trabajadores")
def listar_trabajadores(
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Devuelve todos los trabajadores con sus bloques de horario."""
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute(
            "SELECT id FROM trabajadores ORDER BY nombre"
        )
        ids = [r["id"] for r in cur.fetchall()]
        result = []
        for tid in ids:
            t = _fetch_trabajador_con_horarios(cur, tid)
            if t:
                result.append(t)
        return result
    except Exception as e:
        logger.error(f"Error listar_trabajadores: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()


@router.post("/trabajadores", status_code=201)
def crear_trabajador(
    body: TrabajadorCreate,
    usuario: UsuarioActual = Depends(solo_admin)
):
    """Crea un trabajador con uno o más bloques de horario."""
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        cur.execute(
            """INSERT INTO trabajadores (chec_id, nombre, cargo, sueldo_quincenal, activo)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING id""",
            (body.chec_id, body.nombre, body.cargo, body.sueldo_quincenal, body.activo)
        )
        row = cur.fetchone()
        nuevo_id = row["id"]

        _insert_horarios(cur, nuevo_id, body.horarios)
        conn.commit()

        # Crear acceso al portal si se solicitó (username = str(chec_id))
        if body.crear_portal and body.chec_id:
            from datetime import datetime as _dt3
            import bcrypt as _bcrypt3
            pwd_portal = body.password_portal or f"IESEF{_dt3.now().year}"
            pwd_hash_portal = _bcrypt3.hashpw(pwd_portal.encode(), _bcrypt3.gensalt(rounds=10)).decode()
            username_trab = str(body.chec_id)
            try:
                cur2 = conn.cursor()
                cur2.execute("""
                    INSERT INTO usuarios (trabajador_id, nombre, email, password_hash, rol,
                                         activo, debe_cambiar_password)
                    VALUES (%s, %s, %s, %s, 'trabajador', true, true)
                    ON CONFLICT (email) DO NOTHING
                """, (row["id"], body.nombre, username_trab, pwd_hash_portal))
                conn.commit()
                cur2.close()
            except Exception as e2:
                logger.warning(f"No se pudo crear usuario portal para trabajador {row['id']}: {e2}")

        result = _fetch_trabajador_con_horarios(cur, nuevo_id)
        return result
    except psycopg2.errors.UniqueViolation:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=409, detail="Ya existe un trabajador con ese chec_id")
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error crear_trabajador: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()


@router.put("/trabajadores/{trabajador_id}")
def actualizar_trabajador(
    trabajador_id: int,
    body: TrabajadorUpdate,
    usuario: UsuarioActual = Depends(solo_admin)
):
    """
    Actualiza campos del trabajador y reemplaza TODOS sus bloques de horario
    si se proporciona la clave 'horarios'.
    """
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        # Verificar existencia
        cur.execute("SELECT id FROM trabajadores WHERE id = %s", (trabajador_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Trabajador no encontrado")

        # Construir SET dinámico solo con campos proporcionados
        campos = {}
        if body.chec_id is not None:
            campos["chec_id"] = body.chec_id
        if body.nombre is not None:
            campos["nombre"] = body.nombre
        if body.cargo is not None:
            campos["cargo"] = body.cargo
        if body.sueldo_quincenal is not None:
            campos["sueldo_quincenal"] = body.sueldo_quincenal
        if body.activo is not None:
            campos["activo"] = body.activo

        if campos:
            set_clause = ", ".join(f"{k} = %s" for k in campos)
            values     = list(campos.values()) + [trabajador_id]
            cur.execute(
                f"UPDATE trabajadores SET {set_clause} WHERE id = %s",
                values
            )

        # Reemplazar horarios si se enviaron
        if body.horarios is not None:
            cur.execute(
                "DELETE FROM horarios_trabajador WHERE trabajador_id = %s",
                (trabajador_id,)
            )
            _insert_horarios(cur, trabajador_id, body.horarios)

        conn.commit()
        result = _fetch_trabajador_con_horarios(cur, trabajador_id)
        return result
    except HTTPException:
        raise
    except psycopg2.errors.UniqueViolation:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=409, detail="Ya existe un trabajador con ese chec_id")
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error actualizar_trabajador: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()


@router.patch("/trabajadores/{trabajador_id}/activo")
def cambiar_activo(
    trabajador_id: int,
    body: ActivoUpdate,
    usuario: UsuarioActual = Depends(solo_admin)
):
    """Activa o desactiva un trabajador."""
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute(
            "UPDATE trabajadores SET activo = %s WHERE id = %s RETURNING id, nombre, activo",
            (body.activo, trabajador_id)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Trabajador no encontrado")
        conn.commit()
        return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error cambiar_activo: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()


# ── Endpoints: Periodos Admin ──────────────────────────────────────────────────

class PeriodoCreate(BaseModel):
    nombre:       str
    fecha_inicio: date
    fecha_fin:    date

@router.get("/periodos")
def listar_periodos(usuario: UsuarioActual = Depends(get_usuario_actual)):
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute("""
            SELECT p.id, p.nombre, p.fecha_inicio, p.fecha_fin, p.estado, p.creado_en,
                   u.nombre AS creado_por_nombre
            FROM periodos_admin p
            LEFT JOIN usuarios u ON u.id = p.creado_por
            ORDER BY p.fecha_inicio DESC
        """)
        return [dict(r) for r in cur.fetchall()]
    finally:
        if conn: conn.close()

@router.post("/periodos", status_code=201)
def crear_periodo(body: PeriodoCreate, usuario: UsuarioActual = Depends(solo_admin)):
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute("""
            INSERT INTO periodos_admin (nombre, fecha_inicio, fecha_fin, creado_por)
            VALUES (%s, %s, %s, %s) RETURNING *
        """, (body.nombre, body.fecha_inicio, body.fecha_fin, usuario.id))
        row = cur.fetchone()
        conn.commit()
        return dict(row)
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()

@router.get("/periodos/{periodo_id}")
def obtener_periodo(periodo_id: int, usuario: UsuarioActual = Depends(get_usuario_actual)):
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute("""
            SELECT p.id, p.nombre, p.fecha_inicio, p.fecha_fin, p.estado, p.creado_en,
                   u.nombre AS creado_por_nombre
            FROM periodos_admin p
            LEFT JOIN usuarios u ON u.id = p.creado_por
            WHERE p.id = %s
        """, (periodo_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Período no encontrado")
        return dict(row)
    finally:
        if conn: conn.close()

@router.patch("/periodos/{periodo_id}/estado")
def cambiar_estado_periodo(
    periodo_id: int,
    estado: str,
    usuario: UsuarioActual = Depends(solo_admin)
):
    if estado not in ('abierto', 'cerrado'):
        raise HTTPException(400, "Estado debe ser 'abierto' o 'cerrado'")
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute(
            "UPDATE periodos_admin SET estado = %s WHERE id = %s RETURNING *",
            (estado, periodo_id)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Periodo no encontrado")
        conn.commit()
        return dict(row)
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()

@router.delete("/periodos/{periodo_id}", status_code=204)
def eliminar_periodo(periodo_id: int, usuario: UsuarioActual = Depends(solo_admin)):
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()
        # Verificar que existe
        cur.execute("SELECT id FROM periodos_admin WHERE id = %s", (periodo_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Período no encontrado")
        # Eliminar en cascada: nomina e incidencias primero
        cur.execute("DELETE FROM nomina_admin_quincena WHERE periodo_id = %s", (periodo_id,))
        cur.execute("DELETE FROM incidencias_admin WHERE periodo_id = %s", (periodo_id,))
        cur.execute("DELETE FROM periodos_admin WHERE id = %s", (periodo_id,))
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        if conn: conn.close()


# ── Endpoints: Asistencia ──────────────────────────────────────────────────────

@router.get("/periodos/{quincena_id}/asistencia")
def asistencia_quincena(
    quincena_id: int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Calcula asistencia de todos los trabajadores activos para la quincena dada.
    Incluye flag 'tiene_nomina' si ya se generó nómina para ese trabajador.
    """
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        # Obtener quincena
        cur.execute(
            "SELECT id, fecha_inicio, fecha_fin FROM periodos_admin WHERE id = %s",
            (quincena_id,)
        )
        q = cur.fetchone()
        if not q:
            raise HTTPException(status_code=404, detail="Periodo no encontrado")

        fecha_inicio = q["fecha_inicio"]
        fecha_fin    = q["fecha_fin"]

        # Trabajadores activos
        cur.execute(
            "SELECT id, chec_id, nombre, cargo, sueldo_quincenal "
            "FROM trabajadores WHERE activo = true ORDER BY nombre"
        )
        trabajadores = [dict(r) for r in cur.fetchall()]

        # IDs con nómina ya generada
        cur.execute(
            "SELECT trabajador_id FROM nomina_admin_quincena WHERE periodo_id = %s",
            (quincena_id,)
        )
        con_nomina = {r["trabajador_id"] for r in cur.fetchall()}

        result = []
        for t in trabajadores:
            asistencia = _calcular_asistencia_trabajador(cur, t, fecha_inicio, fecha_fin)
            asistencia["tiene_nomina"] = t["id"] in con_nomina
            result.append(asistencia)

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error asistencia_quincena: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()


@router.get("/periodos/{quincena_id}/asistencia/{trabajador_id}/detalle")
def asistencia_detalle(
    quincena_id:   int,
    trabajador_id: int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Detalle día a día de asistencia de un trabajador en la quincena.
    """
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        # Quincena
        cur.execute(
            "SELECT id, fecha_inicio, fecha_fin FROM periodos_admin WHERE id = %s",
            (quincena_id,)
        )
        q = cur.fetchone()
        if not q:
            raise HTTPException(status_code=404, detail="Periodo no encontrado")

        fecha_inicio = q["fecha_inicio"]
        fecha_fin    = q["fecha_fin"]

        # Trabajador
        cur.execute(
            "SELECT id, chec_id, nombre, cargo, sueldo_quincenal "
            "FROM trabajadores WHERE id = %s",
            (trabajador_id,)
        )
        t = cur.fetchone()
        if not t:
            raise HTTPException(status_code=404, detail="Trabajador no encontrado")
        t = dict(t)

        # Horarios
        cur.execute(
            "SELECT lunes, martes, miercoles, jueves, viernes, sabado, domingo, "
            "       hora_entrada, hora_salida "
            "FROM horarios_trabajador WHERE trabajador_id = %s",
            (trabajador_id,)
        )
        horarios = [dict(r) for r in cur.fetchall()]

        chec_id = t.get("chec_id")

        # Checadas del período (con dedup 3 min)
        checadas_por_dia = {}
        if chec_id is not None:
            cur.execute(
                """
                SELECT timestamp_checada::date AS fecha_dia,
                       timestamp_checada::time AS hora
                FROM asistencias_checadas
                WHERE user_id = %s
                  AND timestamp_checada::date >= %s
                  AND timestamp_checada::date <= %s
                ORDER BY timestamp_checada
                """,
                (chec_id, fecha_inicio, fecha_fin)
            )
            from collections import defaultdict

            def _det_hora_seg(t):
                if isinstance(t, timedelta):
                    return int(t.total_seconds())
                return t.hour * 3600 + t.minute * 60 + t.second

            def _det_dedup(horas):
                if not horas:
                    return []
                result = [horas[0]]
                for h in horas[1:]:
                    if _det_hora_seg(h) - _det_hora_seg(result[-1]) >= 180:
                        result.append(h)
                return result

            tmp = defaultdict(list)
            for c in cur.fetchall():
                tmp[c["fecha_dia"]].append(c["hora"])
            checadas_por_dia = {k: _det_dedup(v) for k, v in tmp.items()}

        py_dow_to_col = {
            0: "lunes", 1: "martes", 2: "miercoles", 3: "jueves",
            4: "viernes", 5: "sabado", 6: "domingo"
        }

        dias_result    = []
        dias_periodo   = 0
        dias_presentes = 0
        retardos       = 0
        faltas         = 0
        incompletos    = 0

        current = fecha_inicio
        while current <= fecha_fin:
            dow = current.weekday()
            col = py_dow_to_col[dow]

            for h in horarios:
                if not h[col]:
                    continue

                dias_periodo += 1
                hora_entrada = h["hora_entrada"]
                hora_salida  = h["hora_salida"]
                checadas_dia = checadas_por_dia.get(current, [])

                from datetime import datetime as dt

                def to_dt(t_val):
                    if isinstance(t_val, timedelta):
                        total_sec = int(t_val.total_seconds())
                        hh, rem = divmod(total_sec, 3600)
                        mm, ss = divmod(rem, 60)
                        return dt(2000, 1, 1, hh, mm, ss)
                    return dt(2000, 1, 1, t_val.hour, t_val.minute, t_val.second)

                entrada_prog        = to_dt(hora_entrada)
                salida_prog         = to_dt(hora_salida)
                ventana_entrada_min = entrada_prog - timedelta(hours=2)
                ventana_entrada_max = entrada_prog + timedelta(minutes=10)
                ventana_salida_min  = salida_prog  - timedelta(minutes=10)

                checadas_dt = [to_dt(c) for c in checadas_dia]

                entradas_validas = [c for c in checadas_dt
                                    if ventana_entrada_min <= c <= ventana_entrada_max]
                entradas_tarde   = [c for c in checadas_dt
                                    if c > ventana_entrada_max]
                salidas_validas  = [c for c in checadas_dt if c >= ventana_salida_min]

                tiene_entrada_puntual = len(entradas_validas) > 0
                tiene_entrada_tarde   = len(entradas_tarde) > 0 and not tiene_entrada_puntual
                tiene_salida          = len(salidas_validas) > 0

                if not checadas_dia:
                    estado         = "falta"
                    primera_checada = None
                    ultima_checada  = None
                    minutos_tarde   = 0
                    faltas += 1
                elif tiene_entrada_puntual and tiene_salida:
                    estado          = "presente"
                    primera_checada = checadas_dia[0]
                    ultima_checada  = checadas_dia[-1]
                    minutos_tarde   = 0
                    dias_presentes += 1
                elif tiene_entrada_tarde and tiene_salida:
                    estado          = "retardo"
                    primera_checada = checadas_dia[0]
                    ultima_checada  = checadas_dia[-1]
                    retardos += 1
                    dias_presentes += 1
                    # Calcular minutos de retraso
                    primera_dt  = to_dt(checadas_dia[0])
                    diff        = (primera_dt - ventana_entrada_max).total_seconds()
                    minutos_tarde = max(0, int(diff / 60))
                elif tiene_entrada_puntual or tiene_entrada_tarde or tiene_salida:
                    estado          = "incompleto"
                    primera_checada = checadas_dia[0]
                    ultima_checada  = checadas_dia[-1]
                    minutos_tarde   = 0
                    incompletos    += 1
                else:
                    # checadas fuera de toda ventana
                    estado          = "falta"
                    primera_checada = None
                    ultima_checada  = None
                    minutos_tarde   = 0
                    faltas += 1

                # Formatear horas
                def fmt_hora(val):
                    if val is None:
                        return None
                    if isinstance(val, timedelta):
                        total_sec = int(val.total_seconds())
                        hh, rem = divmod(total_sec, 3600)
                        mm, _ = divmod(rem, 60)
                        return f"{hh:02d}:{mm:02d}"
                    return f"{val.hour:02d}:{val.minute:02d}"

                todas_checadas_fmt = [fmt_hora(c) for c in checadas_dia]

                dias_result.append({
                    "fecha":            current.isoformat(),
                    "dia_semana":       col,
                    "hora_entrada_prog": fmt_hora(hora_entrada),
                    "hora_salida_prog":  fmt_hora(hora_salida),
                    "primera_checada":   fmt_hora(primera_checada),
                    "ultima_checada":    fmt_hora(ultima_checada),
                    "todas_checadas":    todas_checadas_fmt,
                    "estado":            estado,
                    "minutos_tarde":     minutos_tarde,
                })

            current += timedelta(days=1)

        dias_descuento = faltas + (retardos // 3)

        return {
            "trabajador_id":     t["id"],
            "nombre":            t["nombre"],
            "cargo":             t.get("cargo"),
            "chec_id":           chec_id,
            "sueldo_quincenal":  float(t["sueldo_quincenal"]),
            "dias": dias_result,
            "resumen": {
                "dias_periodo":   dias_periodo,
                "dias_presentes": dias_presentes,
                "retardos":       retardos,
                "faltas":         faltas,
                "incompletos":    incompletos,
                "dias_descuento": dias_descuento,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error asistencia_detalle: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()


# ── Endpoints: Nómina ──────────────────────────────────────────────────────────

@router.post("/periodos/{quincena_id}/generar_nomina")
def generar_nomina_admin(
    quincena_id: int,
    usuario: UsuarioActual = Depends(solo_admin)
):
    """
    Calcula y hace upsert de nomina_admin_quincena para todos
    los trabajadores activos. Retorna {procesados, errores}.
    """
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        # Quincena
        cur.execute(
            "SELECT id, fecha_inicio, fecha_fin FROM periodos_admin WHERE id = %s",
            (quincena_id,)
        )
        q = cur.fetchone()
        if not q:
            raise HTTPException(status_code=404, detail="Periodo no encontrado")

        fecha_inicio = q["fecha_inicio"]
        fecha_fin    = q["fecha_fin"]

        # Trabajadores activos
        cur.execute(
            "SELECT id, chec_id, nombre, cargo, sueldo_quincenal "
            "FROM trabajadores WHERE activo = true ORDER BY nombre"
        )
        trabajadores = [dict(r) for r in cur.fetchall()]

        procesados = 0
        errores    = 0

        for t in trabajadores:
            try:
                asistencia = _calcular_asistencia_trabajador(cur, t, fecha_inicio, fecha_fin)

                dias_periodo   = asistencia["dias_periodo"]
                dias_presentes = asistencia["dias_presentes"]
                retardos_cnt   = asistencia["retardos"]
                faltas_cnt     = asistencia["faltas"]
                dias_descuento = asistencia["dias_descuento"]
                sueldo_base    = float(t["sueldo_quincenal"])

                if dias_periodo > 0:
                    descuento  = dias_descuento * (sueldo_base / dias_periodo)
                else:
                    descuento  = 0.0

                total_pagar = sueldo_base - descuento

                cur.execute(
                    """
                    INSERT INTO nomina_admin_quincena
                        (trabajador_id, periodo_id, dias_periodo, dias_presentes,
                         retardos, faltas, dias_descuento, sueldo_base,
                         descuento, total_pagar, estado, generado_en, generado_por)
                    VALUES
                        (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'borrador', NOW(), %s)
                    ON CONFLICT (trabajador_id, periodo_id) DO UPDATE SET
                        dias_periodo   = EXCLUDED.dias_periodo,
                        dias_presentes = EXCLUDED.dias_presentes,
                        retardos       = EXCLUDED.retardos,
                        faltas         = EXCLUDED.faltas,
                        dias_descuento = EXCLUDED.dias_descuento,
                        sueldo_base    = EXCLUDED.sueldo_base,
                        descuento      = EXCLUDED.descuento,
                        total_pagar    = EXCLUDED.total_pagar,
                        generado_en    = NOW(),
                        generado_por   = EXCLUDED.generado_por
                    """,
                    (
                        t["id"], quincena_id,
                        dias_periodo, dias_presentes,
                        retardos_cnt, faltas_cnt, dias_descuento,
                        sueldo_base, descuento, total_pagar,
                        usuario.id,
                    )
                )
                procesados += 1
            except Exception as e_inner:
                logger.error(
                    f"Error calculando nomina trabajador {t['id']} ({t['nombre']}): {e_inner}"
                )
                errores += 1

        conn.commit()
        return {"procesados": procesados, "errores": errores}

    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error generar_nomina_admin: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()


@router.get("/periodos/{quincena_id}/nomina")
def obtener_nomina_admin(
    quincena_id: int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Devuelve las filas de nomina_admin_quincena para la quincena indicada,
    unidas con datos del trabajador.
    """
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        cur.execute("SELECT id FROM periodos_admin WHERE id = %s", (quincena_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Periodo no encontrado")

        cur.execute(
            """
            SELECT
                n.id,
                n.trabajador_id,
                t.nombre,
                t.cargo,
                t.chec_id,
                n.dias_periodo,
                n.dias_presentes,
                n.retardos,
                n.faltas,
                n.dias_descuento,
                n.sueldo_base,
                n.descuento,
                n.total_pagar,
                n.estado,
                n.generado_en
            FROM nomina_admin_quincena n
            JOIN trabajadores t ON t.id = n.trabajador_id
            WHERE n.periodo_id = %s
            ORDER BY t.nombre
            """,
            (quincena_id,)
        )
        rows = cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["sueldo_base"]  = float(d["sueldo_base"])
            d["descuento"]    = float(d["descuento"])
            d["total_pagar"]  = float(d["total_pagar"])
            result.append(d)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obtener_nomina_admin: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()


# ── Endpoints: Incidencias ─────────────────────────────────────────────────────

@router.get("/periodos/{quincena_id}/incidencias")
def listar_incidencias_admin(
    quincena_id: int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Devuelve todas las incidencias de la quincena, con nombre de trabajador
    y nombre de quien registró.
    """
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        cur.execute("SELECT id FROM periodos_admin WHERE id = %s", (quincena_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Periodo no encontrado")

        cur.execute(
            """
            SELECT
                i.id,
                i.periodo_id,
                i.trabajador_id,
                t.nombre  AS trabajador_nombre,
                i.tipo,
                i.fecha,
                i.descripcion,
                i.registrado_por,
                u.nombre  AS registrado_por_nombre,
                i.registrado_en
            FROM incidencias_admin i
            JOIN trabajadores t ON t.id = i.trabajador_id
            LEFT JOIN usuarios u ON u.id = i.registrado_por
            WHERE i.periodo_id = %s
            ORDER BY i.fecha, t.nombre
            """,
            (quincena_id,)
        )
        rows = [dict(r) for r in cur.fetchall()]
        # Serializar fecha
        for r in rows:
            if hasattr(r["fecha"], "isoformat"):
                r["fecha"] = r["fecha"].isoformat()
        return rows
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listar_incidencias_admin: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()


@router.post("/periodos/{quincena_id}/incidencias", status_code=201)
def crear_incidencia_admin(
    quincena_id: int,
    body: IncidenciaCreate,
    usuario: UsuarioActual = Depends(solo_admin)
):
    """
    Registra una incidencia para un trabajador en la quincena.
    No requiere aprobación adicional.
    """
    tipos_validos = {"falta_justificada", "permiso", "vacaciones", "otro"}
    if body.tipo not in tipos_validos:
        raise HTTPException(
            status_code=422,
            detail=f"Tipo inválido. Debe ser uno de: {', '.join(sorted(tipos_validos))}"
        )

    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        cur.execute("SELECT id FROM periodos_admin WHERE id = %s", (quincena_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Periodo no encontrado")

        cur.execute("SELECT id FROM trabajadores WHERE id = %s", (body.trabajador_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Trabajador no encontrado")

        cur.execute(
            """
            INSERT INTO incidencias_admin
                (periodo_id, trabajador_id, tipo, fecha, descripcion, registrado_por)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, periodo_id, trabajador_id, tipo, fecha, descripcion,
                      registrado_por, registrado_en
            """,
            (
                quincena_id,
                body.trabajador_id,
                body.tipo,
                body.fecha,
                body.descripcion,
                usuario.id,
            )
        )
        row = dict(cur.fetchone())
        conn.commit()

        if hasattr(row["fecha"], "isoformat"):
            row["fecha"] = row["fecha"].isoformat()

        return row
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error crear_incidencia_admin: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()


@router.delete("/periodos/{quincena_id}/incidencias/{incidencia_id}", status_code=204)
def eliminar_incidencia_admin(
    quincena_id:   int,
    incidencia_id: int,
    usuario: UsuarioActual = Depends(solo_admin)
):
    """Elimina una incidencia por ID dentro de la quincena indicada."""
    conn = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        cur.execute(
            "DELETE FROM incidencias_admin WHERE id = %s AND periodo_id = %s RETURNING id",
            (incidencia_id, quincena_id)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(
                status_code=404,
                detail="Incidencia no encontrada en esta quincena"
            )
        conn.commit()
        return None
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error eliminar_incidencia_admin: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        if conn:
            conn.close()
