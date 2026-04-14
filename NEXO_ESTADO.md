# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión. Se actualiza al final de cada sesión de trabajo.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-13 (noche — PC casa)  
**Rama:** `main`  
**Último commit:** `3ac2483` — chore: setup gitignore + portal checadas semana con rango de fechas

---

## Lo que está funcionando en producción (nexo.iesef.edu.mx)

| Módulo | Estado |
|---|---|
| Login JWT / roles / usuarios | ✅ |
| Catálogos: docentes, programas, materias | ✅ |
| Asignaciones + horarios (vigente_desde/vigente_hasta) | ✅ |
| Quincenas: crear, cambiar estado, listar | ✅ |
| QuincenaDetalle: docentes con asignaciones + campo clínico | ✅ |
| Evaluación virtual (CA 40% + EV 60%) | ✅ |
| Exportación Excel nómina | ✅ |
| Personal Administrativo: CRUD + asistencia | ✅ |
| Portal docente/trabajador: checadas, credenciales | ✅ |
| MB360 → Ubuntu laptop → HostGator (26k+ checadas) | ✅ |
| Cloudflare Tunnel (nexo.iesef.edu.mx → localhost:8000) | ✅ |
| Charset UTF-8 fix (ñ/tildes en todos los navegadores) | ✅ |

---

## Cambios de esta sesión (2026-04-13, noche — aún sin commit)

### Backend
- `routers/portal.py` — dedup de checadas (ventana 3 min) + entrada/salida por posición (no tipo_punch)
- `routers/administrativos.py` — misma lógica de dedup en resumen y detalle
- `routers/quincenas.py` — múltiples fixes:
  - JOIN por `vigente_desde/vigente_hasta` en lugar de `ciclo` (string)
  - Nuevo endpoint `GET /quincenas/ciclos-disponibles`
  - Fix campo_clínico: `SELECT ciclo, fecha_inicio, fecha_fin`
  - Fix INSERT campo_clínico: usa `ciclo_label` y `vigente_desde`
- `routers/catalogos.py` — `ciclo` → `ciclo_label` en todos los queries
- `routers/evaluacion.py` — JOIN por fechas en lugar de ciclo string
- `main_nomina.py` — headers charset UTF-8 para todos los archivos de texto
- `routers/asistencias.py` — nuevo router (archivo nuevo sin commit)

### Frontend
- `Quincenas.jsx` — dropdown de ciclos en lugar de texto libre; llama `/ciclos-disponibles`
- Varios cambios menores en páginas (ver `git diff`)

### DB (ya aplicado en producción)
```sql
-- Migración: ciclo_label + vigente_desde + vigente_hasta en asignaciones
ALTER TABLE asignaciones RENAME COLUMN ciclo TO ciclo_label;
ALTER TABLE asignaciones ADD COLUMN vigente_desde DATE;
ALTER TABLE asignaciones ADD COLUMN vigente_hasta DATE;
-- Backfill: vigente_desde = '2026-01-01' para todos los activos
UPDATE asignaciones SET vigente_desde = '2026-01-01' WHERE activa = true;
```

---

## Pendientes inmediatos

### Mañana — Diagnóstico laptop Ubuntu
1. SSH a laptop Ubuntu → verificar cron: `crontab -l`
2. Verificar que el agente corre: `/home/nomina/venv_zk/bin/python3 /home/nomina/agente_nomina/agente.py`
3. Verificar IP Cloudflare en `/etc/hosts`: `cat /etc/hosts | grep api.iesef`
4. Si la IP cambió: `host api.iesef.edu.mx` y actualizar /etc/hosts
5. Revisar logs del cron si los hay

### Pendiente técnico — Sistema v1
- Diagnóstico superficial completado: el v1 SÍ mapeaba docentes correctamente via `id_dispositivo_biometrico`
- Datos docentes se detuvieron el 2026-03-19, trabajadores el 2026-03-11 (ambos = sin conexión al MB360)
- Causa probable: cron nuestro monopoliza TCP del MB360 + cambio de línea ISP del laptop
- **No hay bug específico de docentes en v1** — es un problema de conexión

### Siguiente sprint — Funcionalidades faltantes
- [x] **Vista Horarios Por Grupo** — grilla semanal visual con rowspan + detección conflictos (2026-04-13)
- [ ] Motor de cálculo fiscal completo (horas × tarifa → honorarios, IVA, ISR, retenciones)
- [ ] Generación Excel HONORARIOS CENTRO y HONORARIOS INSTITUTO (formato exacto)
- [ ] Módulo de incidencias y suplencias
- [ ] Cargar horarios desde PDF aSc (Opción A: Eduardo pasa el PDF, Claude parsea y genera SQL)
- [ ] Clasificador de checadas con ventanas de horario (asistencia/retardo/incompleta)

---

## Arquitectura de asignaciones — Decisión clave
**NO usar `ciclo` como JOIN key.** Usar rango de fechas:
```sql
-- Para una quincena con fecha_inicio y fecha_fin:
JOIN asignaciones a ON a.docente_id = d.id
  AND a.vigente_desde <= q.fecha_fin
  AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= q.fecha_inicio)
  AND a.activa = true
```
Cuando Coord. Docente cargue horario nuevo: `UPDATE asignaciones SET vigente_hasta = TODAY WHERE activa=true`, luego INSERT nuevo con `vigente_desde = inicio_ciclo`.

---

## Decisiones de infraestructura importantes
- **psycopg2 directo** — NO SQLAlchemy
- **Sin Docker** — FastAPI + PostgreSQL directo en HostGator
- **Cloudflare delante** — siempre `User-Agent: Mozilla/5.0` en requests desde agentes
- **MB360 TCP monopolio** — solo una conexión a la vez. Cron cada 5 min, 24 seg de ejecución. V1 puede fallar si intenta conectar en esa ventana.
- **Checadas inmutables** — nunca borrar `asistencias_checadas`. V1 tampoco usa `clear_attendance()`.

---

## Contexto de sesión por horario
| Hora (México UTC-6) | Contexto probable |
|---|---|
| 07:00 – 17:00 | PC trabajo (oficina IESEF, misma LAN que MB360) |
| 18:00 – 23:59 | PC casa (acceso remoto via Cloudflare Tunnel) |
| 00:00 – 06:00 | PC casa (sesión nocturna) |

---

## Cómo sincronizar entre PCs

### Al EMPEZAR una sesión (cualquier PC)
```bash
cd /ruta/del/repo
git pull
# Claude Code leerá NEXO_ESTADO.md automáticamente via CLAUDE.md
```

### Al TERMINAR una sesión
```bash
# Claude actualiza NEXO_ESTADO.md con lo que se hizo
git add NEXO_ESTADO.md
git commit -m "estado: sesión $(date '+%Y-%m-%d %H:%M')"
git push
```

### Script rápido (guardar como alias `nexo-sync`)
```bash
#!/bin/bash
git add -A
git commit -m "estado: sesión $(date '+%Y-%m-%d %H:%M') — $1"
git push && echo "Contexto sincronizado"
```

---

## Credenciales y accesos rápidos
Ver: `~/.claude/projects/.../memory/reference_hostgator_credentials.md`  
(No se guarda aquí por seguridad)
