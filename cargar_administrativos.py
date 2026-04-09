#!/usr/bin/env python3
"""
Carga personal administrativo desde Excel a PostgreSQL.
Tablas: trabajadores, horarios_trabajador
"""

import pandas as pd
import psycopg2
import sys
import re

EXCEL_PATH = r"C:\Users\Admin\Downloads\BASE PERSONAL SISTEMA2.xlsx"

# ── Day parsing ──────────────────────────────────────────────────────────────
ORDEN = ['L', 'M', 'MI', 'J', 'V', 'S', 'D']
FIELD = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

# Map abbreviation → index in ORDEN
ABBREV_IDX = {
    'L': 0, 'LU': 0, 'LUNES': 0,
    'M': 1, 'MA': 1, 'MARTES': 1,
    'MI': 2, 'X': 2, 'MIERCOLES': 2, 'MIÉRCOLES': 2, 'MIERCOLES': 2,
    'J': 3, 'JU': 3, 'JUEVES': 3,
    'V': 4, 'VI': 4, 'VIERNES': 4,
    'S': 5, 'SA': 5, 'SABADO': 5, 'SÁBADO': 5,
    'D': 6, 'DO': 6, 'DOMINGO': 6,
}


def normalize_day_token(token):
    """Normalize a single day token to its ORDEN index. Returns None if unrecognized."""
    t = token.strip().upper()
    # Remove accents
    t = t.replace('Á', 'A').replace('É', 'E').replace('Í', 'I').replace('Ó', 'O').replace('Ú', 'U')
    t = t.replace('\xc3\x81', 'A')  # garbled encodings
    return ABBREV_IDX.get(t)


def parse_dias(s):
    """
    Parse a DIA string into a dict of {lunes:bool, martes:bool, ..., domingo:bool}.

    Handles:
      'L-V'           → range L through V
      'L-S'           → range L through S
      'L-J'           → range L through J
      'L-M-J-S'       → individual: L, M, J, S
      'L-M-M'         → L, M, MI  (second M = martes, third M = miercoles)
      'L-M-M-J'       → L, M, MI, J
      'S-D'           → range S through D
      'L-MIERCOLES, VIERNES' → L, MI, V
    """
    flags = [False] * 7

    if not s or (isinstance(s, float)):
        return dict(zip(FIELD, flags))

    s = str(s).strip().upper()
    # Normalize accented chars
    for a, b in [('Á','A'),('É','E'),('Í','I'),('Ó','O'),('Ú','U')]:
        s = s.replace(a, b)

    # Split on commas to get sub-expressions, then process each
    comma_parts = [p.strip() for p in s.split(',')]
    indices = set()

    for part in comma_parts:
        # Split on dash
        tokens = [t.strip() for t in part.split('-') if t.strip()]

        if not tokens:
            continue

        # If only one token → single day
        if len(tokens) == 1:
            idx = normalize_day_token(tokens[0])
            if idx is not None:
                indices.add(idx)
            continue

        # Two tokens: could be a range (L-V) or two individual days
        if len(tokens) == 2:
            idx0 = normalize_day_token(tokens[0])
            idx1 = normalize_day_token(tokens[1])
            if idx0 is not None and idx1 is not None:
                if idx1 > idx0:
                    # range
                    for i in range(idx0, idx1 + 1):
                        indices.add(i)
                elif idx1 == idx0:
                    indices.add(idx0)
                else:
                    # idx1 < idx0: treat as individual (e.g. overnight days listed out of order)
                    indices.add(idx0)
                    indices.add(idx1)
            continue

        # 3+ tokens: parse as a sequence of individual days,
        # but handle the special case where consecutive 'M' tokens
        # mean [martes, miercoles]
        resolved = []
        i = 0
        while i < len(tokens):
            t = tokens[i].strip().upper()
            if t == 'M':
                # Look ahead: if next token is also 'M', this is martes and next is miercoles
                if i + 1 < len(tokens) and tokens[i+1].strip().upper() == 'M':
                    resolved.append(1)  # martes
                    resolved.append(2)  # miercoles
                    i += 2
                    continue
                else:
                    resolved.append(1)  # martes
            else:
                idx = normalize_day_token(t)
                if idx is not None:
                    resolved.append(idx)
            i += 1

        for idx in resolved:
            indices.add(idx)

    for idx in indices:
        flags[idx] = True

    return dict(zip(FIELD, flags))


