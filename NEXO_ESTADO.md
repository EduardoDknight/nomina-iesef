# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión para Claude Code. Se actualiza al final de cada sesión.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-16 (PC casa, sesión completa)
**Rama:** `main`
**Último commit:** `adbe062` feat: Excel fiscal + PWA + asistencia clasificada

### Commits del día (en orden)
| Hash | Descripción |
|---|---|
| `7b6cfa1` | docs: CLAUDE.md — reglas binarias de asistencia (sin retardos ni parciales para docentes) |
| `8903caa` | docs: NEXO_ESTADO.md — NSSM documentado, infraestructura actualizada |
| `bfc4c75` | fix: NSSM servicios + incidencias (superadmin aprobar + botón validada_coord) |
| `adbe062` | feat: Excel fiscal (IVA+ISR), PWA instalable y vista asistencia por bloques |

---

## ✅ ACCIONES COMPLETADAS (noche 2026-04-16 PC casa)

1. ✅ NSSM instalado: `nomina-iesef` (uvicorn) + `cloudflared-nomina` (túnel), ambos Automatic
2. ✅ Incidencias fix: superadmin puede aprobar + botón Aprobar visible en estado validada_coord
3. ✅ CLAUDE.md corregido: regla binaria de asistencia, sin retardos para docentes, sin horas parciales
4. ✅ Excel Nómina: columnas fiscales (IVA 16%, RET. ISR, RET. IVA, TOTAL A PAGAR)
5. ✅ PWA: manifest.json + Service Worker + iconos 192/512 — app instalable en móvil
6. ✅ Vista Asistencia Clasificada: endpoint + página /quincenas/:id/asistencia-clasificada
7. ⬜ **Pendiente verificar en navegador:**
   - Excel exportado → nuevas columnas fiscales visibles (IVA, ISR, Total)
   - En Chrome Android/Desktop: banner "Instalar app" debe aparecer
   - Botón "Asistencia por Bloques" visible en QuincenaDetalle para coord+

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
| 2026-04-16 noche | PC casa | **NSSM + incidencias fixes** | Servicios Windows auto-restart + superadmin aprobar incidencias |
| 2026-04-16 noche | PC casa | **Excel columnas fiscales (IVA/ISR/Total)** | Nómina ahora muestra desglose fiscal completo |
| 2026-04-16 noche | PC casa | **PWA — app instalable** | manifest.json + SW + iconos institucionales |
| 2026-04-16 noche | PC casa | **Vista Asistencia Clasificada** | /quincenas/:id/asistencia-clasificada — bloques con semáforo verde/rojo |

---

## MÓDULOS EN PRODUCCIÓN

| Módulo | Estado | Notas |
|---|---|---|
| Login JWT / roles / usuarios | ✅ activo | |
| Catálogos: docentes, programas, materias, asignaciones | ✅ activo | |
| Horarios Por Grupo: grilla semanal visual | ✅ activo | |
| Quincenas: crear, estados, colores por mes, eliminar | ✅ activo | |
| QuincenaDetalle: nómina, asistencia, virtual, incidencias, campo clínico | ✅ activo | |
| Incidencias: flujo coord→validar→aprobar, todos los permisos correctos | ✅ activo | fix: superadmin + botón aprobar en validada_coord |
| Evaluación virtual (CA 40% + EV 60%) | ✅ activo | |
| Cálculo nómina filtrado por razon_social | ✅ activo | |
| Exportación Excel Nómina + columnas fiscales | ✅ activo | IVA 16%, RET ISR, RET IVA, TOTAL A PAGAR |
| Vista Asistencia Clasificada por Bloques | ✅ activo | /quincenas/:id/asistencia-clasificada |
| Personal Administrativo: CRUD + asistencia | ✅ activo | |
| Portales docente/trabajador | ✅ activo | |
| Estadísticas: KPIs + 5 gráficas | ✅ activo | |
| SyncBadge en 7 vistas | ✅ activo | |
| Dark mode (toggle 🌙/☀️ + CSS global) | ✅ activo | |
| PWA — app instalable en móvil/escritorio | ✅ activo | manifest.json + SW + iconos 192/512 |
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

