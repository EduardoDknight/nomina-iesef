# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión para Claude Code. Se actualiza al final de cada sesión.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-15 (tarde — PC trabajo, sesión completa)
**Rama:** `main`
**Último commit:** `62bc564` — feat: dark mode con persistencia en localStorage

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
| `426a370` | docs: actualizar estado sesión con SyncBadge y pasos build |
| `5fc21aa` | docs: reescribir NEXO_ESTADO.md + crear NEXO_PROYECTO_CHAT.md |
| `62bc564` | feat: dark mode con persistencia en localStorage |

---

## 🚨 ACCIÓN REQUERIDA AL LLEGAR A CASA (esta noche)

### PASO 1 — Reiniciar uvicorn (activa TODOS los fixes de backend)
```powershell
Get-Process python | Stop-Process -Force
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\start_server.ps1
```

### PASO 2 — Build del frontend (activa SyncBadge + Dark Mode)
```powershell
cd C:\Proyectos\nomina-iesef\frontend
npm run build
cd ..
git add -f frontend/dist/
git commit -m "build: dark mode + SyncBadge + fixes razon_social"
git push
```

### PASO 3 — Verificar que todo funcionó
1. Quincena "centro" → debe mostrar solo ~20 docentes de Bachillerato (no 145)
2. Excel exportado → Barrera Reyes debe mostrar $120 (no $75)
3. Sidebar → debe aparecer botón 🌙 / ☀️ sobre "Cerrar sesión"
4. Estadísticas → badge "Al día · MB360 HH:MM" en lugar de "En vivo"
5. Hacer un push de prueba desde PC trabajo → nexo se actualiza en ~5 seg (sin restart manual)

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
        │  os._exit(0) → uvicorn reinicia worker con código nuevo
        ▼
  nexo.iesef.edu.mx actualizado (~3-5 seg)
```

- Webhook ID: `606281234` | URL: `https://nexo.iesef.edu.mx/deploy` | Ping: 200 OK
- **Cambios de backend (.py):** se despliegan solos con git push
- **Cambios de frontend (.jsx):** requieren `npm run build` + commit dist en PC casa

### Flujo típico desde PC trabajo
```bash
git pull                    # siempre al empezar
# Claude Code modifica archivos .py
git add -u
git commit -m "descripción"
git push                    # webhook → backend actualizado automáticamente
```

---

## ARRANQUE DEL SERVIDOR (PC casa)

```powershell
# Reinicio manual
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\start_server.ps1

# Autostart ya instalado en carpeta Startup del usuario (no hacer de nuevo)
```

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
| Cálculo nómina filtrado por razon_social | ✅ en repo | ⚠️ activa tras restart uvicorn |
| Exportación Excel resumen (fix $75→$120) | ✅ en repo | ⚠️ activa tras restart uvicorn |
| Personal Administrativo: CRUD + asistencia | ✅ activo | |
| Portales docente/trabajador | ✅ activo | |
| Estadísticas: KPIs + 5 gráficas | ✅ activo | |
| SyncBadge en 7 vistas | ✅ en repo | ⚠️ pendiente build frontend |
| Dark mode (toggle 🌙/☀️ + CSS global) | ✅ en repo | ⚠️ pendiente build frontend |
| MB360 → Ubuntu → nexo (28k+ checadas) | ✅ activo | cron 30min con flock |
| Cloudflare Tunnel (nexo.iesef.edu.mx) | ✅ activo | |
| Auto-deploy webhook `/deploy` | ✅ en repo | ⚠️ os._exit activa tras restart uvicorn |
| Arranque automático Windows | ✅ activo | carpeta Startup del usuario |

---

## INFRAESTRUCTURA

| Item | Estado |
|---|---|
| Zona horaria PC casa / PostgreSQL | ✅ `America/Mexico_City` (UTC-6) |
| Cron Ubuntu laptop | ✅ `*/30 con flock` |
| Webhook GitHub | ✅ ID 606281234, ping 200 OK |
| Arranque automático Windows | ✅ carpeta Startup del usuario |
| node/npm | ❌ solo en PC casa — builds de frontend solo ahí |

---

## SIGUIENTE SPRINT

### 🔴 CRÍTICO — Esta noche en PC casa
- [ ] Restart uvicorn + build frontend (pasos 1-2 de la sección ACCIÓN REQUERIDA)
- [ ] Verificar los 5 puntos del PASO 3
- [ ] Recalcular nómina Q6 (centro, id=6) — tras restart debe tener solo ~20 docentes

### 🔴 Infraestructura — próxima semana
- [ ] **NSSM** — convertir uvicorn en servicio Windows real
  ```powershell
  # Descargar nssm.cc, luego:
  nssm install nomina-iesef "C:\Python312\python.exe" "-m uvicorn main_nomina:app --host 0.0.0.0 --port 8000"
  nssm set nomina-iesef AppDirectory "C:\Proyectos\nomina-iesef"
  nssm start nomina-iesef
  ```
  En `deploy.py` reemplazar `os._exit(0)` con `subprocess.run(["sc", "stop/start", "nomina-iesef"])`

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
