# NEXO — Contexto completo del proyecto para Claude (modo chat)
> Documento para sesiones de chat en Claude Projects (claude.ai).
> Cubre qué es el sistema, qué está hecho, qué falta y cómo trabajamos.
> Última actualización: 2026-04-15

---

## ¿Qué es NEXO?

Sistema web de **nómina quincenal para docentes** del Instituto de Estudios Superiores Elise Freinet (IESEF), en Hidalgo, México. El IESEF tiene dos razones sociales independientes:

- **CENTRO** → Preparatoria / Bachillerato ($120/hr)
- **INSTITUTO** → Universidad, Especialidades de Enfermería, Maestrías ($130–220/hr según programa)

Un proveedor externo cobró ~$70,000 MXN durante 8 meses y entregó solo un script local con errores. NEXO lo reemplaza completamente.

**URL en producción:** https://nexo.iesef.edu.mx

---

## ¿Por qué existe? — El problema que resuelve

El proceso manual actual:
- Excel compartido entre Capital Humano, Coordinaciones y Finanzas
- Sin control de acceso por rol
- Sin integración real con el checador biométrico
- Cálculo fiscal manual (Art. 106 LISR: IVA, ISR, retenciones)
- Errores cuando un docente da clases en múltiples programas con tarifas distintas

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Backend | Python 3.12 + FastAPI |
| Base de datos | PostgreSQL 15 (psycopg2 directo, sin SQLAlchemy) |
| Frontend | React 18 + Vite + Tailwind CSS v4 |
| Auth | JWT + bcrypt |
| Excel | openpyxl |
| Servidor | uvicorn --reload, Windows, PC casa |
| Túnel | Cloudflare Tunnel → localhost:8000 |
| Checador | ZKTeco MB360 (IP 192.168.1.201:4370) |
| Agente sync | Python + pyzk en Ubuntu laptop, cron cada 30 min con flock |
| Auto-deploy | GitHub Webhook → POST /deploy con HMAC SHA-256 → os._exit(0) |

**Rutas del repo:**
- PC trabajo (oficina): `C:\nomina-iesef`
- PC casa (servidor): `C:\Proyectos\nomina-iesef`
- GitHub: https://github.com/EduardoDknight/nomina-iesef (privado)

**Reglas que nunca cambian:**
1. NUNCA tocar `iesef_chatbot` (chatbot WhatsApp de HostGator)
2. NUNCA borrar registros de `asistencias_checadas` (el sistema v1 legacy también los lee)
3. psycopg2 directo — sin SQLAlchemy
4. Asignaciones: JOIN por `vigente_desde / vigente_hasta`, nunca por columna `ciclo`
5. Razón social: filtrar por `p.razon_social` (programa), NO por `d.adscripcion` (docente)

---

## Cómo trabaja el equipo

- **Eduardo Pérez** — único admin TI del IESEF. Ejecuta comandos, prueba en el navegador, da feedback.
- **Claude** — escribe todo el código, depura, diseña la arquitectura.
- Flujo: Claude propone y escribe → Eduardo ejecuta → Claude corrige según resultado.

**Dos PCs:**
- PC trabajo (oficina): donde se abre Claude Code durante el día. No tiene npm/node.
- PC casa: donde corre el servidor. Tiene Python, PostgreSQL, node/npm, Cloudflare Tunnel.
- Cambios de backend (.py): se despliegan solos con `git push` vía webhook.
- Cambios de frontend (.jsx): requieren `npm run build` + commit dist, solo en PC casa.

---

## Lo que está funcionando hoy (2026-04-15)

### Backend — activo en producción
- ✅ Login JWT, 9 roles (director, cap_humano, finanzas, coordinaciones, docente, trabajador…)
- ✅ Catálogos: docentes, programas, materias, asignaciones con vigencia por fechas
- ✅ Horarios por grupo: grilla semanal visual
- ✅ Quincenas: crear, estados (abierta → en_revision → cerrada → pagada), colores por mes, eliminar
- ✅ QuincenaDetalle con 5 tabs: Nómina, Asistencia, Virtual, Incidencias, Campo Clínico
- ✅ Cálculo fiscal automático (Art. 106 LISR): honorarios × IVA × ISR × retenciones
- ✅ Evaluación virtual: criterios CA (40%) + EV (60%), umbral binario de pago
- ✅ Personal Administrativo: CRUD + asistencia por período
- ✅ Portal del docente: checadas propias, nómina, aclaraciones
- ✅ Portal del trabajador: asistencia por semana/quincena
- ✅ Estadísticas: KPIs animados + 5 gráficas (Recharts)
- ✅ Sincronización MB360 → DB: 28,097+ checadas, cron 30min con flock