### 🚨 ACCIONES URGENTES — PC CASA ESTA NOCHE (2026-04-17)
> El webhook está roto por divergencia git y falta openpyxl. El export Excel NO funciona hasta resolver esto.

```powershell
cd C:\Proyectos\nomina-iesef

# 1. Resolver divergencia + traer código nuevo (deploy.py con git fetch+reset+pip install)
git fetch origin
git reset --hard origin/main
pip install -r requirements.txt

# 2. Actualizar DEPLOY_SECRET en .env
notepad .env
# Cambiar: DEPLOY_SECRET=iesef-nexo-RMEbFH_dRdhAFyuXnHbcyuxRB9AP70Dak6SjXW89180

# 3. Reiniciar servicio
nssm restart nomina-iesef

# 4. En GitHub → Webhooks → Change secret → mismo valor → Redeliver → debe dar 200

# 5. Instalar Tailscale (acceso remoto futuro)
winget install tailscale
tailscale up
# Anotar la IP de Tailscale de PC casa para futuras sesiones desde PC trabajo
```

### 🔴 CRÍTICO — Verificar en navegador
- [x] Quincena "centro" → 22 docentes de Bachillerato ✅ correcto
- [x] Excel exportado → Barrera Reyes $120 ✅ correcto, múltiplos de $120
- [x] Excel solo genera hoja CENTRO para quincena centro ✅
- [x] NSSM servicios corriendo ✅ (2026-04-16 noche)
- [ ] **Excel: verificar columnas IVA/ISR/Total** (bloqueado hasta resolver urgente de arriba)
- [ ] PWA: verificar banner "Instalar app" en Chrome/Android
- [ ] Vista Asistencia Clasificada: verificar botón en QuincenaDetalle

### 🟠 Desarrollo prioritario
- [ ] **Carga horarios desde PDF aSc** — botón ya existe, falta implementar el parser
- [ ] **Módulo incidencias completo** — Coord.Académica → Coord.Docente → Cap.Humano
- [ ] **Recalcular nómina Q6** (centro, id=6) — pendiente verificar

### 🟡 Media prioridad
- [ ] Integración Aspel NOI (Eduardo debe confirmar el formato con Finanzas primero)
- [ ] Clasificador comparativo de checadas (ejecutar en quincenas activas y comparar)
- [ ] Más indicadores en Estadísticas

### 🟢 Baja prioridad / Proyectos futuros
- [x] ~~PWA~~ ✅ Implementado
- [ ] Firma digital de documentos (requiere módulo de calificaciones primero)

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

### Componentes frontend clave nuevos
| Archivo | Qué hace |
|---|---|
| `src/components/SyncBadge.jsx` | 3 variantes: Full/Compact/Portal — polling cada 5min |
| `src/context/ThemeContext.jsx` | dark/light con localStorage + prefers-color-scheme |
| `src/index.css` | overrides globales dark mode (Tailwind + inline styles React) |
| `src/pages/AsistenciaClasificada.jsx` | Vista bloques por docente — semáforo pagado/no_pagado/virtual |
| `public/manifest.json` + `public/sw.js` | PWA: instalable en móvil/escritorio |
| `public/pwa-192.png` + `public/pwa-512.png` | Iconos PWA generados desde logo IESEF |

### Excel Nómina — columnas actuales (2026-04-16)
**CENTRO (11 cols):** PROGRAMA | DOCENTE | NOI | PRESENCIAL ($) | DESCUENTO | AJUSTES | HONORARIOS | IVA 16% | RET. ISR 10% | RET. IVA | TOTAL A PAGAR
**INSTITUTO (12 cols):** ídem + VIRTUAL ($) después de PRESENCIAL

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
