# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión para Claude Code. Se actualiza al final de cada sesión.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-16 (PC trabajo, sesión completa)
**Rama:** `main`
**Último commit:** `25a20ae` docs: firma digital como proyecto futuro

### Commits del día (en orden)
| Hash | Descripción |
|---|---|
| `7ba2c61` | fix: GET nómina lee razon_social directamente de la quincena |
| `c43da08` | fix: asistencia y resumen count filtran por razon_social |
| `0de0ceb` | fix: asistencia usa p.razon_social (no d.adscripcion) |
| `807da08` | fix: deploy usa os._exit(0) para restart real del worker |
| `4495264` | fix: exportar nómina filtra SQL por razon_social ($75 → $120) |
| `7d3c38f` | docs: agregar problema reload uvicorn como prioridad crítica |
| `2132626` | feat: SyncBadge — indicador último sync MB360 en 7 vistas |
| `426a370` | docs: actualizar estado sesión con SyncBadge y pasos build |
| `5fc21aa` | docs: reescribir NEXO_ESTADO.md + crear NEXO_PROYECTO_CHAT.md |
| `62bc564` | feat: dark mode con persistencia en localStorage |
| `f96cf28` | build: dark mode + SyncBadge + fixes razon_social (**dist compilado**) |

---

## ✅ ACCIONES COMPLETADAS (noche 2026-04-15)

1. ✅ Uvicorn reiniciado con código nuevo (os._exit activo)
2. ✅ `npm run build` ejecutado → dist compilado y pusheado (`f96cf28`)
3. ✅ Webhook disparó correctamente → servidor se reinició solo en ~5s
4. ⬜ **Pendiente verificar manualmente en el navegador:**
   - Quincena "centro" → debe mostrar solo ~20 docentes de Bachillerato (no 145)
   - Excel exportado → Barrera Reyes debe mostrar $120 (no $75)
   - Sidebar → botón 🌙 / ☀️ visible sobre "Cerrar sesión"
   - Estadísticas → badge "Al día · MB360 HH:MM"
   - Recalcular nómina Q6 (centro, id=6)

---

## FLUJO DE TRABAJO REMOTO

```
PC trabajo (Claude Code)
        │  git push → GitHub
        ▼
  github.com/EduardoDknight/nomina-iesef
        │  Webhook POST /deploy (HMAC SHA-256)
        ▼
  nexo.iesef.edu.mx/deploy
        │  git pull --ff-only
        │  os._exit(0) → uvicorn muere (proceso único, sin --reload)
        ▼
  watchdog.ps1 (siempre corriendo en PC casa)
        │  detecta salida del proceso uvicorn
        │  espera 2 segundos
        │  lanza uvicorn fresco con código nuevo del disco
        ▼
  nexo.iesef.edu.mx actualizado (~3-5 seg)
```

- Webhook ID: `606281234` | URL: `https://nexo.iesef.edu.mx/deploy` | Ping: 200 OK
- **Cambios de backend (.py):** se despliegan solos con git push
- **Cambios de frontend (.jsx):** requieren `npm run build` + commit dist en PC casa
- **uvicorn corre SIN `--reload`** — proceso único, watchdog.ps1 es el guardian

### Flujo típico desde PC trabajo
```bash
git pull                    # siempre al empezar
# Claude Code modifica archivos .py o .jsx
git add -u
git commit -m "descripción"
git push                    # backend .py → live en ~5s
                            # frontend .jsx → GitHub Actions build (~2 min) → live

# ⚠️ Si el push falla con "fetch first":
# GitHub Actions commiteó el dist/ mientras trabajabas
git pull --rebase && git push
```

---

## ARRANQUE DEL SERVIDOR (PC casa)

```powershell
# Estado de los servicios NSSM
nssm status nomina-iesef          # Running / Stopped
nssm status cloudflared-nomina

# Reiniciar manualmente
nssm restart nomina-iesef
nssm restart cloudflared-nomina

# Logs
# C:\Proyectos\nomina-iesef\logs\uvicorn.log
# C:\Proyectos\nomina-iesef\logs\uvicorn_err.log
# C:\Proyectos\nomina-iesef\logs\cloudflared.log
```

### Arquitectura NSSM (activa desde 2026-04-16 noche PC casa)
- `nomina-iesef` — servicio Windows que corre uvicorn (StartType: Automatic)
- `cloudflared-nomina` — servicio Windows que corre cloudflared (StartType: Automatic)
- Ambos arrancan al **inicio del sistema** (antes del login del usuario)
- Si cualquiera muere → NSSM lo reinicia automáticamente (2s uvicorn, 5s cloudflared)
- `watchdog.ps1` ya no se usa (Startup .bat desactivado)
- `deploy.py` usa `os._exit(0)` → NSSM detecta la caída y reinicia con código nuevo

