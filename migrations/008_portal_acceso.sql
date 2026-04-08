-- migrations/008_portal_acceso.sql
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'superadmin';
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'trabajador';

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS trabajador_id       INTEGER REFERENCES trabajadores(id),
    ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_usuarios_trabajador ON usuarios(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_docente    ON usuarios(docente_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON usuarios TO nomina_user;