# ── Time normalization ────────────────────────────────────────────────────────
def normalize_time(val):
    if val is None:
        return None
    try:
        import pandas as pd
        if not isinstance(val, str) and pd.isna(val):
            return None
    except Exception:
        pass
    if hasattr(val, 'strftime'):
        return val.strftime('%H:%M')
    s = str(val).strip()
    if not s or s.lower() in ('nan', 'none', 'nat'):
        return None
    if ':' in s:
        return s[:5]
    return None


# ── Load Excel ────────────────────────────────────────────────────────────────
def load_excel(path):
    df = pd.read_excel(path, sheet_name='Base Personal', header=0, engine='openpyxl')
    # Normalize column names
    df.columns = [str(c).strip() for c in df.columns]
    print(f"Columns detected: {list(df.columns)}")
    print(f"Rows: {len(df)}")
    return df


# ── Parse a single row ────────────────────────────────────────────────────────
def parse_row(row):
    """Returns dict with chec_id, nombre, blocks or None if should be skipped."""
    import pandas as pd

    # Col 0: chec_id
    raw_chec = row.iloc[0]
    try:
        if pd.isna(raw_chec):
            return None, f"Sin chec_id (chec_id=NaN) para '{str(row.iloc[1]).strip()}'"
    except Exception:
        pass
    try:
        chec_id = int(raw_chec)
    except (ValueError, TypeError):
        return None, f"chec_id no numérico '{raw_chec}'"

    # Col 1: nombre
    nombre_raw = str(row.iloc[1]).strip()
    if not nombre_raw or nombre_raw.upper() == 'NAN':
        return None, f"Sin nombre para chec_id={chec_id}"
    nombre = nombre_raw.upper()

    # Blocks: (DIA, INICIO, FIN) at cols 2-4, 5-7, 8-10, 11-13
    blocks = []
    block_offsets = [2, 5, 8, 11]
    for offset in block_offsets:
        if offset + 2 >= len(row):
            break
        dia_val = row.iloc[offset]
        ini_val = row.iloc[offset + 1]
        fin_val = row.iloc[offset + 2]

        # Skip empty block
        try:
            if pd.isna(dia_val):
                continue
        except Exception:
            pass

        dia_str = str(dia_val).strip()
        if not dia_str or dia_str.lower() == 'nan':
            continue

        hora_entrada = normalize_time(ini_val)
        hora_salida = normalize_time(fin_val)

        if hora_entrada is None and hora_salida is None:
            continue

        day_flags = parse_dias(dia_str)
        # Check if any day is set
        if not any(day_flags.values()):
            print(f"  WARNING: Could not parse DIA='{dia_str}' for chec_id={chec_id}, skipping block")
            continue

        block = {**day_flags, 'hora_entrada': hora_entrada, 'hora_salida': hora_salida,
                 '_dia_raw': dia_str}
        blocks.append(block)

    if not blocks:
        return None, f"Sin bloques de horario válidos para chec_id={chec_id} ({nombre})"

    return {'chec_id': chec_id, 'nombre': nombre, 'blocks': blocks}, None


