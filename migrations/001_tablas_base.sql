-- ============================================================
-- MIGRACIÓN 001 — Tablas base del sistema de nómina IESEF
-- Aplica sobre: iesef_nomina (PostgreSQL 15 en HostGator)
-- Ejecutar: psql -U nomina_user -d iesef_nomina -f 001_tablas_base.sql
-- PRECAUCIÓN: No toca asistencias_checadas ni sync_log (ya existen)
-- ============================================================

BEGIN;

-- ============================================================
-- TIPOS ENUM
-- ============================================================

CREATE TYPE nivel_programa    AS ENUM ('prepa', 'licenciatura', 'especialidad', 'maestria');
CREATE TYPE razon_social      AS ENUM ('centro', 'instituto', 'ambos');
CREATE TYPE tipo_docente      AS ENUM ('por_horas', 'tiempo_completo', 'virtual', 'campo_clinico');
CREATE TYPE modalidad_clase   AS ENUM ('presencial', 'virtual', 'mixta');
CREATE TYPE dia_semana        AS ENUM ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado');
CREATE TYPE rol_usuario       AS ENUM (
    'director_cap_humano', 'cap_humano', 'finanzas',
    'coord_docente', 'servicios_escolares',
    'coord_academica', 'educacion_virtual',
    'docente', 'reportes'
);
CREATE TYPE estado_quincena   AS ENUM ('abierta', 'en_revision', 'cerrada', 'pagada');
CREATE TYPE razon_quincena    AS ENUM ('centro', 'instituto', 'ambas');
CREATE TYPE estado_incidencia AS ENUM ('pendiente', 'validada_coord', 'aprobada', 'rechazada');
CREATE TYPE tipo_incidencia   AS ENUM ('falta', 'retardo', 'suplencia');
CREATE TYPE estado_nomina     AS ENUM ('borrador', 'validado', 'pagado');
CREATE TYPE tipo_ajuste       AS ENUM ('cargo', 'abono');
CREATE TYPE estado_aclaracion AS ENUM ('pendiente', 'revisando', 'resuelta', 'rechazada');
CREATE TYPE area_evaluacion   AS ENUM ('coord_academica', 'educacion_virtual');
CREATE TYPE regimen_fiscal    AS ENUM ('honorarios', 'asimilados_salarios');
CREATE TYPE plan_academico    AS ENUM ('semestral', 'cuatrimestral');

-- ============================================================
-- CONFIGURACIÓN DEL SISTEMA
-- ============================================================

CREATE TABLE config_asistencia (
    id                       SERIAL PRIMARY KEY,
    tolerancia_entrada_min   INTEGER NOT NULL DEFAULT 10,
    max_tolerancia_salida_min INTEGER NOT NULL DEFAULT 20, -- tope fijo sin importar duración
    minutos_falta            INTEGER NOT NULL DEFAULT 21,
    retardos_por_falta       INTEGER NOT NULL DEFAULT 3,
    modificado_por           INTEGER,  -- FK a usuarios (se agrega después con ALTER)
    modificado_en            TIMESTAMP DEFAULT NOW()
);

-- Insertar valores por defecto
INSERT INTO config_asistencia
    (tolerancia_entrada_min, max_tolerancia_salida_min, minutos_falta, retardos_por_falta)
VALUES (10, 20, 21, 3);

-- ============================================================
-- CATÁLOGO DE PROGRAMAS
-- ============================================================

CREATE TABLE programas (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    codigo          VARCHAR(20)  NOT NULL UNIQUE, -- PREPA, ENFER, NUTR, LENA, ESP, MAES, CAMPO
    nivel           nivel_programa NOT NULL,
    razon_social    razon_social NOT NULL,
    plan            plan_academico NOT NULL DEFAULT 'cuatrimestral',
    costo_hora      NUMERIC(10,2) NOT NULL,
    activo          BOOLEAN NOT NULL DEFAULT true,
    creado_en       TIMESTAMP DEFAULT NOW()
);

