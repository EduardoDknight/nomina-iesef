# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión. Se actualiza al final de cada sesión de trabajo.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-14 (tarde — PC trabajo)  
**Rama:** `main`  
**Último commit:** `d374d52` — feat: estadísticas + horarios por grupo + fixes ciclo/checadas

---

## Lo que está funcionando en producción (nexo.iesef.edu.mx → localhost:8000 vía Cloudflare Tunnel)

| Módulo | Estado |
|---|---|
| Login JWT / roles / usuarios | ✅ |
| Catálogos: docentes, programas, materias | ✅ |
| Asignaciones + horarios (vigente_desde/vigente_hasta) | ✅ |
| Horarios Por Grupo: grilla semanal visual, rowspan, conflictos, nueva materia | ✅ |
| Quincenas: crear, cambiar estado, listar | ✅ |
| QuincenaDetalle: docentes + campo clínico + evaluación virtual | ✅ |
| Evaluación virtual (CA 40% + EV 60%) | ✅ |
| Exportación Excel nómina | ✅ |
| Personal Administrativo: CRUD + asistencia quincena | ✅ |
| Portal docente/trabajador: checadas, credenciales | ✅ |
| **Estadísticas** — KPIs animados + gráficas recharts | ✅ nuevo |
| MB360 → Ubuntu laptop → nexo (26k+ checadas) | ✅ cron activo |
| Cloudflare Tunnel (nexo.iesef.edu.mx → localhost:8000) | ✅ |

---

## Tarea inmediata — Laptop Ubuntu (en ~1 hora)

### Problema diagnosticado: cron con instancias simultáneas + colisión MB360
- El cron de 5 min lanza múltiples instancias a la vez (46 runs en 2 segundos, confirmado en sync_log)
- El MB360 solo acepta UNA conexión TCP a la vez → colisiona con sistema v1 y con procesos del dispositivo
- El 13 abr a la 1pm alguien intentó respaldar MB360 a USB → bloqueó TCP 6 horas → gap total de checadas 13:04–19:41

### Fix a aplicar en la laptop Ubuntu:

```bash
crontab -e
```

**Cambiar la línea actual** (probablemente `*/5 * * * * ...agente.py`) **por:**

```
*/30 * * * * /usr/bin/flock -n /tmp/agente_nomina.lock /home/nomina/venv_zk/bin/python3 $HOME/agente_nomina/agente.py >> $HOME/agente_nomina/agente.log 2>&1
```

- `flock -n` → si ya hay una instancia corriendo, la nueva no inicia (elimina los 46 runs simultáneos)
- `*/30` → cada 30 minutos en lugar de cada 5 (reduce colisiones con v1 y procesos del MB360)
- `>> agente.log 2>&1` → log de errores para diagnóstico futuro

**Verificar que flock existe:**
```bash
which flock   # debe devolver /usr/bin/flock
```

**Verificar crontab actual antes de cambiar:**
```bash
crontab -l
```

---

## Diagnóstico completo del cron y checadas (sesión de hoy)

### sync_log — historial real del cron
| Fecha | Estado |
|---|---|
| Mar 26 | Primera corrida: descargó 26,257 registros históricos de golpe |
| Mar 27–28 | Normal (300–456 nuevos/día) |
| Mar 29–31 | Muy esporádico, gaps grandes |
| **Abr 1–9** | **COMPLETAMENTE APAGADO** (Semana Santa + laptop off) |
| Abr 10 | 3 runs a las 23:11, 164 nuevos |
| **Abr 11–12** | Sin runs |
| Abr 13 | 16:00 → 631 nuevos; 19:08 → 752 nuevos (46 runs simultáneos) |
| Abr 14 | 2 runs normales |

### Gaps de datos confirmados en asistencias_checadas
- **Abr 1–9**: vacío para la mayoría (Semana Santa real + cron apagado)
- **Abr 13 13:04–19:41**: CERO checadas para cualquier usuario (backup USB bloqueó el MB360)
- Las salidas de esa tarde (incluyendo la de Eduardo) se perdieron permanentemente — el dispositivo las registró pero no pudo ser consultado y al reiniciarse las perdió

