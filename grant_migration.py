import psycopg2, sys
pwd = input("Password de postgres: ")
try:
    conn = psycopg2.connect(
        host="localhost", port=5432, dbname="iesef_nomina",
        user="postgres", password=pwd
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON overrides_pago_clase TO nomina_user")
    cur.execute("GRANT USAGE, SELECT ON SEQUENCE overrides_pago_clase_id_seq TO nomina_user")
    print("OK - permisos otorgados")
    cur.close()
    conn.close()
except Exception as e:
    print("Error:", e)
    sys.exit(1)
