# watchdog.ps1 — IESEF Nomina: guardian del servidor
# Mantiene uvicorn corriendo SIEMPRE.
# Cuando cae (por deploy, crash, reboot), lo reinicia automaticamente.
# No requiere intervencion manual. Correr como tarea de inicio de sesion.

$ROOT   = "C:\Proyectos\nomina-iesef"
$LOGDIR = "$ROOT\logs"
$LOG    = "$LOGDIR\watchdog.log"
$PYTHON = "python"

if (!(Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR | Out-Null }

function Escribir-Log($msg) {
    $linea = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Add-Content -Path $LOG -Value $linea -Encoding UTF8
}

Escribir-Log "=== Watchdog iniciado ==="

while ($true) {
    # Limpiar cualquier uvicorn anterior en el puerto 8000
    try {
        $pid8000 = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess
        if ($pid8000) {
            Stop-Process -Id $pid8000 -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    } catch {}

    Escribir-Log "Iniciando uvicorn (sin --reload)..."

    # Iniciar uvicorn SIN --reload: un solo proceso, mata limpia
    $proc = Start-Process `
        -FilePath       $PYTHON `
        -ArgumentList   "-m uvicorn main_nomina:app --host 0.0.0.0 --port 8000" `
        -WorkingDirectory $ROOT `
        -RedirectStandardOutput "$LOGDIR\uvicorn.log" `
        -RedirectStandardError  "$LOGDIR\uvicorn_err.log" `
        -PassThru `
        -NoNewWindow

    Escribir-Log "uvicorn PID $($proc.Id) en ejecucion."

    # Esperar a que el proceso termine (por deploy, crash, lo que sea)
    $proc.WaitForExit()
    $codigo = $proc.ExitCode

    Escribir-Log "uvicorn termino (exit code: $codigo). Reiniciando en 2 segundos..."
    Start-Sleep -Seconds 2
}
