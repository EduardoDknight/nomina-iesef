from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual, solo_admin, admin_o_finanzas
from services.calculo_nomina import calcular_nomina_docente, guardar_nomina

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/nomina", tags=["nomina"])

def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)

# ── Modelos ────────────────────────────────────────────────────────────────────

class NominaResumenDocente(BaseModel):
    docente_id:          int
    docente_nombre:      str
    horas_programadas:   float
    horas_presenciales:  float
    horas_virtuales:     float
    horas_suplencia:     float
    horas_reales:        float
    honorarios:          float
    iva:                 float
    sub_total:           float
    retencion_isr:       float
    retencion_iva:       float
    total_a_pagar:       float
    ajustes:             float
    total_final:         float
    estado:              str

class GenerarNominaResult(BaseModel):
    quincena_id:  int
    procesados:   int
    errores:      int
    total_honorarios: float
    detalle_errores: List[str] = []

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/quincenas/{quincena_id}/generar", response_model=GenerarNominaResult)
async def generar_nomina(
    quincena_id: int,
    usuario: UsuarioActual = Depends(solo_admin)
):
    """
    Calcula y guarda la nómina borrador de todos los docentes activos
    para la quincena indicada. Se puede volver a llamar para recalcular.
    """
    conn = get_conn()
    cur = conn.cursor()

    # Verificar que la quincena existe y está abierta/en_revision
    cur.execute("SELECT * FROM quincenas WHERE id = %s", (quincena_id,))
    quincena = cur.fetchone()
    if not quincena:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Quincena no encontrada")
    if quincena["estado"] not in ("abierta", "en_revision"):
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail=f"No se puede generar nómina en estado '{quincena['estado']}'")

    # Obtener todos los docentes que participan en esta quincena:
    # presenciales (chec_id), virtuales con evaluación, campo clínico,
    # y docentes que fungieron como suplentes (aprobados)
    cur.execute("""
        SELECT DISTINCT d.id
        FROM docentes d
        WHERE d.activo = true
          AND (
              d.chec_id IS NOT NULL
              OR EXISTS (
                  SELECT 1 FROM evaluacion_virtual_resultado evr
                  WHERE evr.docente_id = d.id AND evr.quincena_id = %s AND evr.aprobada = true
              )
              OR EXISTS (
                  SELECT 1 FROM campo_clinico_quincena ccq
                  WHERE ccq.docente_id = d.id AND ccq.quincena_id = %s
              )
              OR EXISTS (
                  SELECT 1 FROM incidencias i
                  WHERE i.docente_suplente_id = d.id
                    AND i.quincena_id = %s
                    AND i.estado = 'aprobada'
                    AND i.tipo = 'suplencia'
              )
          )
    """, (quincena_id, quincena_id, quincena_id))
    docente_ids = [r["id"] for r in cur.fetchall()]
    cur.close()

    procesados = errores = 0
    detalle_errores = []
    total_honorarios = Decimal("0")

    for doc_id in docente_ids:
        resultado = calcular_nomina_docente(
            conn,
            docente_id=doc_id,
            quincena_id=quincena_id,
            fecha_inicio=quincena["fecha_inicio"],
            fecha_fin=quincena["fecha_fin"]
        )
        if resultado.error:
            errores += 1
            detalle_errores.append(f"Docente {doc_id}: {resultado.error}")
            continue
        try:
            guardar_nomina(conn, resultado, usuario.id)
            conn.commit()
            procesados += 1
            total_honorarios += resultado.total_a_pagar
        except Exception as e:
            conn.rollback()
            errores += 1
            detalle_errores.append(f"Docente {doc_id}: {str(e)[:80]}")
            logger.error(f"Error guardando nómina docente {doc_id}: {e}")

    conn.close()
    return GenerarNominaResult(
        quincena_id=quincena_id,
        procesados=procesados,
        errores=errores,
        total_honorarios=float(total_honorarios),
        detalle_errores=detalle_errores
    )

@router.get("/quincenas/{quincena_id}", response_model=List[NominaResumenDocente])
async def get_nomina_quincena(
    quincena_id: int,
    razon_social: Optional[str] = None,  # 'centro', 'instituto'
    _: UsuarioActual = Depends(admin_o_finanzas)
):
    conn = get_conn()
    cur = conn.cursor()
    sql = """
        SELECT
            nq.docente_id,
            d.nombre_completo AS docente_nombre,
            nq.horas_programadas, nq.horas_presenciales,
            nq.horas_virtuales, nq.horas_suplencia, nq.horas_reales,
            nq.honorarios, nq.iva, nq.sub_total,
            nq.retencion_isr, nq.retencion_iva,
            nq.total_a_pagar, nq.ajustes, nq.total_final,
            nq.estado
        FROM nomina_quincena nq
        JOIN docentes d ON nq.docente_id = d.id
        WHERE nq.quincena_id = %s
    """
    params = [quincena_id]
    if razon_social:
        sql += " AND d.adscripcion IN (%s, 'ambos')"
        params.append(razon_social)
    sql += " ORDER BY d.nombre_completo"
    cur.execute(sql, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [NominaResumenDocente(**r) for r in rows]

@router.get("/quincenas/{quincena_id}/docente/{docente_id}")
async def get_nomina_docente(
    quincena_id: int,
    docente_id:  int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Un docente solo puede ver su propia nómina."""
    if usuario.rol == "docente" and usuario.docente_id != docente_id:
        raise HTTPException(status_code=403, detail="Solo puedes ver tu propia nómina")
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT nq.*, d.nombre_completo AS docente_nombre
        FROM nomina_quincena nq
        JOIN docentes d ON nq.docente_id = d.id
        WHERE nq.quincena_id = %s AND nq.docente_id = %s
    """, (quincena_id, docente_id))
    nq = cur.fetchone()
    if not nq:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Nómina no encontrada")
    # Detalle por programa
    cur.execute("""
        SELECT ndp.*, p.nombre AS programa_nombre
        FROM nomina_detalle_programa ndp
        JOIN programas p ON ndp.programa_id = p.id
        WHERE ndp.nomina_id = %s
        ORDER BY p.nombre
    """, (nq["id"],))
    detalle = cur.fetchall()
    cur.close()
    conn.close()
    return {"nomina": dict(nq), "detalle_programas": [dict(d) for d in detalle]}
