"""
routers/calendario.py — Días no laborables (vacaciones + suspensiones)

Tipos y efecto en nómina:
  vacaciones           → docentes NO cobran | administrativos cobran normal
  suspension_oficial   → docentes NO cobran | administrativos cobran normal
  suspension_interna   → docentes SÍ cobran (sin checada) | administrativos no afectados

suspension_interna tiene cobertura opcional por horas:
  hora_inicio/hora_fin = NULL → afecta la jornada completa del día
  hora_inicio/hora_fin set    → solo clases que se solapan con ese rango horario

REGLA PARA EL MOTOR DE NÓMINA al encontrar suspension_interna:
  - Marcar los bloques de clase afectados como "impartidos / pagados" aunque no haya checada.
  - Ignorar completamente en el cálculo de administrativos.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, time
import psycopg2
from psycopg2.extras import RealDictCursor

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual

router = APIRouter(prefix="/calendario", tags=["calendario"])

ROLES_EDICION = ('superadmin', 'director_cap_humano', 'cap_humano')
TIPOS_VALIDOS  = ('vacaciones', 'suspension_oficial', 'suspension_interna')


class AgregarDiaBody(BaseModel):
    fecha:          date
    tipo:           str
    descripcion:    Optional[str]       = None
    ciclo:          str                 = "2026"
    hora_inicio:    Optional[time]      = None
    hora_fin:       Optional[time]      = None
    # NULL = todos los programas; lista con IDs = solo esos programas afectados.
    # Solo relevante para suspension_interna.
    programas_ids:  Optional[List[int]] = None


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
                SELECT id, fecha, tipo, descripcion, ciclo, activo,
                       hora_inicio, hora_fin, programas_ids
                FROM dias_no_laborables
                WHERE EXTRACT(YEAR FROM fecha) = %s
                  AND activo = true
                ORDER BY fecha
            """, (anio,))
            rows = cur.fetchall()

    return [_serializar_dia(dict(r)) for r in rows]


# ── POST /calendario/dias-no-laborables ───────────────────────────────────────

@router.post("/dias-no-laborables", status_code=201)
def agregar_dia(
    data:    AgregarDiaBody,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Agrega o reactiva un día no laborable. Upsert por fecha.

    Para suspension_interna:
      - hora_inicio / hora_fin opcionales (NULL = jornada completa)
      - programas_ids opcionales (NULL = todos los programas afectados;
        lista con IDs = solo esos programas quedan exentos de checada)
    Los tipos vacaciones / suspension_oficial siempre afectan a todos los programas.
    """
    if usuario.rol not in ROLES_EDICION:
        raise HTTPException(403, "Sin permiso para modificar el calendario")
    if data.tipo not in TIPOS_VALIDOS:
        raise HTTPException(400, f"tipo debe ser uno de: {', '.join(TIPOS_VALIDOS)}")

    # Vacaciones y suspension_oficial no admiten rango de horas ni programas específicos
    if data.tipo != 'suspension_interna':
        if data.hora_inicio is not None or data.hora_fin is not None:
            raise HTTPException(400, "hora_inicio / hora_fin solo aplican a suspension_interna")
        if data.programas_ids:
            raise HTTPException(400, "programas_ids solo aplica a suspension_interna")

    # Para suspension_interna: ambas horas o ninguna
    if data.tipo == 'suspension_interna':
        if (data.hora_inicio is None) != (data.hora_fin is None):
            raise HTTPException(400, "Debes indicar hora_inicio y hora_fin juntos, o dejar ambos vacíos")
        if data.hora_inicio and data.hora_fin and data.hora_fin <= data.hora_inicio:
            raise HTTPException(400, "hora_fin debe ser posterior a hora_inicio")

    # NULL en programas_ids = todos los programas
    programas_ids_db = data.programas_ids if data.programas_ids else None

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO dias_no_laborables
                    (fecha, tipo, descripcion, ciclo, hora_inicio, hora_fin,
                     programas_ids, creado_por)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (fecha) DO UPDATE
                    SET tipo          = EXCLUDED.tipo,
                        descripcion   = EXCLUDED.descripcion,
                        ciclo         = EXCLUDED.ciclo,
                        hora_inicio   = EXCLUDED.hora_inicio,
                        hora_fin      = EXCLUDED.hora_fin,
                        programas_ids = EXCLUDED.programas_ids,
                        activo        = true
                RETURNING id, fecha, tipo, descripcion, ciclo, activo,
                          hora_inicio, hora_fin, programas_ids
            """, (data.fecha, data.tipo, data.descripcion, data.ciclo,
                  data.hora_inicio, data.hora_fin, programas_ids_db, usuario.id))
            conn.commit()
            row = dict(cur.fetchone())

    return _serializar_dia(row)


def _serializar_dia(row: dict) -> dict:
    """Convierte campos time y array a tipos serializables por JSON."""
    if row.get('hora_inicio') is not None:
        row['hora_inicio'] = row['hora_inicio'].strftime('%H:%M')
    if row.get('hora_fin') is not None:
        row['hora_fin'] = row['hora_fin'].strftime('%H:%M')
    # programas_ids ya llega como list[int] desde psycopg2
    return row


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
    """
    Retorna días no laborables en un rango de fechas (usado por cálculo de nómina).

    MOTOR DE NÓMINA — cómo interpretar cada tipo:
      vacaciones / suspension_oficial:
          → las clases de ESE DÍA no se pagan a docentes (sin checada = sin pago)
      suspension_interna:
          → las clases que caen en hora_inicio-hora_fin (o todo el día si NULL)
            SE PAGAN a docentes aunque no haya checada biométrica
          → administrativos: ignorar completamente este tipo
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT fecha, tipo, descripcion, hora_inicio, hora_fin, programas_ids
                FROM dias_no_laborables
                WHERE fecha BETWEEN %s AND %s
                  AND activo = true
                ORDER BY fecha
            """, (desde, hasta))
            rows = cur.fetchall()

    return [_serializar_dia(dict(r)) for r in rows]
