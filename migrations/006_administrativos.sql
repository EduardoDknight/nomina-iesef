-- Migration 006: Administrative Staff Payroll Module
-- Tablas para nomina de personal administrativo

CREATE TABLE IF NOT EXISTS trabajadores (
    id                SERIAL PRIMARY KEY,
    chec_id           INTEGER UNIQUE,
    nombre            VARCHAR(200) NOT NULL,
    cargo             VARCHAR(100),
    sueldo_quincenal  NUMERIC(10,2) NOT NULL DEFAULT 0,
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS horarios_trabajador (
    id              SERIAL PRIMARY KEY,
    trabajador_id   INTEGER NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
    lunes           BOOLEAN NOT NULL DEFAULT FALSE,
    martes          BOOLEAN NOT NULL DEFAULT FALSE,
    miercoles       BOOLEAN NOT NULL DEFAULT FALSE,
    jueves          BOOLEAN NOT NULL DEFAULT FALSE,
    viernes         BOOLEAN NOT NULL DEFAULT FALSE,
    sabado          BOOLEAN NOT NULL DEFAULT FALSE,
    domingo         BOOLEAN NOT NULL DEFAULT FALSE,
    hora_entrada    TIME NOT NULL,
    hora_salida     TIME NOT NULL
);

CREATE TABLE IF NOT EXISTS nomina_admin_quincena (
    id              SERIAL PRIMARY KEY,
    trabajador_id   INTEGER NOT NULL REFERENCES trabajadores(id),
    quincena_id     INTEGER NOT NULL REFERENCES quincenas(id) ON DELETE CASCADE,
    dias_periodo    INTEGER NOT NULL DEFAULT 0,
    dias_presentes  INTEGER NOT NULL DEFAULT 0,
    retardos        INTEGER NOT NULL DEFAULT 0,
    faltas          INTEGER NOT NULL DEFAULT 0,
    dias_descuento  INTEGER NOT NULL DEFAULT 0,
    sueldo_base     NUMERIC(10,2) NOT NULL DEFAULT 0,
    descuento       NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_pagar     NUMERIC(10,2) NOT NULL DEFAULT 0,
    estado          VARCHAR(20) NOT NULL DEFAULT 'borrador',
    generado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generado_por    INTEGER REFERENCES usuarios(id),
    UNIQUE (trabajador_id, quincena_id)
);

CREATE TABLE IF NOT EXISTS incidencias_admin (
    id              SERIAL PRIMARY KEY,
    quincena_id     INTEGER NOT NULL REFERENCES quincenas(id) ON DELETE CASCADE,
    trabajador_id   INTEGER NOT NULL REFERENCES trabajadores(id),
    tipo            VARCHAR(30) NOT NULL CHECK (tipo IN ('falta_justificada', 'permiso', 'vacaciones', 'otro')),
    fecha           DATE NOT NULL,
    descripcion     TEXT,
    registrado_por  INTEGER REFERENCES usuarios(id),
    registrado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_horarios_trabajador_id ON horarios_trabajador(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_nomina_admin_quincena ON nomina_admin_quincena(quincena_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_admin_quincena ON incidencias_admin(quincena_id);
