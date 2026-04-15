from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import io
import logging

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual, solo_admin, puede_horarios

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/catalogos", tags=["catalogos"])

def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)

# ── Modelos ────────────────────────────────────────────────────────────────────

class ProgramaOut(BaseModel):
    id: int
    nombre: str
    codigo: str
    nivel: str
    razon_social: str
    plan: str
    costo_hora: float
    activo: bool

class MateriaCreate(BaseModel):
    nombre: str
    programa_id: int
    semestre: Optional[str] = None

class MateriaOut(MateriaCreate):
    id: int
    activa: bool

class AsignacionCreate(BaseModel):
    docente_id:    int
    materia_id:    int
    grupo:         Optional[str]  = None
    horas_semana:  float
    modalidad:     str = "presencial"
    costo_hora:    Optional[float] = None  # None = usa tarifa del programa
    ciclo:         str
    vigente_desde: Optional[str]  = None   # ISO date, default = hoy

class AsignacionOut(AsignacionCreate):
    id: int
    activa: bool
    # campos derivados para conveniencia
    docente_nombre: Optional[str] = None
    materia_nombre: Optional[str] = None
    programa_nombre: Optional[str] = None

class HorarioCreate(BaseModel):
    asignacion_id: int
    dia_semana:    str   # 'lunes', 'martes', etc.
    hora_inicio:   str   # "08:00"
    hora_fin:      str   # "10:00"
    horas_bloque:  float

class HorarioOut(HorarioCreate):
    id: int
    activo: bool

class CargaHorariosResultado(BaseModel):
    total: int
    insertados: int
    actualizados: int
    errores: int
    detalle_errores: List[str] = []

# ── PROGRAMAS ──────────────────────────────────────────────────────────────────

