# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión. Se actualiza al final de cada sesión de trabajo.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-14 (noche — PC casa)
**Rama:** `main`
**Último commit:** `1666758` — fix: filtrar nomina por razon_social + eliminar en_revision para superadmin

---

## FLUJO DE TRABAJO REMOTO — Cómo aplicar cambios desde PC trabajo

```
PC trabajo (Claude Code)
        │
        │  git push → GitHub
        ▼
  github.com/EduardoDknight/nomina-iesef
        │
        │  Webhook POST /deploy  (automático al hacer push)
        ▼
  nexo.iesef.edu.mx/deploy
        │  verifica firma HMAC SHA-256
        │  git pull --ff-only
        │  touch archivos .py modificados
        ▼
  uvicorn --reload detecta cambios
        │
        ▼
  🌐 nexo.iesef.edu.mx actualizado (sin tocar la PC casa)
```

### Requisito único: GitHub Webhook
Configurar **UNA SOLA VEZ** en:
> github.com/EduardoDknight/nomina-iesef → Settings → Webhooks → Add webhook

| Campo | Valor |
|---|---|
| Payload URL | `https://nexo.iesef.edu.mx/deploy` |
| Content type | `application/json` |
| Secret | `iesef-deploy-2026` |
| Events | Just the push event |
| Active | ✅ |

Después del primer push, GitHub muestra ✅ verde si el webhook funcionó.

### Flujo en PC trabajo (sesión típica)
```bash
# 1. Al empezar
git pull

# 2. Claude Code hace los cambios
# (si hay frontend: npm run build en frontend/)

# 3. Al terminar
git add -u
git add -f frontend/dist/     # si hubo cambios de UI
git commit -m "fix: descripción del cambio"
git push
# → GitHub dispara el webhook → nexo se actualiza solo
```

---

## ARRANQUE AUTOMÁTICO DEL SERVIDOR (PC casa)

### Script manual (si el servidor se cae)
```powershell
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\start_server.ps1
```

### Instalar arranque automático al inicio de Windows (ejecutar UNA SOLA VEZ como admin)
```powershell
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\scripts\instalar_autostart.ps1
```
Esto crea una tarea en el Programador de tareas que arranca uvicorn automáticamente
cada vez que inicias sesión en Windows.

### Verificar que el servidor corre
```powershell
# Test rápido
python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/').status)"
# Debe imprimir: 200

# Ver logs en tiempo real
Get-Content C:\Proyectos\nomina-iesef\logs\uvicorn_err.log -Wait
```

### Logs
- `logs/uvicorn.log` — stdout (casi vacío)
- `logs/uvicorn_err.log` — stderr donde uvicorn realmente escribe

---

## CHANGELOG — Historial de cambios importantes

| Fecha/Hora (CST) | PC | Cambio | Motivo |
|---|---|---|---|
| 2026-03-26 ~AM | Ubuntu laptop | Primera corrida del agente pyzk → 26,257 registros históricos del MB360 | Inicio de sincronización automática |
| 2026-03-29 (sábado) | Ubuntu laptop | Agente apuntado a `nexo.iesef.edu.mx` | Migración a servidor local con tunnel |
| 2026-04-13 13:04–19:41 | MB360 | **GAP TOTAL de checadas** — backup USB bloqueó TCP | Datos perdidos permanentemente |
| 2026-04-14 ~AM | Ubuntu laptop | **Cron corregido: `*/30` con flock** | Eliminar 46 instancias simultáneas |
| 2026-04-14 10:35 | PC trabajo | Fix exportar nómina: `a.ciclo` → `vigente_desde/vigente_hasta` | Excel nómina ya funciona |
| 2026-04-14 10:40 | PC trabajo | Webhook `/deploy` implementado | Auto-deploy desde GitHub |
| 2026-04-14 ~20:00 | PC casa | `.env` + `DEPLOY_SECRET`; servidor levantado; Excel verificado OK | Setup PC casa |
| 2026-04-14 ~20:30 | PC casa | Estadísticas: KPIs + recharts (5 gráficas) | Módulo completado |
| 2026-04-14 ~21:00 | PC casa | Quincenas: colores por mes + botón eliminar | UX |
| 2026-04-14 ~21:30 | PC casa | Fix razon_social en cálculo nómina (centro ≠ instituto) | Bug: quincena centro mostraba todos los programas |
| 2026-04-14 ~22:00 | PC casa | Autostart Windows + deploy.py mejorado (touch .py) | Infraestructura |
| 2026-04-14 | Eduardo | Sistema v1 corregido: columna `_biometrico` | v1 ya toma sus propias checadas |

