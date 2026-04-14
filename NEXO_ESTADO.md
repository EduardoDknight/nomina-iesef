# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión. Se actualiza al final de cada sesión de trabajo.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-14 (noche — PC casa)
**Rama:** `main`
**Último commit:** pendiente de push

---

## CHANGELOG — Historial de cambios importantes
> Formato: `YYYY-MM-DD HH:MM | PC | Cambio | Motivo`
> Agregar aquí cualquier cambio crítico en infraestructura, BD, cron, o lógica de negocio.

| Fecha/Hora (CST) | PC | Cambio | Motivo |
|---|---|---|---|
| 2026-03-26 ~AM | Ubuntu laptop | Primera corrida del agente pyzk → 26,257 registros históricos del MB360 | Inicio de sincronización automática |
| 2026-03-29 (sábado) | Ubuntu laptop | Agente apuntado de `api.iesef.edu.mx` → `nexo.iesef.edu.mx` | Migración a servidor local con tunnel |
| 2026-04-01 al 09 | Ubuntu laptop | Cron APAGADO | Semana Santa, laptop apagada |
| 2026-04-13 ~13:04 | MB360 | Alguien intentó respaldar MB360 a USB → puerto TCP bloqueado | Backup manual no coordinado |
| 2026-04-13 13:04–19:41 | MB360 | **GAP TOTAL de checadas** — CERO registros para cualquier usuario | TCP bloqueado por backup USB |
| 2026-04-13 ~19:00 | Ubuntu laptop | 46 instancias del cron corriendo simultáneamente (confirmado en sync_log) | Bug: flock no configurado |
| 2026-04-14 ~AM | Ubuntu laptop | **Cron corregido: `*/5` → `*/30 con flock`** | Eliminar colisiones con v1 y MB360 |
| 2026-04-14 10:35 CST | PC trabajo | Fix `a.ciclo` → `vigente_desde/vigente_hasta` en exportar_nomina_resumen | Error al exportar Excel nómina |
| 2026-04-14 10:40 CST | PC trabajo | Webhook `/deploy` agregado para auto-pull desde GitHub | Eliminar necesidad de ir a casa para aplicar fixes |
| 2026-04-14 ~20:00 CST | PC casa | `.env` actualizado con `DEPLOY_SECRET=iesef-deploy-2026` | El webhook necesitaba el secret para verificar firma |
| 2026-04-14 ~20:00 CST | PC casa | Sistema v1 corregido (columna `_biometrico` mal nombrada por dev externo) | v1 ya funciona y toma sus checadas |
| 2026-04-14 ~20:00 CST | PC casa | Excel nómina verificado OK — genera 20,252 bytes sin errores para Q4 | Confirmado funcional |
| 2026-04-14 ~20:00 CST | PC casa | Uvicorn iniciado con `Start-Process` PowerShell + `--reload` | Servidor corriendo en localhost:8000 |

---

## ✅ TAREAS COMPLETADAS HOY (PC casa, noche)

1. ✅ **DEPLOY_SECRET** agregado al `.env` → webhook ya puede verificar firmas GitHub
2. ✅ **Excel nómina** verificado — genera sin errores (fix `vigente_desde/vigente_hasta` funcionando)
3. ✅ **Uvicorn** iniciado correctamente con `--reload`, responde en localhost:8000
4. ✅ **Sistema v1** corregido por Eduardo (columna `_biometrico` eliminada del código del dev externo)

---

## ⚠️ PENDIENTE INMEDIATO — Configurar GitHub Webhook

Ve a: **github.com/EduardoDknight/nomina-iesef → Settings → Webhooks → Add webhook**

| Campo | Valor |
|---|---|
| Payload URL | `https://nexo.iesef.edu.mx/deploy` |
| Content type | `application/json` |
| Secret | `iesef-deploy-2026` |
| Events | Just the push event |
| Active | ✅ |

---

## ⚠️ PENDIENTE — Cron Ubuntu laptop

En la laptop Ubuntu, ejecutar:
```bash
crontab -e
# Cambiar la línea del cron de:
#   */5 * * * * /ruta/al/script
# Por:
#   */30 * * * * /usr/bin/flock -n /tmp/agente_nomina.lock /ruta/al/script
```
Confirmar con: `crontab -l`

---

## ⚠️ PENDIENTE — Zona horaria PC casa
El servidor guarda timestamps 2 horas adelantados (el reloj está mal).
```powershell
Set-TimeZone -Id "Central Standard Time (Mexico)"
```

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
| Exportación Excel nómina | ✅ FUNCIONANDO (fix aplicado + verificado) |
| Personal Administrativo: CRUD + asistencia quincena | ✅ |
| Portal docente/trabajador: checadas, credenciales | ✅ |
| Estadísticas — KPIs animados + gráficas recharts | ✅ |
| MB360 → Ubuntu laptop → nexo (28k+ checadas) | ✅ cron cada 30min con flock |
| Cloudflare Tunnel (nexo.iesef.edu.mx → localhost:8000) | ✅ |
| Auto-deploy via GitHub webhook | ⏳ falta configurar en GitHub (ver arriba) |
| Sistema v1 (dev externo) | ✅ corregido — ya toma sus propias checadas |

---

