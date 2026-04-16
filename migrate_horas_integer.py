"""
Migración: convierte todos los campos de horas de clases a INTEGER.
Regla de negocio: las horas de clase son siempre enteros (1, 2, 3...).
Valores fraccionales fueron introducidos por un script de importación con error.
"""
import psycopg2
import psycopg2.extras
import sys
import os

# Importar settings del proyecto
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import settings

conn = psycopg2.connect(settings.database_url_nomina)
cur = conn.cursor()

print("=== Migracion: horas de clase -> INTEGER ===\n")

# ── Paso 1a: Redondear valores fraccionales ────────────────────────────────────

print("Paso 1a: Redondear valores fraccionales...")

cur.execute("""
  UPDATE asignaciones
  SET horas_semana = GREATEST(1, ROUND(horas_semana))
  WHERE horas_semana != FLOOR(horas_semana)
""")
print(f"  asignaciones.horas_semana actualizadas: {cur.rowcount}")

cur.execute("""
  UPDATE horario_clases
  SET horas_bloque = GREATEST(1, ROUND(horas_bloque))
  WHERE horas_bloque != FLOOR(horas_bloque)
""")
print(f"  horario_clases.horas_bloque actualizadas: {cur.rowcount}")

cur.execute("""
  UPDATE incidencias
  SET horas_afectadas = ROUND(horas_afectadas),
      horas_suplidas  = ROUND(horas_suplidas)
  WHERE horas_afectadas != FLOOR(COALESCE(horas_afectadas,0))
     OR horas_suplidas  != FLOOR(COALESCE(horas_suplidas,0))
""")
print(f"  incidencias actualizadas: {cur.rowcount}")

cur.execute("""
  UPDATE evaluacion_virtual_resultado
  SET horas_quincena       = GREATEST(1, ROUND(horas_quincena)),
      horas_reales_a_pagar = ROUND(horas_reales_a_pagar)
  WHERE horas_quincena != FLOOR(horas_quincena)
     OR horas_reales_a_pagar != FLOOR(COALESCE(horas_reales_a_pagar,0))
""")
print(f"  evaluacion_virtual_resultado actualizadas: {cur.rowcount}")

cur.execute("""
  UPDATE nomina_quincena
  SET horas_programadas = ROUND(horas_programadas),
      horas_presenciales = ROUND(horas_presenciales),
      horas_virtuales   = ROUND(horas_virtuales),
      horas_suplencia   = ROUND(horas_suplencia),
      horas_reales      = ROUND(horas_reales)
  WHERE horas_programadas != FLOOR(COALESCE(horas_programadas,0))
     OR horas_presenciales != FLOOR(COALESCE(horas_presenciales,0))
     OR horas_virtuales    != FLOOR(COALESCE(horas_virtuales,0))
     OR horas_reales       != FLOOR(COALESCE(horas_reales,0))
""")
print(f"  nomina_quincena actualizadas: {cur.rowcount}")

cur.execute("""
  UPDATE nomina_detalle_programa
  SET horas_presenciales = ROUND(horas_presenciales),
      horas_virtuales   = ROUND(horas_virtuales),
      horas_suplencia   = ROUND(horas_suplencia),
      horas_reales      = ROUND(horas_reales)
  WHERE horas_presenciales != FLOOR(COALESCE(horas_presenciales,0))
     OR horas_virtuales    != FLOOR(COALESCE(horas_virtuales,0))
     OR horas_reales       != FLOOR(COALESCE(horas_reales,0))
""")
print(f"  nomina_detalle_programa actualizadas: {cur.rowcount}")

conn.commit()
print("\nDatos redondeados y comiteados.\n")

# ── Paso 1b: ALTER TABLE → INTEGER ────────────────────────────────────────────

print("Paso 1b: Alterando columnas a INTEGER...")

alterations = [
    "ALTER TABLE asignaciones ALTER COLUMN horas_semana TYPE INTEGER USING ROUND(horas_semana)::INTEGER",
    "ALTER TABLE horario_clases ALTER COLUMN horas_bloque TYPE INTEGER USING ROUND(horas_bloque)::INTEGER",
    "ALTER TABLE incidencias ALTER COLUMN horas_afectadas TYPE INTEGER USING ROUND(COALESCE(horas_afectadas,0))::INTEGER",
    "ALTER TABLE incidencias ALTER COLUMN horas_suplidas TYPE INTEGER USING ROUND(COALESCE(horas_suplidas,0))::INTEGER",
    "ALTER TABLE evaluacion_virtual_resultado ALTER COLUMN horas_quincena TYPE INTEGER USING ROUND(horas_quincena)::INTEGER",
    "ALTER TABLE evaluacion_virtual_resultado ALTER COLUMN horas_reales_a_pagar TYPE INTEGER USING ROUND(COALESCE(horas_reales_a_pagar,0))::INTEGER",
    "ALTER TABLE nomina_quincena ALTER COLUMN horas_programadas TYPE INTEGER USING ROUND(COALESCE(horas_programadas,0))::INTEGER",
    "ALTER TABLE nomina_quincena ALTER COLUMN horas_presenciales TYPE INTEGER USING ROUND(COALESCE(horas_presenciales,0))::INTEGER",
    "ALTER TABLE nomina_quincena ALTER COLUMN horas_virtuales TYPE INTEGER USING ROUND(COALESCE(horas_virtuales,0))::INTEGER",
    "ALTER TABLE nomina_quincena ALTER COLUMN horas_suplencia TYPE INTEGER USING ROUND(COALESCE(horas_suplencia,0))::INTEGER",
    "ALTER TABLE nomina_quincena ALTER COLUMN horas_reales TYPE INTEGER USING ROUND(COALESCE(horas_reales,0))::INTEGER",
    "ALTER TABLE nomina_quincena ALTER COLUMN horas_descuento TYPE INTEGER USING ROUND(COALESCE(horas_descuento,0))::INTEGER",
    "ALTER TABLE nomina_detalle_programa ALTER COLUMN horas_presenciales TYPE INTEGER USING ROUND(COALESCE(horas_presenciales,0))::INTEGER",
    "ALTER TABLE nomina_detalle_programa ALTER COLUMN horas_virtuales TYPE INTEGER USING ROUND(COALESCE(horas_virtuales,0))::INTEGER",
    "ALTER TABLE nomina_detalle_programa ALTER COLUMN horas_suplencia TYPE INTEGER USING ROUND(COALESCE(horas_suplencia,0))::INTEGER",
    "ALTER TABLE nomina_detalle_programa ALTER COLUMN horas_reales TYPE INTEGER USING ROUND(COALESCE(horas_reales,0))::INTEGER",
]

for sql in alterations:
    try:
        cur.execute(sql)
        conn.commit()
        parts = sql.split()
        table = parts[2]
        col   = parts[5]
        print(f"  OK  {table}.{col} → INTEGER")
    except Exception as e:
        conn.rollback()
        print(f"  ERR {sql[:60]}... -> {e}")

cur.close()
conn.close()
print("\nMigración completada.")
