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
    """
    Devuelve la última vez que el servidor recibió datos del agente.
    Usa sync_log.recibido_en (TIMESTAMPTZ, llenado automáticamente con NOW()
    en el servidor al momento de recibir el POST). Es la hora real del servidor,
    sin depender del reloj del agente ni de conversiones de zona horaria.
    """
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            (SELECT MAX(recibido_en) FROM sync_log)               AS ultimo,
            (SELECT COUNT(*)         FROM asistencias_checadas)   AS total
    """)
    row = cur.fetchone()
    cur.close()
    conn.close()

    # recibido_en es TIMESTAMPTZ — psycopg2 lo devuelve timezone-aware.
    # .isoformat() produce un string con offset correcto (p.ej. "2026-04-15T20:30:00-06:00").
    # El frontend lo parsea directo, sin manipulación extra.
    ultimo_iso = row["ultimo"].isoformat() if row["ultimo"] else None

    return {
        "ultimo_sync":     ultimo_iso,
        "total_registros": row["total"],
    }
