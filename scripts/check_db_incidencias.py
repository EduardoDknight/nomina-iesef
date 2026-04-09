import psycopg2
conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina')
cur = conn.cursor()
cur.execute("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'incidencias'
    ORDER BY ordinal_position
""")
print("=== incidencias columns ===")
for r in cur.fetchall():
    print(r)

# Also check what incidencias exist
cur.execute("SELECT COUNT(*), tipo FROM incidencias GROUP BY tipo")
print("\n=== incidencias count by tipo ===")
for r in cur.fetchall():
    print(r)

# Check if grupo/horario columns exist
cur.execute("SELECT COUNT(*) FROM incidencias")
print(f"\nTotal incidencias: {cur.fetchone()[0]}")
conn.close()
