-- Migración 013: foto de perfil para usuarios
-- Almacenada como data URL base64 (cliente redimensiona a ≤200×200 antes de enviar)

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS foto_perfil TEXT;

-- Índice no necesario (TEXT largo no se indexa; se accede solo por id)
