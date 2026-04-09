"""Agrega columnas faltantes y UNIQUE constraint a campo_clinico_quincena."""
import psycopg2
# Necesita postgres superuser para ALTER TABLE
conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina')
cur = conn.cursor()

sqls = [
    # Agregar columnas que faltan (si no existen)
    "ALTER TABLE campo_clinico_quincena ADD COLUMN IF NOT EXISTS notas TEXT",
    "ALTER TABLE campo_clinico_quincena ADD COLUMN IF NOT EXISTS pagado BOOLEAN DEFAULT false",
    "ALTER TABLE campo_clinico_quincena ADD COLUMN IF NOT EXISTS modificado_por INTEGER",
    "ALTER TABLE campo_clinico_quincena ADD COLUMN IF NOT EXISTS modificado_en TIMESTAMP DEFAULT NOW()",
    # UNIQUE constraint para el ON CONFLICT del upsert
    """DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname='campo_clinico_quincena_quincena_id_docente_id_key'
         ) THEN
           ALTER TABLE campo_clinico_quincena
             ADD CONSTRAINT campo_clinico_quincena_quincena_id_docente_id_key
             UNIQUE (quincena_id, docente_id);
         END IF;
       END $$""",
    # Permiso al usuario de la app
    "GRANT ALL ON campo_clinico_quincena TO nomina_user",
]

for sql in sqls:
    try:
        cur.execute(sql)
        print(f"OK: {sql[:60]}...")
    except Exception as e:
        print(f"SKIP/ERR: {e}")
        conn.rollback()
        conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina')
        cur = conn.cursor()

conn.commit()
print("Listo.")
conn.close()
