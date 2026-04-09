#!/bin/bash
# deploy.sh — Sube y aplica cambios al servidor HostGator
# Uso: bash scripts/deploy.sh [--skip-frontend] [--skip-scripts]
# Requiere: acceso SSH configurado (ssh wwiese@dedi-1124945.iesef.edu.mx)

set -e

SERVIDOR="wwiese@dedi-1124945.iesef.edu.mx"
RUTA_SERVIDOR="/home/wwiese/api.iesef.edu.mx"
# Ruta donde se sirve el frontend en el servidor (carpeta pública del dominio frontend)
# Ajustar si es diferente en producción:
RUTA_FRONTEND_SERVIDOR="/home/wwiese/public_html/nomina"

SKIP_FRONTEND=false
SKIP_SCRIPTS=false
for arg in "$@"; do
  [[ "$arg" == "--skip-frontend" ]] && SKIP_FRONTEND=true
  [[ "$arg" == "--skip-scripts" ]] && SKIP_SCRIPTS=true
done

echo "==> [1/6] Subiendo routers y servicios..."
scp routers/auth.py       ${SERVIDOR}:${RUTA_SERVIDOR}/routers/
scp routers/docentes.py   ${SERVIDOR}:${RUTA_SERVIDOR}/routers/
scp routers/catalogos.py  ${SERVIDOR}:${RUTA_SERVIDOR}/routers/
scp routers/quincenas.py  ${SERVIDOR}:${RUTA_SERVIDOR}/routers/
scp routers/nomina.py     ${SERVIDOR}:${RUTA_SERVIDOR}/routers/
scp routers/exportar.py   ${SERVIDOR}:${RUTA_SERVIDOR}/routers/
scp routers/usuarios.py   ${SERVIDOR}:${RUTA_SERVIDOR}/routers/
scp routers/evaluacion.py ${SERVIDOR}:${RUTA_SERVIDOR}/routers/
scp services/calculo_nomina.py      ${SERVIDOR}:${RUTA_SERVIDOR}/services/
scp services/exportar_honorarios.py ${SERVIDOR}:${RUTA_SERVIDOR}/services/
scp services/auditoria.py           ${SERVIDOR}:${RUTA_SERVIDOR}/services/
scp config.py ${SERVIDOR}:${RUTA_SERVIDOR}/

if [[ "$SKIP_SCRIPTS" == false ]]; then
  echo "==> [2/6] Subiendo scripts utilitarios..."
  ssh ${SERVIDOR} "mkdir -p ${RUTA_SERVIDOR}/scripts"
  scp scripts/importar_horarios_pdf.py  ${SERVIDOR}:${RUTA_SERVIDOR}/scripts/
  scp scripts/fix_relink_evaluaciones.py ${SERVIDOR}:${RUTA_SERVIDOR}/scripts/
  scp scripts/import_ev_excel.py        ${SERVIDOR}:${RUTA_SERVIDOR}/scripts/
  scp scripts/comparar_nomina_excel.py  ${SERVIDOR}:${RUTA_SERVIDOR}/scripts/
else
  echo "==> [2/6] Scripts omitidos (--skip-scripts)"
fi

echo "==> [3/6] Instalando dependencias Python..."
ssh ${SERVIDOR} "source /opt/iesef_api/bin/activate && pip install PyJWT bcrypt openpyxl pydantic-settings pymupdf -q"

echo "==> [4/6] Aplicando migraciones SQL..."
# Migración 001
ssh ${SERVIDOR} "psql -U nomina_user -d iesef_nomina -tAc \"SELECT 1 FROM migraciones WHERE version='001'\" 2>/dev/null | grep -q 1 \
  && echo '  [SKIP] Migración 001 ya aplicada' \
  || (psql -U nomina_user -d iesef_nomina -f - && echo '  [OK] Migración 001 aplicada')" < migrations/001_tablas_base.sql

# Migración 002
ssh ${SERVIDOR} "psql -U nomina_user -d iesef_nomina -tAc \"SELECT 1 FROM migraciones WHERE version='002'\" 2>/dev/null | grep -q 1 \
  && echo '  [SKIP] Migración 002 ya aplicada' \
  || (psql -U nomina_user -d iesef_nomina -f - && echo '  [OK] Migración 002 aplicada')" < migrations/002_auditoria.sql

