# NEXO — Contexto completo del proyecto para Claude (modo chat)
> Este documento está pensado para sesiones de chat en Claude Projects.
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

El proceso manual actual es:
- Excel compartido entre Capital Humano, Coordinaciones y Finanzas
- Sin control de acceso por rol
- Sin integración real con el checador biométrico
- Cálculo fiscal manual (Art. 106 LISR: IVA, ISR, retenciones)
- Errores frecuentes cuando un docente da clases en múltiples programas con tarifas distintas

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Backend | Python 3.12 + FastAPI |
| Base de datos | PostgreSQL 15 (psycopg2 directo, sin SQLAlchemy) |
| Frontend | React 18 + Vite + Tailwind CSS |
| Auth | JWT + bcrypt |
| Excel | openpyxl |
| Servidor | uvicorn con --reload, Windows, PC casa |
| Túnel | Cloudflare Tunnel → localhost:8000 |
| Checador | ZKTeco MB360 (IP 192.168.1.201:4370) |
| Agente sync | Python + pyzk en Ubuntu laptop, cron cada 30 min |
| Auto-deploy | GitHub Webhook → POST /deploy con HMAC SHA-256 |

**Rutas del repo:**
- PC trabajo (oficina): `C:\nomina-iesef`
- PC casa (servidor): `C:\Proyectos\nomina-iesef`
- GitHub: https://github.com/EduardoDknight/nomina-iesef (privado)

**Regla crítica:** NUNCA tocar la DB `iesef_chatbot` (chatbot WhatsApp de HostGator). Solo trabajamos en `iesef_nomina`.

---

## Cómo trabaja el equipo

- **Eduardo Pérez** — único admin TI del IESEF. Ejecuta comandos, prueba en el navegador, da feedback.
- **Claude** — escribe todo el código, depura, diseña la arquitectura.
- Eduardo tiene conocimiento sólido de infraestructura (redes, Linux, SSH) pero Python básico.
- El flujo: Claude propone código → Eduardo copia/pega o da instrucciones → Claude corrige según resultado.

**Dos PCs:**
- PC trabajo (oficina IESEF): donde se abre Claude Code durante el día
- PC casa: donde corre el servidor. No tiene acceso remoto automático aún.

---

## Lo que está funcionando hoy (2026-04-15)

### Backend completamente funcional
- ✅ Login con JWT, 9 roles de usuario (director, cap_humano, finanzas, coordinaciones, docente, etc.)
- ✅ Catálogos: docentes, programas, materias, asignaciones con vigencia por fechas
- ✅ Horarios por grupo: grilla semanal visual
- ✅ Quincenas: crear, estados (abierta → en_revision → cerrada → pagada), colores por mes, eliminar
- ✅ Detalle de quincena con 5 tabs: Nómina, Asistencia, Virtual, Incidencias, Campo Clínico
- ✅ Cálculo fiscal automático (Art. 106 LISR): honorarios × IVA × ISR × retenciones
- ✅ Filtro correcto por razón social: quincena "centro" muestra solo docentes de Bachillerato
- ✅ Exportación Excel resumen de nómina filtrado por razón social
- ✅ Evaluación virtual: criterios CA (40%) + EV (60%), umbral binario de pago
- ✅ Personal Administrativo: CRUD + asistencia por período
- ✅ Portal del docente: checadas propias, nómina, aclaraciones
- ✅ Portal del trabajador administrativo: asistencia por semana/quincena
- ✅ Módulo Estadísticas: KPIs animados + 5 gráficas (Recharts)
- ✅ Sincronización MB360 → DB: 28,097+ checadas, cron 30min con flock anti-duplicados
- ✅ Auto-deploy: push a GitHub → webhook → git pull → restart uvicorn en ~5 seg

### Frontend — pendiente de build en PC casa
- ✅ **SyncBadge**: indicador "último sync con MB360" en 7 vistas
  - Verde (<30min) / Ámbar (30-60min) / Rojo (>60min)
  - Aparece en: Estadísticas, Nómina Docente, Nómina Administrativa, Docentes, Personal Admin, Portal Docente, Portal Trabajador
  - Razón: evitar que docentes se desesperen porque "no ven sus checadas" cuando aún no ha pasado el cron de 30 min

---

## Bugs importantes resueltos hoy (2026-04-15)

### 1. Quincena "centro" mostraba 145 docentes en vez de ~20
**Causa:** Tres endpoints filtraban por `d.adscripcion` (columna del docente) en vez de `p.razon_social` (columna del programa). Un docente con `adscripcion='ambos'` aparecía en quincenas de "centro" aunque solo tuviera asignaciones en programas del Instituto.

**Fix:** Cambiar todos los filtros a `p.razon_social = 'centro'` — filtra por el programa al que pertenece la asignación.

**Archivos afectados:**
- `routers/nomina.py` — GET nómina de la quincena
- `routers/quincenas.py` — GET asistencia y resumen count
- `services/exportar_nomina_resumen.py` — SQL_NOMINA y SQL_ASIGNACIONES

### 2. Excel exportaba $75 en vez de $120 para Barrera Reyes (Bachillerato)
**Causa:** El servicio de exportación traía TODOS los programas del docente (incluyendo Especialidades, Enfermería). La función `_distribuir()` dividía los $400 totales proporcionalmente: Bachillerato = 3h de 16h totales = $75.

**Fix:** Filtrar `SQL_NOMINA` y `SQL_ASIGNACIONES` por `razon_social` de la quincena antes de distribuir.

### 3. Uvicorn no recargaba código al hacer push
**Causa:** `uvicorn --reload` en Windows no detecta cambios de mtime de forma confiable.

