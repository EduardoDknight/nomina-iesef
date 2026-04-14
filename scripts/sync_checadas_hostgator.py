"""
sync_checadas_hostgator.py
Sincroniza las checadas del 31 mar → hoy desde HostGator a la BD local.
Uso: python scripts/sync_checadas_hostgator.py

Requiere: ssh configurado con acceso a dedi-1124945.iesef.edu.mx
"""
import subprocess, sys, psycopg2, json
from datetime import datetime, date

LOCAL_DB = "postgresql://nomina_user:IESEFnomina%402026$@localhost:5432/iesef_nomina"
SSH_HOST = "wwiese@dedi-1124945.iesef.edu.mx"
# Credenciales de la BD en HostGator (leer del .env del servidor)
REMOTE_DB = "postgresql://nomina_user:IESEFnomina%402026$@localhost:5432/iesef_nomina"

DESDE = "2026-03-31"   # Ajustar si es necesario

print(f"Sincronizando checadas desde {DESDE} hasta hoy...")
print(f"Origen:  {SSH_HOST}")
print(f"Destino: localhost iesef_nomina\n")

# ── 1. Exportar checadas del rango desde HostGator via SSH ────────────────────
query = f"""
COPY (
  SELECT uid_checador, user_id, timestamp_checada, tipo_punch,
         estado, id_dispositivo, id_agente, sincronizado_en
  FROM asistencias_checadas
  WHERE timestamp_checada >= '{DESDE}'
  ORDER BY timestamp_checada
) TO STDOUT WITH (FORMAT csv, HEADER false)
"""

cmd = [
    "ssh", SSH_HOST,
    f"psql \"{REMOTE_DB}\" -c \"{query.strip()}\""
]

print("Conectando a HostGator via SSH...")
try:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        print("Error SSH:", result.stderr)
        sys.exit(1)
except subprocess.TimeoutExpired:
    print("Timeout — revisa acceso SSH a HostGator")
    sys.exit(1)

lines = [l for l in result.stdout.strip().split("\n") if l]
print(f"Registros obtenidos de HostGator: {len(lines)}")

if not lines:
    print("Sin registros nuevos — ya estás al día.")
    sys.exit(0)

# ── 2. Insertar en BD local ───────────────────────────────────────────────────
conn = psycopg2.connect(LOCAL_DB)
cur = conn.cursor()

insertadas = 0
duplicadas = 0
errores = 0

for line in lines:
    parts = line.split(",")
    if len(parts) < 8:
        errores += 1
        continue
    try:
        cur.execute("""
            INSERT INTO asistencias_checadas
                (uid_checador, user_id, timestamp_checada, tipo_punch,
                 estado, id_dispositivo, id_agente, sincronizado_en)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id_dispositivo, uid_checador, timestamp_checada)
            DO NOTHING
        """, (
            int(parts[0]),
            int(parts[1]),
            parts[2],
            int(parts[3]),
            int(parts[4]),
            parts[5].strip('"'),
            parts[6].strip('"'),
            parts[7].strip('"') if parts[7].strip('"') else None,
        ))
        if cur.rowcount == 1:
            insertadas += 1
        else:
            duplicadas += 1
    except Exception as e:
        errores += 1
        print(f"  Error en línea: {line[:60]} → {e}")

conn.commit()
cur.close()
conn.close()

print(f"\nResultado:")
print(f"  Insertadas : {insertadas}")
print(f"  Duplicadas : {duplicadas}")
print(f"  Errores    : {errores}")
print(f"\nBD local actualizada hasta {date.today()}.")
