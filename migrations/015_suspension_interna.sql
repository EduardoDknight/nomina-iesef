-- Migración 014: Suspensión Interna en el calendario institucional
--
-- Añade un tercer tipo de día no laborable con semántica opuesta a los anteriores:
--   vacaciones / suspension_oficial → docentes NO cobran (clases canceladas sin pago)
--   suspension_interna              → docentes SÍ cobran (actividad institucional:
--                                     simulacro, evento, celebración, etc.)
--                                     Administrativos NO se ven afectados en ningún caso.
--
-- El nuevo tipo admite cobertura parcial:
--   hora_inicio = NULL, hora_fin = NULL → suspensión todo el día
--   hora_inicio y hora_fin definidas    → solo el bloque de clases que cae en ese rango
--
-- REGLA DE PAGO (para el motor de nómina):
--   - suspension_interna (todo el día): todas las clases del docente en esa fecha
--     se contabilizan como "impartidas" y se pagan, SIN requerir checada biométrica.
--   - suspension_interna (parcial): solo las clases que se solapan con el rango
--     hora_inicio-hora_fin se pagan sin checada; el resto sigue reglas normales.
--   - Los tipos vacaciones/suspension_oficial siguen exactamente igual que antes.

-- 1. Eliminar el CHECK constraint original (solo tenía los dos tipos previos)
ALTER TABLE dias_no_laborables DROP CONSTRAINT IF EXISTS dias_no_laborables_tipo_check;

-- 2. Nuevo CHECK que incluye el tercer tipo
ALTER TABLE dias_no_laborables ADD CONSTRAINT dias_no_laborables_tipo_check
    CHECK (tipo IN ('vacaciones', 'suspension_oficial', 'suspension_interna'));

-- 3. Columnas para horario parcial (NULL en ambas = todo el día)
ALTER TABLE dias_no_laborables ADD COLUMN IF NOT EXISTS hora_inicio TIME DEFAULT NULL;
ALTER TABLE dias_no_laborables ADD COLUMN IF NOT EXISTS hora_fin    TIME DEFAULT NULL;

-- 4. Constraint de coherencia: o ambas horas presentes y fin > inicio, o ninguna
ALTER TABLE dias_no_laborables DROP CONSTRAINT IF EXISTS chk_horario_coherente;
ALTER TABLE dias_no_laborables ADD CONSTRAINT chk_horario_coherente CHECK (
    (hora_inicio IS NULL AND hora_fin IS NULL)
    OR
    (hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_fin > hora_inicio)
);
