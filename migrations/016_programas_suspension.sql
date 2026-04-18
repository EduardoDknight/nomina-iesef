-- Migración 015: Programas afectados por suspensión interna
--
-- Permite que una suspension_interna aplique solo a programas específicos.
-- NULL = todos los programas afectados (comportamiento anterior / por defecto)
-- Array con IDs → solo los docentes asignados a esos programas quedan exentos
-- de checada y se les paga; el resto sigue reglas normales de asistencia.
--
-- Ejemplo real: inspección de SEP solo para Bachillerato →
--   programas_ids = [1]  (1 = Preparatoria)
--   Docentes de Enfermería, Maestrías, etc. deben asistir y checar normalmente.

ALTER TABLE dias_no_laborables
    ADD COLUMN IF NOT EXISTS programas_ids INTEGER[] DEFAULT NULL;

COMMENT ON COLUMN dias_no_laborables.programas_ids IS
    'NULL = aplica a todos los programas. Array de IDs = solo esos programas. Solo relevante para suspension_interna.';
