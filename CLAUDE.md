# Sistema de Nómina Docente — IESEF
## Instituto de Estudios Superiores Elise Freinet | Hidalgo, México

---

## 1. CONTEXTO DEL PROYECTO

### Institución
- **Nombre:** Instituto de Estudios Superiores Elise Freinet (IESEF)
- **Ubicación:** Hidalgo, México
- **Razones sociales:** DOS independientes
  - **Centro** → Preparatoria (Bachillerato)
  - **Instituto** → Universidad + Especialidades + Maestrías
- **Docentes activos:** ~466

### Co-desarrollador
- **Eduardo Pérez** — único admin de TI del IESEF
- Stack conocido: Linux, Python básico, redes (MikroTik, UniFi), SSH, bases de datos
- Metodología: Eduardo ejecuta y prueba. Claude escribe y depura.
- Empresa propia: **GeniussLab** (consultoría IA, cliente Moodle activo)

### Problema que resuelve
El proceso de nómina quincenal se lleva en Excel manualmente entre varias áreas:
- Sin control de accesos
- Sin integración confiable con el checador biométrico
- Sin cálculo fiscal automático correcto
- Un desarrollador externo cobró ~$70,000 MXN / 8 meses y solo entregó un script local con errores, sin web, sin suplencias, sin virtual, sin tiempo completo.

### Objetivo
Sistema web completo (FastAPI + React + PostgreSQL) en HostGator que:
- Integra checadores ZKTeco MB360 en tiempo real
- Permite a coordinaciones registrar suplencias e incidencias
- Permite a Educación Virtual reportar horas de docentes virtuales
- Calcula honorarios con fórmula fiscal exacta (Art. 106 LISR)
- Genera Excel HONORARIOS CENTRO y HONORARIOS INSTITUTO (formato exacto del actual)
- Portal del docente: historial de checadas, nómina borrador, aclaraciones

---

## 2. INFRAESTRUCTURA — ESTADO ACTUAL (YA DESPLEGADO)

### Servidor de Producción — HostGator
- **Host:** `dedi-1124945.iesef.edu.mx` / dominio API: `api.iesef.edu.mx` (detrás de Cloudflare)
- **OS:** Linux CentOS/cPanel, acceso SSH
- **FastAPI:** corre como servicio systemd `uvicorn_api`
  - Código: `/home/wwiese/api.iesef.edu.mx/`
  - Venv: `/opt/iesef_api/`
  - Reinicio: `systemctl restart uvicorn_api`
  - Validar antes de reiniciar: `python3 -c "import routers.X; print('OK')"`
- **PostgreSQL 15** en `localhost:5432`
- **SSL/CDN:** Cloudflare (la IP puede cambiar — ver nota en agente)

### Bases de Datos PostgreSQL
| DB | Uso | Estado |
|---|---|---|
| `iesef_chatbot` | Chatbot WhatsApp | **NO TOCAR. NUNCA.** |
| `iesef_nomina` | Sistema de nómina | Nuestro proyecto |

**Conexión iesef_nomina:**
- usuario: `nomina_user` | host: `localhost:5432`
- Credenciales: ver `.env` en `/home/wwiese/api.iesef.edu.mx/.env`

### Tablas YA existentes en iesef_nomina
```sql
asistencias_checadas (
    id BIGSERIAL PK,
    uid_checador INTEGER,
    user_id INTEGER,          -- = campo CHEC del Excel de docentes
    timestamp_checada TIMESTAMP,
    tipo_punch SMALLINT,      -- 0=entrada, 1=salida
    estado SMALLINT,
    id_dispositivo VARCHAR(50),
    id_agente VARCHAR(100),
    sincronizado_en TIMESTAMP,
    UNIQUE (id_dispositivo, uid_checador, timestamp_checada)
)
-- 26,133+ registros y creciendo. NUNCA borrar.

sync_log (id, id_agente, timestamp_agente, checadas_enviadas, insertadas, duplicadas, errores)
```

### Endpoints FastAPI YA existentes
```
GET  /                         → health check
GET  /asistencias/ultimo_sync  → último timestamp y total de registros
POST /asistencias/checadas     → recibe lote, inserta con ON CONFLICT DO NOTHING
POST /webhook/meta             → chatbot WhatsApp (NO TOCAR)
```
- Archivo router asistencias: `/home/wwiese/api.iesef.edu.mx/routers/asistencias.py`
- Main: `/home/wwiese/api.iesef.edu.mx/main.py`

### PC Agente — Ubuntu Laptop (YA FUNCIONANDO)
- **Usuario:** `nomina` | **Directorio:** `/home/nomina/agente_nomina/`
- **Archivos:** `agente.py`, `lector_zk.py`, `config.py`
- **Venv:** `/home/nomina/venv_zk/bin/python3`
- **Ejecución:** Cron cada 5 minutos (NO live_capture — descarga todo el historial ~24 seg)
- **Regla en laptop:** siempre usar `nano` para editar, usar `$HOME` en lugar de `~`
- **Problema resuelto:** IPv6 deshabilitado + IP de Cloudflare hardcodeada en `/etc/hosts`
  - ⚠️ Si el agente falla con DNS: `host api.iesef.edu.mx` y actualizar `/etc/hosts`
- **Cloudflare:** todas las requests requieren `headers={'User-Agent': 'Mozilla/5.0'}` o devuelve 403

**config.py del agente:**
```python
MB360_IP = '192.168.1.201'
MB360_PORT = 4370
DISPOSITIVO_ID = 'MB360_001'
HOSTGATOR_URL = 'https://api.iesef.edu.mx'
TIMEOUT = 10
```

### Checador ZKTeco MB360
- **IP LAN:** `192.168.1.201:4370`
- **Firmware:** v6.60 Sep 2019 | **Usuarios enrolados:** 218 | **Registros:** ~26,000+
- **Limitación actual:** pyzk descarga TODO el historial cada vez (sin filtro por fecha)
- **Compartido con sistema v1** — nunca borrar registros del checador
- **Planificado:** 3-5 unidades a futuro

