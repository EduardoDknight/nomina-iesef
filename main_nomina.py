"""
main_nomina.py — Módulo principal del sistema de nómina IESEF
"""
from fastapi import FastAPI
from routers import auth, docentes, catalogos, quincenas, nomina, exportar, usuarios, evaluacion, administrativos, portal

app = FastAPI(title="IESEF Nómina — Dev", docs_url="/docs")
app.include_router(auth.router)
app.include_router(docentes.router)
app.include_router(catalogos.router)
app.include_router(quincenas.router)
app.include_router(nomina.router)
app.include_router(exportar.router)
app.include_router(usuarios.router)
app.include_router(evaluacion.router)
app.include_router(administrativos.router)
app.include_router(portal.router)

@app.get("/")
async def root():
    return {"status": "ok", "sistema": "nomina-iesef"}
