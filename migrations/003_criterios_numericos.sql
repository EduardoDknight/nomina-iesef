-- Migración 003: Criterios de evaluación virtual — de BOOLEAN a NUMERIC
-- CA: 0.00 | 0.05 | 0.10    (no cumple | parcial | cumple)
-- EV: 0.00 | 0.075 | 0.15   (no cumple | parcial | cumple)
-- Ejecutar: psql -U nomina_user -d iesef_nomina -f migrations/003_criterios_numericos.sql

BEGIN;

-- Quitar defaults booleanos antes de cambiar tipo
ALTER TABLE evaluacion_virtual_semana
  ALTER COLUMN ca_1 DROP DEFAULT,
  ALTER COLUMN ca_2 DROP DEFAULT,
  ALTER COLUMN ca_3 DROP DEFAULT,
  ALTER COLUMN ca_4 DROP DEFAULT,
  ALTER COLUMN ev_1 DROP DEFAULT,
  ALTER COLUMN ev_2 DROP DEFAULT,
  ALTER COLUMN ev_3 DROP DEFAULT,
  ALTER COLUMN ev_4 DROP DEFAULT;

-- Convertir columnas CA (boolean → numeric, 0.10 si era true)
ALTER TABLE evaluacion_virtual_semana
  ALTER COLUMN ca_1 TYPE NUMERIC(5,3) USING CASE WHEN ca_1 THEN 0.100 ELSE 0.000 END,
  ALTER COLUMN ca_2 TYPE NUMERIC(5,3) USING CASE WHEN ca_2 THEN 0.100 ELSE 0.000 END,
  ALTER COLUMN ca_3 TYPE NUMERIC(5,3) USING CASE WHEN ca_3 THEN 0.100 ELSE 0.000 END,
  ALTER COLUMN ca_4 TYPE NUMERIC(5,3) USING CASE WHEN ca_4 THEN 0.100 ELSE 0.000 END;

-- Convertir columnas EV (boolean → numeric, 0.15 si era true)
ALTER TABLE evaluacion_virtual_semana
  ALTER COLUMN ev_1 TYPE NUMERIC(5,3) USING CASE WHEN ev_1 THEN 0.150 ELSE 0.000 END,
  ALTER COLUMN ev_2 TYPE NUMERIC(5,3) USING CASE WHEN ev_2 THEN 0.150 ELSE 0.000 END,
  ALTER COLUMN ev_3 TYPE NUMERIC(5,3) USING CASE WHEN ev_3 THEN 0.150 ELSE 0.000 END,
  ALTER COLUMN ev_4 TYPE NUMERIC(5,3) USING CASE WHEN ev_4 THEN 0.150 ELSE 0.000 END;

-- Establecer nuevo default numérico
ALTER TABLE evaluacion_virtual_semana
  ALTER COLUMN ca_1 SET DEFAULT 0.000,
  ALTER COLUMN ca_2 SET DEFAULT 0.000,
  ALTER COLUMN ca_3 SET DEFAULT 0.000,
  ALTER COLUMN ca_4 SET DEFAULT 0.000,
  ALTER COLUMN ev_1 SET DEFAULT 0.000,
  ALTER COLUMN ev_2 SET DEFAULT 0.000,
  ALTER COLUMN ev_3 SET DEFAULT 0.000,
  ALTER COLUMN ev_4 SET DEFAULT 0.000;

-- Corregir valor_max de criterios de Coord. Académica: era 0.15, debe ser 0.10
UPDATE criterios_evaluacion SET valor_max = 0.100 WHERE area = 'coord_academica';

-- Los criterios de Educación Virtual ya son 0.15, confirmar
UPDATE criterios_evaluacion SET valor_max = 0.150 WHERE area = 'educacion_virtual';

INSERT INTO migraciones (version, descripcion)
VALUES ('003', 'Criterios evaluacion virtual: boolean→numeric, CA max=0.10, EV max=0.15')
ON CONFLICT (version) DO NOTHING;

COMMIT;
