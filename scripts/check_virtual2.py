import psycopg2
from psycopg2.extras import RealDictCursor
conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina')
cur = conn.cursor(cursor_factory=RealDictCursor)

# Ver EV contribution real por docente (con y sin EV)
cur.execute('''
    SELECT d.nombre_completo, mat.nombre AS materia,
           evr.ca_contribution, evr.ev_contribution, evr.pct_cumplimiento,
           evr.horas_quincena, evr.tarifa,
           evr.monto_base, evr.monto_a_pagar, evr.monto_descontado
    FROM evaluacion_virtual_resultado evr
    JOIN asignaciones a ON evr.asignacion_id = a.id
    JOIN docentes d ON evr.docente_id = d.id
    JOIN materias mat ON a.materia_id = mat.id
    WHERE evr.quincena_id = 3
    ORDER BY evr.ev_contribution DESC, d.nombre_completo
    LIMIT 30
''')
print(f'{"DOCENTE":<33} {"MATERIA":<28} {"EV%":>5} {"CA%":>5} {"TOTAL%":>7} {"BASE":>9} {"DESC":>9}')
print('-'*100)
for r in cur.fetchall():
    ev = float(r["ev_contribution"])*100
    ca = float(r["ca_contribution"])*100
    pct = float(r["pct_cumplimiento"])*100
    base = float(r["monto_base"])
    desc = float(r["monto_descontado"])
    print(f'{r["nombre_completo"][:32]:<33} {r["materia"][:27]:<28} {ev:>4.0f}% {ca:>4.0f}% {pct:>6.0f}% ${base:>8,.0f} ${desc:>8,.0f}')

# Estadísticas EV
cur.execute('''
    SELECT
        COUNT(*) FILTER (WHERE ev_contribution = 0.60) AS ev_perfecto,
        COUNT(*) FILTER (WHERE ev_contribution > 0 AND ev_contribution < 0.60) AS ev_parcial,
        COUNT(*) FILTER (WHERE ev_contribution = 0) AS ev_cero,
        SUM(monto_base) AS total_base,
        SUM(monto_descontado) AS total_desc
    FROM evaluacion_virtual_resultado WHERE quincena_id=3
''')
r = cur.fetchone()
print(f'\nEV perfecto (60%): {r["ev_perfecto"]}  |  EV parcial: {r["ev_parcial"]}  |  EV cero: {r["ev_cero"]}')
print(f'Monto base total: ${float(r["total_base"]):,.2f}  |  Descuento por falta CA: ${float(r["total_desc"]):,.2f}')
print(f'\nNOTA: Con CA=0, max pct = 0.60 que NO supera el umbral >60%.')
print('Para aprobar se necesita CA > 0 OR EV tan alto que compense.')
conn.close()
