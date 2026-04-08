"""
routers/portal.py
Endpoints del portal de autoservicio para docentes y trabajadores.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/portal", tags=["portal"])


def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)


def _solo_docente(usuario: UsuarioActual = Depends(get_usuario_actual)) -> UsuarioActual:
    if usuario.rol not in ("docente", "superadmin"):
        raise HTTPException(status_code=403, detail="Solo docentes")
    if usuario.rol == "docente" and not usuario.docente_id:
        raise HTTPException(status_code=403, detail="Usuario docente sin perfil asociado")
    return usuario


def _solo_trabajador(usuario: UsuarioActual = Depends(get_usuario_actual)) -> UsuarioActual:
    if usuario.rol not in ("trabajador", "superadmin"):
        raise HTTPException(status_code=403, detail="Solo trabajadores")
    if usuario.rol == "trabajador" and not usuario.trabajador_id:
        raise HTTPException(status_code=403, detail="Usuario trabajador sin perfil asociado")
    return usuario


# ── Mi Nómina (docente) ────────────────────────────────────────────────────────

@router.get("/mi-nomina")
async def mi_nomina(usuario: UsuarioActual = Depends(_solo_docente)):
    """Lista de quincenas del docente con resumen fiscal."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
                nq.id, nq.quincena_id, q.fecha_inicio, q.fecha_fin, q.estado AS quincena_estado,
                nq.horas_programadas, nq.horas_presenciales, nq.horas_virtuales,
                nq.horas_suplencia, nq.horas_reales,
                nq.honorarios, nq.iva, nq.sub_total,
                nq.retencion_isr, nq.retencion_iva,
                nq.total_a_pagar, nq.ajustes, nq.total_final,
                nq.estado AS nomina_estado
            FROM nomina_quincena nq
            JOIN quincenas q ON q.id = nq.quincena_id
            WHERE nq.docente_id = %s
            ORDER BY q.fecha_inicio DESC
        """, (usuario.docente_id,))
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        cur.close()
        conn.close()


@router.get("/mi-nomina/{quincena_id}")
async def mi_nomina_detalle(
    quincena_id: int,
    usuario: UsuarioActual = Depends(_solo_docente)
):
    """Detalle fiscal completo de una quincena específica."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
                nq.*, q.fecha_inicio, q.fecha_fin, q.ciclo,
                d.nombre_completo, d.numero_docente
            FROM nomina_quincena nq
            JOIN quincenas q ON q.id = nq.quincena_id
            JOIN docentes d  ON d.id  = nq.docente_id
            WHERE nq.docente_id = %s AND nq.quincena_id = %s
        """, (usuario.docente_id, quincena_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Nómina no encontrada")

        # Detalle por programa
        cur.execute("""
            SELECT ndp.*, p.nombre AS programa_nombre
            FROM nomina_detalle_programa ndp
            JOIN programas p ON p.id = ndp.programa_id
            WHERE ndp.nomina_id = %s
            ORDER BY p.nombre
        """, (row["id"],))
        detalle = [dict(r) for r in cur.fetchall()]

        result = dict(row)
        result["detalle_programas"] = detalle
        return result
    finally:
        cur.close()
        conn.close()


# ── Mis Checadas (docente) ─────────────────────────────────────────────────────

@router.get("/mis-checadas")
async def mis_checadas(
    quincena_id: Optional[int] = None,
    usuario: UsuarioActual = Depends(_solo_docente)
):
    """Checadas propias del docente, filtradas opcionalmente por quincena."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT chec_id FROM docentes WHERE id = %s", (usuario.docente_id,))
        doc = cur.fetchone()
        if not doc or not doc["chec_id"]:
            return []

        if quincena_id:
            cur.execute(
                "SELECT fecha_inicio, fecha_fin FROM quincenas WHERE id = %s",
                (quincena_id,)
            )
            q = cur.fetchone()
            if not q:
                raise HTTPException(status_code=404, detail="Quincena no encontrada")
            fecha_ini, fecha_fin = q["fecha_inicio"], q["fecha_fin"]
        else:
            cur.execute("""
                SELECT fecha_inicio, fecha_fin FROM quincenas
                WHERE estado IN ('abierta', 'en_revision')
                ORDER BY fecha_inicio DESC LIMIT 1
            """)
            q = cur.fetchone()
            if not q:
                return []
            fecha_ini, fecha_fin = q["fecha_inicio"], q["fecha_fin"]

        cur.execute("""
            SELECT
                id,
                DATE(timestamp_checada)         AS fecha,
                TO_CHAR(timestamp_checada, 'Dy') AS dia_semana,
                timestamp_checada::time          AS hora,
                tipo_punch,
                estado
            FROM asistencias_checadas
            WHERE user_id = %s
              AND timestamp_checada::date BETWEEN %s AND %s
            ORDER BY timestamp_checada
        """, (doc["chec_id"], fecha_ini, fecha_fin))

        por_fecha = {}
        for r in cur.fetchall():
            f = str(r["fecha"])
            if f not in por_fecha:
                por_fecha[f] = {"fecha": f, "dia_semana": r["dia_semana"],
                                "entrada": None, "salida": None, "extras": []}
            if r["tipo_punch"] == 0 and not por_fecha[f]["entrada"]:
                por_fecha[f]["entrada"] = str(r["hora"])[:5]
            elif r["tipo_punch"] == 1 and not por_fecha[f]["salida"]:
                por_fecha[f]["salida"] = str(r["hora"])[:5]
            else:
                por_fecha[f]["extras"].append(str(r["hora"])[:5])

        return list(por_fecha.values())
    finally:
        cur.close()
        conn.close()


