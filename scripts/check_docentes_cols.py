import psycopg2
conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina')
cur = conn.cursor()
cur.execute("""SELECT column_name FROM information_schema.columns
               WHERE table_name='docentes' ORDER BY ordinal_position""")
cols = [r[0] for r in cur.fetchall()]
print("Columnas docentes:", cols)
conn.close()
