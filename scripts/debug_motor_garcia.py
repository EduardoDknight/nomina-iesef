"""Debug: ejecuta el motor para García Lavalley y muestra cada bloque-fecha con sus checadas."""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = 'postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina'
FECHA_INICIO = '2026-03-11'
FECHA_FIN    = '2026-03-25'
DOC_ID  = 31
CHEC_ID = 65

conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
cur  = conn.cursor()

cur.execute("""
    WITH
    fechas AS (
        SELECT gs::date AS fecha, EXTRACT(DOW FROM gs) AS dow
        FROM generate_series(%s::date, %s::date, '1 day') gs
        WHERE EXTRACT(DOW FROM gs) != 0
    ),
    checadas AS (
        SELECT DATE(timestamp_checada) AS fecha,
               timestamp_checada::time AS hora
        FROM asistencias_checadas
        WHERE timestamp_checada BETWEEN %s AND %s AND user_id = %s
    ),
    bloques AS (
        SELECT hc.id AS horario_id, hc.dia_semana, hc.hora_inicio, hc.hora_fin, hc.horas_bloque,
               m.programa_id, p.nombre AS programa_nombre,
               COALESCE(a.costo_hora, p.costo_hora) AS tarifa,
               CASE hc.dia_semana
                   WHEN 'lunes'     THEN 1 WHEN 'martes'    THEN 2
                   WHEN 'miercoles' THEN 3 WHEN 'jueves'    THEN 4
                   WHEN 'viernes'   THEN 5 WHEN 'sabado'    THEN 6
               END AS dow_num
        FROM horario_clases hc
        JOIN asignaciones a ON hc.asignacion_id = a.id AND a.docente_id = %s AND a.activa = true
        JOIN materias m     ON a.materia_id = m.id
        JOIN programas p    ON m.programa_id = p.id
        WHERE hc.activo = true
    )
    SELECT bf.programa_nombre, bf.dia_semana, bf.hora_inicio, bf.hora_fin, bf.horas_bloque, bf.fecha,
        EXISTS(SELECT 1 FROM checadas c WHERE c.fecha=bf.fecha
               AND c.hora BETWEEN bf.hora_inicio - INTERVAL '20 minutes'
                               AND bf.hora_inicio + INTERVAL '10 minutes') AS tiene_entrada,
        EXISTS(SELECT 1 FROM checadas c WHERE c.fecha=bf.fecha
               AND c.hora >= bf.hora_fin
                      - (LEAST(bf.horas_bloque*10,20)||' minutes')::INTERVAL) AS tiene_salida
    FROM (SELECT b.*, f.fecha FROM bloques b JOIN fechas f ON f.dow=b.dow_num) bf
    ORDER BY bf.programa_nombre, bf.fecha, bf.hora_inicio
""", (FECHA_INICIO, FECHA_FIN, FECHA_INICIO, FECHA_FIN, CHEC_ID, DOC_ID))

rows = cur.fetchall()
print(f"Total filas del motor para García Lavalley: {len(rows)}")
print()

from collections import defaultdict
por_prog = defaultdict(float)
for r in rows:
    ok = r['tiene_entrada'] and r['tiene_salida']
    prog = r['programa_nombre'][:25]
    marca = '✅' if ok else '❌'
    if ok:
        por_prog[r['programa_nombre']] += float(r['horas_bloque'])
    print(f"{marca} {r['fecha']}  {str(r['hora_inicio'])[:5]}-{str(r['hora_fin'])[:5]}  "
          f"{r['horas_bloque']}h  E={r['tiene_entrada']} S={r['tiene_salida']}  {prog}")

print()
print("TOTALES POR PROGRAMA:")
for prog, h in sorted(por_prog.items()):
    print(f"  {prog:<35} {h:.1f}h")

conn.close()
