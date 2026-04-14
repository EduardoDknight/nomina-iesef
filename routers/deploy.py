"""
routers/deploy.py — Webhook de auto-deploy desde GitHub
Cuando GitHub hace push, llama POST /deploy con un secreto.
FastAPI hace git pull; uvicorn --reload detecta los cambios y se reinicia solo.
"""
import hmac, hashlib, subprocess, logging
from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["deploy"])


def _verificar_firma(body: bytes, signature: Optional[str]) -> bool:
    """Verifica el header X-Hub-Signature-256 de GitHub."""
    if not signature:
        return False
    expected = "sha256=" + hmac.new(
        settings.deploy_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/deploy")
async def deploy(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
):
    body = await request.body()

    # Verificar firma de GitHub
    if not _verificar_firma(body, x_hub_signature_256):
        logger.warning("Deploy rechazado: firma inválida")
        raise HTTPException(status_code=401, detail="Firma inválida")

    # git pull
    try:
        result = subprocess.run(
            ["git", "pull", "--ff-only"],
            capture_output=True, text=True, timeout=30
        )
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        logger.info(f"git pull: {stdout}")
        if result.returncode != 0:
            logger.error(f"git pull falló: {stderr}")
            raise HTTPException(status_code=500, detail=f"git pull falló: {stderr}")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="git pull timeout")

    return {
        "status": "ok",
        "output": stdout or "Already up to date.",
    }