### Flujo de datos actual (Fase 3 ya completada parcialmente)
```
[MB360 192.168.1.201:4370]
        │ pyzk cron 5min
        ▼
[Laptop Ubuntu /home/nomina/agente_nomina/]
        │ HTTPS POST + User-Agent header
        │ api.iesef.edu.mx (Cloudflare → HostGator)
        ▼
[FastAPI uvicorn_api → iesef_nomina.asistencias_checadas]
        ✅ 26,133+ registros sincronizados
```

### Reglas de desarrollo CRÍTICAS
1. **Nunca mezclar** `iesef_nomina` con `iesef_chatbot`
2. **Nunca borrar** registros de `asistencias_checadas` (nominav1 también los usa)
3. **psycopg2 directo** — NO SQLAlchemy (consistencia con el proyecto)
4. **En la laptop:** siempre `nano`, nunca comandos largos en terminal
5. **Reinicio FastAPI:** `systemctl restart uvicorn_api` (validar sintaxis antes)

---

## 3. STACK TECNOLÓGICO

| Componente | Tecnología | Estado |
|---|---|---|
| Base de datos | PostgreSQL 15 | ✅ Ya instalado en HostGator |
| ORM | **psycopg2 directo** (NO SQLAlchemy) | ✅ Decisión tomada, consistencia |
| Migraciones | Scripts SQL versionados manuales | Por hacer |
| Backend / API | Python 3.12 + FastAPI | ✅ Corriendo como systemd `uvicorn_api` |
| Autenticación | JWT + bcrypt | Por hacer |
| Frontend | React 18 + Vite + Tailwind | Por hacer |
| Servidor web | Nginx (o servir desde FastAPI static) | Por decidir |
| Agente MB360 | Python 3.12 + pyzk (cron 5 min) | ✅ Funcionando en laptop Ubuntu |
| Generación Excel | openpyxl | Por hacer |
| Tiempo real | WebSockets o polling (a evaluar) | Por decidir |

> **Nota Docker:** El sistema actual NO usa Docker. FastAPI y PostgreSQL corren directamente en el servidor. Se mantiene así para no romper lo que ya funciona.

---

## 4. PROGRAMAS ACADÉMICOS Y RAZONES SOCIALES

### CENTRO (Razón social: Preparatoria)
| Programa | Costo/hora |
|---|---|
| PREPARATORIA (Bachillerato) | $120/hr |

### INSTITUTO (Razón social: Universidad+)
| Programa | Código grupos | Costo/hora | Modalidad | Notas |
|---|---|---|---|---|
| LICENCIATURA EN ENFERMERÍA | ENFER1, ENFER2x | $140/hr | Presencial | Semestral, 4 años |
| LICENCIATURA EN NUTRICIÓN | - | $130/hr | Mixta o Sabatina | Cuatrimestral, 4 años |
| LENA (Lic. Enfermería Nivelación Académica) | 1°1, 1°2 | $160/hr | **MIXTA: viernes virtual 13-20h + sábados presencial 8-17h** | Cuatrimestral, 1 año 4 meses |
| ESPECIALIDADES — Quirúrgica (EEQX) | EEQX x°x | $200/hr | Mixta: L-V virtual + sábados presencial 8-16h | Cuatrimestral, 1 año |
| ESPECIALIDADES — Cuidados Intensivos (EECI) | EECI x°x | $200/hr | Mixta: L-V virtual + sábados presencial 8-16h | |
| ESPECIALIDADES — Perinatal (EEPI) | EEPI x°x | $200/hr | Mixta: L-V virtual + sábados presencial 8-17h | |
| ESPECIALIDADES — Geriátrica (EEGE) | EEGE x°x | $200/hr | Mixta: L-V virtual + sábados presencial 8-17h | |
| ESPECIALIDADES — ADSE | ADSE x°x | $200/hr | **100% VIRTUAL** | Administración y Docencia Servicios Enfermería |
| MAESTRÍA en Salud Pública (MSP) | MSP x°x | $220/hr | 100% Virtual | Cuatrimestral, 2 años |
| MAESTRÍA en Docencia (MDIE) | MDIE x°x | $220/hr | 100% Virtual | Maestría en Docencia Ed. Media Superior y Superior |
| MAESTRÍA en Gestión (MGDIS) | MGDIS x°x | $220/hr | 100% Virtual | Maestría en Gestión y Dirección de Inst. de Salud |
| CAMPO CLÍNICO | - | $2,500 fijo | Sin checador | Pago fijo por quincena, verificado por coordinación |

> **Nota crítica:** Un mismo docente puede dar clases en AMBAS razones sociales y en MÚLTIPLES programas con tarifas distintas. Un docente puede ser simultáneamente presencial en Enfermería ($140), virtual en Especialidades ($200) y tener Campo Clínico ($2,500 fijo).

---

## 5. TIPOS DE DOCENTE

| Tipo | Pago | Notas |
|---|---|---|
| `por_horas` | costo × hora real trabajada | Tarifa varía por programa |
| `tiempo_completo` | Sueldo fijo + extras | Ver sección 7 (dos capas) |
| `virtual` | costo × hora reportada | No checa biométrico. Educación Virtual reporta. |
| `suplente` | costo × hora suplida | Puede ser cualquier docente activo |
| `campo_clinico` | $2,500 fijo quincenal | Docentes de prácticas/campos clínicos |

Un docente puede ser de **varios tipos simultáneamente**.

---

## 6. ROLES DEL SISTEMA

