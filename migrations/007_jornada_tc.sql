-- Migración 007: Jornada para docentes de tiempo completo
-- Estructura similar a horarios_trabajador (administrativos)

CREATE TABLE IF NOT EXISTS horarios_docente_tc (
    id            SERIAL PRIMARY KEY,
    docente_id    INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
    lunes         BOOLEAN NOT NULL DEFAULT false,
    martes        BOOLEAN NOT NULL DEFAULT false,
    miercoles     BOOLEAN NOT NULL DEFAULT false,
    jueves        BOOLEAN NOT NULL DEFAULT false,
    viernes       BOOLEAN NOT NULL DEFAULT false,
    sabado        BOOLEAN NOT NULL DEFAULT false,
    domingo       BOOLEAN NOT NULL DEFAULT false,
    hora_entrada  TIME NOT NULL,
    hora_salida   TIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_horarios_docente_tc_docente ON horarios_docente_tc(docente_id);

-- Permisos para el usuario de la aplicación
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE horarios_docente_tc TO nomina_user;
GRANT USAGE, SELECT ON SEQUENCE horarios_docente_tc_id_seq TO nomina_user;
