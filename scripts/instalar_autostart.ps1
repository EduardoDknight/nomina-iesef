# instalar_autostart.ps1
# Registra una tarea en el Programador de tareas de Windows para que
# uvicorn arranque automáticamente al iniciar sesión.
#
# Ejecutar UNA SOLA VEZ desde PowerShell como Administrador:
#   powershell -ExecutionPolicy Bypass -File scripts\instalar_autostart.ps1

$TASK_NAME = "IESEF-Nomina-Uvicorn"
$ROOT      = "C:\Proyectos\nomina-iesef"
$SCRIPT    = "$ROOT\start_server.ps1"

# Eliminar tarea anterior si existe
Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false -ErrorAction SilentlyContinue

$action  = New-ScheduledTaskAction `
    -Execute    "powershell.exe" `
    -Argument   "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$SCRIPT`"" `
    -WorkingDirectory $ROOT

# Al iniciar sesión del usuario actual
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit     (New-TimeSpan -Hours 0) `
    -RestartCount           3 `
    -RestartInterval        (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable     $true

Register-ScheduledTask `
    -TaskName   $TASK_NAME `
    -Action     $action `
    -Trigger    $trigger `
    -Settings   $settings `
    -RunLevel   Highest `
    -Force | Out-Null

Write-Host "✓ Tarea '$TASK_NAME' registrada."
Write-Host "  El servidor arrancará automáticamente al iniciar sesión."
Write-Host ""
Write-Host "Para arrancarlo AHORA sin reiniciar:"
Write-Host "  Start-ScheduledTask -TaskName '$TASK_NAME'"
Write-Host ""
Write-Host "Para eliminar la tarea:"
Write-Host "  Unregister-ScheduledTask -TaskName '$TASK_NAME' -Confirm:`$false"