| Rol | Usado por | Puede hacer |
|---|---|---|
| `director_cap_humano` | Director de Capital Humano | TODO de `cap_humano` + cambiar régimen fiscal de docentes + aprobar cambios de tarifa + gestión de usuarios |
| `cap_humano` | Operador de Capital Humano | Abrir/cerrar quincenas, validar incidencias, ajustes, configurar tolerancias, exportar honorarios, carga masiva de docentes. **Validar suplencias** enviadas por coord_academica. |
| `finanzas` | Dirección de Finanzas / Contador | Ver todos los registros y contexto completo. Cargar/modificar NOI de docentes. Exportar archivo para **Aspel NOI** (carga masiva de pagos). Ver borradores de honorarios. |
| `coord_docente` | Coordinación Docente | Cargar/modificar horarios (masivo o individual). **Validar suplencias** enviadas por coord_academica antes de que lleguen a Cap. Humano. Ver asistencia de su área. |
| `servicios_escolares` | Dirección de Servicios Escolares | Cargar/modificar horarios (masivo desde eStudy o individual). Gestión de catálogos académicos (programas, materias, grupos). |
| `coord_academica` | Coordinación Académica (1 usuario por programa) | Capturar evaluación virtual 40% (criterios académicos) de **su programa**. **Registrar suplencias** (quedan pendientes de validación por coord_docente). Ver asistencia de su programa. |
| `educacion_virtual` | Educación Virtual | Capturar evaluación virtual 60% (aspectos virtuales) para **todos los programas**. Ver sus propios registros. |
| `docente` | Docentes | Solo lectura: checadas, nómina borrador, historial, suplencias. Enviar aclaraciones. |
| `reportes` | Dirección / Auditoría | Solo lectura de reportes consolidados (sin datos individuales de pago) |

**Coordinaciones Académicas — una instancia por programa:**
| Programa | Estado |
|---|---|
| Preparatoria | Existe |
| Lic. Enfermería Escolarizada | Existe |
| LENA | Existe |
| Especialidades | Existe |
| Maestrías | **No existe aún** → las horas virtuales se procesan sin validación del 40% por ahora |

> **Cuando no existe Coord. Académica de un programa:** el 40% puede ser aprobado directamente por Cap. Humano o Director de Cap. Humano como excepción.

> **Flujo actual (ineficiente):** Coord. Académica → avisa a Coord. Docente → avisa a Cap. Humano → registra suplencia. **Nuevo flujo:** Coord. Académica registra suplencia en sistema (estado: `pendiente`) → Coord. Docente valida → Cap. Humano aprueba y aplica a nómina.

---

## 7. ESTRUCTURA DE DATOS DE DOCENTES

### Campos capturados en el sistema actual (Base Alta Docentes)
- `numero_docente` (F) — identificador único público, es el username del portal
- `nombre_completo`
- `rfc`
- `curp`
- `codigo_postal`
- `forma_pago` — "Clabe interbancaria" / "Honorarios" / "Asimilados a salarios"
- `clabe` — 18 dígitos
- `modalidad` — "Asimilados a salarios" / "Honorarios"
- `adscripcion` — "Centro" / "Instituto" / ambos
- `programas_educativos` — múltiples, separados por ";"
- `noi` — número interno de Capital Humano (puede estar vacío en nuevos)
- `correo` — formato: `docente.iniciales@iesef.edu.mx`
- `comentarios`

### Campos adicionales del sistema nuevo
- `chec_id` — ID en el MB360 (puede ser diferente al número docente)
- `costo_hora_centro` — tarifa en Preparatoria
- `costo_hora_instituto` — tarifa base en programas del Instituto
- `tipo` — ENUM(por_horas, tiempo_completo, virtual, suplente)
- `activo` — boolean

### Personal Administrativo (módulo separado)
Los administrativos son trabajadores con jornadas fijas, no honorarios:
- `no_trabajador_checado` — ID en el MB360
- `nombre`
- Hasta 3-4 turnos distintos por semana: `DIA`, `INICIO`, `FIN`
- Ejemplos: L-V 09:00-17:00, S 08:00-14:00

---

## 8. REGLAS DE CHECADA — MOTOR DE ASISTENCIA

### Principio base
- El sistema guarda **siempre** el timestamp exacto. Nunca borra.
- El "estado" es una interpretación del timestamp según las reglas del ciclo vigente.
- El sistema **NUNCA descuenta automáticamente**. Siempre hay confirmación humana.

### REGLA CRÍTICA — Para docentes el pago es BINARIO (NO hay decimales ni parciales)
> **Confirmado por Eduardo 2026-04-16**
- Un docente tiene un bloque de N horas (ej. 4h). O se pagan las 4h completas o cero.
- **No existen** horas parciales como "3.75h" para docentes.
- **No existen retardos** para docentes. La llegada tardía dentro de la ventana es asistencia limpia; fuera de la ventana es `pendiente_revision` (coordinación decide si pagar o no).
- El concepto de "3 retardos = 1 falta" aplica **solo a administrativos** y a la **Capa 1 de docentes TC** (su permanencia institucional), NUNCA a las clases de docentes.

### Ventana de entrada (docentes)
- Tolerancia: **10 minutos** desde el inicio del bloque
- Checa entre min 0 y min +10 → ✅ `asistencia` — se pagan las N horas completas
- Checa después de min +10 → `pendiente_revision` — coordinación/Cap.Humano decide

### Ventana de salida — REGLA VERIFICADA (docentes)
- Tolerancia de salida anticipada: `min(horas_bloque × 10, 20)` minutos antes del fin
- **El máximo es 20 minutos, sin importar las horas del bloque**

| Duración bloque | Puede salir desde | Tolerancia |
|---|---|---|
| 1 hora | min 50 (10 min antes) | 10 min |
| 2 horas | min 100 (20 min antes) | 20 min |
| 3 horas | min 160 (20 min antes) | **20 min (tope)** |
| 5 horas | min 280 (20 min antes) | **20 min (tope)** |

- Sale dentro de la ventana → sigue siendo `asistencia` completa
- Sale fuera (demasiado temprano) → `pendiente_revision`

### Clases back-to-back (REGLA CRÍTICA)
Una sola checada **NO** cuenta para dos clases consecutivas. El docente debe hacer dos checadas físicas separadas:
- Salida clase 1: ventana minutos 40-60 del bloque
- Entrada clase 2: ventana minutos 0-10 desde inicio
- Una sola checada en esa zona → se asigna a la clase correspondiente, la otra queda `incompleta` → revisión Capital Humano.

### Estados de checada para docentes
- `asistencia` — cumple ventanas de entrada y salida → se pagan N horas completas del bloque
- `fuera_ventana` — no corresponde a ninguna clase
- `incompleta` — entrada sin salida o viceversa
- `pendiente_revision` — fuera de tolerancia → va a bandeja de Capital Humano (nunca descuento automático)

> **Nota:** El estado `retardo` NO aplica a docentes. Solo aplica a administrativos (ver sección 17) y a la Capa 1 de docentes TC (permanencia institucional, no sus clases).