### tipo_punch es NO confiable
El MB360 envía todos los punches como tipo=0 o todos como tipo=1 dependiendo del modo, sin distinguir entrada/salida. El código ya lo maneja: usa **posición temporal** (primera del día = entrada, última = salida), no tipo_punch. Dedup window: 180 segundos para colapsar duplicados físicos del mismo evento.

---

## Estado de la DB — Datos reales hoy
- **Docentes activos:** 162
- **Asignaciones activas:** (ver /api/estadisticas/resumen)
- **Checadas totales:** 28,000+
- **Quincenas:** 5 (Q3 pagada, Q4 en revisión, Q5 abierta)
- **Evaluaciones virtuales:** 280 registros

---

## Servidor local (esta PC)
- FastAPI corre con: `nohup python -m uvicorn main_nomina:app --reload --host 0.0.0.0 --port 8000 >> logs/uvicorn.log 2>&1 &`
- Logs: `C:\Proyectos\nomina-iesef\logs\uvicorn.log`
- **IMPORTANTE:** el proceso NO tiene `systemctl` — es un `nohup` en bash. Si se cae, relanzar con el comando anterior.
- Para verificar que corre: `netstat -ano | grep :8000`
- Para matar: buscar PID con `wmic process get ProcessId,CommandLine | grep uvicorn` y usar `os.kill(PID, signal.SIGTERM)` desde Python

---

## Siguiente sprint — Funcionalidades pendientes

### Alta prioridad
- [ ] **Motor de cálculo fiscal completo** — horas × tarifa → honorarios, IVA, ISR, retenciones (fórmula ya definida en CLAUDE.md §12)
- [ ] **Generación Excel HONORARIOS CENTRO y HONORARIOS INSTITUTO** — formato exacto del Excel actual
- [ ] **Módulo de incidencias y suplencias** — flujo: coord_academica registra → coord_docente valida → cap_humano aprueba

### Media prioridad
- [ ] **Cargar horarios desde PDF aSc** — Eduardo pasa el PDF, Claude parsea y genera SQL de INSERT
- [ ] **Clasificador de checadas** con ventanas de horario (asistencia/retardo/incompleta) para docentes
- [ ] **Eliminar grupo "Segundo 1" de PREPA** — Eduardo lo identificó como inexistente (hacerlo desde Horarios Por Grupo)

### Baja prioridad
- [ ] Estadísticas: agregar más indicadores conforme crezca el sistema
- [ ] Integración Aspel NOI (formato de exportación pendiente de definir con Finanzas)

---

## Arquitectura clave — recordatorios

### Infraestructura
- **No está en HostGator todavía** — todo corre local con Cloudflare Tunnel
- `nexo.iesef.edu.mx` → Cloudflare → túnel → `localhost:8000` en esta PC
- PostgreSQL local, `iesef_nomina` (NUNCA tocar `iesef_chatbot`)
- psycopg2 directo, sin SQLAlchemy, sin Docker

### Asignaciones — JOIN por fechas (NO por ciclo string)
```sql
JOIN asignaciones a ON a.docente_id = d.id
  AND a.vigente_desde <= q.fecha_fin
  AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= q.fecha_inicio)
  AND a.activa = true
```

### Cálculo fiscal (Art. 106 LISR) — fórmula fija
```
honorarios     = horas_reales × costo_hora
iva            = honorarios × 0.16
sub_total      = honorarios + iva
retencion_isr  = honorarios × 0.10
retencion_iva  = iva × (2/3)
total_a_pagar  = sub_total - retencion_isr - retencion_iva
```

---

## Cómo sincronizar entre PCs

### Al EMPEZAR una sesión (cualquier PC)
```bash
cd /ruta/del/repo   # o C:\Proyectos\nomina-iesef en Windows
git pull
# Claude Code leerá NEXO_ESTADO.md automáticamente
```

### Al TERMINAR una sesión
El asistente actualiza este archivo y hace push. Tú solo haces `git pull` en la siguiente PC.

---

## Credenciales y accesos rápidos
Ver: `~/.claude/projects/.../memory/reference_hostgator_credentials.md`  
(No se guarda aquí por seguridad)