# ── Aclaraciones (docente) ─────────────────────────────────────────────────────

class AclaracionCreate(BaseModel):
    descripcion: str
    fecha_referencia: Optional[date] = None

@router.get("/aclaraciones")
async def mis_aclaraciones(usuario: UsuarioActual = Depends(_solo_docente)):
    """Lista de aclaraciones propias del docente."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT a.id, a.descripcion, a.estado, a.respuesta,
                   a.fecha_referencia, a.creado_en,
                   u.nombre AS atendido_por_nombre
            FROM aclaraciones a
            LEFT JOIN usuarios u ON u.id = a.atendido_por
            WHERE a.docente_id = %s
            ORDER BY a.creado_en DESC
        """, (usuario.docente_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@router.post("/aclaraciones", status_code=201)
async def crear_aclaracion(
    body: AclaracionCreate,
    usuario: UsuarioActual = Depends(_solo_docente)
):
    """Crear una nueva aclaración. Estado inicial: pendiente."""
    if not body.descripcion.strip():
        raise HTTPException(status_code=400, detail="La descripción es requerida")
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO aclaraciones (docente_id, descripcion, estado, fecha_referencia)
            VALUES (%s, %s, 'pendiente', %s)
            RETURNING id, descripcion, estado, respuesta, fecha_referencia, creado_en
        """, (usuario.docente_id, body.descripcion.strip(), body.fecha_referencia))
        row = cur.fetchone()
        conn.commit()
        return dict(row)
    except Exception as e:
        conn.rollback()
        logger.error(f"Error crear_aclaracion: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        cur.close()
        conn.close()


# ── Mi Asistencia (trabajador) ─────────────────────────────────────────────────

@router.get("/mi-asistencia")
async def mi_asistencia(
    periodo_id: Optional[int] = None,
    usuario: UsuarioActual = Depends(_solo_trabajador)
):
    """Checadas del trabajador agrupadas por día para el período seleccionado."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT chec_id FROM trabajadores WHERE id = %s", (usuario.trabajador_id,))
        trab = cur.fetchone()
        if not trab or not trab["chec_id"]:
            return {"resumen": {}, "dias": []}

        if periodo_id:
            cur.execute(
                "SELECT nombre, fecha_inicio, fecha_fin FROM periodos_admin WHERE id = %s",
                (periodo_id,)
            )
            periodo = cur.fetchone()
            if not periodo:
                raise HTTPException(status_code=404, detail="Período no encontrado")
        else:
            cur.execute("""
                SELECT nombre, fecha_inicio, fecha_fin FROM periodos_admin
                WHERE estado = 'abierto'
                ORDER BY fecha_inicio DESC LIMIT 1
            """)
            periodo = cur.fetchone()
            if not periodo:
                return {"resumen": {}, "dias": [], "periodo": None}

        cur.execute("""
            SELECT
                DATE(timestamp_checada)         AS fecha,
                TO_CHAR(timestamp_checada, 'Dy') AS dia_semana,
                timestamp_checada::time          AS hora,
                tipo_punch
            FROM asistencias_checadas
            WHERE user_id = %s
              AND timestamp_checada::date BETWEEN %s AND %s
            ORDER BY timestamp_checada
        """, (trab["chec_id"], periodo["fecha_inicio"], periodo["fecha_fin"]))

        por_fecha = {}
        for r in cur.fetchall():
            f = str(r["fecha"])
            if f not in por_fecha:
                por_fecha[f] = {"fecha": f, "dia_semana": r["dia_semana"],
                                "entrada": None, "salida": None}
            if r["tipo_punch"] == 0 and not por_fecha[f]["entrada"]:
                por_fecha[f]["entrada"] = str(r["hora"])[:5]
            elif r["tipo_punch"] == 1 and not por_fecha[f]["salida"]:
                por_fecha[f]["salida"] = str(r["hora"])[:5]

        dias = list(por_fecha.values())
        presentes   = sum(1 for d in dias if d["entrada"] and d["salida"])
        incompletos = sum(1 for d in dias if (d["entrada"] or d["salida"]) and not (d["entrada"] and d["salida"]))

        return {
            "periodo": dict(periodo),
            "resumen": {
                "dias_con_registro": len(dias),
                "presentes":         presentes,
                "incompletos":       incompletos,
            },
            "dias": dias,
        }
    finally:
        cur.close()
        conn.close()


# ── Lista de quincenas disponibles para selector (docente) ────────────────────

@router.get("/quincenas-disponibles")
async def quincenas_disponibles(usuario: UsuarioActual = Depends(_solo_docente)):
    """Lista de quincenas donde el docente tiene nómina registrada."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT q.id, q.fecha_inicio, q.fecha_fin, q.estado, q.ciclo
            FROM quincenas q
            JOIN nomina_quincena nq ON nq.quincena_id = q.id
            WHERE nq.docente_id = %s
            ORDER BY q.fecha_inicio DESC
        """, (usuario.docente_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


# ── Lista de períodos disponibles para selector (trabajador) ──────────────────

@router.get("/periodos-disponibles")
async def periodos_disponibles(usuario: UsuarioActual = Depends(_solo_trabajador)):
    """Lista de períodos admin para el selector del trabajador."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, nombre, fecha_inicio, fecha_fin, estado
            FROM periodos_admin
            ORDER BY fecha_inicio DESC
            LIMIT 20
        """)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()