### Retardos y faltas — SOLO para administrativos y TC Capa 1 (jornada)
> **No existen horas parciales para NADIE.** El pago siempre es en unidades enteras.

**Reglas para administrativos y TC Capa 1 (jornada fija):**
- Llegada ≤ 10 min tarde → `retardo` (se registra, no descuenta automáticamente)
- Llegada > 30 min tarde → `falta` automática — ese día NO se paga (Cap.Humano puede revertir)
- Salida ≥ 30 min antes de su hora → `falta` automática — ese día NO se paga (Cap.Humano puede revertir)
- 3 `retardo` en la quincena → `falta` (1 día descontado del sueldo fijo)
- En todos los casos el descuento es de **1 día completo** — nunca fracciones de día/hora

> La franja entre 10 y 30 minutos es `retardo` que acumula. Cap.Humano y Director deciden si aplican descuento directo o esperan a los 3 retardos.

### Valores configurables en `config_asistencia`
| Parámetro | Aplica a | Valor actual |
|---|---|---|
| tolerancia_entrada_min | Todos | 10 |
| max_tolerancia_salida_min (docentes) | Docentes | 20 |
| minutos_falta_directa | Administrativos + TC Capa 1 | 30 |
| retardos_por_falta | Administrativos + TC Capa 1 | 3 |

---

## 9. DOCENTES DE TIEMPO COMPLETO — DOS CAPAS

### Capa 1 — Permanencia institucional (sueldo fijo quincenal)
- Jornada estándar: L-V 8:00-16:00 / S 7:00-15:00 (configurable por contrato)
- Llegada ≤ 10 min tarde → `retardo`; acumula 3 → descuento de 1 día completo
- Llegada > 30 min tarde → `falta` automática (día completo no pagado; Cap.Humano puede revertir)
- Salida ≥ 30 min antes → `falta` automática (día completo no pagado; Cap.Humano puede revertir)
- **No existen descuentos parciales de horas** — siempre es 1 día completo o nada

### Capa 2 — Horas frente a grupo
- Aplican exactamente las mismas reglas de ventana que cualquier docente (binario: bloque completo o cero)
- Horas **dentro** de la jornada → cubiertas por sueldo fijo, no pago extra
- Horas **fuera** de la jornada → se pagan como honorario adicional, siempre en **horas enteras**

**Ejemplo:** Jornada 8:00-16:00. Clase 15:00-17:00 → solo se paga 16:00-17:00 = **1 hora entera** fuera de jornada.

---

## 10. INCIDENCIAS, SUPLENCIAS Y AJUSTES

### Faltas
- Una falta = ausencia confirmada por coordinación o Capital Humano (no automáticamente).
- Descuenta el valor de todas las horas del bloque.
- El sistema marca ausencias como `pendiente_revision` hasta confirmación humana.

### Suplencias
- La coordinación registra: docente titular que faltó + fecha + horas + docente suplente + horas suplidas.
- El sistema calcula: descuento al titular + suma de horas al suplente.
- El suplente puede ser cualquier docente activo.
- Ambas coordinaciones (académica y docente) pueden registrar suplencias.

### Horas Virtuales — Estructura completa de evaluación

**Aplica a:** LENA (viernes), Especialidades (L-V), ADSE (100%), Maestrías (100%), Nutrición (parte virtual)

#### Regla de pago crítica
Un docente virtual debe obtener **más del 60% de cumplimiento** para que se le paguen sus horas. Es una decisión binaria: o se pagan todas las horas o ninguna.

#### Estructura del Excel virtual (60 columnas)

| Columnas | Contenido |
|---|---|
| C1-C4 | PROGRAMA, GRUPO, MATERIA, DOCENTE |
| C5-C22 | Horas por día (L-S) para cada semana de la quincena |
| C23 | HORAS POR QUINCENA (total) |
| C24 | PAGO POR HORA (tarifa) |
| C25 | PAGO (horas × tarifa, antes de evaluación) |
| C26-C37 | **COORDINACIÓN ACADÉMICA** — 4 criterios × 3 semanas (binario: 0 o 0.15 cada uno) |
| C38-C49 | **EDUCACIÓN VIRTUAL** — 4 criterios × 3 semanas (binario: 0 o 0.15 cada uno) |
| C50 | Nro de semanas de la quincena |
| C51 | Contribución C.A. al % final (C.A. × peso 40%) |
| C52 | Contribución E.V. al % final (E.V. × peso 60%) |
| C53 | % DE CUMPLIMIENTO = C51 + C52 |
| C54 | % DESCUENTO (1 = no se paga, 0 = sí se paga) |
| C55 | A PAGAR (0 si no supera umbral) |
| C56 | MONTO DESCONTADO |
| C57 | HORAS REALES A PAGAR (0 si no supera umbral) |
| C58 | OBSERVACIONES COORD. ACADÉMICA |
| C59 | OBSERVACIONES EDUCACIÓN VIRTUAL |

#### Criterios de Coordinación Académica (4 por semana):
1. Vinculación de actividades
2. Respeto secuencial
3. Congruencia entre contenido y actividades
4. Material de apoyo

#### Criterios de Educación Virtual (4 por semana):
1. Formato institucional
2. Instrumento de evaluación
3. Publicación de actividades
4. Evaluación de actividades

#### Fórmula de cálculo verificada contra el Excel:
```
# Cada criterio es binario: 0 (no cumple) o 0.15 (cumple)
# 4 criterios por área × n_semanas semanas

CA_contribution = (SUM(criterios_CA) / (n_semanas × 0.60)) × peso_CA
EV_contribution = (SUM(criterios_EV) / (n_semanas × 0.60)) × peso_EV
pct_cumplimiento = CA_contribution + EV_contribution

# Decisión de pago (binaria):
if pct_cumplimiento > umbral_pago (default: 0.60):
    horas_reales_a_pagar = horas_quincena
    monto_virtual       = horas_quincena × tarifa
else:
    horas_reales_a_pagar = 0
    monto_virtual        = 0
    monto_descontado     = horas_quincena × tarifa  # para registro
```