---

## Lo que está funcionando en producción

| Módulo | Estado |
|---|---|
| Login JWT / roles / usuarios | ✅ |
| Catálogos: docentes, programas, materias | ✅ |
| Asignaciones + horarios (vigente_desde/vigente_hasta) | ✅ |
| Horarios Por Grupo: grilla semanal visual | ✅ |
| Quincenas: crear, estado, colores por mes, eliminar | ✅ |
| QuincenaDetalle: nómina, asistencia, virtual, incidencias, campo clínico | ✅ |
| Evaluación virtual (CA 40% + EV 60%) | ✅ |
| Cálculo nómina filtrado por razon_social (centro/instituto/ambas) | ✅ |
| Exportación Excel nómina resumen | ✅ |
| Personal Administrativo: CRUD + asistencia quincena | ✅ |
| Portal docente/trabajador: checadas, credenciales | ✅ |
| Estadísticas — KPIs animados + 5 gráficas recharts | ✅ |
| MB360 → Ubuntu laptop → nexo (28k+ checadas) | ✅ cron cada 30min con flock |
| Cloudflare Tunnel (nexo.iesef.edu.mx → localhost:8000) | ✅ |
| Auto-deploy via GitHub webhook POST /deploy | ⏳ falta configurar webhook en GitHub |
| Arranque automático del servidor en Windows | ⏳ ejecutar instalar_autostart.ps1 |

---

## ⚠️ ACCIONES PENDIENTES EN PC CASA

### 1. Configurar webhook en GitHub (solo una vez, en el browser)
Ver instrucciones en sección "FLUJO DE TRABAJO REMOTO" arriba.

### 2. Instalar arranque automático del servidor
```powershell
# Abrir PowerShell como Administrador y ejecutar:
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\scripts\instalar_autostart.ps1
```

### 3. Cron Ubuntu laptop — flock (cuando puedas SSH)
```bash
crontab -e
# Cambiar a:
*/30 * * * * /usr/bin/flock -n /tmp/agente_nomina.lock /home/nomina/venv_zk/bin/python3 /home/nomina/agente_nomina/agente.py >> /home/nomina/agente_nomina/agente.log 2>&1
```

### 4. Zona horaria PC casa
```powershell
Set-TimeZone -Id "Central Standard Time (Mexico)"
```

---

## Siguiente sprint — Funcionalidades pendientes

### Alta prioridad
- [ ] **Motor de cálculo fiscal completo** — honorarios × IVA × ISR por razon_social (fórmula ya documentada en CLAUDE.md)
- [ ] **Excel HONORARIOS** — formato exacto del Excel original: HONORARIOS CENTRO y HONORARIOS INSTITUTO con cálculo fiscal
- [ ] **Módulo de incidencias y suplencias** — flujo: coord_academica → coord_docente → cap_humano

### Media prioridad
- [ ] **Cargar horarios desde PDF aSc** — Eduardo pasa el PDF, Claude parsea y genera SQL
- [ ] **Clasificador de checadas** con ventanas de horario para docentes
- [ ] **Eliminar grupo "Segundo 1" de PREPA** — identificado como inexistente

### Baja prioridad
- [ ] Estadísticas: más indicadores
- [ ] Integración Aspel NOI
- [ ] **PWA** — manifest.json + Service Worker

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

### Estado de la DB
- Docentes activos: 162
- Checadas totales: 28,097+ (al 2026-04-14)
- Quincenas: Q3 pagada · Q4 en_revision (id=4, ambas) · Q5 abierta (id=5) · Q6 en_revision (id=6, centro — pendiente eliminar)

---

## Cómo sincronizar entre PCs

### Al EMPEZAR una sesión (cualquier PC)
```bash
git pull
# Claude Code leerá NEXO_ESTADO.md automáticamente → contexto completo
```

### Al TERMINAR una sesión (PC trabajo → deploy automático)
```bash
git add -u
git add -f frontend/dist/    # si hubo cambios de UI
git commit -m "descripción"
git push
# Si el webhook está configurado → nexo se actualiza solo en ~5 segundos
```

---

## Credenciales y accesos rápidos
Ver: `~/.claude/projects/.../memory/` — no se guardan aquí por seguridad.
