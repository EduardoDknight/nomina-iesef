"""
main_nomina.py — Módulo principal del sistema de nómina IESEF
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pathlib import Path
import mimetypes
from routers import auth, docentes, catalogos, quincenas, nomina, exportar, usuarios, evaluacion, administrativos, portal, asistencias, estadisticas

app = FastAPI(title="IESEF Nómina — Dev", docs_url="/docs")

# ── API routers (todos bajo /api) ─────────────────────────────────────────────
app.include_router(auth.router,            prefix="/api")
app.include_router(docentes.router,        prefix="/api")
app.include_router(catalogos.router,       prefix="/api")
app.include_router(quincenas.router,       prefix="/api")
app.include_router(nomina.router,          prefix="/api")
app.include_router(exportar.router,        prefix="/api")
app.include_router(usuarios.router,        prefix="/api")
app.include_router(evaluacion.router,      prefix="/api")
app.include_router(administrativos.router, prefix="/api")
app.include_router(portal.router,          prefix="/api")
app.include_router(asistencias.router,     prefix="/api")
app.include_router(asistencias.router)          # sin /api — compatible con agente Ubuntu
app.include_router(estadisticas.router,    prefix="/api")

# ── Frontend estático (React build) ──────────────────────────────────────────
DIST = Path(__file__).parent / "frontend" / "dist"

# Extensiones que son archivos estáticos reales (nunca servir index.html para estas)
STATIC_EXTS = {".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp",
               ".gif", ".woff", ".woff2", ".ttf", ".eot", ".pdf"}

if DIST.exists():
    # Archivos estáticos compilados con hash (JS, CSS) — Cloudflare puede cachear agresivamente
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file = DIST / full_path

        if file.is_file():
            mime, _ = mimetypes.guess_type(str(file))
            # Añadir charset=utf-8 a todos los tipos de texto para evitar que
            # navegadores caigan a ISO-8859-1 y corrompan ñ y tildes
            if mime and mime.startswith("text/"):
                mime = f"{mime}; charset=utf-8"
            headers = {
                "Cache-Control": "public, max-age=3600",
                "Content-Type": mime or "application/octet-stream",
            }
            return FileResponse(file, headers=headers)

        # SPA routes → index.html — Cloudflare NO debe cachear esto
        return FileResponse(
            DIST / "index.html",
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
        )
else:
    @app.get("/")
    async def root():
        return {"status": "ok", "sistema": "nomina-iesef",
                "nota": "frontend/dist no encontrado — ejecuta npm run build"}
