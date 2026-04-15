# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión para Claude Code. Se actualiza al final de cada sesión.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-15 (tarde — PC trabajo, 2 sesiones consecutivas)
**Rama:** `main`
**Último commit:** `426a370` — docs: actualizar estado sesión con SyncBadge y pasos build PC casa

### Commits de hoy (en orden)
| Hash | Descripción |
|---|---|
| `7ba2c61` | fix: GET nómina lee razon_social directamente de la quincena |
| `c43da08` | fix: asistencia y resumen count filtran por razon_social |
| `0de0ceb` | fix: asistencia usa p.razon_social (no d.adscripcion) |
| `807da08` | fix: deploy usa os._exit(0) para restart real del worker |
| `4495264` | fix: exportar nómina filtra SQL por razon_social ($75 → $120) |
| `7d3c38f` | docs: agregar problema reload uvicorn como prioridad crítica |
| `2132626` | feat: SyncBadge — indicador último sync MB360 en 7 vistas |
| `426a370` | docs: actualizar estado sesión con SyncBadge y pasos build PC casa |

---

## 🚨 ACCIÓN REQUERIDA AL LLEGAR A CASA (5pm)

### PASO 1 — Reiniciar uvicorn (activa TODOS los fixes de hoy)
```powershell
Get-Process python | Stop-Process -Force
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\start_server.ps1
```

### PASO 2 — Build del frontend (activa el SyncBadge visual)
```powershell
cd C:\Proyectos\nomina-iesef\frontend
npm run build
cd ..
git add -f frontend/dist/
git commit -m "build: SyncBadge + activa fixes razon_social"
git push
```

### PASO 3 — Verificar que todo funcionó
1. Abrir quincena "centro" → debe mostrar solo ~20 docentes de Bachillerato (no 145)
2. Exportar Excel → Barrera Reyes debe mostrar $120 (no $75)
3. Estadísticas → debe aparecer badge "Al día · MB360 HH:MM" en lugar de "En vivo"
4. Hacer un push de prueba desde PC trabajo → verificar que nexo se actualiza en ~3 seg

### ¿Por qué es necesario el restart manual?
El fix de `os._exit(0)` en `deploy.py` necesita ser cargado antes de poder usarse.
Es un problema de arranque único: después de este restart, todos los futuros pushes
desde PC trabajo actualizarán automáticamente el servidor.

---

## FLUJO DE TRABAJO REMOTO — Cómo funciona el auto-deploy

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
        │  verifica firma HMAC SHA-256 (DEPLOY_SECRET en .env de PC casa)
        │  git pull --ff-only
        │  os._exit(0) en hilo secundario → uvicorn reinicia el worker
        ▼
  nexo.iesef.edu.mx actualizado (~3-5 seg, sin tocar PC casa)
```

### Webhook GitHub
- ID: `606281234` | URL: `https://nexo.iesef.edu.mx/deploy`
- Ping verificado: **200 OK**

### Flujo en PC trabajo (sesión típica)
```bash
git pull                          # siempre al empezar
# Claude Code hace los cambios en backend (.py)
git add -u
git commit -m "descripción"
git push                          # dispara webhook → backend actualizado en ~5 seg

# Si hay cambios de UI (frontend .jsx):
# → HACER EN PC CASA: npm run build && git add -f frontend/dist/ && git push
```

---

## ARRANQUE DEL SERVIDOR (PC casa)

### Reinicio manual
```powershell
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\start_server.ps1
```

### Arranque automático al inicio de Windows
```powershell
# Una sola vez, como admin:
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\scripts\instalar_autostart.ps1
```
✅ Ya instalado en carpeta Startup del usuario.

### Verificar que el servidor corre
```python
python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/').status)"
# → 200
```

---

## CHANGELOG — Historial de cambios importantes

