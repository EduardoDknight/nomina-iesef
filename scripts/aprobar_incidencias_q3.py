import psycopg2
conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina')
cur = conn.cursor()

# Obtener el id de algún usuario admin/cap_humano para registrar como aprobador
cur.execute("SELECT id FROM usuarios WHERE rol IN ('director_cap_humano','cap_humano') LIMIT 1")
u = cur.fetchone()
aprobador_id = u[0] if u else None

cur.execute("""
    UPDATE incidencias
    SET estado = 'aprobada',
        aprobado_cap_por = %s,
        aprobado_cap_en  = NOW()
    WHERE quincena_id = 3
    RETURNING id, tipo, estado
""", (aprobador_id,))
rows = cur.fetchall()
conn.commit()
print(f"Aprobadas: {len(rows)} incidencias")
for r in rows:
    print(f"  id={r[0]} tipo={r[1]} → {r[2]}")
conn.close()
