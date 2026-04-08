"""
run_migration_008.py — Portal docente/trabajador
Ejecutar como: python run_migration_008.py
Requiere contraseña del usuario postgres (superusuario).
"""
import psycopg2
import sys

pwd = input("Password de postgres: ")
try:
    conn = psycopg2.connect(
        host="localhost", port=5432, dbname="iesef_nomina",
        user="postgres", password=pwd
    )
    conn.autocommit = True
    cur = conn.cursor()

    print("Agregando valores al enum rol_usuario...")
    cur.execute("ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'superadmin'")
    cur.execute("ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'trabajador'")
    print("  -> OK: superadmin, trabajador")

    print("Agregando columnas a la tabla usuarios...")
    cur.execute("""
        ALTER TABLE usuarios
            ADD COLUMN IF NOT EXISTS trabajador_id       INTEGER REFERENCES trabajadores(id),
            ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false
    """)
    print("  -> OK: trabajador_id, debe_cambiar_password")

    print("Creando índices...")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_usuarios_trabajador ON usuarios(trabajador_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_usuarios_docente    ON usuarios(docente_id)")
    print("  -> OK: índices creados")

    print("Otorgando permisos a nomina_user...")
    cur.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON usuarios TO nomina_user")
    print("  -> OK: permisos otorgados")

    print("\nMigracion 008 completada exitosamente.")
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