---

## CHANGELOG — Historial de cambios

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
| 2026-04-14 ~22:00 | PC casa | Autostart Windows + deploy.py con os._exit(0) | Infraestructura auto-deploy |
| 2026-04-14 ~22:30 | PC casa | Fix modal incidencias: dropdown Asignación vacío | `ciclo_label AS ciclo` + fechas como texto en Pydantic |
| 2026-04-14 | Eduardo | Sistema v1 corregido: columna `_biometrico` | v1 ya toma sus propias checadas |
| 2026-04-15 tarde | PC trabajo | **Fixes razon_social** (3 endpoints + export) | Quincena 'centro' mostraba 145 docs → solo ~20; $75 → $120 |
| 2026-04-15 tarde | PC trabajo | **deploy.py os._exit(0)** activo en repo | Webhook carga código nuevo (pendiente restart manual esta noche) |
| 2026-04-15 tarde | PC trabajo | **SyncBadge** en 7 vistas (3 variantes) | Usuarios saben hasta qué hora son sus datos del checador |
| 2026-04-15 tarde | PC trabajo | **Dark mode** (ThemeContext + CSS global + botón sidebar) | Toggle 🌙/☀️ con persistencia, sin tocar páginas individuales |
| 2026-04-15 tarde | PC trabajo | **NEXO_PROYECTO_CHAT.md** creado | Contexto completo para Claude Projects (modo chat) |
| 2026-04-15 noche | PC casa | **Restart uvicorn + build dist** | Activa todos los fixes del día + SyncBadge + Dark Mode |
| 2026-04-16 mañana | PC trabajo | **Inicio sesión PC trabajo** | git pull OK (42 archivos), túnel 200 OK, webhook test |
| 2026-04-16 | PC trabajo | **Fix Excel: solo hojas por razon_social** | Centro solo genera hoja CENTRO, Instituto solo INSTITUTO, ambas ambas |
| 2026-04-16 | PC trabajo | **Badges visuales razon_social en Quincenas** | Centro=verde, Instituto=violeta, C+I=gris |
| 2026-04-16 | PC trabajo | **GitHub Actions build automático frontend** | Push .jsx → Actions npm build → commit dist → webhook → live (~2 min) |

---

## MÓDULOS EN PRODUCCIÓN

| Módulo | Estado | Notas |
|---|---|---|
| Login JWT / roles / usuarios | ✅ activo | |
| Catálogos: docentes, programas, materias, asignaciones | ✅ activo | |
| Horarios Por Grupo: grilla semanal visual | ✅ activo | |
| Quincenas: crear, estados, colores por mes, eliminar | ✅ activo | |
| QuincenaDetalle: nómina, asistencia, virtual, incidencias, campo clínico | ✅ activo | |
| Incidencias: flujo coord→validar→aprobar, todos los permisos correctos | ✅ activo | fix 2026-04-16: superadmin + botón aprobar en validada_coord |
| Evaluación virtual (CA 40% + EV 60%) | ✅ activo | |
| Cálculo nómina filtrado por razon_social | ✅ activo | |
| Exportación Excel resumen (fix $75→$120) | ✅ activo | |
| Personal Administrativo: CRUD + asistencia | ✅ activo | |
| Portales docente/trabajador | ✅ activo | |
| Estadísticas: KPIs + 5 gráficas | ✅ activo | |
| SyncBadge en 7 vistas | ✅ activo | |
| Dark mode (toggle 🌙/☀️ + CSS global) | ✅ activo | |
| MB360 → Ubuntu → nexo (28k+ checadas) | ✅ activo | cron 30min con flock |
| Cloudflare Tunnel (nexo.iesef.edu.mx) | ✅ activo | servicio NSSM cloudflared-nomina |
| Auto-deploy webhook `/deploy` | ✅ activo | os._exit → NSSM reinicia en 2s |
| GitHub Actions build frontend | ✅ activo | Push .jsx → build automático → webhook → live (~2 min) |
| **Servicios Windows NSSM** | ✅ activo | nomina-iesef + cloudflared-nomina · Automatic · arrancan sin login |

---

## INFRAESTRUCTURA

| Item | Estado |
|---|---|
| Zona horaria PC casa / PostgreSQL | ✅ `America/Mexico_City` (UTC-6) |
| Cron Ubuntu laptop | ✅ `*/30 con flock` |
| Webhook GitHub | ✅ ID 606281234, ping 200 OK |
| Arranque automático Windows | ✅ Servicios NSSM (Automatic) — arrancan sin necesidad de login |
| node/npm | ✅ GitHub Actions hace el build automático — ya no se necesita PC casa para frontend |
| NSSM | ✅ Instalado via choco · `nomina-iesef` (uvicorn) + `cloudflared-nomina` |

