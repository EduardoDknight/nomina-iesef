-- Migración 005 — Overrides manuales de pago por clase
-- Permite a cap_humano / coord_docente / dir_cap_humano forzar pagar/no pagar
-- una clase específica, independientemente del cálculo automático.

CREATE TABLE IF NOT EXISTS overrides_pago_clase (
    id              SERIAL PRIMARY KEY,
    quincena_id     INTEGER NOT NULL REFERENCES quincenas(id) ON DELETE CASCADE,
    docente_id      INTEGER NOT NULL REFERENCES docentes(id)  ON DELETE CASCADE,
    fecha           DATE    NOT NULL,
    hora_ini        TIME    NOT NULL,
    hora_fin        TIME    NOT NULL,
    decision        VARCHAR(10) NOT NULL CHECK (decision IN ('pagar', 'no_pagar')),
    motivo          TEXT,
    registrado_por  INTEGER REFERENCES usuarios(id),
    registrado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (quincena_id, docente_id, fecha, hora_ini, hora_fin)
);

CREATE INDEX IF NOT EXISTS idx_overrides_quincena_docente
    ON overrides_pago_clase (quincena_id, docente_id);

COMMENT ON TABLE overrides_pago_clase IS
    'Override manual de pago por clase presencial. Si existe un registro aquí, '
    'prevalece sobre el estado automático calculado por calculo_nomina.py.';
