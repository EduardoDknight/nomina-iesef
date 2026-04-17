-- Migration 014: Soporte de registro de comida en horarios de trabajadores
-- Agrega campo tiene_comida a horarios_trabajador para indicar si el trabajador
-- debe checar entrada y salida de comida (media hora al punto medio de su jornada).

ALTER TABLE horarios_trabajador
    ADD COLUMN IF NOT EXISTS tiene_comida BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN horarios_trabajador.tiene_comida IS
    'Si TRUE, el trabajador debe checar salida y regreso de comida. '
    'La ventana de comida se calcula automáticamente como el punto medio de '
    'hora_entrada/hora_salida ± 45 min de tolerancia. '
    'ZKTeco tipo_punch=2 (break-out) y tipo_punch=3 (break-in) se usan si '
    'el dispositivo los emite; si no, se usan heurísticas por ventana de tiempo.';
