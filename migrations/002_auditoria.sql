-- Migración 002: Sistema de auditoría
-- Ejecutar: psql -h 127.0.0.1 -U nomina_user -d iesef_nomina -f 002_auditoria.sql

CREATE TABLE IF NOT EXISTS audit_log (
    id            BIGSERIAL PRIMARY KEY,
    -- Quién
    usuario_id    INTEGER,                          -- puede ser NULL si se borra el usuario
    usuario_email TEXT        NOT NULL,             -- desnormalizado: persiste aunque se borre el usuario
    usuario_rol   TEXT        NOT NULL,
    -- Qué
    accion        TEXT        NOT NULL,             -- 'crear_docente', 'dar_baja_docente', etc.
    entidad       TEXT        NOT NULL,             -- 'docente', 'quincena', 'nomina', etc.
    entidad_id    TEXT,                             -- ID del registro afectado
    descripcion   TEXT,                             -- resumen legible: "Dio de baja a García Soto Fernando"
    detalle       JSONB,                            -- datos antes/después en formato libre
    -- Cuándo / dónde
    ip_cliente    TEXT,
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_audit_usuario  ON audit_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_entidad  ON audit_log(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_audit_accion   ON audit_log(accion);
CREATE INDEX IF NOT EXISTS idx_audit_ts       ON audit_log(timestamp DESC);

-- Registrar migración
INSERT INTO migraciones (version, descripcion) VALUES ('002', 'Sistema de auditoria')
ON CONFLICT (version) DO NOTHING;
