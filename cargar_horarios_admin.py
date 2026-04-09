"""
cargar_horarios_admin.py
Carga bloques de horario del Excel BASE PERSONAL SISTEMA2.xlsx
a la tabla horarios_trabajador en PostgreSQL iesef_nomina.
"""

import pandas as pd
import psycopg2
import datetime
import re

# ── Conexión ─────────────────────────────────────────────────────────────────
conn = psycopg2.connect(
    host='localhost', port=5432,
    dbname='iesef_nomina', user='postgres', password='postgres'
)
cur = conn.cursor()

# ── Orden canónico de días ────────────────────────────────────────────────────
# Índices: L=0, M=1, MI=2, J=3, V=4, S=5, D=6
DAY_ORDER = ['L', 'M', 'MI', 'J', 'V', 'S', 'D']
DAY_FIELD = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

# Normalización de tokens de texto libre → clave canónica
WORD_TO_KEY = {
    'L': 'L',
    'M': 'M',
    'MI': 'MI', 'X': 'MI',
    'MIERCOLES': 'MI', 'MIÉRCOLES': 'MI',
    'J': 'J',
    'V': 'V', 'VIERNES': 'V',
    'S': 'S',
    'D': 'D',
}


def _to_key(token: str) -> str | None:
    """Normaliza un token de texto a clave canónica o None si no se reconoce."""
    t = token.strip().upper().replace('É', 'E').replace('Í', 'I')
    return WORD_TO_KEY.get(t)


def parse_dias(s) -> dict | None:
    """
    Convierte una cadena de días a dict {lunes:bool, ..., domingo:bool}.
    Retorna None si la entrada está vacía / NaN.
    """
    if s is None:
        return None
    try:
        if pd.isna(s):
            return None
    except Exception:
        pass
    s = str(s).strip()
    if not s or s.lower() == 'nan':
        return None

    result = {f: False for f in DAY_FIELD}

    # Separar primero por coma (ej. "L-MIERCOLES, VIERNES")
    comma_parts = [p.strip() for p in s.split(',')]

    for part in comma_parts:
        # Separar por guión o espacio
        tokens = [t for t in re.split(r'[-\s]+', part) if t]

        # Convertir cada token a clave canónica
        keys = [_to_key(t) for t in tokens]

        if None in keys:
            # Algún token no reconocido — intentar ignorar
            keys = [k for k in keys if k is not None]
        if not keys:
            continue

        # Decidir: ¿rango o lista individual?
        # Rango: exactamente 2 tokens, ambos claves simples de un solo carácter
        # (NO "MI" — MI es 2 letras, no puede ser extremo de rango simple),
        # excepto "L-MI" que sí es rango L→MI.
        if len(keys) == 2:
            idx0 = DAY_ORDER.index(keys[0]) if keys[0] in DAY_ORDER else -1
            idx1 = DAY_ORDER.index(keys[1]) if keys[1] in DAY_ORDER else -1
            if idx0 >= 0 and idx1 >= 0 and idx1 >= idx0:
                # Tratar como rango
                for i in range(idx0, idx1 + 1):
                    result[DAY_FIELD[i]] = True
                continue
        # Si no es rango de 2, tratar como lista individual,
        # con resolución de "M-M" → martes + miercoles (segunda M = MI)
        seen = set()
        for k in keys:
            if k == 'M' and 'M' in seen:
                # Segunda M → Miércoles
                k = 'MI'
            seen.add(k)
            if k in DAY_ORDER:
                result[DAY_FIELD[DAY_ORDER.index(k)]] = True

    return result


