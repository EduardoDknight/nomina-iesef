"""
Diagnóstico: muestra asignaciones activas de Nutrición (prog_id=3)
para detectar docentes con bloques duplicados entre archivos.
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = 'postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina'
CICLO  = '2026-1'

conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
cur  = conn.cursor()

# Todos los bloques activos de Nutrición agrupados por docente
cur.execute("""
    SELECT d.nombre_completo, a.grupo, hc.dia_semana, hc.hora_inicio, hc.hora_fin,
           hc.horas_bloque, a.id AS asig_id
    FROM horario_clases hc
    JOIN asignaciones a   ON hc.asignacion_id = a.id AND a.activa = true AND a.ciclo = %s
    JOIN materias m       ON a.materia_id = m.id AND m.programa_id = 3
    JOIN docentes d       ON a.docente_id = d.id
    WHERE hc.activo = true
    ORDER BY d.nombre_completo, hc.dia_semana, hc.hora_inicio
""", (CICLO,))
rows = cur.fetchall()

# Agrupar por docente
from collections import defaultdict
por_docente = defaultdict(list)
for r in rows:
    por_docente[r['nombre_completo']].append(r)

print(f"{'='*90}")
print(f"NUTRICIÓN — bloques activos ({len(rows)} total, {len(por_docente)} docentes)")
print(f"{'='*90}")

for nombre, bloques in sorted(por_docente.items()):
    grupos = set(b['grupo'] for b in bloques)
    # Detectar si tiene grupos de ambos archivos
    tiene_ealn  = any('LN' in g.upper() or 'EA26' in g.upper() for g in grupos)
    tiene_2626  = any(g.strip() in ('26 1', '26 2', '261', '262') or
                      (len(g) <= 5 and g[:2] == '26') for g in grupos)
    flag = '⚠ DOBLE' if (tiene_ealn and tiene_2626) else ''
    total_h = sum(b['horas_bloque'] for b in bloques)
    print(f"\n  {nombre}  ({total_h:.1f}h/sem)  {flag}")
    for b in bloques:
        print(f"    {b['dia_semana']:<10} {str(b['hora_inicio'])[:5]}-{str(b['hora_fin'])[:5]}  "
              f"({b['horas_bloque']:.1f}h)  grupo={b['grupo']}")

# Resumen de grupos únicos
print(f"\n{'='*90}")
print("GRUPOS únicos en Nutrición:")
cur.execute("""
    SELECT DISTINCT a.grupo, COUNT(*) AS bloques,
           SUM(hc.horas_bloque) AS horas_sem
    FROM horario_clases hc
    JOIN asignaciones a ON hc.asignacion_id = a.id AND a.activa=true AND a.ciclo=%s
    JOIN materias m     ON a.materia_id = m.id AND m.programa_id = 3
    WHERE hc.activo = true
    GROUP BY a.grupo ORDER BY a.grupo
""", (CICLO,))
for r in cur.fetchall():
    print(f"  {r['grupo']:<20}  {r['bloques']} bloques  {r['horas_sem']:.1f}h/sem")

cur.close()
conn.close()