**Ejemplo verificado (Romero Montalvo, Maestrías, Marzo 2026):**
```
CA: todos los criterios = 0 → CA_contribution = 0
EV: todos los criterios = 0.15, n_semanas = 3
    EV_contribution = (12 × 0.15) / (3 × 0.60) × 0.60 = 1.80/1.80 × 0.60 = 0.60
pct_cumplimiento = 0 + 0.60 = 0.60 → NO supera el 60% → NO se paga ✅
```

#### Parámetros configurables por ciclo:
- `peso_coord_academica` — default: 0.40 (40%)
- `peso_educacion_virtual` — default: 0.60 (60%)
- `umbral_pago` — default: 0.60 (debe superarlo, no solo igualarlo)
- Nombres y cantidad de criterios por área (actualmente 4 por semana cada una)

### Campo Clínico
- Pago fijo: **$2,500 por quincena** sin importar número de sesiones.
- No hay checador biométrico. Las coordinaciones correspondientes verifican presencialmente.
- Las coordinaciones cargan/modifican si se paga o hay descuentos en el sistema.
- Los docentes de Campo Clínico pueden también dar clases presenciales y/o virtuales en otros programas.

### Ajustes entre quincenas
- Si se pagó de más o de menos, la diferencia se registra en la quincena siguiente como concepto separado.
- Cada ajuste queda vinculado a la quincena origen para trazabilidad.
- Puede ser cargo (descuento) o abono (pago pendiente).

---

## 11. RÉGIMEN FISCAL DE DOCENTES

Los docentes pueden estar bajo distintos regímenes según su nivel de ingresos/horas:
- **Honorarios** — régimen estándar para la mayoría
- **Asimilados a salarios** — régimen alternativo (aparece en Alta Docentes como "Asimilados a salarios")
- El régimen puede cambiar durante el ciclo si el docente supera ciertos umbrales de ingresos.
- **Quién decide el cambio:** Capital Humano o Director de Capital Humano, confirmado con el contador/responsable de nómina.
- El sistema debe permitir cambiar el régimen fiscal de un docente y registrar la quincena en que aplicó el cambio.
- El campo `modalidad` en la tabla `docentes` almacena el régimen vigente.

> **Pendiente de definición:** Los umbrales exactos de ingresos que desencadenan el cambio de régimen los define el área fiscal/contable. El sistema no los calcula automáticamente; solo permite el registro manual con confirmación del director de Cap. Humano.

## 12. CÁLCULO FISCAL — FÓRMULA FIJA (Art. 106 LISR)

```
honorarios      = horas_reales × costo_hora
iva             = honorarios × 0.16
sub_total       = honorarios + iva
retencion_isr   = honorarios × 0.10
retencion_iva   = iva × (2/3)          -- = iva × 0.666667
total_a_pagar   = sub_total - retencion_isr - retencion_iva
```

**Ejemplo verificado contra Excel real:**
```
6 horas × $120/hr = $720.00 honorarios
IVA:           $720.00 × 0.16  = $115.20
Sub-total:     $720.00 + $115.20 = $835.20
Retención ISR: $720.00 × 0.10  = $72.00
Retención IVA: $115.20 × 0.6667 = $76.80
TOTAL A PAGAR: $835.20 - $72.00 - $76.80 = $686.40  ✅
```

- El cálculo es 100% automático. No requiere configuración fiscal por docente.
- El sistema genera el **BORRADOR**. El contador lo revisa y formaliza para firma.
- Se generan **DOS documentos separados**: HONORARIOS CENTRO y HONORARIOS INSTITUTO.

---

## 12. FORMATO DE LOS EXCELS DE SALIDA

### Reporte de Asistencia (para coordinaciones)
Un Excel por quincena con hojas por programa: PREPA, ENFERMERIA, NUTRICION, LENA, ESPECIALIDADES, MAESTRIAS, CAMPO CLINICO

Por cada docente dentro de su programa:
```
FECHA | DÍA | ENTRADA PROG. | SALIDA PROG. | ENTRADA REG. | SALIDA REG. | ESTADO | MARCACIONES EXTRA | CANT. EXTRA | FIRMA DE CONFORMIDAD
```

### Nómina Intermedia (por programa, para validación interna)
- **PREPA / MAESTRIAS** (sin virtual): `Nombre | NOI | HORAS_PROG | HORAS A PAGAR | DESCUENTO | TOTAL A PAGAR`
- **NUTRICION / LENA / ESPECIALIDADES** (con virtual): `Nombre | NOI | HORAS_PROG | HORAS A PAGAR | HORAS VIRTUALES | DESCUENTO | SUB TOTAL | TOTAL`
- **CAMPO CLINICO**: `Nombre | (vacío) | TOTAL A PAGAR` (monto fijo $2,500)

### HONORARIOS CENTRO y HONORARIOS INSTITUTO (documento fiscal final)
Encabezado:
- PROGRAMA ACADEMICO, QUINCENA, FECHA DE PAGO, FORMA DE PAGO

Detalle (una fila por docente):
```
PROGRAMA EDUCATIVO | NOMBRE | HORAS PROGRAMADAS | HORAS PRESENCIALES | HORAS VIRTUALES | DESCUENTOS | COSTO POR HORA | HONORARIOS | IVA 16% | SUB-TOTAL | RETENCION ISR | RETENCION IVA | TOTAL A PAGAR | FIRMA
```

### Hoja BD del Excel original (referencia de estructura de datos)
El Excel BD tiene docentes con las columnas: DOCENTE, CHEC, NOI y luego columnas por programa/materia asignada (una columna por materia, agrupadas por programa).

---

## 13. CICLOS ACADÉMICOS Y PERÍODOS DE HORARIOS

| Programa | Plan | Impacto en el sistema |
|---|---|---|
| Preparatoria | **Semestral** | Horarios se recargan 2 veces al año |
| Lic. Enfermería Escolarizada | **Semestral** | Horarios se recargan 2 veces al año |
| LENA | Cuatrimestral | Horarios se recargan 3 veces al año |
| Lic. Nutrición | Cuatrimestral | |
| Especialidades | Cuatrimestral | Inicios enero, mayo, septiembre |
| Maestrías | Cuatrimestral | Inicios enero, mayo, septiembre |