def parse_time(val) -> str | None:
    """Convierte un valor a string 'HH:MM' o None."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except Exception:
        pass
    if isinstance(val, datetime.time):
        return val.strftime('%H:%M')
    if isinstance(val, datetime.datetime):
        return val.strftime('%H:%M')
    s = str(val).strip()
    if not s or s.lower() == 'nan':
        return None
    if ':' in s:
        return s[:5]
    return None


# ── Leer Excel ────────────────────────────────────────────────────────────────
df = pd.read_excel(
    'C:/Users/Admin/Downloads/BASE PERSONAL SISTEMA2.xlsx',
    sheet_name='Base Personal',
    header=0
)

# Bloques: (col_dia, col_inicio, col_fin)
BLOCKS = [
    (2, 3, 4),    # bloque 1
    (5, 6, 7),    # bloque 2
    (8, 9, 10),   # bloque 3
    (11, 12, 13), # bloque 4
]

total_inserted = 0
total_skipped_rows = 0
total_skipped_blocks = 0
warnings = []

print("=" * 60)
print("CARGANDO HORARIOS DE TRABAJADORES ADMINISTRATIVOS")
print("=" * 60)

for excel_row_idx, row in df.iterrows():
    raw_chec = row.iloc[0]

    # Saltar filas sin chec_id numérico
    if raw_chec is None or (hasattr(raw_chec, '__float__') and pd.isna(raw_chec)):
        continue
    # Saltar si el valor no es un entero válido (ej. "56 CINTIA")
    try:
        chec_id = int(float(str(raw_chec).strip()))
    except ValueError:
        warnings.append(f"  AVISO fila Excel {excel_row_idx}: chec_id no numérico ({raw_chec!r}), se omite")
        total_skipped_rows += 1
        continue

    nombre = str(row.iloc[1]).strip() if pd.notna(row.iloc[1]) else f'chec_{chec_id}'

    # Buscar trabajador_id en la BD
    cur.execute("SELECT id FROM trabajadores WHERE chec_id = %s", (chec_id,))
    res = cur.fetchone()
    if not res:
        warnings.append(f"  AVISO fila Excel {excel_row_idx}: chec_id={chec_id} ({nombre}) NO encontrado en trabajadores, se omite")
        total_skipped_rows += 1
        continue

    trabajador_id = res[0]
    row_inserted = 0

    for b_num, (ci, cs, cf) in enumerate(BLOCKS, start=1):
        dias_raw = row.iloc[ci]
        inicio_raw = row.iloc[cs]
        fin_raw = row.iloc[cf]

        # Saltar bloque si días o inicio están vacíos
        try:
            if pd.isna(dias_raw):
                continue
        except Exception:
            pass
        if dias_raw is None or str(dias_raw).strip().lower() == 'nan':
            continue

        hora_inicio = parse_time(inicio_raw)
        if hora_inicio is None:
            total_skipped_blocks += 1
            warnings.append(f"  AVISO fila Excel {excel_row_idx} chec={chec_id} bloque {b_num}: INICIO vacío, bloque omitido")
            continue

        hora_fin = parse_time(fin_raw)
        dias = parse_dias(dias_raw)
        if dias is None:
            total_skipped_blocks += 1
            warnings.append(f"  AVISO fila Excel {excel_row_idx} chec={chec_id} bloque {b_num}: días no parseables ({dias_raw!r}), bloque omitido")
            continue

        # Verificar que al menos un día esté marcado
        if not any(dias.values()):
            total_skipped_blocks += 1
            warnings.append(f"  AVISO fila Excel {excel_row_idx} chec={chec_id} bloque {b_num}: ningún día activo en ({dias_raw!r}), bloque omitido")
            continue

        cur.execute("""
            INSERT INTO horarios_trabajador
                (trabajador_id, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
                 hora_entrada, hora_salida)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            trabajador_id,
            dias['lunes'], dias['martes'], dias['miercoles'],
            dias['jueves'], dias['viernes'], dias['sabado'], dias['domingo'],
            hora_inicio, hora_fin
        ))
        row_inserted += 1
        total_inserted += 1

        # Mostrar qué días se cargaron
        dias_str = ''.join([
            'L' if dias['lunes'] else '',
            'M' if dias['martes'] else '',
            'X' if dias['miercoles'] else '',
            'J' if dias['jueves'] else '',
            'V' if dias['viernes'] else '',
            'S' if dias['sabado'] else '',
            'D' if dias['domingo'] else '',
        ])
        print(f"  chec={chec_id:3d} {nombre[:35]:35s} bloque {b_num}: [{dias_str}] {hora_inicio}-{hora_fin or '?':5s}  (raw: {dias_raw!r})")

    if row_inserted > 0:
        print(f"  => {row_inserted} bloque(s) insertado(s)\n")
    else:
        print(f"  => chec={chec_id} {nombre[:35]} - 0 bloques insertados\n")

