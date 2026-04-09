import psycopg2, sys
pwd = input("Password de postgres: ")
try:
    conn = psycopg2.connect(
        host="localhost", port=5432, dbname="iesef_nomina",
        user="postgres", password=pwd
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS overrides_pago_clase (
            id             SERIAL PRIMARY KEY,
            quincena_id    INTEGER NOT NULL REFERENCES quincenas(id) ON DELETE CASCADE,
            docente_id     INTEGER NOT NULL REFERENCES docentes(id)  ON DELETE CASCADE,
            fecha          DATE    NOT NULL,
            hora_ini       TIME    NOT NULL,
            hora_fin       TIME    NOT NULL,
            decision       VARCHAR(10) NOT NULL CHECK (decision IN ('pagar', 'no_pagar')),
            motivo         TEXT,
            registrado_por INTEGER REFERENCES usuarios(id),
            registrado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (quincena_id, docente_id, fecha, hora_ini, hora_fin)
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_overrides_quincena_docente
            ON overrides_pago_clase (quincena_id, docente_id)
    """)
    print("OK - tabla creada")
    cur.close()
    conn.close()
except Exception as e:
    print("Error:", e)
    sys.exit(1)
