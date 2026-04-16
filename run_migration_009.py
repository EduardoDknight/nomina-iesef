"""
Migración 009: Convierte campos de horas de clase de NUMERIC a INTEGER.
Requiere usuario postgres (propietario de las tablas).

Nota: El redondeo de datos ya fue ejecutado previamente con nomina_user.
Este script solo altera el tipo de columna.
"""
import psycopg2, sys

pwd = input("Password de postgres: ")
try:
    conn = psycopg2.connect(
        host="localhost", port=5432, dbname="iesef_nomina",
        user="postgres", password=pwd
    )
    conn.autocommit = True
    cur = conn.cursor()

    print("Alterando columnas a INTEGER...")

    alterations = [
        ("asignaciones",                "horas_semana",       "ALTER TABLE asignaciones ALTER COLUMN horas_semana TYPE INTEGER USING ROUND(horas_semana)::INTEGER"),
        ("horario_clases",              "horas_bloque",       "ALTER TABLE horario_clases ALTER COLUMN horas_bloque TYPE INTEGER USING ROUND(horas_bloque)::INTEGER"),
        ("incidencias",                 "horas_afectadas",    "ALTER TABLE incidencias ALTER COLUMN horas_afectadas TYPE INTEGER USING ROUND(COALESCE(horas_afectadas,0))::INTEGER"),
        ("incidencias",                 "horas_suplidas",     "ALTER TABLE incidencias ALTER COLUMN horas_suplidas TYPE INTEGER USING ROUND(COALESCE(horas_suplidas,0))::INTEGER"),
        ("evaluacion_virtual_resultado","horas_quincena",     "ALTER TABLE evaluacion_virtual_resultado ALTER COLUMN horas_quincena TYPE INTEGER USING ROUND(horas_quincena)::INTEGER"),
        ("evaluacion_virtual_resultado","horas_reales_a_pagar","ALTER TABLE evaluacion_virtual_resultado ALTER COLUMN horas_reales_a_pagar TYPE INTEGER USING ROUND(COALESCE(horas_reales_a_pagar,0))::INTEGER"),
        ("nomina_quincena",             "horas_programadas",  "ALTER TABLE nomina_quincena ALTER COLUMN horas_programadas TYPE INTEGER USING ROUND(COALESCE(horas_programadas,0))::INTEGER"),
        ("nomina_quincena",             "horas_presenciales", "ALTER TABLE nomina_quincena ALTER COLUMN horas_presenciales TYPE INTEGER USING ROUND(COALESCE(horas_presenciales,0))::INTEGER"),
        ("nomina_quincena",             "horas_virtuales",    "ALTER TABLE nomina_quincena ALTER COLUMN horas_virtuales TYPE INTEGER USING ROUND(COALESCE(horas_virtuales,0))::INTEGER"),
        ("nomina_quincena",             "horas_suplencia",    "ALTER TABLE nomina_quincena ALTER COLUMN horas_suplencia TYPE INTEGER USING ROUND(COALESCE(horas_suplencia,0))::INTEGER"),
        ("nomina_quincena",             "horas_reales",       "ALTER TABLE nomina_quincena ALTER COLUMN horas_reales TYPE INTEGER USING ROUND(COALESCE(horas_reales,0))::INTEGER"),
        ("nomina_quincena",             "horas_descuento",    "ALTER TABLE nomina_quincena ALTER COLUMN horas_descuento TYPE INTEGER USING ROUND(COALESCE(horas_descuento,0))::INTEGER"),
        ("nomina_detalle_programa",     "horas_presenciales", "ALTER TABLE nomina_detalle_programa ALTER COLUMN horas_presenciales TYPE INTEGER USING ROUND(COALESCE(horas_presenciales,0))::INTEGER"),
        ("nomina_detalle_programa",     "horas_virtuales",    "ALTER TABLE nomina_detalle_programa ALTER COLUMN horas_virtuales TYPE INTEGER USING ROUND(COALESCE(horas_virtuales,0))::INTEGER"),
        ("nomina_detalle_programa",     "horas_suplencia",    "ALTER TABLE nomina_detalle_programa ALTER COLUMN horas_suplencia TYPE INTEGER USING ROUND(COALESCE(horas_suplencia,0))::INTEGER"),
        ("nomina_detalle_programa",     "horas_reales",       "ALTER TABLE nomina_detalle_programa ALTER COLUMN horas_reales TYPE INTEGER USING ROUND(COALESCE(horas_reales,0))::INTEGER"),
    ]

    errors = 0
    for tabla, col, sql in alterations:
        try:
            cur.execute(sql)
            print(f"  OK  {tabla}.{col}")
        except Exception as e:
            print(f"  ERR {tabla}.{col}: {e}")
            errors += 1

    cur.close()
    conn.close()

    if errors:
        print(f"\n{errors} errores. Revisar manualmente.")
        sys.exit(1)
    else:
        print("\nMigracion 009 completada correctamente.")

except Exception as e:
    print("Error de conexion:", e)
    sys.exit(1)
