import psycopg2
conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina')
cur = conn.cursor()
cur.execute("""SELECT column_name, data_type, is_nullable
               FROM information_schema.columns
               WHERE table_name = 'campo_clinico_quincena'
               ORDER BY ordinal_position""")
print("=== campo_clinico_quincena ===")
for r in cur.fetchall():
    print(r)
conn.close()
