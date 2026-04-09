"""
Carga los 9 supervisores de campo clínico para quincena 3 (Mar 11-25, 2026).
Montos del Excel v1: 7 × $2,500 y 2 × $1,250.
Los marca como pago_completo=true (ya aprobados y pagados).
"""
import sys; sys.stdout.reconfigure(encoding='utf-8')
import psycopg2
from psycopg2.extras import RealDictCursor
from difflib import SequenceMatcher

DB_URL     = 'postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina'
QUINCENA_ID = 3

# Supervisores del Excel v1 con sus montos exactos
SUPERVISORES = [
    ('Martínez Alamilla Abigail',        2500),
    ('Ruíz Ramírez Jaqueline',           2500),
    ('de Ita León Rubén',                2500),
    ('Sánchez Casio Pedro Adair',        2500),
    ('Cruz Cruz Eva',                    2500),
    ('Maya Zúñiga Eunice Elena',         2500),
    ('Romero Ibarra Claudia',            2500),
    ('García Soto Fernando',             1250),
    ('Pavana Alonso Yessica Fernanda',   1250),
]

def sim(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def buscar_docente(nombre, docentes):
    mejor_id, mejor_score, mejor_nombre = None, 0.0, ''
    for d in docentes:
        s = sim(nombre, d['nombre_completo'])
        if s > mejor_score:
            mejor_score = s
            mejor_id = d['id']
            mejor_nombre = d['nombre_completo']
    return mejor_id, mejor_score, mejor_nombre

def main():
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    cur  = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT id, nombre_completo FROM docentes WHERE activo=true ORDER BY nombre_completo")
    docentes = cur.fetchall()

    # Verificar que la materia de campo clínico (programa_id=7) existe
    cur.execute("SELECT id FROM materias WHERE programa_id=7 LIMIT 1")
    mat = cur.fetchone()
    if not mat:
        print("ERROR: No existe ninguna materia con programa_id=7 (Campo Clínico)")
        return
    materia_id_cc = mat['id']
    print(f"Materia campo clínico id={materia_id_cc}")

    ok = 0
    for nombre_excel, monto in SUPERVISORES:
        doc_id, score, nombre_db = buscar_docente(nombre_excel, docentes)
        if score < 0.60:
            print(f"❌ Sin match: {nombre_excel} (mejor={nombre_db}, score={score:.2f})")
            continue

        # Verificar que tiene asignación activa de campo clínico (o crearla)
        ciclo = '2026-1'
        cur.execute("""
            SELECT a.id FROM asignaciones a
            JOIN materias m ON a.materia_id = m.id
            WHERE a.docente_id=%s AND m.programa_id=7 AND a.activa=true AND a.ciclo=%s
        """, (doc_id, ciclo))
        asig = cur.fetchone()
        if not asig:
            cur.execute("""
                INSERT INTO asignaciones (docente_id, materia_id, ciclo, activa, modalidad, horas_semana, grupo)
                VALUES (%s, %s, %s, true, 'presencial', 0, 'Campo Clínico')
                RETURNING id
            """, (doc_id, materia_id_cc, ciclo))
            asig_id = cur.fetchone()['id']
            print(f"  ➕ Asignación CC creada para {nombre_db}")
        else:
            asig_id = asig['id']

        # Upsert en campo_clinico_quincena
        cur.execute("""
            SELECT id FROM campo_clinico_quincena
            WHERE quincena_id=%s AND docente_id=%s
        """, (QUINCENA_ID, doc_id))
        cc = cur.fetchone()

        if cc:
            cur.execute("""
                UPDATE campo_clinico_quincena
                SET monto=%s, pago_completo=true, motivo_descuento=NULL
                WHERE id=%s
            """, (monto, cc['id']))
            accion = 'actualizado'
        else:
            cur.execute("""
                INSERT INTO campo_clinico_quincena
                    (quincena_id, docente_id, monto, pago_completo, motivo_descuento)
                VALUES (%s, %s, %s, true, NULL)
            """, (QUINCENA_ID, doc_id, monto))
            accion = 'insertado'

        print(f"  ✅ {accion:<12} {nombre_db:<40} ${monto:>6,}  (match={score:.2f})")
        ok += 1

    conn.commit()
    cur.close(); conn.close()
    print(f"\n{ok}/{len(SUPERVISORES)} supervisores cargados.")

if __name__ == '__main__':
    main()
