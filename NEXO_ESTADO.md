# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión. Se actualiza al final de cada sesión de trabajo.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-15 (tarde — PC trabajo, sesión continuada)
**Rama:** `main`
**Último commit:** `2132626` — feat: agregar indicador de última sincronización MB360 en 7 vistas

---

## 🚨 PROBLEMA ACTIVO — Uvicorn no recarga código en PC casa

**Síntoma:** Los cambios se pushean a GitHub, el webhook `/deploy` devuelve OK,
pero uvicorn sigue ejecutando código viejo. Los fixes no se aplican en producción.

**Causa confirmada:** uvicorn `--reload` en Windows no detecta cambios de mtime.
El deploy hace `git pull` correctamente pero los módulos en memoria no se reemplazan.

**Fix implementado pero no aplicado aún:**
- `deploy.py` ahora usa `os._exit(0)` para matar el worker y forzar restart real
- Este fix mismo está en el repo pero tampoco se ha cargado (el worker viejo lo ejecuta)

**Para resolver HOY al llegar a casa (5pm):**
```powershell
# Matar uvicorn y relanzar — HACER ESTO ANTES DE CUALQUIER OTRA COSA
Get-Process python | Stop-Process -Force
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\start_server.ps1
```

Después de ese restart manual, el nuevo `deploy.py` con `os._exit` estará activo
y todos los futuros deploys desde PC trabajo funcionarán automáticamente.

**Solución a largo plazo (ver prioridades abajo):** Configurar acceso remoto sin
intervención humana (Remote Desktop sin aceptar, VNC, o Task Scheduler).

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
  nexo.iesef.edu.mx actualizado (~5 seg, sin tocar PC casa)
```

### ✅ Webhook configurado (ID: 606281234)
- URL: `https://nexo.iesef.edu.mx/deploy`
- Ping de prueba: **200 OK** — funciona correctamente

### Flujo en PC trabajo (sesión típica)
```bash
git pull                          # siempre al empezar
# ... Claude Code hace los cambios ...
git add -u
git add -f frontend/dist/         # si hubo cambios de UI
git commit -m "descripción"
git push                          # dispara webhook → nexo se actualiza solo
```

---

## ARRANQUE AUTOMÁTICO DEL SERVIDOR (PC casa)

### Si el servidor se cae — reiniciar manualmente
```powershell
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\start_server.ps1
```

### Instalar arranque automático al inicio de Windows (una sola vez, como admin)
```powershell
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\scripts\instalar_autostart.ps1
```

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
| 2026-04-15 tarde | PC trabajo | Fixes razon_social: nómina GET, asistencia, resumen, export Excel | Quincena 'centro' mostraba 145 docentes en vez de ~20 |
| 2026-04-15 tarde | PC trabajo | deploy.py usa `os._exit(0)` para restart real de uvicorn | Webhook ya funciona para cargar código nuevo |
| 2026-04-15 tarde | PC trabajo | **SyncBadge**: indicador último sync MB360 en 7 vistas | Docentes/admins saben hasta qué hora son sus checadas |

---

## Lo que está funcionando en producción

| Módulo | Estado |
|---|---|
| Login JWT / roles / usuarios | ✅ |
| Catálogos: docentes, programas, materias, asignaciones | ✅ |
| Horarios Por Grupo: grilla semanal visual | ✅ |
| Quincenas: crear, estados, colores por mes, eliminar | ✅ |
| QuincenaDetalle: nómina, asistencia, virtual, incidencias, campo clínico | ✅ |
| Modal incidencias: dropdown de asignaciones funciona | ✅ |
| Evaluación virtual (CA 40% + EV 60%) | ✅ |
| Cálculo nómina filtrado por razon_social | ✅ |
| Exportación Excel nómina resumen | ✅ |
| Personal Administrativo: CRUD + asistencia quincena | ✅ |
| Portal docente/trabajador: checadas, credenciales | ✅ |
| Estadísticas: KPIs animados + 5 gráficas recharts | ✅ |
| SyncBadge: indicador último sync MB360 en 7 vistas | ✅ fuente lista · ⚠️ pendiente build frontend en PC casa |
| MB360 → Ubuntu laptop → nexo (28k+ checadas) | ✅ cron 30min con flock |
| Cloudflare Tunnel (nexo.iesef.edu.mx → localhost:8000) | ✅ |
| Auto-deploy webhook `/deploy` | ✅ configurado (ID 606281234, ping 200 OK) |
| Arranque automático Windows | ✅ instalado en carpeta Startup del usuario |

---

## ✅ INFRAESTRUCTURA COMPLETAMENTE CONFIGURADA

