"""
routers/deploy.py — Webhook de auto-deploy desde GitHub

Flujo:
  1. GitHub hace push → llama POST /deploy con X-Hub-Signature-256
  2. Se verifica la firma HMAC (secret en .env: DEPLOY_SECRET)
  3. Se ejecuta git pull --ff-only
  4. Se "tocan" todos los .py modificados para que uvicorn --reload los detecte
  5. uvicorn se reinicia automáticamente con el nuevo código
"""
import hmac
import hashlib
import subprocess
import logging
import os
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, Header
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


def _touch_py_files(changed_files: list[str]) -> int:
    """
    Actualiza el mtime de los .py modificados para disparar uvicorn --reload.
    Retorna el número de archivos tocados.
    """
    tocados = 0
    for ruta in changed_files:
        if ruta.endswith(".py"):
            full = ROOT / ruta
            if full.exists():
                full.touch()
                tocados += 1
    # Si no hubo .py explícitos (ej. solo dist/ o .md), toca main para forzar reload
    if tocados == 0:
        (ROOT / "main_nomina.py").touch()
        tocados = 1
    return tocados


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

    # Si ya estaba actualizado no hay nada que hacer
    if "Already up to date" in stdout or "Ya está actualizado" in stdout:
        return {"status": "ok", "output": stdout, "reload": False}

    # 3. Detectar archivos modificados y tocar .py para forzar reload
    try:
        diff = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
            capture_output=True, text=True, timeout=10, cwd=str(ROOT)
        )
        changed = [f.strip() for f in diff.stdout.splitlines() if f.strip()]
    except Exception:
        changed = []

    tocados = _touch_py_files(changed)
    logger.info(f"Deploy OK — {tocados} archivos .py recargados. Cambios: {changed}")

    return {
        "status":   "ok",
        "output":   stdout,
        "reload":   True,
        "changed":  changed,
        "touched":  tocados,
    }
