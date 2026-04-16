-- Migración 009: Convertir campos de horas de clase a INTEGER
-- Regla de negocio: las horas de clase son siempre enteros (1, 2, 3...)
-- Los valores fraccionales (0.3, 0.7, 1.3) fueron introducidos por un script con error.
--
-- NOTA: Este script debe ejecutarse con el usuario postgres (propietario de las tablas).
-- Los datos ya fueron redondeados en el paso previo con nomina_user.
-- Este paso solo altera el tipo de columna.

ALTER TABLE asignaciones
    ALTER COLUMN horas_semana TYPE INTEGER USING ROUND(horas_semana)::INTEGER;

ALTER TABLE horario_clases
    ALTER COLUMN horas_bloque TYPE INTEGER USING ROUND(horas_bloque)::INTEGER;

ALTER TABLE incidencias
    ALTER COLUMN horas_afectadas TYPE INTEGER USING ROUND(COALESCE(horas_afectadas,0))::INTEGER,
    ALTER COLUMN horas_suplidas  TYPE INTEGER USING ROUND(COALESCE(horas_suplidas,0))::INTEGER;

ALTER TABLE evaluacion_virtual_resultado
    ALTER COLUMN horas_quincena       TYPE INTEGER USING ROUND(horas_quincena)::INTEGER,
    ALTER COLUMN horas_reales_a_pagar TYPE INTEGER USING ROUND(COALESCE(horas_reales_a_pagar,0))::INTEGER;

ALTER TABLE nomina_quincena
    ALTER COLUMN horas_programadas  TYPE INTEGER USING ROUND(COALESCE(horas_programadas,0))::INTEGER,
    ALTER COLUMN horas_presenciales TYPE INTEGER USING ROUND(COALESCE(horas_presenciales,0))::INTEGER,
    ALTER COLUMN horas_virtuales    TYPE INTEGER USING ROUND(COALESCE(horas_virtuales,0))::INTEGER,
    ALTER COLUMN horas_suplencia    TYPE INTEGER USING ROUND(COALESCE(horas_suplencia,0))::INTEGER,
    ALTER COLUMN horas_reales       TYPE INTEGER USING ROUND(COALESCE(horas_reales,0))::INTEGER,
    ALTER COLUMN horas_descuento    TYPE INTEGER USING ROUND(COALESCE(horas_descuento,0))::INTEGER;

ALTER TABLE nomina_detalle_programa
    ALTER COLUMN horas_presenciales TYPE INTEGER USING ROUND(COALESCE(horas_presenciales,0))::INTEGER,
    ALTER COLUMN horas_virtuales    TYPE INTEGER USING ROUND(COALESCE(horas_virtuales,0))::INTEGER,
    ALTER COLUMN horas_suplencia    TYPE INTEGER USING ROUND(COALESCE(horas_suplencia,0))::INTEGER,
    ALTER COLUMN horas_reales       TYPE INTEGER USING ROUND(COALESCE(horas_reales,0))::INTEGER;