@router.get("/programas", response_model=List[ProgramaOut])
async def listar_programas(_: UsuarioActual = Depends(get_usuario_actual)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM programas WHERE activo = true ORDER BY nombre")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [ProgramaOut(**r) for r in rows]

@router.patch("/programas/{programa_id}/tarifa")
async def actualizar_tarifa(
    programa_id: int,
    costo_hora: float,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Solo director_cap_humano puede cambiar tarifas."""
    if usuario.rol not in ("director_cap_humano", "finanzas", "superadmin"):
        raise HTTPException(status_code=403, detail="Solo Finanzas o el Director de Capital Humano pueden cambiar tarifas")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE programas SET costo_hora = %s WHERE id = %s RETURNING id, nombre, costo_hora",
        (costo_hora, programa_id)
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    return row

# ── MATERIAS ───────────────────────────────────────────────────────────────────

@router.get("/materias", response_model=List[MateriaOut])
async def listar_materias(
    programa_id: Optional[int] = None,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    conn = get_conn()
    cur = conn.cursor()
    if programa_id:
        cur.execute("SELECT * FROM materias WHERE programa_id = %s AND activa = true ORDER BY nombre", (programa_id,))
    else:
        cur.execute("SELECT * FROM materias WHERE activa = true ORDER BY nombre")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [MateriaOut(**r) for r in rows]

@router.post("/materias", response_model=MateriaOut, status_code=201)
async def crear_materia(
    body: MateriaCreate,
    _: UsuarioActual = Depends(puede_horarios)
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO materias (nombre, programa_id, semestre) VALUES (%s,%s,%s) RETURNING *",
        (body.nombre, body.programa_id, body.semestre)
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return MateriaOut(**row)

# ── ASIGNACIONES ───────────────────────────────────────────────────────────────

@router.get("/asignaciones", response_model=List[AsignacionOut])
async def listar_asignaciones(
    docente_id: Optional[int] = None,
    ciclo:      Optional[str] = None,
    activa:     bool = True,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            a.id,
            a.docente_id,
            a.materia_id,
            a.grupo,
            a.horas_semana,
            a.modalidad,
            a.costo_hora,
            a.ciclo_label   AS ciclo,
            a.vigente_desde,
            a.vigente_hasta,
            a.activa,
            d.nombre_completo AS docente_nombre,
            m.nombre          AS materia_nombre,
            p.nombre          AS programa_nombre
        FROM asignaciones a
        JOIN docentes d  ON a.docente_id  = d.id
        JOIN materias m  ON a.materia_id  = m.id
        JOIN programas p ON m.programa_id = p.id
        WHERE a.activa = %s
          AND (%s IS NULL OR a.docente_id = %s)
          AND (%s IS NULL OR a.ciclo_label = %s)
        ORDER BY d.nombre_completo, p.nombre
    """, (activa, docente_id, docente_id, ciclo, ciclo))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [AsignacionOut(**r) for r in rows]

@router.post("/asignaciones", response_model=AsignacionOut, status_code=201)
async def crear_asignacion(
    body: AsignacionCreate,
    _: UsuarioActual = Depends(puede_horarios)
):
    from datetime import date
    vigente = body.vigente_desde or str(date.today())
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO asignaciones
                (docente_id, materia_id, grupo, horas_semana, modalidad, costo_hora, ciclo_label, vigente_desde)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING *
        """, (body.docente_id, body.materia_id, body.grupo, body.horas_semana,
              body.modalidad, body.costo_hora, body.ciclo, vigente))
        row = cur.fetchone()
        conn.commit()
    except psycopg2.Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cur.close()
        conn.close()
    return AsignacionOut(**row)

@router.delete("/asignaciones/{asignacion_id}")
async def desactivar_asignacion(
    asignacion_id: int,
    _: UsuarioActual = Depends(puede_horarios)
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE asignaciones SET activa = false WHERE id = %s RETURNING id", (asignacion_id,))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    return {"mensaje": "Asignación desactivada"}

# ── HORARIOS ───────────────────────────────────────────────────────────────────

@router.get("/asignaciones/por-programa")
async def asignaciones_por_programa(
    programa_id: Optional[int] = None,
    ciclo:       Optional[str] = None,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    """Retorna asignaciones agrupadas por docente (con todos sus bloques), para la vista de horarios."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            a.id AS asignacion_id, a.grupo, a.horas_semana, a.modalidad, a.ciclo_label AS ciclo,
            COALESCE(a.costo_hora, p.costo_hora) AS tarifa,
            d.id AS docente_id, d.nombre_completo AS docente_nombre,
            m.id AS materia_id, m.nombre AS materia_nombre,
            p.id AS programa_id, p.nombre AS programa_nombre,
            hc.id AS bloque_id, hc.dia_semana, hc.hora_inicio, hc.hora_fin, hc.horas_bloque
        FROM asignaciones a
        JOIN docentes  d  ON a.docente_id  = d.id
        JOIN materias  m  ON a.materia_id  = m.id
        JOIN programas p  ON m.programa_id = p.id
        LEFT JOIN horario_clases hc ON hc.asignacion_id = a.id AND hc.activo = true
        WHERE a.activa = true
          AND (%s IS NULL OR p.id = %s)
          AND (%s IS NULL OR a.ciclo_label = %s)
        ORDER BY d.nombre_completo, p.nombre, a.grupo, hc.dia_semana, hc.hora_inicio
    """, (programa_id, programa_id, ciclo, ciclo))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    # Agrupar por docente+programa → grupos → bloques
    from collections import defaultdict, OrderedDict
    docentes = OrderedDict()
    for r in rows:
        dk = (r['docente_id'], r['programa_id'])
        if dk not in docentes:
            docentes[dk] = {
                'docente_id':      r['docente_id'],
                'docente_nombre':  r['docente_nombre'],
                'programa_id':     r['programa_id'],
                'programa_nombre': r['programa_nombre'],
                'grupos': OrderedDict(),
            }
        d = docentes[dk]
        ak = r['asignacion_id']
        if ak not in d['grupos']:
            d['grupos'][ak] = {
                'asignacion_id': r['asignacion_id'],
                'grupo':        r['grupo'],
                'materia':      r['materia_nombre'],
                'horas_semana': float(r['horas_semana'] or 0),
                'modalidad':    r['modalidad'],
                'tarifa':       float(r['tarifa'] or 0),
                'ciclo':        r['ciclo'],
                'bloques': [],
            }
        if r['bloque_id']:
            d['grupos'][ak]['bloques'].append({
                'id':           r['bloque_id'],
                'dia':          r['dia_semana'],
                'inicio':       str(r['hora_inicio'])[:5],
                'fin':          str(r['hora_fin'])[:5],
                'horas_bloque': float(r['horas_bloque'] or 0),
            })

    result = []
    for dk, d in docentes.items():
        grupos_list = list(d['grupos'].values())
        total_h = sum(g['horas_semana'] for g in grupos_list)
        result.append({
            'docente_id':      d['docente_id'],
            'docente_nombre':  d['docente_nombre'],
            'programa_id':     d['programa_id'],
            'programa_nombre': d['programa_nombre'],
            'total_horas_semana': total_h,
            'grupos': grupos_list,
        })
    return result


@router.delete("/horarios/{horario_id}")
async def desactivar_horario(
    horario_id: int,
    _: UsuarioActual = Depends(puede_horarios)
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE horario_clases SET activo = false WHERE id = %s RETURNING id", (horario_id,))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Bloque no encontrado")
    return {"mensaje": "Bloque eliminado"}


@router.get("/asignaciones/{asignacion_id}/horarios", response_model=List[HorarioOut])
async def listar_horarios(
    asignacion_id: int,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM horario_clases WHERE asignacion_id = %s AND activo = true ORDER BY dia_semana, hora_inicio",
        (asignacion_id,)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [HorarioOut(**r) for r in rows]

@router.post("/horarios", response_model=HorarioOut, status_code=201)
async def crear_horario(
    body: HorarioCreate,
    _: UsuarioActual = Depends(puede_horarios)
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO horario_clases
            (asignacion_id, dia_semana, hora_inicio, hora_fin, horas_bloque)
        VALUES (%s,%s,%s,%s,%s)
        RETURNING *
    """, (body.asignacion_id, body.dia_semana, body.hora_inicio,
          body.hora_fin, body.horas_bloque))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return HorarioOut(**row)

