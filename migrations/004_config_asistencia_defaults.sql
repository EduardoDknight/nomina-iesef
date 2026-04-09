-- Migración 004: politica_retardo + fila por defecto en config_asistencia
-- Ejecutar como: psql -U nomina_user -d iesef_nomina -f migrations/004_config_asistencia_defaults.sql

BEGIN;

-- 1. Agregar columna politica_retardo si no existe
ALTER TABLE config_asistencia
    ADD COLUMN IF NOT EXISTS politica_retardo VARCHAR(30) NOT NULL DEFAULT 'tres_retardos_falta';

-- 2. Insertar fila de defaults si la tabla está vacía
INSERT INTO config_asistencia
    (tolerancia_entrada_min, max_tolerancia_salida_min, minutos_falta, retardos_por_falta, politica_retardo)
SELECT 10, 20, 21, 3, 'tres_retardos_falta'
WHERE NOT EXISTS (SELECT 1 FROM config_asistencia);

-- 3. Registrar migración
INSERT INTO migraciones (version, descripcion) VALUES ('004', 'config_asistencia: politica_retardo + fila default')
ON CONFLICT (version) DO NOTHING;

COMMIT;
