import psycopg2
from psycopg2.extras import RealDictCursor
conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina')
cur = conn.cursor(cursor_factory=RealDictCursor)

cur.execute('''
    SELECT d.nombre_completo, mat.nombre AS materia,
           evr.pct_cumplimiento, evr.aprobada,
           evr.horas_quincena, evr.monto_a_pagar, evr.monto_descontado
    FROM evaluacion_virtual_resultado evr
    JOIN asignaciones a ON evr.asignacion_id = a.id
    JOIN docentes d ON evr.docente_id = d.id
    JOIN materias mat ON a.materia_id = mat.id
    WHERE evr.quincena_id = 3
    ORDER BY evr.aprobada, d.nombre_completo
    LIMIT 40
''')
print(f'{"DOCENTE":<35} {"MATERIA":<30} {"PCT":>6} {"APROBADA":>9} {"A PAGAR":>10}')
print('-'*95)
for r in cur.fetchall():
    print(f'{r["nombre_completo"][:34]:<35} {r["materia"][:29]:<30} {float(r["pct_cumplimiento"])*100:>5.1f}% {str(r["aprobada"]):>9} ${float(r["monto_a_pagar"]):>9,.2f}')

cur.execute('''
    SELECT
        COUNT(*) FILTER (WHERE aprobada) AS aprobadas,
        COUNT(*) FILTER (WHERE NOT aprobada) AS no_aprobadas,
        SUM(monto_a_pagar) AS total_pagar,
        SUM(monto_descontado) AS total_descuento
    FROM evaluacion_virtual_resultado WHERE quincena_id=3
''')
res = cur.fetchone()
print(f'\nResumen: {res["aprobadas"]} aprobadas / {res["no_aprobadas"]} no aprobadas')
print(f'Total a pagar: ${float(res["total_pagar"]):,.2f}  |  Descuentos: ${float(res["total_descuento"]):,.2f}')
conn.close()