@router.post("/horarios/carga-masiva", response_model=CargaHorariosResultado)
async def carga_masiva_horarios(
    ciclo: str,
    file: UploadFile = File(...),
    usuario: UsuarioActual = Depends(puede_horarios)
):
    """
    Carga asignaciones y horarios desde el Excel de eStudy / CENTRO HORARIO.
    Formato esperado: ÁREA ACADÉMICA | Semestre | Materia | DOCENTE |
                      No. de horas | [L][M][MX][J][V][S] por fecha...
    """
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl no instalado")

    contenido = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contenido), data_only=True)
        ws = wb.active
    except Exception:
        raise HTTPException(status_code=400, detail="Archivo Excel inválido")

    insertados = actualizados = errores = 0
    detalle_errores = []

    conn = get_conn()
    cur = conn.cursor()

    # Leer encabezados de días desde la fila 1 (columna 6 en adelante)
    dias_map = {"L": "lunes", "M": "martes", "MX": "miercoles",
                "J": "jueves", "V": "viernes", "S": "sabado"}

    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row or not row[3]:  # sin docente
            continue
        try:
            programa_nombre = str(row[0]).strip() if row[0] else None
            semestre        = str(row[1]).strip() if row[1] else None
            materia_nombre  = str(row[2]).strip() if row[2] else None
            docente_nombre  = str(row[3]).strip() if row[3] else None
            horas_semana    = float(row[4]) if row[4] else 0

            if not (programa_nombre and materia_nombre and docente_nombre):
                continue

            # Buscar docente por nombre (búsqueda parcial)
            cur.execute(
                "SELECT id FROM docentes WHERE nombre_completo ILIKE %s AND activo = true LIMIT 1",
                (f"%{docente_nombre[:20]}%",)
            )
            doc = cur.fetchone()
            if not doc:
                errores += 1
                detalle_errores.append(f"Fila {i}: docente no encontrado '{docente_nombre[:40]}'")
                continue

            # Buscar programa
            cur.execute(
                "SELECT id FROM programas WHERE nombre ILIKE %s AND activo = true LIMIT 1",
                (f"%{programa_nombre[:15]}%",)
            )
            prog = cur.fetchone()
            if not prog:
                errores += 1
                detalle_errores.append(f"Fila {i}: programa no encontrado '{programa_nombre[:30]}'")
                continue

            # Buscar o crear materia
            cur.execute(
                "SELECT id FROM materias WHERE nombre ILIKE %s AND programa_id = %s LIMIT 1",
                (f"%{materia_nombre[:30]}%", prog["id"])
            )
            mat = cur.fetchone()
            if not mat:
                cur.execute(
                    "INSERT INTO materias (nombre, programa_id, semestre) VALUES (%s,%s,%s) RETURNING id",
                    (materia_nombre, prog["id"], semestre)
                )
                mat = cur.fetchone()

            # Crear o actualizar asignación
            cur.execute("""
                INSERT INTO asignaciones (docente_id, materia_id, grupo, horas_semana, ciclo_label, modificado_por)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT DO NOTHING
                RETURNING id, (xmax = 0) AS es_insert
            """, (doc["id"], mat["id"], semestre, horas_semana, ciclo, usuario.id))
            asig = cur.fetchone()

            if asig:
                if asig["es_insert"]:
                    insertados += 1
                else:
                    actualizados += 1
            else:
                # Ya existía, buscar id
                cur.execute(
                    "SELECT id FROM asignaciones WHERE docente_id=%s AND materia_id=%s AND ciclo_label=%s",
                    (doc["id"], mat["id"], ciclo)
                )
                asig = cur.fetchone()
                actualizados += 1

        except Exception as e:
            errores += 1
            detalle_errores.append(f"Fila {i}: {str(e)[:100]}")
            logger.warning(f"Error carga horarios fila {i}: {e}")

    conn.commit()
    cur.close()
    conn.close()

    return CargaHorariosResultado(
        total=insertados + actualizados + errores,
        insertados=insertados,
        actualizados=actualizados,
        errores=errores,
        detalle_errores=detalle_errores
    )