# Migración 003 — requiere postgres superuser (ALTER COLUMN en evaluacion_virtual_semana)
ssh ${SERVIDOR} "psql -U nomina_user -d iesef_nomina -tAc \"SELECT 1 FROM migraciones WHERE version='003'\" 2>/dev/null | grep -q 1 \
  && echo '  [SKIP] Migración 003 ya aplicada' \
  || (psql -U postgres -d iesef_nomina -f - && echo '  [OK] Migración 003 aplicada')" < migrations/003_criterios_numericos.sql

# Migración 004 — requiere postgres superuser (ALTER TABLE config_asistencia ADD COLUMN politica_retardo)
# El INSERT de la fila default puede correr con nomina_user, pero el ALTER necesita superuser.
ssh ${SERVIDOR} "psql -U nomina_user -d iesef_nomina -tAc \"SELECT 1 FROM migraciones WHERE version='004'\" 2>/dev/null | grep -q 1 \
  && echo '  [SKIP] Migración 004 ya aplicada' \
  || (psql -U postgres -d iesef_nomina -f - && echo '  [OK] Migración 004 aplicada')" < migrations/004_config_asistencia_defaults.sql

echo "==> [5/6] Actualizando main.py en servidor..."
ssh ${SERVIDOR} "cd ${RUTA_SERVIDOR} && python3 -c \"
with open('main.py', 'r') as f:
    content = f.read()

nuevos_imports = '''from routers import auth as auth_router
from routers import docentes as docentes_router
from routers import catalogos as catalogos_router
from routers import quincenas as quincenas_router
from routers import nomina as nomina_router
from routers import exportar as exportar_router
from routers import usuarios as usuarios_router
from routers import evaluacion as evaluacion_router
'''
nuevos_routers = '''
app.include_router(auth_router.router)
app.include_router(docentes_router.router)
app.include_router(catalogos_router.router)
app.include_router(quincenas_router.router)
app.include_router(nomina_router.router)
app.include_router(exportar_router.router)
app.include_router(usuarios_router.router)
app.include_router(evaluacion_router.router)
'''

if 'auth_router' not in content:
    content = nuevos_imports + content
    content = content.replace('@app.get(\\\"\/\\\")', nuevos_routers + '@app.get(\\\"\/\\\")')
    with open('main.py', 'w') as f:
        f.write(content)
    print('main.py actualizado')
else:
    print('main.py ya tiene los routers')
\""

echo "==> Validando sintaxis Python..."
ssh ${SERVIDOR} "source /opt/iesef_api/bin/activate && cd ${RUTA_SERVIDOR} && \
  python3 -c 'from routers import auth, docentes, catalogos, quincenas, nomina, exportar, usuarios, evaluacion; print(\"Sintaxis OK\")'"

echo "==> Reiniciando FastAPI..."
ssh ${SERVIDOR} "systemctl restart uvicorn_api && sleep 2 && systemctl status uvicorn_api | head -10"

if [[ "$SKIP_FRONTEND" == false ]]; then
  echo "==> [6/6] Compilando y subiendo frontend..."
  cd frontend
  npm run build
  cd ..
  # Crear directorio en servidor si no existe
  ssh ${SERVIDOR} "mkdir -p ${RUTA_FRONTEND_SERVIDOR}"
  # Subir todo el contenido de dist/
  scp -r frontend/dist/* ${SERVIDOR}:${RUTA_FRONTEND_SERVIDOR}/
  echo "  Frontend subido a ${RUTA_FRONTEND_SERVIDOR}"
  echo "  IMPORTANTE: verificar que el servidor web apunte a esa carpeta"
  echo "  y que el SPA routing esté configurado (index.html para rutas 404)"
else
  echo "==> [6/6] Frontend omitido (--skip-frontend)"
  echo "  Para subir frontend manualmente:"
  echo "    cd frontend && npm run build && cd .."
  echo "    scp -r frontend/dist/* ${SERVIDOR}:${RUTA_FRONTEND_SERVIDOR}/"
fi

echo ""
echo "✓ Deploy completado."
echo "  API:      curl https://api.iesef.edu.mx/"
echo "  Frontend: verificar en el navegador"
echo ""
echo "  Post-deploy checklist:"
echo "  [ ] Verificar migración 004: psql -U postgres -d iesef_nomina -c \"SELECT politica_retardo FROM config_asistencia;\""
echo "  [ ] Verificar API health: curl https://api.iesef.edu.mx/"
echo "  [ ] Login en frontend"
echo "  [ ] Abrir Configuración → Tolerancias: debe mostrar política de retardo"
echo "  [ ] Abrir Horarios: debe listar docentes por programa"