| Fecha/Hora (CST) | PC | Cambio | Motivo |
|---|---|---|---|
| 2026-03-26 ~AM | Ubuntu laptop | Primera corrida pyzk → 26,257 registros del MB360 | Inicio sincronización |
| 2026-03-29 | Ubuntu laptop | Agente apuntado a `nexo.iesef.edu.mx` | Migración a servidor local |
| 2026-04-13 13:04–19:41 | MB360 | **GAP TOTAL checadas** — backup USB bloqueó TCP | Datos perdidos permanentemente |
| 2026-04-14 ~AM | Ubuntu laptop | Cron corregido: `*/30` con flock | Eliminar 46 instancias simultáneas |
| 2026-04-14 10:35 | PC trabajo | Fix exportar nómina: `a.ciclo` → `vigente_desde/vigente_hasta` | Excel nómina funciona |
| 2026-04-14 10:40 | PC trabajo | Webhook `/deploy` implementado | Auto-deploy desde GitHub |
| 2026-04-14 ~20:00 | PC casa | `.env` + `DEPLOY_SECRET`; Excel nómina verificado OK | Setup PC casa |
| 2026-04-14 ~20:30 | PC casa | Estadísticas: KPIs animados + 5 gráficas recharts | Módulo completado |
| 2026-04-14 ~21:00 | PC casa | Quincenas: colores por mes + botón eliminar + superadmin | UX + permisos |
| 2026-04-14 ~21:30 | PC casa | Fix razon_social en cálculo nómina | Bug: quincena 'centro' incluía todos los programas |
| 2026-04-14 ~22:00 | PC casa | Autostart Windows + deploy.py mejorado | Infraestructura auto-deploy |
| 2026-04-14 ~22:30 | PC casa | Fix modal incidencias: dropdown Asignación vacío | `ciclo_label AS ciclo` + fechas como texto en Pydantic |
| 2026-04-14 | Eduardo | Sistema v1 corregido: columna `_biometrico` | v1 ya toma sus propias checadas |
| 2026-04-15 tarde | PC trabajo | **Fixes razon_social** (3 endpoints + export): nómina GET, asistencia, resumen, Excel | Quincena 'centro' mostraba 145 docentes → solo ~20 |
| 2026-04-15 tarde | PC trabajo | **deploy.py os._exit(0)**: restart real del worker uvicorn | Webhook ya recarga código nuevo (pendiente restart manual) |
| 2026-04-15 tarde | PC trabajo | **SyncBadge**: indicador último sync MB360 en 7 vistas | Usuarios saben hasta qué hora son sus datos |

---

## MÓDULOS EN PRODUCCIÓN

| Módulo | Estado | Notas |
|---|---|---|
| Login JWT / roles / usuarios | ✅ activo | |
| Catálogos: docentes, programas, materias, asignaciones | ✅ activo | |
| Horarios Por Grupo: grilla semanal visual | ✅ activo | |
| Quincenas: crear, estados, colores por mes, eliminar | ✅ activo | |
| QuincenaDetalle: nómina, asistencia, virtual, incidencias, campo clínico | ✅ activo | |
| Modal incidencias: dropdown de asignaciones | ✅ activo | |
| Evaluación virtual (CA 40% + EV 60%) | ✅ activo | |
| Cálculo nómina filtrado por razon_social | ✅ en repo | ⚠️ activa tras restart |
| Exportación Excel nómina resumen | ✅ en repo | ⚠️ fix $75→$120 activa tras restart |
| Personal Administrativo: CRUD + asistencia quincena | ✅ activo | |
| Portal docente/trabajador: checadas, nómina, credenciales | ✅ activo | |
| Estadísticas: KPIs animados + 5 gráficas recharts | ✅ activo | |
| SyncBadge: indicador último sync MB360 en 7 vistas | ✅ fuente lista | ⚠️ pendiente build + restart |
| MB360 → Ubuntu laptop → nexo (28k+ checadas) | ✅ activo | cron 30min con flock |
| Cloudflare Tunnel (nexo.iesef.edu.mx → localhost:8000) | ✅ activo | |
| Auto-deploy webhook `/deploy` | ✅ activo | ⚠️ os._exit activa tras restart |
| Arranque automático Windows | ✅ activo | carpeta Startup del usuario |

---

## INFRAESTRUCTURA

| Item | Estado |
|---|---|
| Zona horaria PC casa | ✅ `America/Mexico_City` (UTC-6) |
| Zona horaria PostgreSQL | ✅ `America/Mexico_City` |
| Timestamps en BD | ✅ todos en CST, coherentes |
| Cron Ubuntu laptop | ✅ `*/30 con flock` |
| Webhook GitHub | ✅ ID 606281234, ping 200 OK |
| Arranque automático Windows | ✅ carpeta Startup del usuario |
| node/npm en PC trabajo | ❌ NO instalado — builds solo en PC casa |

---

## SIGUIENTE SPRINT — Pendientes priorizados

### 🔴 CRÍTICO — Infraestructura