El sistema debe manejar **coexistencia de múltiples ciclos activos simultáneamente** (ej. algunos programas en 2do cuatrimestre mientras Prepa está en 1er semestre).

## 14. FLUJO COMPLETO DE UNA QUINCENA

| Paso | Responsable | Acción |
|---|---|---|
| 1 | Capital Humano | Abrir quincena con fechas. Sistema pre-carga horarios vigentes. MB360 ya envía checadas en tiempo real. |
| 2 | Docentes (automático) | Checan en MB360. Cada checada llega al instante. Sistema clasifica según ventanas. Incompletas/fuera van a bandeja de revisión. |
| 3 | Coordinaciones | Confirmar faltas. Registrar suplencias (quién suplió, cuántas horas). Pueden hacerlo durante toda la quincena. |
| 4 | Educación Virtual | Reportar horas de docentes virtuales por materia. |
| 5 | Capital Humano | Revisar bandeja de incidencias. Aplicar ajustes de quincenas anteriores si hay. Atender aclaraciones de docentes. |
| 6 | Capital Humano | Cerrar quincena. Sistema bloquea ediciones y genera borradores Excel HONORARIOS CENTRO y HONORARIOS INSTITUTO. |
| 7 | Contador | Da formato oficial a los borradores. Docentes firman de recibido. |

---

## 14. SCHEMA DE BASE DE DATOS PRINCIPAL (PostgreSQL)

```sql
-- CATÁLOGOS BASE
docentes (id UUID PK, nombre_completo, numero_docente UNIQUE, noi, chec_id,
          tipo ENUM(por_horas, tiempo_completo, virtual, suplente),
          razon_social ENUM(centro, instituto, ambos),
          costo_hora_centro NUMERIC, costo_hora_instituto NUMERIC,
          rfc, curp, clabe, forma_pago, modalidad,
          horas_contrato_semana, hora_entrada TIME, hora_salida TIME,
          correo, password_hash, activo BOOLEAN)

programas (id UUID PK, nombre TEXT, nivel ENUM(prepa, licenciatura, especialidad, maestria),
           razon_social ENUM(centro, instituto), costo_hora_default NUMERIC)

materias (id UUID PK, nombre TEXT, programa_id FK, semestre TEXT)

asignaciones (id UUID PK, docente_id FK, materia_id FK, grupo TEXT,
              horas_semana INT, modalidad ENUM(presencial, virtual, mixta),
              costo_hora NUMERIC, ciclo TEXT, activa BOOLEAN)

horario_clases (id UUID PK, asignacion_id FK, dia_semana ENUM(lunes..sabado),
                hora_inicio TIME, hora_fin TIME, horas_bloque INT)

-- CHECADAS Y ASISTENCIA
nodos_checado (id UUID PK, nombre TEXT, tipo ENUM(biometrico, agente),
               plantel ENUM(centro, instituto), ip_local TEXT,
               token_api TEXT, activo BOOLEAN, ultima_conexion TIMESTAMP)

checadas (id UUID PK, docente_id FK, nodo_id FK, timestamp TIMESTAMP NOT NULL,
          tipo ENUM(entrada, salida), origen TEXT, raw_data JSONB,
          estado ENUM(asistencia, retardo, fuera_ventana, incompleta, pendiente_revision),
          clase_id FK NULLABLE, procesada BOOLEAN)

-- QUINCENAS E INCIDENCIAS
quincenas (id UUID PK, fecha_inicio DATE, fecha_fin DATE,
           razon_social ENUM(centro, instituto, ambas),
           estado ENUM(abierta, en_revision, cerrada, pagada),
           ciclo TEXT, creada_por FK)

incidencias (id UUID PK, quincena_id FK, docente_titular_id FK, asignacion_id FK,
             tipo ENUM(falta, retardo, suplencia), fecha DATE, horas_afectadas NUMERIC,
             docente_suplente_id FK NULLABLE, horas_suplidas NUMERIC NULLABLE,
             registrado_por FK, autorizado_por FK NULLABLE, notas TEXT)

horas_virtuales (id UUID PK, quincena_id FK, docente_id FK, asignacion_id FK,
                 horas_reportadas NUMERIC, reportado_por FK, validado_por FK NULLABLE, notas TEXT)
-- EVALUACIÓN VIRTUAL DETALLADA (reemplaza horas_virtuales en producción)
-- evaluacion_parametros: peso_ca, peso_ev, umbral_pago, ciclo, activo
-- criterios_evaluacion: area(ca/ev), numero(1-4), nombre, valor_max(0.15), activo
-- evaluacion_virtual_semana: por quincena+docente+asignacion+semana_num, 4 criterios CA + 4 EV (boolean), obs_ca, obs_ev
-- evaluacion_virtual_resultado: consolidado por quincena+docente+asignacion, pct_cumplimiento, aprobada(bool), horas/monto a pagar

ajustes_quincena (id UUID PK, docente_id FK, quincena_id FK, quincena_origen_id FK,
                  concepto TEXT, tipo ENUM(cargo, abono), monto NUMERIC, registrado_por FK)

nomina_quincena (id UUID PK, docente_id FK, quincena_id FK,
                 horas_programadas NUMERIC, horas_presenciales NUMERIC,
                 horas_virtuales NUMERIC, horas_suplencia NUMERIC, horas_reales NUMERIC,
                 descuentos_total NUMERIC, honorarios NUMERIC, iva NUMERIC, sub_total NUMERIC,
                 retencion_isr NUMERIC, retencion_iva NUMERIC, total_a_pagar NUMERIC,
                 ajustes NUMERIC DEFAULT 0, total_final NUMERIC,
                 estado ENUM(borrador, validado, pagado))

-- CONFIGURACIÓN
configuracion_tolerancias (id UUID PK, programa_id FK, ciclo TEXT,
                            minutos_tolerancia_entrada INT DEFAULT 10,
                            minutos_tolerancia_entrada_bloque_largo INT DEFAULT 5,
                            horas_bloque_para_tolerancia_corta INT DEFAULT 2,
                            minutos_tolerancia_salida INT DEFAULT 10,
                            politica_retardo ENUM(solo_nota, retardo_descuento, tres_retardos_falta),
                            activa BOOLEAN)

-- USUARIOS Y ACCESOS
usuarios (id UUID PK, docente_id FK NULLABLE, nombre TEXT, email TEXT UNIQUE,
          password_hash TEXT, rol ENUM(admin, coord_academica, virtual, docente, reportes),
          activo BOOLEAN)

aclaraciones (id UUID PK, docente_id FK, checada_id FK NULLABLE, quincena_id FK,
              descripcion TEXT, estado ENUM(pendiente, revisando, resuelta, rechazada),
              respuesta TEXT, atendido_por FK NULLABLE)
```

