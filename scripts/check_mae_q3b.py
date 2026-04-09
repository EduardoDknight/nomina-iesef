import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = 'postgresql://nomina_user:IESEFnomina%402026$@localhost:5432/iesef_nomina'
conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
cur = conn.cursor()

# Maestrías aprobadas con montos
cur.execute("""
    SELECT d.nombre_completo, evr.horas_reales_a_pagar, evr.monto_a_pagar,
           evr.aprobada, evr.pct_cumplimiento, m.nombre as materia
    FROM evaluacion_virtual_resultado evr
    JOIN asignaciones a ON evr.asignacion_id = a.id
    JOIN materias m ON a.materia_id = m.id
    JOIN docentes d ON evr.docente_id = d.id
    WHERE evr.quincena_id = 3 AND m.programa_id = 6
    ORDER BY d.nombre_completo
""")
rows = cur.fetchall()
print(f"Maestrías Q3 virtual_resultado ({len(rows)} registros):")
total_monto = 0
for r in rows:
    print(f"  {r['nombre_completo'][:30]:<30} horas={r['horas_reales_a_pagar']}  monto=${r['monto_a_pagar']}  aprobada={r['aprobada']}  pct={r['pct_cumplimiento']}")
    total_monto += float(r['monto_a_pagar'] or 0)
print(f"\nTotal Maestrías aprobado: ${total_monto:,.2f}")

# Para ver si el comparar_nomina los está encontrando: buscar por nombre en la comparación
# Verificar Campa López en evaluacion
cur.execute("""
    SELECT d.id, d.nombre_completo, d.chec_id
    FROM docentes d WHERE d.nombre_completo ILIKE '%campa%' AND d.activo = true
""")
for r in cur.fetchall():
    print(f"\nDocente: {r['nombre_completo']} id={r['id']} chec_id={r['chec_id']}")

conn.close()