INSERT INTO programas (nombre, codigo, nivel, razon_social, plan, costo_hora) VALUES
    ('Preparatoria',                              'PREPA', 'prepa',         'centro',    'semestral',      120.00),
    ('Licenciatura en Enfermería',                'ENFER', 'licenciatura',  'instituto', 'semestral',      140.00),
    ('Licenciatura en Nutrición',                 'NUTR',  'licenciatura',  'instituto', 'cuatrimestral',  130.00),
    ('Lic. Enfermería Nivelación Académica',       'LENA',  'licenciatura',  'instituto', 'cuatrimestral',  160.00),
    ('Especialidades',                            'ESP',   'especialidad',  'instituto', 'cuatrimestral',  200.00),
    ('Maestrías',                                 'MAES',  'maestria',      'instituto', 'cuatrimestral',  220.00),
    ('Campo Clínico',                             'CAMPO', 'licenciatura',  'instituto', 'cuatrimestral',    0.00); -- pago fijo, no por hora

-- ============================================================
-- CATÁLOGO DE MATERIAS
-- ============================================================

CREATE TABLE materias (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(200) NOT NULL,
    programa_id INTEGER NOT NULL REFERENCES programas(id),
    semestre    VARCHAR(10),
    activa      BOOLEAN NOT NULL DEFAULT true,
    creado_en   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- CATÁLOGO DE DOCENTES
-- ============================================================

CREATE TABLE docentes (
    id                    SERIAL PRIMARY KEY,
    numero_docente        VARCHAR(20)  UNIQUE,           -- identificador público, username portal
    noi                   INTEGER,                        -- número interno Capital Humano (lo asigna Finanzas)
    chec_id               INTEGER,                        -- user_id en asistencias_checadas (campo CHEC)
    nombre_completo       VARCHAR(200) NOT NULL,
    rfc                   VARCHAR(13),
    curp                  VARCHAR(18),
    codigo_postal         VARCHAR(5),
    clabe                 VARCHAR(18),
    forma_pago            VARCHAR(50),                    -- 'Clabe interbancaria'
    regimen_fiscal        regimen_fiscal DEFAULT 'honorarios',
    adscripcion           razon_social DEFAULT 'instituto',
    tipo                  tipo_docente NOT NULL DEFAULT 'por_horas',
    -- tarifas (pueden diferir del programa si tiene tarifa especial)
    costo_hora_centro     NUMERIC(10,2),
    costo_hora_instituto  NUMERIC(10,2),
    -- tiempo completo
    horas_contrato_semana INTEGER,
    hora_entrada          TIME,
    hora_salida           TIME,
    -- campo clínico
    monto_fijo_quincenal  NUMERIC(10,2),                 -- $2,500 por quincena
    -- contacto y acceso
    correo                VARCHAR(100),
    password_hash         VARCHAR(200),
    activo                BOOLEAN NOT NULL DEFAULT true,
    creado_en             TIMESTAMP DEFAULT NOW(),
    modificado_en         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_docentes_chec_id      ON docentes(chec_id);
CREATE INDEX idx_docentes_noi          ON docentes(noi);
CREATE INDEX idx_docentes_numero       ON docentes(numero_docente);

-- ============================================================
-- CATÁLOGO DE TRABAJADORES ADMINISTRATIVOS
-- ============================================================

CREATE TABLE trabajadores (
    id          SERIAL PRIMARY KEY,
    no_trabajador INTEGER UNIQUE NOT NULL,  -- = NO. TRABAJADOR CHECADO = chec_id
    nombre      VARCHAR(200) NOT NULL,
    chec_id     INTEGER UNIQUE,             -- mismo que no_trabajador normalmente
    -- hasta 3 bloques de horario por semana
    bloque1_dias    VARCHAR(10),            -- 'L-V', 'L-S', 'M-M-J', etc.
    bloque1_inicio  TIME,
    bloque1_fin     TIME,
    bloque2_dias    VARCHAR(10),
    bloque2_inicio  TIME,
    bloque2_fin     TIME,
    bloque3_dias    VARCHAR(10),
    bloque3_inicio  TIME,
    bloque3_fin     TIME,
    activo      BOOLEAN NOT NULL DEFAULT true,
    creado_en   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trabajadores_chec ON trabajadores(chec_id);

-- ============================================================
-- ASIGNACIONES (docente → materia × ciclo)
-- ============================================================

CREATE TABLE asignaciones (
    id            SERIAL PRIMARY KEY,
    docente_id    INTEGER NOT NULL REFERENCES docentes(id),
    materia_id    INTEGER NOT NULL REFERENCES materias(id),
    grupo         VARCHAR(30),
    horas_semana  NUMERIC(4,1) NOT NULL,
    modalidad     modalidad_clase NOT NULL DEFAULT 'presencial',
    costo_hora    NUMERIC(10,2),           -- NULL = usa tarifa del programa
    ciclo         VARCHAR(20) NOT NULL,    -- '2026-1', '2026-A', etc.
    activa        BOOLEAN NOT NULL DEFAULT true,
    creado_en     TIMESTAMP DEFAULT NOW(),
    modificado_por INTEGER,
    modificado_en  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_asignaciones_docente ON asignaciones(docente_id);
CREATE INDEX idx_asignaciones_ciclo   ON asignaciones(ciclo);

-- ============================================================
-- HORARIOS DE CLASES (bloques por día)
-- ============================================================

CREATE TABLE horario_clases (
    id             SERIAL PRIMARY KEY,
    asignacion_id  INTEGER NOT NULL REFERENCES asignaciones(id),
    dia_semana     dia_semana NOT NULL,
    hora_inicio    TIME NOT NULL,
    hora_fin       TIME NOT NULL,
    horas_bloque   NUMERIC(3,1) NOT NULL,  -- duración en horas (ej: 2.0, 1.5)
    activo         BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_horario_asignacion ON horario_clases(asignacion_id);

-- ============================================================
-- USUARIOS DEL SISTEMA
-- ============================================================

CREATE TABLE usuarios (
    id           SERIAL PRIMARY KEY,
    docente_id   INTEGER REFERENCES docentes(id),   -- NULL si no es docente
    nombre       VARCHAR(200) NOT NULL,
    email        VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(200) NOT NULL,
    rol          rol_usuario NOT NULL,
    programa_id  INTEGER REFERENCES programas(id),  -- para coord_academica (1 por programa)
    activo       BOOLEAN NOT NULL DEFAULT true,
    ultimo_acceso TIMESTAMP,
    creado_en    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_rol   ON usuarios(rol);

-- Agregar FK diferida a config_asistencia
ALTER TABLE config_asistencia
    ADD CONSTRAINT fk_config_usuario
    FOREIGN KEY (modificado_por) REFERENCES usuarios(id);

-- ============================================================
-- QUINCENAS
-- ============================================================

CREATE TABLE quincenas (
    id           SERIAL PRIMARY KEY,
    fecha_inicio DATE NOT NULL,
    fecha_fin    DATE NOT NULL,
    razon_social razon_quincena NOT NULL DEFAULT 'ambas',
    estado       estado_quincena NOT NULL DEFAULT 'abierta',
    ciclo        VARCHAR(20) NOT NULL,
    creada_por   INTEGER REFERENCES usuarios(id),
    creada_en    TIMESTAMP DEFAULT NOW(),
    cerrada_por  INTEGER REFERENCES usuarios(id),
    cerrada_en   TIMESTAMP,
    CONSTRAINT uq_quincena_periodo UNIQUE (fecha_inicio, fecha_fin, razon_social)
);

CREATE INDEX idx_quincenas_estado ON quincenas(estado);

-- ============================================================
-- INCIDENCIAS (faltas, retardos, suplencias)
-- ============================================================

CREATE TABLE incidencias (
    id                   SERIAL PRIMARY KEY,
    quincena_id          INTEGER NOT NULL REFERENCES quincenas(id),
    docente_titular_id   INTEGER NOT NULL REFERENCES docentes(id),
    asignacion_id        INTEGER NOT NULL REFERENCES asignaciones(id),
    tipo                 tipo_incidencia NOT NULL,
    fecha                DATE NOT NULL,
    horas_afectadas      NUMERIC(4,1) NOT NULL DEFAULT 0,
    -- suplencia
    docente_suplente_id  INTEGER REFERENCES docentes(id),
    horas_suplidas       NUMERIC(4,1),
    -- flujo de aprobación: coord_academica → coord_docente → cap_humano
    estado               estado_incidencia NOT NULL DEFAULT 'pendiente',
    registrado_por       INTEGER REFERENCES usuarios(id),
    validado_coord_por   INTEGER REFERENCES usuarios(id),
    validado_coord_en    TIMESTAMP,
    aprobado_cap_por     INTEGER REFERENCES usuarios(id),
    aprobado_cap_en      TIMESTAMP,
    notas                TEXT,
    creado_en            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_incidencias_quincena  ON incidencias(quincena_id);
CREATE INDEX idx_incidencias_titular   ON incidencias(docente_titular_id);
CREATE INDEX idx_incidencias_estado    ON incidencias(estado);

-- ============================================================
-- CAMPO CLÍNICO (pago fijo por quincena)
-- ============================================================

CREATE TABLE campo_clinico_quincena (
    id              SERIAL PRIMARY KEY,
    quincena_id     INTEGER NOT NULL REFERENCES quincenas(id),
    docente_id      INTEGER NOT NULL REFERENCES docentes(id),
    monto           NUMERIC(10,2) NOT NULL DEFAULT 2500.00,
    pago_completo   BOOLEAN NOT NULL DEFAULT true,   -- false si hubo descuento
    motivo_descuento TEXT,
    registrado_por  INTEGER REFERENCES usuarios(id),
    creado_en       TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_campo_clinico UNIQUE (quincena_id, docente_id)
);

-- ============================================================
-- EVALUACIÓN VIRTUAL
-- ============================================================

CREATE TABLE evaluacion_parametros (
    id           SERIAL PRIMARY KEY,
    ciclo        VARCHAR(20) NOT NULL,
    peso_ca      NUMERIC(4,2) NOT NULL DEFAULT 0.40,
    peso_ev      NUMERIC(4,2) NOT NULL DEFAULT 0.60,
    umbral_pago  NUMERIC(4,2) NOT NULL DEFAULT 0.60,  -- debe SUPERAR (no igualar)
    activo       BOOLEAN NOT NULL DEFAULT true,
    creado_en    TIMESTAMP DEFAULT NOW(),
    CONSTRAINT chk_pesos CHECK (peso_ca + peso_ev = 1.00)
);

CREATE TABLE criterios_evaluacion (
    id         SERIAL PRIMARY KEY,
    area       area_evaluacion NOT NULL,
    numero     INTEGER NOT NULL,         -- 1-4
    nombre     VARCHAR(200) NOT NULL,
    valor_max  NUMERIC(4,2) NOT NULL DEFAULT 0.15,
    activo     BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT uq_criterio UNIQUE (area, numero)
);

-- Criterios iniciales (del Excel real)
INSERT INTO criterios_evaluacion (area, numero, nombre) VALUES
    ('coord_academica', 1, 'Vinculación de actividades'),
    ('coord_academica', 2, 'Respeto secuencial'),
    ('coord_academica', 3, 'Congruencia entre contenido y actividades'),
    ('coord_academica', 4, 'Material de apoyo'),
    ('educacion_virtual', 1, 'Formato institucional'),
    ('educacion_virtual', 2, 'Instrumento de evaluación'),
    ('educacion_virtual', 3, 'Publicación de actividades'),
    ('educacion_virtual', 4, 'Evaluación de actividades');

CREATE TABLE evaluacion_virtual_semana (
    id               SERIAL PRIMARY KEY,
    quincena_id      INTEGER NOT NULL REFERENCES quincenas(id),
    docente_id       INTEGER NOT NULL REFERENCES docentes(id),
    asignacion_id    INTEGER NOT NULL REFERENCES asignaciones(id),
    semana_num       INTEGER NOT NULL CHECK (semana_num IN (1, 2, 3)),
    -- criterios Coord. Académica (binarios)
    ca_1 BOOLEAN NOT NULL DEFAULT false,
    ca_2 BOOLEAN NOT NULL DEFAULT false,
    ca_3 BOOLEAN NOT NULL DEFAULT false,
    ca_4 BOOLEAN NOT NULL DEFAULT false,
    -- criterios Educación Virtual (binarios)
    ev_1 BOOLEAN NOT NULL DEFAULT false,
    ev_2 BOOLEAN NOT NULL DEFAULT false,
    ev_3 BOOLEAN NOT NULL DEFAULT false,
    ev_4 BOOLEAN NOT NULL DEFAULT false,
    -- metadata
    capturado_ca_por INTEGER REFERENCES usuarios(id),
    capturado_ca_en  TIMESTAMP,
    capturado_ev_por INTEGER REFERENCES usuarios(id),
    capturado_ev_en  TIMESTAMP,
    obs_ca           TEXT,
    obs_ev           TEXT,
    CONSTRAINT uq_eval_semana UNIQUE (quincena_id, docente_id, asignacion_id, semana_num)
);

CREATE TABLE evaluacion_virtual_resultado (
    id                    SERIAL PRIMARY KEY,
    quincena_id           INTEGER NOT NULL REFERENCES quincenas(id),
    docente_id            INTEGER NOT NULL REFERENCES docentes(id),
    asignacion_id         INTEGER NOT NULL REFERENCES asignaciones(id),
    horas_quincena        NUMERIC(5,1) NOT NULL,
    tarifa                NUMERIC(10,2) NOT NULL,
    monto_base            NUMERIC(10,2) NOT NULL,     -- horas × tarifa
    ca_contribution       NUMERIC(5,4),
    ev_contribution       NUMERIC(5,4),
    pct_cumplimiento      NUMERIC(5,4),
    aprobada              BOOLEAN NOT NULL DEFAULT false,
    horas_reales_a_pagar  NUMERIC(5,1) NOT NULL DEFAULT 0,
    monto_a_pagar         NUMERIC(10,2) NOT NULL DEFAULT 0,
    monto_descontado      NUMERIC(10,2) NOT NULL DEFAULT 0,
    calculado_en          TIMESTAMP DEFAULT NOW(),
    validado_por          INTEGER REFERENCES usuarios(id),
    CONSTRAINT uq_eval_resultado UNIQUE (quincena_id, docente_id, asignacion_id)
);

CREATE INDEX idx_eval_quincena ON evaluacion_virtual_resultado(quincena_id);

-- ============================================================
-- NÓMINA QUINCENAL
-- ============================================================

CREATE TABLE nomina_quincena (
    id                   SERIAL PRIMARY KEY,
    docente_id           INTEGER NOT NULL REFERENCES docentes(id),
    quincena_id          INTEGER NOT NULL REFERENCES quincenas(id),
    -- horas desglosadas
    horas_programadas    NUMERIC(6,1) NOT NULL DEFAULT 0,
    horas_presenciales   NUMERIC(6,1) NOT NULL DEFAULT 0,
    horas_virtuales      NUMERIC(6,1) NOT NULL DEFAULT 0,  -- horas virtuales aprobadas
    horas_suplencia      NUMERIC(6,1) NOT NULL DEFAULT 0,
    horas_reales         NUMERIC(6,1) NOT NULL DEFAULT 0,  -- presenciales + virtuales + suplencia
    horas_descuento      NUMERIC(6,1) NOT NULL DEFAULT 0,
    -- cálculo fiscal (fórmula Art. 106 LISR)
    costo_hora_promedio  NUMERIC(10,2),                    -- puede variar multi-programa
    honorarios           NUMERIC(12,2) NOT NULL DEFAULT 0, -- horas_reales × costo_hora
    iva                  NUMERIC(12,2) NOT NULL DEFAULT 0, -- honorarios × 0.16
    sub_total            NUMERIC(12,2) NOT NULL DEFAULT 0, -- honorarios + iva
    retencion_isr        NUMERIC(12,2) NOT NULL DEFAULT 0, -- honorarios × 0.10
    retencion_iva        NUMERIC(12,2) NOT NULL DEFAULT 0, -- iva × 0.6667
    total_a_pagar        NUMERIC(12,2) NOT NULL DEFAULT 0, -- sub_total - isr - ret_iva
    -- ajustes de quincenas anteriores
    ajustes              NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_final          NUMERIC(12,2) NOT NULL DEFAULT 0, -- total_a_pagar + ajustes
    -- estado
    estado               estado_nomina NOT NULL DEFAULT 'borrador',
    generado_en          TIMESTAMP DEFAULT NOW(),
    validado_por         INTEGER REFERENCES usuarios(id),
    validado_en          TIMESTAMP,
    CONSTRAINT uq_nomina UNIQUE (docente_id, quincena_id)
);

-- Tabla de detalle multi-programa (para docentes que dan en varios programas)
CREATE TABLE nomina_detalle_programa (
    id              SERIAL PRIMARY KEY,
    nomina_id       INTEGER NOT NULL REFERENCES nomina_quincena(id),
    programa_id     INTEGER NOT NULL REFERENCES programas(id),
    horas_presenciales NUMERIC(6,1) NOT NULL DEFAULT 0,
    horas_virtuales    NUMERIC(6,1) NOT NULL DEFAULT 0,
    horas_suplencia    NUMERIC(6,1) NOT NULL DEFAULT 0,
    horas_reales       NUMERIC(6,1) NOT NULL DEFAULT 0,
    costo_hora         NUMERIC(10,2) NOT NULL,
    honorarios         NUMERIC(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT uq_nomina_detalle UNIQUE (nomina_id, programa_id)
);

CREATE INDEX idx_nomina_quincena  ON nomina_quincena(quincena_id);
CREATE INDEX idx_nomina_docente   ON nomina_quincena(docente_id);
CREATE INDEX idx_nomina_estado    ON nomina_quincena(estado);

-- ============================================================
-- AJUSTES ENTRE QUINCENAS
-- ============================================================

CREATE TABLE ajustes_quincena (
    id                  SERIAL PRIMARY KEY,
    docente_id          INTEGER NOT NULL REFERENCES docentes(id),
    quincena_id         INTEGER NOT NULL REFERENCES quincenas(id),  -- donde se aplica
    quincena_origen_id  INTEGER REFERENCES quincenas(id),           -- donde ocurrió el error
    concepto            TEXT NOT NULL,
    tipo                tipo_ajuste NOT NULL,
    monto               NUMERIC(12,2) NOT NULL,
    registrado_por      INTEGER REFERENCES usuarios(id),
    creado_en           TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- PORTAL DEL DOCENTE — ACLARACIONES
-- ============================================================

CREATE TABLE aclaraciones (
    id              SERIAL PRIMARY KEY,
    docente_id      INTEGER NOT NULL REFERENCES docentes(id),
    checada_id      BIGINT REFERENCES asistencias_checadas(id),  -- puede ser NULL
    quincena_id     INTEGER NOT NULL REFERENCES quincenas(id),
    descripcion     TEXT NOT NULL,
    estado          estado_aclaracion NOT NULL DEFAULT 'pendiente',
    respuesta       TEXT,
    atendido_por    INTEGER REFERENCES usuarios(id),
    atendido_en     TIMESTAMP,
    creado_en       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_aclaraciones_docente  ON aclaraciones(docente_id);
CREATE INDEX idx_aclaraciones_estado   ON aclaraciones(estado);

-- ============================================================
-- TABLA DE MIGRACIONES (control de versiones)
-- ============================================================

CREATE TABLE IF NOT EXISTS migraciones (
    id          SERIAL PRIMARY KEY,
    version     VARCHAR(10) NOT NULL UNIQUE,
    descripcion TEXT NOT NULL,
    aplicada_en TIMESTAMP DEFAULT NOW()
);

INSERT INTO migraciones (version, descripcion)
VALUES ('001', 'Tablas base: config, programas, materias, docentes, trabajadores, asignaciones, horarios, usuarios, quincenas, incidencias, evaluacion_virtual, nomina, ajustes, aclaraciones');

COMMIT;

-- ============================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- ============================================================

SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
