-- Migración 010: Activar modalidad mixta en Informática (Bachillerato) para demo
-- Objetivo: permitir que la pestaña de Evaluación Virtual muestre asignaciones
-- de Informática del programa de Bachillerato, con fines de demostración.
--
-- Impacto: el motor de nómina tratará las sesiones L-V de esas asignaciones
-- como "virtuales" (no requieren checada biométrica) y las sesiones de
-- sábado como presenciales.  Para deshacer: cambiar modalidad de regreso a 'presencial'.
--
-- Ejecutar como nomina_user o postgres.

UPDATE asignaciones
SET    modalidad = 'mixta'
WHERE  activa = true
  AND  materia_id IN (
       SELECT m.id
       FROM   materias m
       JOIN   programas p ON m.programa_id = p.id
       WHERE  p.razon_social = 'centro'          -- solo Bachillerato
         AND  (
              lower(m.nombre) LIKE '%inform%'    -- Informática, Informacion, etc.
           OR lower(m.nombre) LIKE '%computa%'   -- Computación, Cómputo
           OR lower(m.nombre) LIKE '%tic%'       -- TICs
         )
  )
  AND  modalidad = 'presencial';                 -- solo cambiar si aún es presencial

-- Verificar cambios:
-- SELECT a.id, d.nombre_completo, m.nombre AS materia, a.modalidad
-- FROM   asignaciones a
-- JOIN   docentes d  ON a.docente_id  = d.id
-- JOIN   materias m  ON a.materia_id  = m.id
-- JOIN   programas p ON m.programa_id = p.id
-- WHERE  p.razon_social = 'centro'
--   AND  (lower(m.nombre) LIKE '%inform%' OR lower(m.nombre) LIKE '%computa%' OR lower(m.nombre) LIKE '%tic%')
-- ORDER  BY d.nombre_completo;