# ── CONFIG ASISTENCIA ─────────────────────────────────────────────────────────

class ConfigAsistenciaOut(BaseModel):
    id: int
    tolerancia_entrada_min: int
    max_tolerancia_salida_min: int
    minutos_falta: int
    retardos_por_falta: int
    politica_retardo: Optional[str] = 'tres_retardos_falta'

class ConfigAsistenciaUpdate(BaseModel):
    tolerancia_entrada_min:    Optional[int] = None
    max_tolerancia_salida_min: Optional[int] = None
    politica_retardo:          Optional[str] = None
    minutos_falta:             Optional[int] = None
    retardos_por_falta:        Optional[int] = None

# ── HORARIOS POR GRUPO ─────────────────────────────────────────────────────────

@router.get("/grupos-lista")
async def grupos_lista(
    programa_id:  Optional[int] = None,
    ciclo_label:  Optional[str] = None,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    """Lista todos los grupos activos, con su programa. Usado para el selector en la vista Por Grupo."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT a.grupo,
               p.id   AS programa_id,
               p.nombre AS programa_nombre,
               p.codigo AS programa_codigo
        FROM asignaciones a
        JOIN materias  m ON a.materia_id  = m.id
        JOIN programas p ON m.programa_id = p.id
        WHERE a.activa = true
          AND (%s IS NULL OR p.id = %s)
          AND (%s IS NULL OR a.ciclo_label = %s)
          AND a.grupo IS NOT NULL AND a.grupo <> ''
        ORDER BY p.nombre, a.grupo
    """, (programa_id, programa_id, ciclo_label, ciclo_label))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/horarios/por-grupo")
