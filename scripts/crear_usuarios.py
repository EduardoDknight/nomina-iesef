"""
Ejecutar en el servidor:
  source /opt/iesef_api/bin/activate
  cd /home/wwiese/api.iesef.edu.mx
  python3 scripts/crear_usuarios.py
"""
import bcrypt
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = "postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina"

USUARIOS = [
    # (nombre, email, rol)
    ("Capital Humano",            "capital.humano@iesef.edu.mx",          "cap_humano"),
    ("Direccion Capital Humano",  "direccion.capitalhumano@iesef.edu.mx", "director_cap_humano"),
    ("Direccion Academica",       "direccion.academica@iesef.edu.mx",     "reportes"),
    ("Administracion Finanzas",   "admon@iesef.edu.mx",                   "finanzas"),
    ("Educacion Virtual",         "evirtual@iesef.edu.mx",                "educacion_virtual"),
    ("Coordinacion Docente",      "docentes@iesef.edu.mx",                "coord_docente"),
    ("Coord. Preparatoria",       "prepafreinet@iesef.edu.mx",            "coord_academica"),
    ("Coord. Nutricion",          "coord.nutricion@iesef.edu.mx",         "coord_academica"),
    ("Coord. Enfermeria",         "coord.enfermeria@iesef.edu.mx",        "coord_academica"),
    ("Coord. LENA",               "coordinacion.LENA@iesef.edu.mx",       "coord_academica"),
    ("Coord. Especialidades",     "coord.especialidades@iesef.edu.mx",    "coord_academica"),
]

PASSWORD_INICIAL = "IESEF2026"

def main():
    from urllib.parse import urlparse, unquote
    url = urlparse(DB_URL.replace("%40", "@").replace("%24", "$").replace("postgresql://", "http://"))
    conn = psycopg2.connect(
        host="127.0.0.1", port=5432,
        dbname="iesef_nomina",
        user="nomina_user",
        password="IESEFnomina@2026$",
        cursor_factory=RealDictCursor
    )
    cur = conn.cursor()

    pwd_hash = bcrypt.hashpw(PASSWORD_INICIAL.encode(), bcrypt.gensalt(rounds=10)).decode()
    insertados = 0
    omitidos = 0

    for nombre, email, rol in USUARIOS:
        try:
            cur.execute("""
                INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
                VALUES (%s, %s, %s, %s, true)
                ON CONFLICT (email) DO UPDATE SET
                    nombre = EXCLUDED.nombre,
                    rol    = EXCLUDED.rol,
                    activo = true
            """, (nombre, email, pwd_hash, rol))
            insertados += 1
            print(f"  OK  {email} ({rol})")
        except Exception as e:
            omitidos += 1
            print(f"  ERR {email}: {e}")

    conn.commit()
    cur.close()
    conn.close()
    print(f"\n{insertados} usuarios creados/actualizados. Password inicial: {PASSWORD_INICIAL}")

if __name__ == "__main__":
    main()
