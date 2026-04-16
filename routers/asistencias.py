"""
routers/asistencias.py — Receptor de checadas del agente ZKTeco
Compatible con el agente Ubuntu que enviaba a api.iesef.edu.mx
"""
from fastapi import APIRouter, Request
from typing import Any
from datetime import datetime
import psycopg2, logging
from psycopg2.extras import RealDictCursor
from config import settings

try:
    from zoneinfo import ZoneInfo
    _MX = ZoneInfo('America/Mexico_City')
except ImportError:
    _MX = None   # Python < 3.9 fallback

logger = logging.getLogger(__name__)

def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)

router = APIRouter(prefix="/asistencias", tags=["asistencias"])


@router.post("/checadas")
async def recibir_checadas(request: Request):
    """
    Recibe un lote de checadas del agente ZKTeco.
    Acepta el formato original del agente de HostGator.
    """
    body = await request.json()

    # Log para depuración (solo las keys del body y primer elemento)
    checadas_raw = body.get("checadas", [])
    logger.info(f"[asistencias] body keys: {list(body.keys())} | checadas: {len(checadas_raw)}")
    if checadas_raw:
        logger.info(f"[asistencias] primer elemento keys: {list(checadas_raw[0].keys())}")

    conn = get_conn()
    cur  = conn.cursor()

    insertadas = 0
    duplicadas = 0
    errores    = 0

    # Obtener metadatos del lote
    id_agente      = body.get("id_agente") or body.get("agente_id") or "agente_desconocido"
    sincronizado_en = body.get("timestamp_agente") or body.get("sincronizado_en") or datetime.utcnow().isoformat()

    for c in checadas_raw:
        try:
            # Normalizar nombres de campo — el agente puede usar distintas convenciones
            uid      = c.get("uid_checador") or c.get("uid") or c.get("id")
            user_id  = c.get("user_id")      or c.get("uid_checador") or c.get("uid")
            ts       = c.get("timestamp_checada") or c.get("timestamp") or c.get("time")
            punch    = c.get("tipo_punch")   or c.get("punch")  or c.get("status") or 0
            estado   = c.get("estado")       or c.get("state")  or 1
            disp_id  = c.get("id_dispositivo") or body.get("id_dispositivo") or "MB360_001"
            ag_id    = c.get("id_agente")    or id_agente

            if uid is None or user_id is None or ts is None:
                logger.warning(f"[asistencias] campo faltante en: {c}")
                errores += 1
                continue

            cur.execute("""
                INSERT INTO asistencias_checadas
                    (uid_checador, user_id, timestamp_checada, tipo_punch,
                     estado, id_dispositivo, id_agente, sincronizado_en)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id_dispositivo, uid_checador, timestamp_checada)
                DO NOTHING
            """, (uid, user_id, ts, punch, estado, disp_id, ag_id, sincronizado_en))

            if cur.rowcount == 1:
                insertadas += 1
            else:
                duplicadas += 1
        except Exception as e:
            errores += 1
            logger.error(f"[asistencias] error en checada: {e} | data: {c}")

    # sync_log
    try:
        cur.execute("""
            INSERT INTO sync_log (id_agente, timestamp_agente, checadas_enviadas, insertadas, duplicadas, errores)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (id_agente, sincronizado_en, len(checadas_raw), insertadas, duplicadas, errores))
    except Exception:
        pass

    conn.commit()
    cur.close()
    conn.close()

    logger.info(f"[asistencias] insertadas={insertadas} duplicadas={duplicadas} errores={errores}")

    return {
        "status": "ok",
        "recibidas": len(checadas_raw),
        "insertadas": insertadas,
        "duplicadas": duplicadas,
        "errores": errores,
    }


@router.get("/ultimo_sync")
def ultimo_sync():
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT MAX(sincronizado_en) as ultimo, COUNT(*) as total FROM asistencias_checadas")
    row = cur.fetchone()
    cur.close()
    conn.close()
    # Adjuntar timezone para que JavaScript lo interprete correctamente.
    # PostgreSQL devuelve un datetime naive ya en hora de México (America/Mexico_City).
    # Sin offset el frontend lo trata como UTC y calcula diferencias incorrectas.
    ultimo_iso = None
    if row["ultimo"]:
        if _MX:
            ultimo_iso = row["ultimo"].replace(tzinfo=_MX).isoformat()
        else:
            # Fallback: adjuntar -06:00 estático (CST); CDT = -05:00
            ultimo_iso = row["ultimo"].isoformat() + "-06:00"

    return {
        "ultimo_sync":    ultimo_iso,
        "total_registros": row["total"],
    }