async def horarios_por_grupo(
    grupo:       str,
    ciclo_label: Optional[str] = None,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    """Devuelve todas las asignaciones + bloques de un grupo específico para la grilla semanal."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            a.id            AS asignacion_id,
            a.grupo,
            a.horas_semana,
            m.nombre        AS materia,
            d.id            AS docente_id,
            d.nombre_completo AS docente,
            p.id            AS programa_id,
            p.nombre        AS programa,
            p.codigo        AS programa_codigo,
            hc.id           AS bloque_id,
            hc.dia_semana,
            hc.hora_inicio,
            hc.hora_fin,
            hc.horas_bloque
        FROM asignaciones a
        JOIN materias  m  ON a.materia_id  = m.id
        JOIN programas p  ON m.programa_id = p.id
        JOIN docentes  d  ON a.docente_id  = d.id
        LEFT JOIN horario_clases hc ON hc.asignacion_id = a.id AND hc.activo = true
        WHERE a.activa = true
          AND a.grupo = %s
          AND (%s IS NULL OR a.ciclo_label = %s)
        ORDER BY hc.dia_semana, hc.hora_inicio
    """, (grupo, ciclo_label, ciclo_label))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    from collections import OrderedDict
    asigs = OrderedDict()
    for r in rows:
        ak = r['asignacion_id']
        if ak not in asigs:
            asigs[ak] = {
                'asignacion_id': r['asignacion_id'],
                'materia':       r['materia'],
                'docente':       r['docente'],
                'docente_id':    r['docente_id'],
                'programa':      r['programa'],
                'programa_id':   r['programa_id'],
                'programa_codigo': r['programa_codigo'],
                'horas_semana':  float(r['horas_semana'] or 0),
                'bloques': [],
            }
        if r['bloque_id']:
            asigs[ak]['bloques'].append({
                'id':    r['bloque_id'],
                'dia':   r['dia_semana'],
                'inicio': str(r['hora_inicio'])[:5],
                'fin':    str(r['hora_fin'])[:5],
                'horas':  float(r['horas_bloque'] or 0),
            })
    return list(asigs.values())


@router.delete("/grupos")
async def eliminar_grupo(
    grupo:       str,
    ciclo_label: Optional[str] = None,
    usuario: UsuarioActual = Depends(puede_horarios)
):
    """Desactiva todas las asignaciones de un grupo (eliminación lógica)."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE asignaciones SET activa = false
        WHERE grupo = %s AND (%s IS NULL OR ciclo_label = %s)
    """, (grupo, ciclo_label, ciclo_label))
    affected = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return {"eliminadas": affected}


@router.patch("/grupos/renombrar")
async def renombrar_grupo(
    grupo_actual: str,
    grupo_nuevo:  str,
    ciclo_label:  Optional[str] = None,
    usuario: UsuarioActual = Depends(puede_horarios)
):
    """Renombra un grupo en todas sus asignaciones activas."""
    if not grupo_nuevo.strip():
        raise HTTPException(status_code=400, detail="El nombre nuevo no puede estar vacío")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE asignaciones SET grupo = %s
        WHERE grupo = %s AND activa = true
          AND (%s IS NULL OR ciclo_label = %s)
    """, (grupo_nuevo.strip(), grupo_actual, ciclo_label, ciclo_label))
    affected = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return {"actualizadas": affected}


# ── CONFIGURACIÓN DE ASISTENCIA ────────────────────────────────────────────────

@router.get("/config-asistencia", response_model=ConfigAsistenciaOut)
async def get_config_asistencia(_: UsuarioActual = Depends(get_usuario_actual)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM config_asistencia ORDER BY id LIMIT 1")
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")
    return ConfigAsistenciaOut(**row)

@router.patch("/config-asistencia", response_model=ConfigAsistenciaOut)
async def actualizar_config_asistencia(
    body: ConfigAsistenciaUpdate,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    if usuario.rol not in ("director_cap_humano", "cap_humano", "superadmin"):
        raise HTTPException(status_code=403, detail="Sin permiso para modificar configuración")
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="Sin campos para actualizar")
    updates["modificado_en"] = datetime.now()
    updates["modificado_por"] = usuario.id
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values())
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        f"UPDATE config_asistencia SET {set_clause} WHERE id = (SELECT MIN(id) FROM config_asistencia) RETURNING *",
        values
    )
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return ConfigAsistenciaOut(**row)
