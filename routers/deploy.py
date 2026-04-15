"""
routers/deploy.py — Webhook de auto-deploy desde GitHub

Flujo:
  1. GitHub hace push → llama POST /deploy con X-Hub-Signature-256
  2. Se verifica la firma HMAC (secret en .env: DEPLOY_SECRET)
  3. Se ejecuta git pull --ff-only
  4. uvicorn --reload detecta el cambio y se reinicia (os._exit en background)
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
    Espera `delay` segundos y luego termina el proceso worker.
    uvicorn --reload detecta la salida y relanza el worker con el código nuevo.
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

    # 3. Reiniciar el worker de uvicorn en background para cargar el código nuevo.
    #    os._exit(0) termina solo este worker; uvicorn --reload lo relanza
    #    automáticamente con los módulos frescos del disco.
    threading.Thread(target=_restart_after_delay, args=(1.5,), daemon=True).start()

    return JSONResponse({
        "status":  "ok",
        "output":  stdout,
        "reload":  True,
        "method":  "process_restart",
        "up_to_date": ya_actualizado,
    })