- [ ] **Restart manual en PC casa a las 5pm** — ver sección ACCIÓN REQUERIDA arriba
- [ ] **Build frontend en PC casa** — `npm run build` + commit dist + push
- [ ] **NSSM** — convertir uvicorn en servicio Windows real para deploy sin intervención humana
  ```powershell
  # Descargar nssm.cc, luego:
  nssm install nomina-iesef "C:\Python312\python.exe" "-m uvicorn main_nomina:app --host 0.0.0.0 --port 8000"
  nssm set nomina-iesef AppDirectory "C:\Proyectos\nomina-iesef"
  nssm start nomina-iesef
  ```
  En deploy.py reemplazar `os._exit(0)` con `subprocess.run(["sc", "stop/start", "nomina-iesef"])`

### 🟠 Alta prioridad — Desarrollo

- [ ] **Excel HONORARIOS** — formato fiscal final con firma
  Columnas: PROGRAMA | DOCENTE | H. PROG | H. PRES | H. VIRT | DESC | $/HR | HONORARIOS | IVA 16% | SUBTOTAL | RET ISR | RET IVA | TOTAL A PAGAR | FIRMA
  Dos archivos separados: HONORARIOS CENTRO y HONORARIOS INSTITUTO
- [ ] **Verificar cálculo fiscal** en `services/calculo_nomina.py` — confirmar IVA, ISR, retenciones por razon_social
- [ ] **Módulo incidencias completo** — flujo: Coord.Académica registra → Coord.Docente valida → Cap.Humano aprueba

### 🟡 Media prioridad

- [ ] **Cargar horarios desde PDF aSc** — Eduardo pasa el PDF, Claude parsea y genera SQL
- [ ] **Clasificador de checadas** con ventanas de horario (entrada ±10min, salida máx -20min)
- [ ] **Recalcular nómina Q6** después del restart (quincena centro, debe tener ~20 docentes)
- [ ] **Eliminar grupo "Segundo 1" de PREPA** — identificado como inexistente

### 🟢 Baja prioridad

- [ ] Más indicadores en módulo Estadísticas
- [ ] Integración Aspel NOI (archivo de exportación para pago masivo)
- [ ] **PWA** — manifest.json + Service Worker

---

## ARQUITECTURA CLAVE

### Infraestructura
- **No está en HostGator** — todo corre local con Cloudflare Tunnel en PC casa
- `nexo.iesef.edu.mx` → Cloudflare → túnel → `localhost:8000` PC casa
- PostgreSQL local `iesef_nomina` — **NUNCA tocar `iesef_chatbot`**
- psycopg2 directo, sin SQLAlchemy, sin Docker

### Rutas del proyecto
| PC | Ruta |
|---|---|
| PC trabajo (oficina) | `C:\nomina-iesef` |
| PC casa | `C:\Proyectos\nomina-iesef` |

### Razones sociales — regla crítica
| razon_social | Institución | Tarifa | Filtro correcto en SQL |
|---|---|---|---|
| `centro` | Preparatoria (Bachillerato) | $120/hr | `p.razon_social = 'centro'` |
| `instituto` | Universidad, Especialidades, Maestrías | $130-220/hr | `p.razon_social = 'instituto'` |
| `ambas` | Sin restricción | — | sin filtro |

**Regla**: filtrar SIEMPRE por `p.razon_social` (programa), NO por `d.adscripcion` (docente).
Un docente con `adscripcion='ambos'` puede dar clase en ambas razones sociales.

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
- Docentes activos: ~162 en sistema nuevo | Checadas: 28,097+
- Quincenas: Q3 pagada · Q4 en_revision · Q5 abierta · Q6 (centro, en_revision — pendiente recalcular)
- GAP permanente en checadas: 2026-04-13 13:04–19:41 (backup USB bloqueó TCP)

---

## CÓMO SINCRONIZAR ENTRE PCs

```bash
# Al EMPEZAR (cualquier PC)
git pull
# Claude Code lee este archivo → contexto completo

# Al TERMINAR — cambios de backend
git add -u
git commit -m "descripción"
git push                     # dispara webhook → nexo actualizado en ~5 seg

# Al TERMINAR — cambios de frontend (SOLO EN PC CASA)
npm run build               # en frontend/
git add -f frontend/dist/
git add -u
git commit -m "build: descripción"
git push
```

---

## CREDENCIALES Y ACCESOS
Ver: `~/.claude/projects/.../memory/` — no se guardan aquí por seguridad.