### En repo, pendientes de activar esta noche (restart uvicorn + build frontend)
- ✅ Filtro razon_social correcto en 3 endpoints + export Excel (bugs resueltos hoy)
- ✅ deploy.py con os._exit(0) — webhook ya recarga código sin intervención manual
- ✅ **SyncBadge** en 7 vistas: indicador "último sync con MB360" con colores verde/ámbar/rojo
- ✅ **Dark mode**: toggle 🌙/☀️ en sidebar, persistencia en localStorage, respeta preferencia del SO

---

## Trabajo completado hoy (2026-04-15)

### Bug 1: Quincena "centro" mostraba 145 docentes en vez de ~20
**Causa:** Los endpoints filtraban por `d.adscripcion` (del docente) en vez de `p.razon_social` (del programa). Un docente con `adscripcion='ambos'` aparecía aunque solo tuviera asignaciones en Instituto.
**Fix:** Cambiar filtro a `p.razon_social = 'centro'` en `routers/nomina.py`, `routers/quincenas.py`, `services/exportar_nomina_resumen.py`.

### Bug 2: Excel exportaba $75 en vez de $120 (Barrera Reyes, Bachillerato)
**Causa:** `exportar_nomina_resumen.py` traía TODOS los programas del docente. La función `_distribuir()` dividía los $400 totales proporcionalmente: Bachillerato = 3h de 16h = $75.
**Fix:** Filtrar `SQL_NOMINA` y `SQL_ASIGNACIONES` por `razon_social` de la quincena antes de distribuir.

### Bug 3: Uvicorn no recargaba código al hacer push
**Causa:** `uvicorn --reload` en Windows no detecta cambios de mtime de forma confiable.
**Fix:** `deploy.py` lanza `os._exit(0)` en hilo secundario 1.5s después del `git pull`. Uvicorn detecta que el worker murió y lo reinicia con código fresco.

### Feature: SyncBadge
Componente `frontend/src/components/SyncBadge.jsx` con 3 variantes:
- **Full** (Estadísticas): "Al día · MB360 14:35 · 28,097 checadas"
- **Compact** (Docentes, PersonalAdmin, QuincenaDetalle, AdminQuincenaDetalle): píldora pequeña en header
- **Portal** (PortalDocente, PortalTrabajador): banner informativo en tabs de asistencia/nómina
Color automático: verde (<30min) / ámbar (30-60min) / rojo (>60min). Auto-refresca cada 5min.

### Feature: Dark Mode
- `ThemeContext.jsx`: toggle con localStorage, detecta `prefers-color-scheme` del sistema
- `Layout.jsx`: botón 🌙/☀️ en footer del sidebar, sobre "Cerrar sesión"
- `index.css`: overrides globales sin tocar páginas individuales
  - Clases Tailwind: `bg-white`, `text-slate-800`, `border-slate-200`, etc.
  - Inline styles React: `[style*="background: white"]`, `[style*="color: #111827"]`, etc.
  - Inputs, tablas, sombras, scrollbar

### Documentación
- `NEXO_ESTADO.md`: reescritura total para Claude Code sessions
- `NEXO_PROYECTO_CHAT.md` (este archivo): nuevo, para Claude Projects (modo chat)
- Memory files en `~/.claude/projects/` actualizados

---

## Pendiente de hacer — Prioridades

### 🔴 Esta noche en PC casa
1. Restart uvicorn: `Get-Process python | Stop-Process -Force` + `start_server.ps1`
2. Build frontend: `cd frontend && npm run build && cd ..`
3. `git add -f frontend/dist/ && git commit -m "build: dark mode + SyncBadge" && git push`
4. Recalcular nómina Q6 (centro, id=6) — debe tener solo ~20 docentes

### 🔴 Infraestructura
- **NSSM** — convertir uvicorn en servicio Windows real para deploy permanente sin intervención humana

### 🟠 Desarrollo prioritario
- **Excel HONORARIOS completo** — formato fiscal final con firma:
  `PROGRAMA | DOCENTE | H.PROG | H.PRES | H.VIRT | DESC | $/HR | HONORARIOS | IVA 16% | SUBTOTAL | RET ISR | RET IVA | TOTAL A PAGAR | FIRMA`
  Dos archivos: HONORARIOS CENTRO y HONORARIOS INSTITUTO
- **Verificar cálculo fiscal multi-programa** en `services/calculo_nomina.py`
- **Módulo incidencias completo**: Coord.Académica registra → Coord.Docente valida → Cap.Humano aprueba

### 🟡 Media prioridad
- Cargar horarios desde PDF aSc (Eduardo tiene el PDF)
- Clasificador de checadas con ventanas (entrada ±10min, salida máx -20min)
- Eliminar grupo "Segundo 1" de PREPA (inexistente)

### 🟢 Baja prioridad
- Más indicadores en Estadísticas
- Integración Aspel NOI (exportación para pago masivo)
- PWA (manifest.json + Service Worker)

