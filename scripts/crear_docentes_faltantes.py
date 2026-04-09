"""
Crea los docentes que aparecen en los Excel de horarios pero no están en DB.
Usa el CURP como identificador único.
"""
import sys; sys.stdout.reconfigure(encoding='utf-8')
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = 'postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina'

# Docentes a crear: (nombre_completo, curp, adscripcion, regimen_fiscal)
# Nombres normalizados: Apellidos Nombre(s), sin títulos académicos
NUEVOS = [
    # 3 docentes nuevos identificados en quincena anterior
    ('Ríos Guzmán Julio César',        'RIGJ971107HHGSZL03', 'instituto', 'honorarios'),
    ('Lara Ramírez Aurelia Eugenia',   'LARA901119MHGRMR01', 'instituto', 'honorarios'),
    ('Lara Gómez Ariadna Bárbara',     'LAGA961228MHGRMR03', 'instituto', 'honorarios'),
    # Docentes de Enfermería no registrados
    ('Navarrete García Jorge Arturo',  'NAGJ970226HDFVRR09', 'instituto', 'honorarios'),
    ('Flores Cerón Karla Iveth',       'FOCK940517MHGLRR05', 'instituto', 'honorarios'),
    ('Hurtado Arellanos Irma Andrea',  'HUAI001110MSPRRRA3', 'instituto', 'honorarios'),
    ('Llaca Pérez Daniela',            'LAPD940326MHGLRN09', 'instituto', 'honorarios'),
    ('Espino Domínguez Karen',         'EIDK990618MHGSMR05', 'instituto', 'honorarios'),
    ('Ramírez Cervantes Joaquín',      'RACJ740521HHGMRQ01', 'instituto', 'honorarios'),
    ('Mendoza Islas Hilda Graciela',   'MEIH831118MHGNSL02', 'instituto', 'honorarios'),
]

def main():
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    cur  = conn.cursor(cursor_factory=RealDictCursor)

    # CURPs ya en DB
    cur.execute("SELECT curp FROM docentes WHERE curp IS NOT NULL AND LENGTH(TRIM(curp))=18")
    curps_existentes = {r['curp'].strip().upper() for r in cur.fetchall()}

    creados = 0
    for nombre, curp, adscripcion, regimen in NUEVOS:
        curp_norm = curp.strip().upper()
        if curp_norm in curps_existentes:
            print(f"  ⏭ Ya existe: {nombre}  CURP={curp_norm}")
            continue

        cur.execute("""
            INSERT INTO docentes (nombre_completo, curp, adscripcion, regimen_fiscal, activo)
            VALUES (%s, %s, %s, %s, true)
            RETURNING id
        """, (nombre, curp_norm, adscripcion, regimen))
        new_id = cur.fetchone()['id']
        print(f"  ✅ Creado id={new_id}: {nombre}  CURP={curp_norm}")
        curps_existentes.add(curp_norm)
        creados += 1

    conn.commit()
    cur.close(); conn.close()
    print(f"\n{creados} docentes creados.")

if __name__ == '__main__':
    main()
