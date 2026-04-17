-- Migración 012 — Ajustes manuales de Finanzas en nómina_quincena
-- Agrega dos campos editables solo por Finanzas y Superadmin:
--   descuento_manual: descuento a aplicar (ej. cobro por error previo, sanción)
--   ajuste_extra:     pago adicional (ej. bono, corrección por pago insuficiente)
-- Ambos afectan total_final: total_final = total_a_pagar + ajustes + ajuste_extra - descuento_manual

ALTER TABLE nomina_quincena
  ADD COLUMN IF NOT EXISTS descuento_manual NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ajuste_extra     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nota_ajuste_finanzas TEXT;

-- Recalcular total_final en registros existentes (no cambia porque ambos son 0)
-- total_final ya está correcto. Solo para dejar constancia de la fórmula:
-- total_final = total_a_pagar + ajustes + ajuste_extra - descuento_manual
