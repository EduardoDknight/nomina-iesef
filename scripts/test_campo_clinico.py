import sys; sys.stdout.reconfigure(encoding='utf-8')
import psycopg2
from psycopg2.extras import RealDictCursor
conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina')
cur = conn.cursor(cursor_factory=RealDictCursor)

cur.execute("SELECT ciclo FROM quincenas WHERE id = 3")
q = cur.fetchone()
print('ciclo:', q['ciclo'])

cur.execute("""
    SELECT
        d.id AS docente_id, d.nombre_completo, d.numero_docente,
        p.nombre AS programa_nombre,
        d.monto_fijo_quincenal AS monto_default,
        COALESCE(cc.monto, d.monto_fijo_quincenal) AS monto,
        cc.motivo_descuento AS notas,
        COALESCE(cc.pago_completo, false) AS pagado,
        cc.id AS registro_id
    FROM docentes d
    JOIN asignaciones a ON a.docente_id = d.id AND a.ciclo = %s AND a.activa = true
    JOIN materias mat ON a.materia_id = mat.id AND mat.programa_id = 7
    JOIN programas p ON p.id = mat.programa_id
    LEFT JOIN campo_clinico_quincena cc ON cc.docente_id = d.id AND cc.quincena_id = 3
    WHERE d.activo = true
    ORDER BY d.nombre_completo
""", (q['ciclo'],))

rows = cur.fetchall()
print(f"\n{len(rows)} supervisores de campo clinico:")
for r in rows:
    print(f"  {r['nombre_completo']:<35} ${float(r['monto'] or 0):>8,.0f}  pagado={r['pagado']}")
conn.close()
