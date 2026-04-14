# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión. Se actualiza al final de cada sesión de trabajo.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-14 (tarde — PC trabajo)
**Rama:** `main`
**Último commit:** `8150183` — feat: webhook /deploy para auto-pull desde GitHub

---

## ⚠️ TAREAS PENDIENTES AL LLEGAR A CASA — HACER ANTES DE CUALQUIER OTRA COSA

### 1. git pull (aplica 2 fixes críticos de hoy)
```bash
cd C:\Proyectos\nomina-iesef
git pull
```
Uvicorn con `--reload` se reinicia solo. Los fixes que se aplican:
- **fix exportar_nomina_resumen:** `a.ciclo` → `vigente_desde/vigente_hasta` (el Excel ya no dará error)
- **feat deploy webhook:** nuevo endpoint `POST /deploy` para auto-pull desde GitHub

### 2. Agregar DEPLOY_SECRET al .env
Edita `C:\Proyectos\nomina-iesef\.env` y agrega:
```
DEPLOY_SECRET=iesef-deploy-2026
```

### 3. Configurar webhook en GitHub
Ve a: **github.com/EduardoDknight/nomina-iesef → Settings → Webhooks → Add webhook**

| Campo | Valor |
|---|---|
| Payload URL | `https://nexo.iesef.edu.mx/deploy` |
| Content type | `application/json` |
| Secret | `iesef-deploy-2026` |
| Events | Just the push event |

### 4. Verificar que el Excel de nómina funciona
Entra a nexo.iesef.edu.mx → Quincena Q4 (26 mar – 10 abr) → Exportar Nómina.
Ya no debe aparecer el error `no existe la columna a.ciclo`.

### 5. Corregir zona horaria de la PC de casa
El servidor guarda timestamps 2 horas adelantados (el reloj está mal).
```powershell
Set-TimeZone -Id "Central Standard Time (Mexico)"
```

### 6. Verificar checadas del MB360 — diagnóstico pendiente
Eduardo iba a conectarse a la laptop Ubuntu por SSH para ver si el MB360
tiene registros de ayer y hoy. Correr esto en la laptop Ubuntu:
```bash
cd $HOME/agente_nomina
/home/nomina/venv_zk/bin/python3 - << 'EOF'
from zk import ZK
from datetime import date, timedelta
zk = ZK('192.168.1.201', port=4370, timeout=10)
conn = zk.connect()
registros = conn.get_attendance()
hoy = date.today()
ayer = hoy - timedelta(days=1)
recientes = [r for r in registros if r.timestamp.date() >= ayer]
print(f"Total en checador: {len(registros)}")
print(f"Registros de ayer y hoy: {len(recientes)}")
for r in sorted(recientes, key=lambda x: x.timestamp):
    print(f"  user_id={r.user_id}  {r.timestamp}  punch={r.punch}")
conn.disconnect()
EOF
```
Objetivo: confirmar si los docentes tienen checadas recientes en el MB360
y si sus user_ids coinciden con los `chec_id` en la tabla `docentes`.

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
| Exportación Excel nómina | ✅ (fix pendiente de git pull en casa) |
| Personal Administrativo: CRUD + asistencia quincena | ✅ |
| Portal docente/trabajador: checadas, credenciales | ✅ |
| Estadísticas — KPIs animados + gráficas recharts | ✅ |
| MB360 → Ubuntu laptop → nexo (28k+ checadas) | ✅ cron cada 30min con flock |
| Cloudflare Tunnel (nexo.iesef.edu.mx → localhost:8000) | ✅ |
| Auto-deploy via GitHub webhook | ⏳ pendiente configurar (ver arriba) |

---

## Lo hecho en la sesión de hoy (PC trabajo, 2026-04-14)

### Setup PC trabajo
- Repo clonado en `C:/nomina-iesef`
- Python 3.12 instalado en `C:/Python312`
- Dependencias instaladas (`pip install -r requirements.txt`)
- Git configurado: `EduardoDknight` / `eperez.ig@gmail.com`
- Claude Code en modo automático (`bypassPermissions`)
- Memoria del proyecto guardada en `C:/Users/IESEF/.claude/projects/.../memory/`

### Diagnóstico del sistema de checadas
- Confirmado: registros en `asistencias_checadas` llegan bien hasta hoy (28,097)
- Vacaciones Semana Santa (1-9 abr): counts bajos son NORMALES, no bug
- Cron del agente tenía 46 instancias simultáneas → **corregido a */30 con flock**
- Reloj PC de casa 2 horas adelantado → timestamps se ven desincronizados pero son correctos
- Gap permanente Abr 13 13:04–19:41: backup USB bloqueó el MB360, datos perdidos
- Sistema v1 sin checadas de docentes: pendiente verificar MB360 directamente

### Fixes pusheados hoy
| Commit | Descripción |
|---|---|
| `19367f7` | fix: `a.ciclo` → `vigente_desde/vigente_hasta` en exportar_nomina_resumen |
| `8150183` | feat: webhook `/deploy` para auto-pull desde GitHub |

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

### tipo_punch NO confiable
El MB360 envía todos los punches como tipo=0 o tipo=1 sin distinguir entrada/salida.
El código usa **posición temporal** (primera del día = entrada, última = salida). Dedup: 180 seg.

---

## Estado de la DB
- **Docentes activos:** 162
- **Checadas totales:** 28,097 (al 2026-04-14 ~10:35 CST)
- **Quincenas:** Q3 pagada · Q4 en revisión · Q5 abierta
- **Evaluaciones virtuales:** 280 registros

---

## Servidor local (PC casa)
- FastAPI: `nohup python -m uvicorn main_nomina:app --reload --host 0.0.0.0 --port 8000 >> logs/uvicorn.log 2>&1 &`
- Logs: `C:\Proyectos\nomina-iesef\logs\uvicorn.log`
- **No usa systemctl** — es un nohup en bash. Si se cae, relanzar con el comando anterior.
- Verificar que corre: `netstat -ano | grep :8000`

---

## Siguiente sprint — Funcionalidades pendientes

### Alta prioridad
- [ ] **Verificar MB360** — conectar via SSH a laptop Ubuntu y confirmar checadas de docentes recientes
- [ ] **Nómina Q4 (26 mar–10 abr)** — Eduardo necesita exportar Excel hoy. Requiere git pull en casa primero.
- [ ] **Módulo de incidencias y suplencias** — flujo: coord_academica → coord_docente → cap_humano

### Media prioridad
- [ ] **Cargar horarios desde PDF aSc** — Eduardo pasa el PDF, Claude parsea y genera SQL
- [ ] **Clasificador de checadas** con ventanas de horario para docentes
- [ ] **Eliminar grupo "Segundo 1" de PREPA** — identificado como inexistente

### Baja prioridad
- [ ] Estadísticas: más indicadores
- [ ] Integración Aspel NOI

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
