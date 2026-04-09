"""Debug checadas vs horarios para docentes de Enfermería con mayor discrepancia."""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = 'postgresql://nomina_user:IESEFnomina%402026$@localhost:5432/iesef_nomina'
FECHA_INICIO = '2026-03-11'
FECHA_FIN    = '2026-03-25'

conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
cur  = conn.cursor()

# Buscar Juárez Mata Sergio
cur.execute("SELECT id, nombre_completo, chec_id FROM docentes WHERE nombre_completo ILIKE '%Ju%rez Mata%'")
doc = cur.fetchone()
if not doc:
    print("Docente no encontrado"); exit()
print(f"Docente: {doc['nombre_completo']} id={doc['id']} chec_id={doc['chec_id']}")

# Todas sus asignaciones activas
cur.execute("""
    SELECT a.id, a.grupo, hc.dia_semana, hc.hora_inicio, hc.hora_fin, hc.horas_bloque,
           m.nombre as materia, p.nombre as prog
    FROM asignaciones a
    JOIN horario_clases hc ON hc.asignacion_id = a.id AND hc.activo = true
    JOIN materias m ON a.materia_id = m.id
    JOIN programas p ON m.programa_id = p.id
    WHERE a.docente_id = %s AND a.activa = true
    ORDER BY hc.dia_semana, hc.hora_inicio
""", (doc['id'],))
bloques = cur.fetchall()
print(f"\nBloques en DB: {len(bloques)}")
for b in bloques[:20]:
    print(f"  {b['prog'][:12]:<12} {b['grupo']:<10} {b['dia_semana']:<10} {str(b['hora_inicio'])[:5]}-{str(b['hora_fin'])[:5]} {b['horas_bloque']:.1f}h  {b['materia'][:25]}")

# Total horas/semana
total_h = sum(float(b['horas_bloque']) for b in bloques)
print(f"\nTotal horas/semana en horario: {total_h:.1f}")

# Checadas en la quincena
cur.execute("""
    SELECT DATE(timestamp_checada) as fecha, timestamp_checada::time as hora, tipo_punch
    FROM asistencias_checadas
    WHERE user_id = %s AND timestamp_checada BETWEEN %s AND %s
    ORDER BY timestamp_checada
""", (doc['chec_id'], FECHA_INICIO, FECHA_FIN))
checadas = cur.fetchall()
print(f"\nChecadas en Q3: {len(checadas)}")
for c in checadas:
    print(f"  {c['fecha']}  {str(c['hora'])[:5]}  tipo={c['tipo_punch']}")

conn.close()
