import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = 'postgresql://nomina_user:IESEFnomina%402026$@localhost:5432/iesef_nomina'
conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
cur = conn.cursor()

# Parámetros
cur.execute("SELECT * FROM evaluacion_parametros LIMIT 5")
for r in cur.fetchall(): print("Params:", dict(r))

# Semanas maestrías Q3
cur.execute("""
    SELECT evs.semana_num, evs.ca_1, evs.ca_2, evs.ca_3, evs.ca_4,
           evs.ev_1, evs.ev_2, evs.ev_3, evs.ev_4,
           d.nombre_completo, m.nombre as materia, p.id as prog_id
    FROM evaluacion_virtual_semana evs
    JOIN asignaciones a ON evs.asignacion_id = a.id
    JOIN materias m ON a.materia_id = m.id
    JOIN programas p ON m.programa_id = p.id
    JOIN docentes d ON evs.docente_id = d.id
    WHERE evs.quincena_id = 3 AND p.id = 6
    ORDER BY d.nombre_completo, evs.semana_num
    LIMIT 15
""")
rows = cur.fetchall()
print(f"\nSemanas Maestrías Q3: {len(rows)}")
for r in rows:
    ca = sum([(r['ca_1'] or 0),(r['ca_2'] or 0),(r['ca_3'] or 0),(r['ca_4'] or 0)])
    ev = sum([(r['ev_1'] or 0),(r['ev_2'] or 0),(r['ev_3'] or 0),(r['ev_4'] or 0)])
    print(f"  {r['nombre_completo'][:25]:<25} sem={r['semana_num']} ca={ca:.2f} ev={ev:.2f} {r['materia'][:20]}")

# Resultados por programa
cur.execute("""
    SELECT p.nombre, p.id, COUNT(*) n, SUM(CASE WHEN evr.aprobada THEN 1 ELSE 0 END) aprobadas
    FROM evaluacion_virtual_resultado evr
    JOIN asignaciones a ON evr.asignacion_id = a.id
    JOIN materias m ON a.materia_id = m.id
    JOIN programas p ON m.programa_id = p.id
    WHERE evr.quincena_id = 3
    GROUP BY p.nombre, p.id ORDER BY p.id
""")
print("\nResultados por programa Q3:")
for r in cur.fetchall():
    print(f"  [{r['id']}] {r['nombre']:<30} total={r['n']}  aprobadas={r['aprobadas']}")

conn.close()
