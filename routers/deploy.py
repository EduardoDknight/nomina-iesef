"""
routers/deploy.py — Webhook de auto-deploy desde GitHub

Flujo:
  1. GitHub hace push → llama POST /deploy con X-Hub-Signature-256
  2. Se verifica la firma HMAC (secret en .env: DEPLOY_SECRET)
  3. Se ejecuta git pull --ff-only
  4. os._exit(0) termina el proceso uvicorn (sin --reload)
  5. watchdog.ps1 detecta la salida y relanza uvicorn en ~2 segundos con código nuevo

Arquitectura de reinicio (Windows, sin --reload):
  - uvicorn corre como proceso único (sin reloader padre/hijo)
  - watchdog.ps1 corre en paralelo en un bucle infinito
  - Si uvicorn termina por cualquier razón (deploy, crash, reboot), watchdog lo reinicia
  - El delay de 1.5s en _restart_after_delay permite enviar la respuesta HTTP antes de morir
"""
import hmac
import hashlib
import subprocess
import logging
import os
import threading
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from typing import Optional
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["deploy"])

ROOT = Path(__file__).resolve().parent.parent


def _verificar_firma(body: bytes, signature: Optional[str]) -> bool:
    """Verifica el header X-Hub-Signature-256 de GitHub."""
    if not signature:
        return False
    expected = "sha256=" + hmac.new(
        settings.deploy_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def _restart_after_delay(delay: float = 1.5):
    """
    Espera `delay` segundos y luego termina el proceso uvicorn con os._exit(0).
    El delay permite que FastAPI envíe la respuesta HTTP antes de morir.
    watchdog.ps1 detecta la salida y relanza uvicorn en ~2 segundos con código nuevo del disco.
    """
    import time
    time.sleep(delay)
    logger.info("Deploy: reiniciando proceso uvicorn worker para cargar código nuevo...")
    os._exit(0)


@router.post("/deploy")
async def deploy(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
):
    body = await request.body()

    # 1. Verificar firma de GitHub
    if not _verificar_firma(body, x_hub_signature_256):
        logger.warning("Deploy rechazado: firma inválida")
        raise HTTPException(status_code=401, detail="Firma inválida")

    # 2. git pull
    try:
        result = subprocess.run(
            ["git", "pull", "--ff-only"],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(ROOT),
        )
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        logger.info(f"git pull: {stdout}")
        if result.returncode != 0:
            logger.error(f"git pull falló: {stderr}")
            raise HTTPException(status_code=500, detail=f"git pull falló: {stderr}")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="git pull timeout (>60s)")

    ya_actualizado = "Already up to date" in stdout or "Ya está actualizado" in stdout

    # 3. Terminar el proceso uvicorn en background para cargar el código nuevo.
    #    os._exit(0) termina el proceso; watchdog.ps1 lo relanza en ~2s
    #    automáticamente con los módulos frescos del disco.
    threading.Thread(target=_restart_after_delay, args=(1.5,), daemon=True).start()

    return JSONResponse({
        "status":  "ok",
        "output":  stdout,
        "reload":  True,
        "method":  "process_restart",
        "up_to_date": ya_actualizado,
    })