---

## 15. TABLAS PENDIENTES DE CREAR en iesef_nomina

```sql
-- CATÁLOGOS
docentes (numero_docente, noi, nombre_completo, rfc, curp, clabe, forma_pago,
          modalidad, adscripcion, chec_id, costo_hora_centro, costo_hora_instituto,
          tipo, activo, correo, password_hash, ...)

trabajadores (no_trabajador, nombre, chec_id, activo,
              -- horarios múltiples por día:
              horario_lv_inicio, horario_lv_fin, horario_s_inicio, horario_s_fin, ...)

programas (id, nombre, nivel, razon_social, costo_hora_default)
materias (id, nombre, programa_id, semestre)
asignaciones (id, docente_id, materia_id, grupo, horas_semana, modalidad, costo_hora, ciclo, activa)
horario_clases (id, asignacion_id, dia_semana, hora_inicio, hora_fin, horas_bloque)

-- CONFIGURACIÓN
tarifas_programas (programa_id, tarifa_hora, activo, modificado_por, modificado_en)
config_asistencia (tolerancia_retardo_min, tolerancia_salida_min,
                   minutos_falta, retardos_por_falta)
-- Valores actuales del sistema v1: retardo=15min, salida_antes=15min, falta=21min, retardos/falta=3

-- AUTENTICACIÓN
usuarios (id, docente_id NULLABLE, nombre, email, password_hash,
          rol ENUM(director_cap_humano, cap_humano, finanzas, coord_docente,
                   servicios_escolares, coord_academica, educacion_virtual, docente, reportes),
          programa_id NULLABLE, -- para coord_academica (1 por programa)
          activo)

-- QUINCENAS
quincenas (id, fecha_inicio, fecha_fin, razon_social, estado, ciclo, creada_por, creada_en)

-- INCIDENCIAS Y SUPLENCIAS
incidencias (id, quincena_id, docente_titular_id, asignacion_id, tipo,
             fecha, horas_afectadas, docente_suplente_id, horas_suplidas,
             estado ENUM(pendiente, validada_coord, aprobada, rechazada),
             registrado_por, validado_coord_por, aprobado_cap_por, notas)

-- EVALUACIÓN VIRTUAL
evaluacion_parametros (ciclo, peso_ca, peso_ev, umbral_pago, activo)
criterios_evaluacion (area, numero, nombre, valor_max, activo)
evaluacion_virtual_semana (quincena_id, docente_id, asignacion_id, semana_num,
                            ca_1..ca_4 BOOLEAN, ev_1..ev_4 BOOLEAN,
                            obs_ca, obs_ev, capturado_ca_por, capturado_ev_por)
evaluacion_virtual_resultado (quincena_id, docente_id, asignacion_id,
                               horas_quincena, tarifa, pct_cumplimiento,
                               aprobada BOOLEAN, horas_reales_a_pagar, monto_a_pagar)

-- NÓMINA
nomina_quincena (id, docente_id, quincena_id, horas_programadas, horas_presenciales,
                 horas_virtuales, horas_suplencia, horas_reales, honorarios,
                 iva, sub_total, retencion_isr, retencion_iva, total_a_pagar,
                 ajustes, total_final, estado ENUM(borrador, validado, pagado))
ajustes_quincena (id, docente_id, quincena_id, quincena_origen_id,
                  concepto, tipo ENUM(cargo, abono), monto, registrado_por)

-- PORTAL DOCENTE
aclaraciones (id, docente_id, checada_id NULLABLE, quincena_id,
              descripcion, estado, respuesta, atendido_por)
```

## 16. PLAN DE IMPLEMENTACIÓN — 5 FASES

### Fase 1 — Base, catálogos, nómina y exportación (3-4 semanas)
- Servidor Docker en HostGator configurado
- Login JWT, roles, gestión de usuarios
- ABM docentes con carga masiva desde Excel BD
- Catálogos: programas, materias, asignaciones, horarios
- Gestión de quincenas (crear, abrir, cerrar)
- Motor de cálculo de nómina con fórmula fiscal
- **Exportación Excel HONORARIOS CENTRO y HONORARIOS INSTITUTO (mismo formato que el Excel actual)**
- ✅ Se puede operar EN PARALELO con el Excel como validación cruzada

### Fase 2 — Incidencias, suplencias, virtual y ajustes (2-3 semanas)
- Módulo de faltas y suplencias para coordinaciones
- Módulo de horas virtuales para Educación Virtual
- Topes de horas en tiempo completo con alertas
- Ajustes entre quincenas con trazabilidad
- ✅ Desde aquí se puede cerrar quincenas completamente sin Excel

### Fase 3 — MB360 en tiempo real (2-3 semanas)
- Agente Python como servicio systemd en PC Ubuntu LAN
- Conexión pyzk TCP 4370, live_capture en tiempo real
- Cola local offline: si cae internet, las checadas se acumulan y sincronizan
- Clasificador automático de checadas según ventanas del horario
- Sincronización de plantillas biométricas entre múltiples MB360
- Monitoreo de salud de nodos (alerta si un MB360 deja de responder)

### Fase 4 — Portal del docente (1-2 semanas)
- Acceso con número de docente + contraseña
- Historial de checadas propias con timestamps exactos
- Nómina en curso (borrador) y historial de quincenas anteriores
- Módulo de aclaraciones a Capital Humano

### Fase 5 — Reportes, alertas y capacitación (1-2 semanas)
- Dashboard para dirección
- Reportes históricos por programa y docente
- Alertas por correo: nodo MB360 caído, checada incompleta
- Manual de usuario por rol