**Fix:** `deploy.py` ahora lanza `os._exit(0)` en un hilo secundario 1.5 segundos después del `git pull`. Uvicorn detecta que el worker murió y lo reinicia con código fresco del disco.

**Estado:** Fix está en el repo pero el worker viejo no lo ha cargado aún. Requiere restart manual único en PC casa (5pm).

---

## Pendiente de hacer — Prioridades

### 🔴 Esta semana
1. **Restart manual en PC casa** al llegar (activa todos los fixes de hoy)
2. **Build frontend en PC casa** (`npm run build` → commit dist → push) para activar SyncBadge
3. **NSSM** — convertir uvicorn en servicio Windows real para deploy permanente sin intervención humana

### 🟠 Desarrollo prioritario
- **Excel HONORARIOS completo** — el formato fiscal final que va al contador con firma:
  `PROGRAMA | DOCENTE | H.PROG | H.PRES | H.VIRT | DESC | $/HR | HONORARIOS | IVA 16% | SUBTOTAL | RET ISR | RET IVA | TOTAL A PAGAR | FIRMA`
  Dos archivos separados: HONORARIOS CENTRO y HONORARIOS INSTITUTO.
- **Verificar cálculo fiscal multi-programa** — docente que da clases en Bachillerato ($120) Y Enfermería ($140): el honorario se calcula por programa por separado, pero el cálculo fiscal (IVA, ISR) se aplica sobre el total consolidado.
- **Módulo incidencias completo** — flujo: Coord.Académica registra → Coord.Docente valida → Cap.Humano aprueba → aplica a nómina.

### 🟡 Siguiente sprint
- Cargar horarios desde PDF aSc (Eduardo tiene el PDF, Claude parsea y genera SQL)
- Clasificador automático de checadas con ventanas de horario (entrada ±10min, salida máx -20min)
- Recalcular Q6 (quincena centro id=6, debe tener solo ~20 docentes)

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

Ejemplo verificado: 6h × $120 = $720 → IVA $115.20 → Subtotal $835.20 → RetISR $72 → RetIVA $76.80 → **Total $686.40** ✅

---

## Tipos de docente y pago

| Tipo | Cómo se paga | Notas |
|---|---|---|
| `por_horas` | costo × horas reales | tarifa varía por programa |
| `tiempo_completo` | sueldo fijo + horas extra fuera de jornada | dos capas de cálculo |
| `virtual` | costo × horas reportadas | solo si supera 60% en evaluación CA+EV |
| `campo_clinico` | $2,500 fijo quincenal | sin checador, verificación manual |
| `suplente` | costo × horas suplidas | cualquier docente puede suplir |

Un docente puede ser de **varios tipos simultáneamente** (ej: presencial en Bachillerato + virtual en Maestrías + Campo Clínico).

---

## Evaluación virtual (CA 40% + EV 60%)

- 4 criterios por área por semana (binario: 0 o 0.15 c/u)
- Si `% cumplimiento > 60%` → se pagan TODAS las horas; si no → CERO (decisión binaria)
- CA (Coord. Académica) evalúa criterios académicos, EV (Educ. Virtual) evalúa aspectos técnicos
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

## Arquitectura de datos — reglas que nunca cambian

1. **Asignaciones**: siempre JOIN por `vigente_desde / vigente_hasta`, nunca por columna `ciclo`
2. **Checadas**: timestamps inmutables. El "estado" es interpretación, no modifica el registro
3. **Razón social**: filtrar por `p.razon_social` (del programa), no por `d.adscripcion` (del docente)
4. **psycopg2 directo**: sin SQLAlchemy, sin ORM — fue decisión explícita desde el inicio
5. **NUNCA borrar** registros de `asistencias_checadas` — el sistema v1 también los usa
6. **NUNCA mezclar** `iesef_nomina` con `iesef_chatbot`

---

## Componentes frontend clave

| Archivo | Qué hace |
|---|---|
| `pages/Estadisticas.jsx` | KPIs animados + 5 gráficas Recharts |
| `pages/Quincenas.jsx` | Lista de quincenas con colores por mes |
| `pages/QuincenaDetalle.jsx` | 5 tabs: Nómina, Asistencia, Virtual, Incidencias, Campo Clínico |
| `pages/AdminQuincenas.jsx` + `AdminQuincenaDetalle.jsx` | Nómina de personal administrativo |
| `pages/Docentes.jsx` | CRUD docentes + carga masiva Excel |
| `pages/PersonalAdmin.jsx` | CRUD trabajadores administrativos |
| `pages/PortalDocente.jsx` | Portal self-service del docente |
| `pages/PortalTrabajador.jsx` | Portal self-service del trabajador |
| `components/SyncBadge.jsx` | Indicador de última sync con MB360 (3 variantes) |
| `api/client.js` | Axios con JWT auth, baseURL: `/api` |

---

## Contexto operativo — qué esperar

- **PC trabajo** (Claude Code durante el día): sin npm, sin node. Solo backend. Frontend se construye en PC casa.
- **PC casa** (servidor nocturno): tiene Python, PostgreSQL, node/npm, Cloudflare Tunnel.
- **Ubuntu laptop** (red LAN del IESEF): corre el agente pyzk que sincroniza checadas del MB360 cada 30min.
- **Diferencia de rutas**: PC trabajo usa `C:\nomina-iesef`, PC casa usa `C:\Proyectos\nomina-iesef`.
- **Checadas con delay**: las checadas aparecen con hasta 30 min de retraso (tiempo del cron). El SyncBadge informa esto.
- **GAP permanente** en checadas: 2026-04-13 13:04–19:41, perdido para siempre.
