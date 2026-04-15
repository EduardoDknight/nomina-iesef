# NEXO — Estado del Proyecto
> Archivo de contexto cross-sesión. Se actualiza al final de cada sesión de trabajo.
> **Regla de horario:** mañana/tarde → PC trabajo (oficina IESEF) · noche → PC casa

---

## Última sesión
**Fecha:** 2026-04-14 (noche — PC casa)
**Rama:** `main`
**Último commit:** `219f247` — fix: AsignacionOut serialization

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
| MB360 → Ubuntu laptop → nexo (28k+ checadas) | ✅ cron 30min con flock |
| Cloudflare Tunnel (nexo.iesef.edu.mx → localhost:8000) | ✅ |
| Auto-deploy webhook `/deploy` | ✅ configurado (ID 606281234, ping 200 OK) |
| Arranque automático Windows | ✅ instalado en carpeta Startup del usuario |

---

## ⚠️ PENDIENTES EN PC CASA

1. **Cron Ubuntu laptop** — agregar flock cuando puedas SSH:
   ```bash
   crontab -e
   # */30 * * * * /usr/bin/flock -n /tmp/agente_nomina.lock /home/nomina/venv_zk/bin/python3 /home/nomina/agente_nomina/agente.py
   ```
2. **Zona horaria PC casa**:
   ```powershell
   Set-TimeZone -Id "Central Standard Time (Mexico)"
   ```

---

## Siguiente sprint — Funcionalidades pendientes

### Alta prioridad
- [ ] **Excel HONORARIOS** — formato exacto del Excel original: HONORARIOS CENTRO y HONORARIOS INSTITUTO con cálculo fiscal completo (fórmula Art. 106 LISR ya documentada en CLAUDE.md)
- [ ] **Motor de cálculo fiscal** — verificar que `calculo_nomina.py` aplica IVA, ISR, retenciones correctamente por razon_social
- [ ] **Módulo incidencias** — verificar flujo completo: registro → validación coord → aprobación cap_humano

### Media prioridad
- [ ] **Cargar horarios desde PDF aSc** — Eduardo pasa el PDF, Claude parsea y genera SQL
- [ ] **Clasificador de checadas** con ventanas de horario para docentes
- [ ] **Eliminar grupo "Segundo 1" de PREPA** — identificado como inexistente

### Baja prioridad
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
