-- Migración 011: Días no laborables para docentes virtuales
-- Los días no laborables (vacaciones + suspensiones oficiales) reducen
-- proporcionalmente las horas virtuales a pagar en la quincena afectada.
-- NOTA: Solo aplica a docentes virtuales/mixtos. Administrativos no se ven afectados.

CREATE TABLE IF NOT EXISTS dias_no_laborables (
    id          SERIAL PRIMARY KEY,
    fecha       DATE        NOT NULL UNIQUE,
    tipo        VARCHAR(30) NOT NULL CHECK (tipo IN ('vacaciones', 'suspension_oficial')),
    descripcion TEXT,
    ciclo       VARCHAR(20) DEFAULT '2026',
    activo      BOOLEAN     DEFAULT true,
    creado_en   TIMESTAMP   DEFAULT NOW(),
    creado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dias_no_lab_fecha ON dias_no_laborables(fecha);
CREATE INDEX IF NOT EXISTS idx_dias_no_lab_ciclo ON dias_no_laborables(ciclo);

-- Pre-poblar calendario institucional 2026 (extraído del PDF oficial IESEF)
INSERT INTO dias_no_laborables (fecha, tipo, descripcion, ciclo) VALUES
-- ── Suspensiones oficiales ─────────────────────────────────────────────────────
('2026-02-02', 'suspension_oficial', 'Día de la Constitución',               '2026'),
('2026-03-16', 'suspension_oficial', 'Natalicio de Benito Juárez',           '2026'),
-- ── Semana Santa (vacaciones) ─────────────────────────────────────────────────
('2026-03-30', 'vacaciones',         'Semana Santa',                         '2026'),
('2026-03-31', 'vacaciones',         'Semana Santa',                         '2026'),
('2026-04-01', 'vacaciones',         'Semana Santa',                         '2026'),
('2026-04-02', 'vacaciones',         'Semana Santa',                         '2026'),
('2026-04-03', 'vacaciones',         'Semana Santa',                         '2026'),
-- ── Suspensiones oficiales (continuación) ─────────────────────────────────────
('2026-05-01', 'suspension_oficial', 'Día del Trabajo',                      '2026'),
('2026-05-15', 'suspension_oficial', 'Día del Maestro',                      '2026'),
('2026-09-16', 'suspension_oficial', 'Día de la Independencia',              '2026'),
('2026-11-02', 'suspension_oficial', 'Día de Muertos',                       '2026'),
('2026-11-17', 'suspension_oficial', 'Día de la Revolución',                 '2026')
ON CONFLICT (fecha) DO NOTHING;