## Servidor local (PC casa)
- FastAPI arranca con:
  ```powershell
  powershell -Command "Start-Process -FilePath 'python' -ArgumentList '-m uvicorn main_nomina:app --reload --host 0.0.0.0 --port 8000' -WorkingDirectory 'C:\Proyectos\nomina-iesef' -RedirectStandardOutput 'C:\Proyectos\nomina-iesef\logs\uvicorn.log' -RedirectStandardError 'C:\Proyectos\nomina-iesef\logs\uvicorn_err.log' -WindowStyle Hidden"
  ```
- Logs stdout: `C:\Proyectos\nomina-iesef\logs\uvicorn.log`
- Logs stderr (donde realmente escribe): `C:\Proyectos\nomina-iesef\logs\uvicorn_err.log`
- Verificar proceso: `netstat -ano | findstr :8000` (o `python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/docs').status)"`)
- **No usa systemctl** — es un Start-Process en PowerShell.

---

## Diagnóstico checadas — historial del cron (sync_log)
| Fecha | Estado |
|---|---|
| Mar 26 | Primera corrida: descargó 26,257 registros históricos |
| Mar 27–28 | Normal (300–456 nuevos/día) |
| Mar 29–31 | Muy esporádico |
| Abr 1–9 | APAGADO (Semana Santa + laptop off) — NORMAL |
| Abr 10 | 3 runs, 164 nuevos (regreso vacaciones) |
| Abr 11–12 | Sin runs |
| Abr 13 | 631 + 752 nuevos (46 instancias simultáneas) |
| Abr 14 | Cron corregido a */30 con flock ✅ |

### Gap Abr 13 13:04–19:41 — Permanente, no recuperable
Backup USB bloqueó el puerto TCP del MB360. Las checadas de ese período (incluyendo salida de Eduardo) se perdieron permanentemente. El MB360 no guarda logs de intentos fallidos de conexión.

### tipo_punch NO confiable
El MB360 envía todos los punches como tipo=0 o tipo=1 sin distinguir entrada/salida.
El código usa **posición temporal** (primera del día = entrada, última = salida). Dedup: 180 seg.

---

## Estado de la DB
- **Docentes activos:** 162
- **Checadas totales:** 28,097+ (al 2026-04-14)
- **Quincenas:** Q3 pagada · Q4 en_revisión (id=4) + abierta (id=6) · Q5 abierta (id=5)
- **Evaluaciones virtuales:** 280 registros

---

## Siguiente sprint — Funcionalidades pendientes

### Alta prioridad
- [ ] **Configurar webhook GitHub** — ver instrucciones arriba
- [ ] **Verificar MB360** — conectar via SSH a laptop Ubuntu y confirmar checadas de docentes recientes
- [ ] **Módulo de incidencias y suplencias** — flujo: coord_academica → coord_docente → cap_humano
- [ ] **Motor de cálculo fiscal** — horas × tarifa → honorarios, IVA, ISR (fórmula ya documentada)
- [ ] **Excel HONORARIOS** — formato exacto del Excel original (separado del resumen actual)

### Media prioridad
- [ ] **Cargar horarios desde PDF aSc** — Eduardo pasa el PDF, Claude parsea y genera SQL
- [ ] **Clasificador de checadas** con ventanas de horario para docentes
- [ ] **Eliminar grupo "Segundo 1" de PREPA** — identificado como inexistente

### Baja prioridad
- [ ] Estadísticas: más indicadores
- [ ] Integración Aspel NOI
- [ ] **PWA (Progressive Web App)** — manifest.json + Service Worker. Estimado: 1-2 días.

---

## Arquitectura clave — recordatorios

### Infraestructura
- **No está en HostGator** — todo corre local con Cloudflare Tunnel en PC casa
- `nexo.iesef.edu.mx` → Cloudflare → túnel → `localhost:8000` PC casa
- PostgreSQL local `iesef_nomina` — NUNCA tocar `iesef_chatbot`
- psycopg2 directo, sin SQLAlchemy, sin Docker

### Asignaciones — JOIN por fechas (NO por ciclo string)
```sql
JOIN asignaciones a ON a.docente_id = d.id
  AND a.vigente_desde <= q.fecha_fin
  AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= q.fecha_inicio)
  AND a.activa = true
```

### Cálculo fiscal (Art. 106 LISR)
```
honorarios     = horas_reales × costo_hora
iva            = honorarios × 0.16
sub_total      = honorarios + iva
retencion_isr  = honorarios × 0.10
retencion_iva  = iva × (2/3)
total_a_pagar  = sub_total - retencion_isr - retencion_iva
```

### Comando arranque servidor (PC casa)
```powershell
powershell -Command "Start-Process -FilePath 'python' -ArgumentList '-m uvicorn main_nomina:app --reload --host 0.0.0.0 --port 8000' -WorkingDirectory 'C:\Proyectos\nomina-iesef' -RedirectStandardOutput 'C:\Proyectos\nomina-iesef\logs\uvicorn.log' -RedirectStandardError 'C:\Proyectos\nomina-iesef\logs\uvicorn_err.log' -WindowStyle Hidden"
```

---

## Cómo sincronizar entre PCs

### Al EMPEZAR una sesión (cualquier PC)
```bash
cd C:\Proyectos\nomina-iesef   # o C:/nomina-iesef en PC trabajo
git pull
# Claude Code leerá NEXO_ESTADO.md automáticamente y tendrá todo el contexto
```

### Al TERMINAR una sesión
Claude actualiza este archivo y hace push. En la siguiente PC solo haz `git pull`.

---

## Credenciales y accesos rápidos
Ver: `~/.claude/projects/.../memory/` — no se guardan aquí por seguridad.