# ── GRANTs ────────────────────────────────────────────────────────────────────
print("Aplicando GRANTs a nomina_user...")
grants = [
    "GRANT SELECT, INSERT, UPDATE, DELETE ON trabajadores TO nomina_user",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON horarios_trabajador TO nomina_user",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON nomina_admin_quincena TO nomina_user",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON incidencias_admin TO nomina_user",
    "GRANT USAGE, SELECT ON SEQUENCE trabajadores_id_seq TO nomina_user",
    "GRANT USAGE, SELECT ON SEQUENCE horarios_trabajador_id_seq TO nomina_user",
    "GRANT USAGE, SELECT ON SEQUENCE nomina_admin_quincena_id_seq TO nomina_user",
    "GRANT USAGE, SELECT ON SEQUENCE incidencias_admin_id_seq TO nomina_user",
]
grant_errors = []
for g in grants:
    try:
        cur.execute(g)
        print(f"  OK: {g}")
    except Exception as e:
        grant_errors.append(f"  ERROR GRANT: {g}\n    → {e}")
        conn.rollback()
        # Re-open transaction after rollback
        cur = conn.cursor()
        print(f"  SKIP (tabla no existe): {g.split(' ON ')[1].split(' TO')[0]}")

conn.commit()

# ── Resumen ───────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("RESUMEN")
print("=" * 60)
print(f"Bloques insertados:       {total_inserted}")
print(f"Filas de Excel omitidas:  {total_skipped_rows}")
print(f"Bloques vacíos omitidos:  {total_skipped_blocks}")
if warnings:
    print(f"\nAVISOS ({len(warnings)}):")
    for w in warnings:
        print(w)
if grant_errors:
    print(f"\nERRORES DE GRANT ({len(grant_errors)}):")
    for e in grant_errors:
        print(e)

# ── Verificación ──────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("VERIFICACIÓN — primeros 20 trabajadores")
print("=" * 60)
cur.execute("""
    SELECT t.chec_id, t.nombre, COUNT(h.id) as num_bloques,
           STRING_AGG(
             CASE WHEN h.lunes     THEN 'L' ELSE '' END ||
             CASE WHEN h.martes    THEN 'M' ELSE '' END ||
             CASE WHEN h.miercoles THEN 'X' ELSE '' END ||
             CASE WHEN h.jueves    THEN 'J' ELSE '' END ||
             CASE WHEN h.viernes   THEN 'V' ELSE '' END ||
             CASE WHEN h.sabado    THEN 'S' ELSE '' END ||
             CASE WHEN h.domingo   THEN 'D' ELSE '' END ||
             ' ' || h.hora_entrada::text || '-' || h.hora_salida::text,
             ' | ' ORDER BY h.id
           ) as horarios
    FROM trabajadores t
    LEFT JOIN horarios_trabajador h ON h.trabajador_id = t.id
    GROUP BY t.id, t.chec_id, t.nombre
    ORDER BY t.chec_id
    LIMIT 20
""")
rows = cur.fetchall()
print(f"{'CHEC':>5}  {'NOMBRE':<38}  {'N':>2}  HORARIOS")
print("-" * 100)
for r in rows:
    print(f"{r[0]:>5}  {(r[1] or ''):<38}  {r[2]:>2}  {r[3] or '(sin bloques)'}")

cur.close()
conn.close()
print("\nConexión cerrada. Listo.")