---

## SIGUIENTE SPRINT

### 🔴 CRÍTICO — Verificar en navegador
- [x] Quincena "centro" → 22 docentes de Bachillerato ✅ correcto
- [x] Excel exportado → Barrera Reyes $120 ✅ correcto, múltiplos de $120
- [x] Excel solo genera hoja CENTRO para quincena centro ✅ fix aplicado hoy
- [ ] Recalcular nómina Q6 (centro, id=6) — pendiente

### 🔴 Infraestructura — próxima semana
- [x] **NSSM** ✅ — servicios Windows instalados y corriendo (2026-04-16 noche PC casa)
  - `nomina-iesef` (uvicorn): Automatic, restart 2s
  - `cloudflared-nomina` (túnel): Automatic, restart 5s
  - Startup .bat desactivado — ya no se necesita para uvicorn ni cloudflared
  - `deploy.py` mantiene `os._exit(0)` — NSSM detecta la caída y reinicia en 2s
  - Instalación: `choco install nssm` via fodhelper (UAC bypass); configuración via fodhelper también
  - Administrar: `nssm status nomina-iesef` · `nssm restart nomina-iesef`

### 🟠 Desarrollo prioritario
- [ ] **Excel HONORARIOS completo** — formato fiscal final con firma
  `PROGRAMA | DOCENTE | H.PROG | H.PRES | H.VIRT | DESC | $/HR | HONORARIOS | IVA 16% | SUBTOTAL | RET ISR | RET IVA | TOTAL A PAGAR | FIRMA`
  Dos archivos: HONORARIOS CENTRO y HONORARIOS INSTITUTO
- [ ] **Verificar cálculo fiscal multi-programa** en `services/calculo_nomina.py`
- [ ] **Módulo incidencias completo** — Coord.Académica → Coord.Docente → Cap.Humano

### 🟡 Media prioridad
- [ ] Cargar horarios desde PDF aSc
- [ ] Clasificador de checadas con ventanas de horario
- [ ] Eliminar grupo "Segundo 1" de PREPA (inexistente)

### 🟢 Baja prioridad
- [ ] Más indicadores en Estadísticas
- [ ] Integración Aspel NOI
- [ ] PWA (manifest.json + Service Worker)

### 🔵 Proyectos futuros (pendientes de madurar)
- [ ] **Firma digital de documentos** — reemplazar listas físicas de calificaciones y asistencia
  - Requiere primero: módulo de calificaciones/actas en nexo
  - Nivel recomendado: firma electrónica simple institucional (hash SHA-256 + timestamp + QR verificación)
  - Opción avanzada: integración con e.firma SAT (FIEL) para validez legal plena
  - Referencia: así lo hacen universidades medianas en México para actas internas

---

## ARQUITECTURA CLAVE

### Rutas del proyecto
| PC | Ruta |
|---|---|
| PC trabajo (oficina) | `C:\nomina-iesef` |
| PC casa (servidor) | `C:\Proyectos\nomina-iesef` |

### Regla crítica — razón social
Filtrar SIEMPRE por `p.razon_social` (del programa), **NUNCA** por `d.adscripcion` (del docente).
Un docente con `adscripcion='ambos'` puede aparecer en quincenas incorrectas si se filtra por docente.

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
- Checadas: 28,097+ | GAP permanente: 2026-04-13 13:04–19:41
- Quincenas: Q3 pagada · Q4 en_revision · Q5 abierta · Q6 centro en_revision (pendiente recalcular)
- `iesef_chatbot` → NUNCA TOCAR (chatbot WhatsApp de HostGator)

### Componentes frontend clave nuevos (2026-04-15)
| Archivo | Qué hace |
|---|---|
| `src/components/SyncBadge.jsx` | 3 variantes: Full/Compact/Portal — polling cada 5min |
| `src/context/ThemeContext.jsx` | dark/light con localStorage + prefers-color-scheme |
| `src/index.css` | overrides globales dark mode (Tailwind + inline styles React) |

---

## CÓMO SINCRONIZAR ENTRE PCs

```bash
# Al EMPEZAR (cualquier PC)
git pull

# Al TERMINAR — cambios de backend
git add -u && git commit -m "descripción" && git push

# Al TERMINAR — cambios de frontend (SOLO EN PC CASA)
cd frontend && npm run build && cd ..
git add -f frontend/dist/ && git add -u
git commit -m "build: descripción" && git push
```

---

## CREDENCIALES Y ACCESOS
Ver: `~/.claude/projects/.../memory/` — no se guardan aquí por seguridad.
