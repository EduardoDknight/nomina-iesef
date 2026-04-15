# start_server.ps1 — Arrancar uvicorn para IESEF Nomina
# Uso: click derecho → "Ejecutar con PowerShell"
# O desde terminal: powershell -ExecutionPolicy Bypass -File start_server.ps1

$ROOT    = "C:\Proyectos\nomina-iesef"
$LOGDIR  = "$ROOT\logs"
$LOGOUT  = "$LOGDIR\uvicorn.log"
$LOGERR  = "$LOGDIR\uvicorn_err.log"
$PYTHON  = "python"    # usa el python del PATH; ajustar si hay venv

# Crear carpeta de logs si no existe
if (!(Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR | Out-Null }

# Matar uvicorn anterior si corre en el puerto 8000
$old = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
       Select-Object -ExpandProperty OwningProcess
if ($old) {
    Write-Host "Matando proceso anterior en :8000 (PID $old)..."
    Stop-Process -Id $old -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# Borrar logs anteriores para que el nuevo run empiece limpio
"" | Set-Content $LOGOUT
"" | Set-Content $LOGERR

Write-Host "Iniciando uvicorn en http://0.0.0.0:8000 ..."
Start-Process `
    -FilePath       $PYTHON `
    -ArgumentList   "-m uvicorn main_nomina:app --reload --host 0.0.0.0 --port 8000" `
    -WorkingDirectory $ROOT `
    -RedirectStandardOutput $LOGOUT `
    -RedirectStandardError  $LOGERR `
    -WindowStyle    Hidden

# Esperar máx 10 s a que el puerto abra
$intentos = 0
do {
    Start-Sleep -Milliseconds 800
    $intentos++
    $ok = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
} until ($ok -or $intentos -ge 12)

if ($ok) {
    Write-Host "✓ Servidor listo en http://localhost:8000"
} else {
    Write-Host "⚠ El servidor tardó más de lo normal. Revisa logs\uvicorn_err.log"
    notepad $LOGERR
}