**Tiempo total estimado:** 10-14 semanas con Eduardo como co-desarrollador

---

## 16. CÁLCULO FISCAL PARA DOCENTES MULTI-PROGRAMA

Cuando un docente imparte clases en **múltiples programas con tarifas distintas**, el cálculo fiscal se realiza sobre el **total consolidado de honorarios**, no por separado por programa:

```
honorarios_totales = SUM(horas_reales_programa_X × costo_hora_programa_X)
                   = (horas_pres_enf × $140) + (horas_virt_esp × $200) + ...

iva             = honorarios_totales × 0.16
sub_total       = honorarios_totales + iva
retencion_isr   = honorarios_totales × 0.10
retencion_iva   = iva × (2/3)
total_a_pagar   = sub_total - retencion_isr - retencion_iva
```

**Ejemplo verificado (Garzón Quiróz, Febrero 2026):**
```
Especialidades: (10h presencial + 10h virtual) × $200 = $4,000
Enfermería:     14h presencial × $140            = $1,960
honorarios_totales = $5,960 ✅ (confirmado en Excel)
```

En el documento HONORARIOS, la primera fila del docente muestra el honorario consolidado; las filas adicionales de otros programas quedan en blanco en la columna HONORARIOS (son de referencia para desglose).

## 17. PERSONAL ADMINISTRATIVO

- Usa el **mismo checador biométrico** que los docentes.
- Su cálculo es más simple: jornada fija, entrada y salida.
- Pueden tener hasta 3-4 turnos distintos según día de la semana (ej. L-V 09:00-17:00, S 08:00-14:00).
- Los directores académicos o Capital Humano deciden si se les descuenta por retardos/inasistencias y si se justifican.
- **Van en el mismo sistema**, módulo separado de la nómina de docentes.

## 18. HORARIOS — CARGA DESDE eSTUDY

- El sistema de control escolar del proveedor es **eStudy**.
- Los horarios de docentes se pueden exportar desde eStudy como Excel y cargarse masivamente al nuevo sistema.
- La **Coordinación Docente** y la **Dirección de Servicios Escolares** deben poder:
  - Agregar docentes manualmente
  - Modificar horarios existentes
  - Dar de baja docentes
- El ciclo de cambio de horarios es cuatrimestral (mayoría de programas) o semestral (Preparatoria y Enfermería Escolarizada).

## 19. DECISIONES TÉCNICAS Y RESTRICCIONES

- El NOI (número interno de Capital Humano) **no es el identificador público** del docente. El `numero_docente` (columna "F") es el username del portal.
- La fórmula fiscal es FIJA por ley. No requiere configuración por docente.
- El sistema NO descuenta automáticamente. Siempre hay confirmación humana.
- Los timestamps de checadas son INMUTABLES. El estado es una interpretación.
- Un docente puede dar clases en Centro e Instituto simultáneamente, con tarifas distintas.
- CAMPO CLÍNICO usa pago fijo ($2,500), no por hora.
- La nómina final que se entrega al contador es el Excel de HONORARIOS (con fórmula fiscal completa). El reporte de asistencia es solo para validación interna de coordinaciones.
- El sistema del proveedor externo (control escolar) sigue activo. El nuevo sistema de nómina convive con él, no lo reemplaza.
- Horarios de docentes actualmente vienen de archivos en Google Drive que las coordinaciones llenan. Uno de los objetivos es que esto se capture directamente en el nuevo sistema.

## 20. INTEGRACIÓN CON ASPEL NOI

Finanzas actualmente paga a cada docente **uno por uno** manualmente. El nuevo sistema debe generar un archivo exportable compatible con **Aspel NOI** para carga masiva de pagos.

- **Aspel NOI** es el software de nómina mexicano estándar usado por Finanzas/Contador del IESEF.
- El archivo de exportación debe contener por docente: CLABE, monto total a pagar, concepto, período.
- **NOI:**
  - Lo asigna y carga **Finanzas** (no Capital Humano).
  - En régimen de **Honorarios**, generalmente no se asigna NOI.
  - En régimen de **Asimilados a salarios**, sí lleva NOI.
  - El sistema permite que Finanzas cargue/actualice el NOI de cada docente directamente.
- Finanzas debe poder ver el estado completo de cada quincena, hacer observaciones y tener visibilidad total sin depender de que Cap. Humano les reenvíe información.

> **Pendiente técnico:** Investigar el formato exacto de importación de Aspel NOI (CSV/TXT/XML) para generar el archivo correcto. Confirmar con Eduardo/Finanzas qué campos requiere el layout de Aspel.

## 21. PUNTOS PENDIENTES DE VALIDACIÓN CON EL IESEF

| Punto | Quién decide | Impacto |
|---|---|---|
| Minutos exactos de tolerancia por nivel | Dir. + Capital Humano | ALTO |
| Política de retardo activa para ciclo actual | Dirección General | ALTO |
| Horario exacto de cada docente TC (¿todos 8-16?) | Capital Humano | MEDIO |
| Frecuencia de cambio de horario (semestral/cuatrimestral) | Coord. Docente | MEDIO |
| ¿Horarios vienen de control escolar o se cargan manualmente? | Capital Humano / IT | MEDIO |
| Tarifa exacta de Campo Clínico (¿siempre $2,500 o puede variar?) | Capital Humano | BAJO |
| ~~Cálculo fiscal multi-programa~~ | ✅ Resuelto: consolidado por docente | - |
| ~~NOI quién lo asigna~~ | ✅ Resuelto: lo asigna Finanzas | - |
| ~~Porcentaje virtual 40/60 por programa~~ | ✅ Resuelto: igual para todos | - |
| Formato exacto de exportación para Aspel NOI | Finanzas / Eduardo | ALTO |
| ¿Los códigos de grupos (EECI, MDIE, MSP, etc.) vienen del eStudy o se asignan manualmente? | Control Escolar | BAJO |
| ¿Qué pasa con el 40% de Maestrías mientras no existe Coord. Académica? ¿Cap. Humano lo aprueba? | Director Cap. Humano | MEDIO |
| ¿La evaluación virtual 40/60 afecta el número de horas pagadas o es solo un registro de calidad? | Cap. Humano / Coord. Académica | ALTO |
