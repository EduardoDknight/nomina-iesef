"""
routers/estadisticas.py — Estadísticas e indicadores para administradores y dirección.
"""
from fastapi import APIRouter, Depends
from datetime import datetime, timedelta, timezone
import psycopg2
from psycopg2.extras import RealDictCursor

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual

router = APIRouter(prefix="/estadisticas", tags=["estadisticas"])

MEXICO_OFFSET = timedelta(hours=-6)

def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)


@router.get("/resumen")
async def resumen(_: UsuarioActual = Depends(get_usuario_actual)):
    """KPIs generales del sistema."""
    conn = get_conn()
    cur  = conn.cursor()

    hoy_mx = (datetime.now(timezone.utc) + MEXICO_OFFSET).date()

    # Docentes activos
    cur.execute("SELECT COUNT(*) AS n FROM docentes WHERE activo = true")
    docentes_activos = cur.fetchone()["n"]

    # Asignaciones activas
    cur.execute("SELECT COUNT(*) AS n FROM asignaciones WHERE activa = true")
    asignaciones_activas = cur.fetchone()["n"]

    # Horas programadas totales (semana)
    cur.execute("SELECT COALESCE(SUM(horas_semana),0)::integer AS h FROM asignaciones WHERE activa = true")
    horas_semana = cur.fetchone()["h"]

    # Total checadas en la BD
    cur.execute("SELECT COUNT(*) AS n FROM asistencias_checadas")
    checadas_total = cur.fetchone()["n"]

    # Checadas hoy
    cur.execute("""
        SELECT COUNT(*) AS n FROM asistencias_checadas
        WHERE timestamp_checada::date = %s
    """, (hoy_mx,))
    checadas_hoy = cur.fetchone()["n"]

    # Checadas esta semana (lunes–hoy)
    lunes = hoy_mx - timedelta(days=hoy_mx.weekday())
    cur.execute("""
        SELECT COUNT(*) AS n FROM asistencias_checadas
        WHERE timestamp_checada::date >= %s AND timestamp_checada::date <= %s
    """, (lunes, hoy_mx))
    checadas_semana = cur.fetchone()["n"]

    # Quincenas totales / por estado
    cur.execute("""
        SELECT estado, COUNT(*) AS n FROM quincenas GROUP BY estado
    """)
    q_estados = {r["estado"]: r["n"] for r in cur.fetchall()}

    # Programas activos
    cur.execute("SELECT COUNT(*) AS n FROM programas WHERE activo = true AND id != 7")
    programas_activos = cur.fetchone()["n"]

    # Docentes virtuales (con al menos una asig virtual activa)
    cur.execute("""
        SELECT COUNT(DISTINCT docente_id) AS n FROM asignaciones
        WHERE activa = true AND modalidad IN ('virtual','mixta')
    """)
    docentes_virtuales = cur.fetchone()["n"]

    cur.close(); conn.close()

    return {
        "docentes_activos":    int(docentes_activos),
        "asignaciones_activas": int(asignaciones_activas),
        "horas_semana":        int(horas_semana),
        "checadas_total":      int(checadas_total),
        "checadas_hoy":        int(checadas_hoy),
        "checadas_semana":     int(checadas_semana),
        "quincenas":           q_estados,
        "programas_activos":   int(programas_activos),
        "docentes_virtuales":  int(docentes_virtuales),
    }


@router.get("/checadas-por-semana")
async def checadas_por_semana(_: UsuarioActual = Depends(get_usuario_actual)):
    """Checadas agrupadas por semana — últimas 4 semanas (mes en curso)."""
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            date_trunc('week', timestamp_checada)::date AS semana,
            COUNT(*) AS total,
            COUNT(DISTINCT user_id) AS personas
        FROM asistencias_checadas
        WHERE timestamp_checada >= NOW() - INTERVAL '4 weeks'
        GROUP BY semana
        ORDER BY semana
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [
        {
            "semana":   str(r["semana"]),
            "total":    int(r["total"]),
            "personas": int(r["personas"]),
        }
        for r in rows
    ]


@router.get("/docentes-por-programa")
async def docentes_por_programa(_: UsuarioActual = Depends(get_usuario_actual)):
    """Docentes únicos y horas semanales por programa."""
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            p.nombre AS programa,
            p.codigo AS codigo,
            COUNT(DISTINCT a.docente_id) AS docentes,
            COALESCE(SUM(a.horas_semana), 0)::integer AS horas_semana
        FROM asignaciones a
        JOIN materias  m ON a.materia_id  = m.id
        JOIN programas p ON m.programa_id = p.id
        WHERE a.activa = true AND p.id != 7
        GROUP BY p.id, p.nombre, p.codigo
        ORDER BY horas_semana DESC
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [
        {
            "programa":    r["programa"],
            "codigo":      r["codigo"] or r["programa"][:6],
            "docentes":    int(r["docentes"]),
            "horas_semana": int(r["horas_semana"]),
        }
        for r in rows
    ]


@router.get("/quincenas-historial")
async def quincenas_historial(_: UsuarioActual = Depends(get_usuario_actual)):
    """Historial de quincenas con sus estados."""
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT id, fecha_inicio, fecha_fin, estado, ciclo AS ciclo_label, razon_social
        FROM quincenas
        ORDER BY fecha_inicio DESC
        LIMIT 20
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [dict(r) for r in rows]


@router.get("/evaluacion-virtual")
async def evaluacion_virtual(_: UsuarioActual = Depends(get_usuario_actual)):
    """Resultados de evaluación virtual por quincena."""
    conn = get_conn()
    cur  = conn.cursor()

    # Verificar si la tabla tiene datos
    cur.execute("""
        SELECT
            q.id AS quincena_id,
            q.fecha_inicio,
            q.fecha_fin,
            q.ciclo AS ciclo_label,
            COUNT(*) AS total,
            SUM(CASE WHEN evr.aprobada THEN 1 ELSE 0 END) AS aprobadas,
            SUM(CASE WHEN NOT evr.aprobada THEN 1 ELSE 0 END) AS rechazadas,
            ROUND(AVG(evr.pct_cumplimiento) * 100, 1) AS pct_promedio
        FROM evaluacion_virtual_resultado evr
        JOIN quincenas q ON evr.quincena_id = q.id
        GROUP BY q.id, q.fecha_inicio, q.fecha_fin, q.ciclo
        ORDER BY q.fecha_inicio
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [
        {
            "quincena_id": r["quincena_id"],
            "label":       f"{str(r['fecha_inicio'])[5:]} – {str(r['fecha_fin'])[5:]}",
            "ciclo":       r["ciclo_label"],
            "total":       int(r["total"]),
            "aprobadas":   int(r["aprobadas"]),
            "rechazadas":  int(r["rechazadas"]),
            "pct_promedio": float(r["pct_promedio"] or 0),
        }
        for r in rows
    ]
