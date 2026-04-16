"""
routers/calendario.py — Días no laborables (vacaciones + suspensiones)

Solo afecta el cálculo de horas virtuales docentes.
Administrativos no se ven afectados.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import date
import psycopg2
from psycopg2.extras import RealDictCursor

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual

router = APIRouter(prefix="/calendario", tags=["calendario"])

ROLES_EDICION = ('superadmin', 'director_cap_humano', 'cap_humano')


def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)


# ── GET /calendario/dias-no-laborables?anio=2026 ─────────────────────────────

@router.get("/dias-no-laborables")
def listar_dias(
    anio: int = Query(2026, description="Año a consultar"),
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Retorna todos los días no laborables del año dado."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, fecha, tipo, descripcion, ciclo, activo
                FROM dias_no_laborables
                WHERE EXTRACT(YEAR FROM fecha) = %s
                  AND activo = true
                ORDER BY fecha
            """, (anio,))
            rows = cur.fetchall()
    return [dict(r) for r in rows]


# ── POST /calendario/dias-no-laborables ───────────────────────────────────────

@router.post("/dias-no-laborables", status_code=201)
def agregar_dia(
    fecha: date,
    tipo: str,
    descripcion: Optional[str] = None,
    ciclo: str = "2026",
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Agrega o reactiva un día no laborable. Upsert por fecha."""
    if usuario.rol not in ROLES_EDICION:
        raise HTTPException(403, "Sin permiso para modificar el calendario")
    if tipo not in ("vacaciones", "suspension_oficial"):
        raise HTTPException(400, "tipo debe ser 'vacaciones' o 'suspension_oficial'")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO dias_no_laborables (fecha, tipo, descripcion, ciclo, creado_por)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (fecha) DO UPDATE
                    SET tipo        = EXCLUDED.tipo,
                        descripcion = EXCLUDED.descripcion,
                        ciclo       = EXCLUDED.ciclo,
                        activo      = true
                RETURNING id, fecha, tipo, descripcion, ciclo, activo
            """, (fecha, tipo, descripcion, ciclo, usuario.id))
            conn.commit()
            return dict(cur.fetchone())


# ── DELETE /calendario/dias-no-laborables/{dia_id} ───────────────────────────

@router.delete("/dias-no-laborables/{dia_id}")
def eliminar_dia(
    dia_id: int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Elimina un día no laborable."""
    if usuario.rol not in ROLES_EDICION:
        raise HTTPException(403, "Sin permiso para modificar el calendario")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dias_no_laborables WHERE id = %s RETURNING id", (dia_id,))
            conn.commit()
            if cur.rowcount == 0:
                raise HTTPException(404, "Día no encontrado")
    return {"ok": True}


# ── GET /calendario/dias-no-laborables/rango ─────────────────────────────────

@router.get("/dias-no-laborables/rango")
def dias_en_rango(
    desde: date,
    hasta: date,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Retorna días no laborables en un rango de fechas (usado por cálculo de nómina)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT fecha, tipo, descripcion
                FROM dias_no_laborables
                WHERE fecha BETWEEN %s AND %s
                  AND activo = true
                ORDER BY fecha
            """, (desde, hasta))
            rows = cur.fetchall()
    return [dict(r) for r in rows]