# ── Preview ───────────────────────────────────────────────────────────────────
def days_summary(blocks):
    days_abbr = ['L','M','MI','J','V','S','D']
    parts = []
    for b in blocks:
        active = [days_abbr[i] for i, f in enumerate(FIELD) if b[f]]
        entry = b['hora_entrada'] or '?'
        exit_ = b['hora_salida'] or '?'
        parts.append(f"[{','.join(active)} {entry}-{exit_}]")
    return ' | '.join(parts)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("CARGA DE PERSONAL ADMINISTRATIVO")
    print("=" * 70)

    df = load_excel(EXCEL_PATH)

    workers = []
    skipped = []

    for idx, row in df.iterrows():
        result, reason = parse_row(row)
        if result is None:
            skipped.append((idx + 2, reason))  # +2 for 1-based + header
        else:
            workers.append(result)

    # Preview
    print("\n" + "-"*70)
    print(f"PREVIEW -- {len(workers)} trabajadores listos, {len(skipped)} omitidos")
    print("-"*70)
    print(f"{'chec_id':>8}  {'NOMBRE':<40}  {'BLOQUES':>6}  DIAS/HORARIOS")
    print(f"{'':>8}  {'':40}  {'':>6}  {''}")
    for w in workers:
        print(f"{w['chec_id']:>8}  {w['nombre']:<40}  {len(w['blocks']):>6}  {days_summary(w['blocks'])}")

    if skipped:
        print(f"\nOMITIDOS ({len(skipped)}):")
        for row_num, reason in skipped:
            print(f"  Fila {row_num}: {reason}")

    print("\n" + "-"*70)
    answer = input("¿Proceder con INSERT? (y/n): ").strip().lower()
    if answer != 'y':
        print("Cancelado.")
        sys.exit(0)

    # DB
    print("\nConectando a PostgreSQL...")
    conn = psycopg2.connect(host="localhost", port=5432, dbname="iesef_nomina",
                             user="postgres", password="postgres")
    conn.autocommit = False
    cur = conn.cursor()

    inserted = 0
    updated = 0
    horario_rows = 0
    errors = []

    for w in workers:
        try:
            cur.execute("""
                INSERT INTO trabajadores (chec_id, no_trabajador, nombre, activo)
                VALUES (%s, %s, %s, TRUE)
                ON CONFLICT (chec_id) DO UPDATE SET nombre = EXCLUDED.nombre
                RETURNING id, (xmax = 0) AS is_insert
            """, (w['chec_id'], w['chec_id'], w['nombre']))
            row = cur.fetchone()
            t_id = row[0]
            is_new = row[1]

            if is_new:
                inserted += 1
            else:
                updated += 1

            # Delete existing horarios and re-insert
            cur.execute("DELETE FROM horarios_trabajador WHERE trabajador_id = %s", (t_id,))

            for block in w['blocks']:
                cur.execute("""
                    INSERT INTO horarios_trabajador
                    (trabajador_id, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
                     hora_entrada, hora_salida)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, (
                    t_id,
                    block['lunes'], block['martes'], block['miercoles'],
                    block['jueves'], block['viernes'], block['sabado'], block['domingo'],
                    block['hora_entrada'], block['hora_salida']
                ))
                horario_rows += 1

        except Exception as e:
            errors.append(f"chec_id={w['chec_id']} ({w['nombre']}): {e}")
            conn.rollback()
            # Re-open transaction
            conn = psycopg2.connect(host="localhost", port=5432, dbname="iesef_nomina",
                                     user="postgres", password="postgres")
            conn.autocommit = False
            cur = conn.cursor()
            continue

    # Grants
    print("\nAplicando permisos a nomina_user...")
    grant_stmts = [
        "GRANT SELECT, INSERT, UPDATE, DELETE ON trabajadores TO nomina_user",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON horarios_trabajador TO nomina_user",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON nomina_admin_quincena TO nomina_user",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON incidencias_admin TO nomina_user",
        "GRANT USAGE, SELECT ON SEQUENCE trabajadores_id_seq TO nomina_user",
        "GRANT USAGE, SELECT ON SEQUENCE horarios_trabajador_id_seq TO nomina_user",
        "GRANT USAGE, SELECT ON SEQUENCE nomina_admin_quincena_id_seq TO nomina_user",
        "GRANT USAGE, SELECT ON SEQUENCE incidencias_admin_id_seq TO nomina_user",
    ]
    for stmt in grant_stmts:
        try:
            cur.execute(stmt)
            print(f"  OK  {stmt[:60]}...")
        except Exception as e:
            print(f"  ERR {stmt[:60]}... ERROR: {e}")

    conn.commit()
    cur.close()
    conn.close()

    print("\n" + "="*70)
    print("RESULTADO:")
    print(f"  Insertados nuevos : {inserted}")
    print(f"  Actualizados      : {updated}")
    print(f"  Filas de horario  : {horario_rows}")
    print(f"  Omitidos (sin ins): {len(skipped)}")
    if errors:
        print(f"  Errores DB        : {len(errors)}")
        for e in errors:
            print(f"    {e}")
    print("="*70)


if __name__ == '__main__':
    main()