| Item | Estado |
|---|---|
| Zona horaria PC casa | ✅ `America/Mexico_City` (UTC-6) — correcta |
| Zona horaria PostgreSQL | ✅ `America/Mexico_City` — correcta |
| Timestamps en BD | ✅ todos en CST, coherentes (checada → sync +30min) |
| Cron Ubuntu laptop | ✅ `*/30 con flock` — ya corregido |
| Webhook GitHub | ✅ ID 606281234, ping 200 OK |
| Arranque automático Windows | ✅ carpeta Startup del usuario |

---

## Siguiente sprint — Funcionalidades pendientes

### 🔴 CRÍTICO — Infraestructura (resolver ANTES de continuar desarrollo)

- [ ] **Acceso remoto sin intervención humana a PC casa** — uvicorn no recarga en Windows.
  Opciones a evaluar al llegar a casa:
  1. **VNC/TightVNC** sin contraseña de confirmación — instalar servidor VNC que no requiera aceptar
  2. **Task Scheduler** — tarea programada que mata y relanza uvicorn cada vez que cambia un archivo en el repo (como pseudo-daemon de reload)
  3. **Windows Remote Desktop sin NLA** — desactivar autenticación de red para que RDP no pida confirmación física
  4. **NSSM (Non-Sucking Service Manager)** — convertir uvicorn en un servicio Windows real con restart automático
  
  **Recomendación: NSSM** — instala uvicorn como servicio Windows, se reinicia solo si se cae,
  y el deploy puede hacer `sc stop/start` via subprocess sin necesitar nadie en casa.
  
  ```powershell
  # Una vez instalado NSSM:
  nssm install nomina-iesef "C:\Python312\python.exe" "-m uvicorn main_nomina:app --host 0.0.0.0 --port 8000"
  nssm set nomina-iesef AppDirectory "C:\Proyectos\nomina-iesef"
  nssm start nomina-iesef
  ```
  
  Y en deploy.py reemplazar `os._exit(0)` con:
  ```python
  subprocess.run(["sc", "stop", "nomina-iesef"])
  subprocess.run(["sc", "start", "nomina-iesef"])
  ```

### 🔴 Alta prioridad — Pendiente de activar en PC casa (5pm)

Al llegar a casa hacer PRIMERO:
```powershell
Get-Process python | Stop-Process -Force
powershell -ExecutionPolicy Bypass -File C:\Proyectos\nomina-iesef\start_server.ps1
```

Luego buildear el frontend (solo necesario si hay cambios de UI):
```powershell
cd C:\Proyectos\nomina-iesef\frontend
npm run build
cd ..
git add -f frontend/dist/
git commit -m "build: compilar frontend con SyncBadge"
git push
```

Pendiente verificar:
- [ ] **Filtro razon_social en nómina/asistencia/export** — activo tras restart. Recalcular Q6.
- [ ] **SyncBadge en 7 vistas** — necesita build frontend + `git add -f frontend/dist/` + push

### 🟠 Alta prioridad — Desarrollo

- [ ] **Excel HONORARIOS** — formato fiscal completo: HONORARIOS CENTRO + HONORARIOS INSTITUTO
  Columnas: PROGRAMA | DOCENTE | H. PROG | H. PRES | H. VIRT | DESC | $/HR | HONORARIOS | IVA 16% | SUBTOTAL | RET ISR | RET IVA | TOTAL | FIRMA
- [ ] **Verificar cálculo fiscal** en `calculo_nomina.py` — IVA, ISR, retenciones por razon_social
- [ ] **Módulo incidencias** — flujo completo: registro → coord → cap_humano

### 🟡 Media prioridad
- [ ] **Cargar horarios desde PDF aSc** — Eduardo pasa el PDF, Claude parsea y genera SQL
- [ ] **Clasificador de checadas** con ventanas de horario para docentes
- [ ] **Eliminar grupo "Segundo 1" de PREPA** — identificado como inexistente

### 🟢 Baja prioridad
- [ ] Más indicadores en Estadísticas
- [ ] Integración Aspel NOI
- [ ] **PWA** — manifest.json + Service Worker

---

## Arquitectura clave

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

### Estado de la DB (2026-04-14)
- Docentes activos: 162 | Checadas: 28,097+
- Quincenas: Q3 pagada · Q4 en_revision (id=4) · Q5 abierta (id=5)
- Q6 (id=6, centro, en_revision) — pendiente eliminar con superadmin

---

## Cómo sincronizar entre PCs

```bash
# Al EMPEZAR (cualquier PC)
git pull
# Claude Code lee NEXO_ESTADO.md → contexto completo

# Al TERMINAR (genera deploy automático si webhook está configurado)
git add -u && git add -f frontend/dist/
git commit -m "descripción"
git push
```

---

## Credenciales y accesos rápidos
Ver: `~/.claude/projects/.../memory/` — no se guardan aquí por seguridad.