---

## Cálculo fiscal — fórmula fija (Art. 106 LISR)

```
honorarios     = horas_reales × costo_hora
iva            = honorarios × 0.16
sub_total      = honorarios + iva
retencion_isr  = honorarios × 0.10
retencion_iva  = iva × (2/3)
total_a_pagar  = sub_total - retencion_isr - retencion_iva
```

Ejemplo: 6h × $120 = $720 → IVA $115.20 → Subtotal $835.20 → RetISR $72 → RetIVA $76.80 → **Total $686.40** ✅

---

## Tipos de docente y pago

| Tipo | Cómo se paga | Notas |
|---|---|---|
| `por_horas` | costo × horas reales | tarifa varía por programa |
| `tiempo_completo` | sueldo fijo + horas extra fuera de jornada | dos capas de cálculo |
| `virtual` | costo × horas reportadas | solo si supera 60% en evaluación CA+EV |
| `campo_clinico` | $2,500 fijo quincenal | sin checador, verificación manual |
| `suplente` | costo × horas suplidas | cualquier docente activo puede suplir |

Un docente puede ser de varios tipos simultáneamente.

---

## Evaluación virtual (CA 40% + EV 60%)

- 4 criterios por área por semana (binario: 0 o 0.15 c/u)
- Si `% cumplimiento > 60%` → se pagan TODAS las horas; si no → CERO (decisión binaria)
- CA (Coord. Académica): criterios académicos | EV (Educ. Virtual): aspectos técnicos
- Aplica a: LENA, Especialidades, ADSE, Maestrías, parte de Nutrición

---

## Roles del sistema

| Rol | Puede hacer |
|---|---|
| `superadmin` / `director_cap_humano` | Todo, incluyendo eliminar quincenas y cambiar régimen fiscal |
| `cap_humano` | Abrir/cerrar quincenas, validar incidencias, ajustes, exportar |
| `finanzas` | Solo lectura completa + cargar NOI de docentes |
| `coord_docente` | Cargar horarios, validar suplencias |
| `coord_academica` | Capturar eval. virtual 40% de su programa, registrar suplencias |
| `educacion_virtual` | Capturar eval. virtual 60% para todos los programas |
| `docente` | Solo lectura: sus checadas, su nómina borrador, aclaraciones |
| `trabajador` | Solo lectura: su asistencia |

---

## Programas y tarifas

| Programa | Razón social | Tarifa | Modalidad |
|---|---|---|---|
| Preparatoria (Bachillerato) | CENTRO | $120/hr | Presencial |
| Lic. Enfermería Escolarizada | INSTITUTO | $140/hr | Presencial |
| Lic. Nutrición | INSTITUTO | $130/hr | Mixta/Sabatina |
| LENA (Niv. Académica Enfermería) | INSTITUTO | $160/hr | Mixta (viernes virtual + sábados presencial) |
| Especialidades (Quirúrgica, UCI, Perinatal, Geriátrica, ADSE) | INSTITUTO | $200/hr | Mixta o 100% virtual |
| Maestrías (MSP, MDIE, MGDIS) | INSTITUTO | $220/hr | 100% virtual |
| Campo Clínico | INSTITUTO | $2,500 fijo/quincena | Sin checador |

---

## Arquitectura de datos — reglas que nunca cambian

1. **Asignaciones**: siempre JOIN por `vigente_desde / vigente_hasta`, nunca por columna `ciclo`
2. **Checadas**: timestamps inmutables. El "estado" es interpretación, no modifica el registro
3. **Razón social**: filtrar por `p.razon_social` (del programa), no por `d.adscripcion` (del docente)
4. **psycopg2 directo**: sin SQLAlchemy — decisión explícita desde el inicio
5. **NUNCA borrar** registros de `asistencias_checadas`
6. **NUNCA mezclar** `iesef_nomina` con `iesef_chatbot`

---

## Contexto operativo

- **PC trabajo** (Claude Code, de día): sin npm/node. Solo backend. Frontend se construye en PC casa.
- **PC casa** (servidor, de noche): Python, PostgreSQL, node/npm, Cloudflare Tunnel, uvicorn.
- **Ubuntu laptop** (red LAN del IESEF): agente pyzk sincroniza checadas del MB360 cada 30min.
- **Rutas distintas**: PC trabajo `C:\nomina-iesef`, PC casa `C:\Proyectos\nomina-iesef`.
- **Checadas con delay**: aparecen con hasta 30 min de retraso. El SyncBadge lo informa.
- **GAP permanente** en checadas: 2026-04-13 13:04–19:41 (backup USB bloqueó TCP, perdido para siempre).
- **DB estado**: Docentes ~162 | Checadas 28,097+ | Q3 pagada · Q4 en_revision · Q5 abierta · Q6 centro en_revision (pendiente recalcular tras restart)
