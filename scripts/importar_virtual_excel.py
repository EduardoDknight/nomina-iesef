"""
importar_virtual_excel.py

Limpia asignaciones legacy de eStudy (prefijo 'EA26 ') y crea asignaciones
virtuales/mixtas desde el Excel de Educación Virtual.

Diseñado para correr DESPUÉS de importar_horarios_pdf.py (que importó presenciales).

Pasos:
  1. Desactiva asignaciones con grupo LIKE 'EA26 %' y sus horario_clases
  2. Lee el Excel Virtual (hoja VIRTUAL) y crea asignaciones con modalidad correcta:
       MDIE/MSP/MGDIS/EADSE     → 'virtual'   (100% virtual)
       LENA/EEQ/EECI/EEP/EEG    → 'mixta'     (viernes virtual + sábado presencial)
       LNUTS/LNUT/NUTRICIÓN     → 'mixta'
  3. Re-enlaza evaluacion_virtual_resultado y evaluacion_virtual_semana a nuevos IDs

Uso:
  python importar_virtual_excel.py --dry-run   # ver qué haría sin cambios
  python importar_virtual_excel.py             # ejecutar
"""

import sys, os, re, argparse
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import psycopg2
from psycopg2.extras import RealDictCursor
from difflib import SequenceMatcher
import pandas as pd

# ── Configuración ─────────────────────────────────────────────────────────────

DB_URL     = 'postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina'
EXCEL_PATH = r'C:\Users\Admin\Downloads\Virtual marzo 2- Excel con la parte que la coord de educacion virtual tiene que llenar docente por docente que da clases.xlsx'
CICLO      = '2026-1'
HOJA       = 'VIRTUAL'
HEADER_ROW = 14   # fila 0-indexada con PROGRAMA/GRUPO/MATERIA/DOCENTE

# Índices de columnas en el Excel (0-indexed, después de header)
COL_PROG     = 1
COL_GRUPO    = 2
COL_MATERIA  = 3
COL_DOCENTE  = 4
COL_HORAS_Q  = 23   # HORAS POR QUINCENA

# PROGRAMA (Excel) → prog_id en DB
PROG_ID = {
    'MAESTRIAS': 6, 'MAESTRÍAS': 6,
    'LENA': 4,
    'NUTRICION': 3, 'NUTRICIÓN': 3,
    'ESPECIALIDADES': 5,
}

# prog_id → costo/hora
PROG_COSTO = {1: 120, 2: 140, 3: 130, 4: 160, 5: 200, 6: 220}

# Prefijo de grupo → modalidad
PREFIX_MODALIDAD = {
    'MSP':   'virtual', 'MDIE': 'virtual', 'MGDIS': 'virtual', 'EADSE': 'virtual',
    'LENA':  'mixta',
    'EEQ':   'mixta', 'EECI': 'mixta', 'EEP': 'mixta', 'EEG': 'mixta',
    'LNUTS': 'mixta', 'LNUT': 'mixta', 'LNUTE': 'mixta',
}

TITULOS = {
    'dra','dr','mtra','mtro','lic','enf','ing','med','cir',
    'l.e','m.s.p','l.n','l.c.e','m.c','m.a','m.t.i','m.ped',
    'l.e.e','l.e.f','m.c.b.y.s','m.a.g.s.s','m.m','m.d','m.d.m.s.y.s',
    'l.biol','l.h.mex','lic.der','lic.psic','ing.biom','ing.quim',
    'l.q.a','med.cir','m.c.s','ll.r.p.c','m.a.h.s.s','esp.doc',
    'm.a.i.s','m.c.enf','m.c.b','m.s.p.',
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def quitar_acentos(s):
    return (s.replace('á','a').replace('é','e').replace('í','i')
             .replace('ó','o').replace('ú','u').replace('ñ','n')
             .replace('Á','A').replace('É','E').replace('Í','I')
             .replace('Ó','O').replace('Ú','U').replace('Ñ','N'))

def normalizar_nombre(nombre):
    palabras = str(nombre).strip().split()
    filtradas = [p for p in palabras
                 if p.lower().rstrip('.').rstrip(',') not in TITULOS
                 and not re.match(r'^[A-Z]\.$', p)]
    return ' '.join(sorted(filtradas, key=str.lower)).lower()

def buscar_docente(nombre, docentes_db, by_nombre):
    norm = normalizar_nombre(nombre)
    if norm in by_nombre:
        return by_nombre[norm], 1.0
    mejor_id, mejor_s = None, 0.0
    for d in docentes_db:
        s = SequenceMatcher(None, norm, normalizar_nombre(d['nombre_completo'])).ratio()
        if s > mejor_s:
            mejor_s = s
            mejor_id = d['id']
    return (mejor_id, mejor_s) if mejor_s >= 0.58 else (None, mejor_s)

def normalizar_grado(g):
    """Normaliza el separador de grado (°, º, o) y espacios alrededor."""
    g = g.replace('\u00ba', '°').replace('\u00b0', '°')
    g = re.sub(r'\s*°\s*', '°', g)
    g = ' '.join(g.split())
    return g.strip()

def normalizar_grupo_excel(grupo_raw, programa_raw):
    """
    Convierte el GRUPO del Excel al formato canónico de la DB.
    - LENA y NUTRICIÓN no traen prefijo en el grupo del Excel → se añade.
    - ESPECIALIDADES y MAESTRÍAS ya traen prefijo (EEQ, MDIE, etc.)
    """
    g = str(grupo_raw).strip()
    if not g or g.lower() == 'nan':
        return ''
    g = normalizar_grado(g)

    prog = quitar_acentos(str(programa_raw).strip().upper())

    if 'LENA' in prog and not g.upper().startswith('LENA'):
        g = f'LENA {g}'
    elif 'NUTRI' in prog and not any(g.upper().startswith(p) for p in ('LNUTS','LNUT','LNUTE')):
        # 's' al final = sabatina (LNUTS)
        if re.search(r'\bs\b', g, re.I) or g.lower().endswith(' s') or g.lower().endswith('s'):
            base = re.sub(r'\s*\bS\b\s*$', '', g, flags=re.I).strip()
            g = f'LNUTS {base}'
        else:
            g = f'LNUT {g}'

    return g

def normalizar_grupo_viejo(grupo):
    """
    Convierte grupo eStudy al formato canónico.
    'EA26 EEQX 1°1' → 'EEQ 1°1'
    'EA26 LENA 2°1'  → 'LENA 2°1'
    'EA26 MSP 3°1'   → 'MSP 3°1'
    """
    g = str(grupo or '').strip()
    g = re.sub(r'^EA26\s+', '', g)   # strip EA26 prefix
    g = g.replace('EEQX', 'EEQ')    # EEQX → EEQ (nombre incorrecto de eStudy)
    g = normalizar_grado(g)
    return g

def get_modalidad(grupo_norm):
    m = re.match(r'^([A-Z]+)', grupo_norm.upper().strip())
    if not m:
        return 'virtual'
    prefix = m.group(1)
    for p in sorted(PREFIX_MODALIDAD, key=len, reverse=True):
        if prefix.startswith(p.upper()):
            return PREFIX_MODALIDAD[p]
    return 'virtual'

# ── Main ──────────────────────────────────────────────────────────────────────

def main(dry_run=False):
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor(cursor_factory=RealDictCursor)

    # Cargar docentes y materias
    cur.execute("SELECT id, nombre_completo FROM docentes WHERE activo=true")
    docentes_db = list(cur.fetchall())
    by_nombre   = {normalizar_nombre(d['nombre_completo']): d['id'] for d in docentes_db}

    cur.execute("SELECT id, nombre, programa_id FROM materias")
    materias_db = list(cur.fetchall())
    mat_index   = {(m['programa_id'], m['nombre'].lower()): m['id'] for m in materias_db}

    # ── PASO 1: Leer Excel ──────────────────────────────────────────────────
    print("Leyendo Excel de Educación Virtual...")
    df = pd.read_excel(EXCEL_PATH, sheet_name=HOJA, header=None)
    print(f"  Hoja '{HOJA}': {len(df)} filas totales")

    asig_data  = {}   # key=(doc_id, mat_nom.lower(), grupo_norm, prog_id) → dict
    sin_match  = []
    skip_count = 0

    for i in range(HEADER_ROW + 1, len(df)):
        row = df.iloc[i]
        prog_raw    = str(row.iloc[COL_PROG]).strip()
        grupo_raw   = str(row.iloc[COL_GRUPO]).strip()
        materia_raw = str(row.iloc[COL_MATERIA]).strip()
        docente_raw = str(row.iloc[COL_DOCENTE]).strip()

        # Saltar vacíos / separadores
        vacio = lambda v: not v or v.lower() in ('nan', '', ' ', '         ', '          ')
        if any(vacio(v) for v in (prog_raw, grupo_raw, materia_raw, docente_raw)):
            skip_count += 1
            continue
        if 'PROGRAMA' in prog_raw.upper():
            continue   # fila duplicada de encabezado

        # prog_id
        prog_key = quitar_acentos(prog_raw.strip().upper())
        prog_id  = None
        for k, v in PROG_ID.items():
            if quitar_acentos(k) == prog_key:
                prog_id = v
                break
        if not prog_id:
            # Búsqueda parcial
            for k, v in PROG_ID.items():
                if quitar_acentos(k) in prog_key or prog_key in quitar_acentos(k):
                    prog_id = v
                    break
        if not prog_id:
            continue

        grupo_norm = normalizar_grupo_excel(grupo_raw, prog_raw)
        if not grupo_norm:
            continue

        # Horas por quincena
        try:
            horas_q = float(row.iloc[COL_HORAS_Q]) if str(row.iloc[COL_HORAS_Q]) != 'nan' else 0.0
        except:
            horas_q = 0.0
        horas_sem = round(horas_q / 3.0, 2) if horas_q > 0 else 0.0

        # Match docente
        doc_id, score = buscar_docente(docente_raw, docentes_db, by_nombre)
        if doc_id is None:
            sin_match.append(f"{docente_raw}  ({grupo_norm})  score={score:.2f}")
            continue

        key = (doc_id, materia_raw.lower(), grupo_norm, prog_id)
        if key not in asig_data or horas_q > asig_data[key]['horas_q']:
            asig_data[key] = {
                'docente_id':    doc_id,
                'docente_str':   docente_raw,
                'materia_nombre': materia_raw,
                'grupo':         grupo_norm,
                'prog_id':       prog_id,
                'modalidad':     get_modalidad(grupo_norm),
                'horas_sem':     horas_sem,
                'horas_q':       horas_q,
                'tarifa':        PROG_COSTO.get(prog_id, 0),
            }

    print(f"  Asignaciones virtuales únicas: {len(asig_data)}")
    print(f"  Filas vacías omitidas: {skip_count}")
    if sin_match:
        uniq = sorted(set(sin_match))
        print(f"  Sin match docente ({len(uniq)}):")
        for s in uniq[:20]:
            print(f"    {s}")

    # Resumen por programa
    from collections import Counter
    prog_count = Counter(d['prog_id'] for d in asig_data.values())
    for pid, n in sorted(prog_count.items()):
        print(f"  prog_id={pid}: {n} asignaciones")

    # ── PASO 2: Desactivar EA26 legacy ─────────────────────────────────────
    print("\n[PASO 1/3] Desactivando asignaciones legacy (grupo 'EA26 ...')...")
    if not dry_run:
        cur.execute("""
            UPDATE horario_clases hc SET activo = false
            FROM asignaciones a
            WHERE hc.asignacion_id = a.id
              AND a.grupo LIKE 'EA26 %%'
              AND a.activa = true
        """)
        n_hc = cur.rowcount
        cur.execute("""
            UPDATE asignaciones SET activa = false
            WHERE grupo LIKE 'EA26 %%' AND activa = true
        """)
        n_asig = cur.rowcount
        print(f"  Desactivadas: {n_asig} asignaciones, {n_hc} horario_clases")
    else:
        cur.execute("SELECT COUNT(*) AS n FROM asignaciones WHERE grupo LIKE 'EA26 %%' AND activa=true")
        n = cur.fetchone()['n']
        print(f"  [DRY] Se desactivarían {n} asignaciones EA26")

    # ── PASO 3: Crear asignaciones virtuales ────────────────────────────────
    print("\n[PASO 2/3] Creando asignaciones virtuales desde Excel...")
    created   = 0
    updated   = 0
    skipped   = 0
    new_asig_index = {}   # (doc_id, mat_id, grupo_norm) → asig_id

    for key, data in asig_data.items():
        doc_id  = data['docente_id']
        prog_id = data['prog_id']
        mat_nom = data['materia_nombre']
        grupo   = data['grupo']

        # Resolver materia_id
        mat_k  = (prog_id, mat_nom.lower())
        mat_id = mat_index.get(mat_k)
        if not mat_id:
            # Fuzzy por nombre dentro del mismo programa
            candidatos = [(n, mid) for (p, n), mid in mat_index.items() if p == prog_id]
            mejor_s, mejor_id = 0.0, None
            for n, mid in candidatos:
                s = SequenceMatcher(None, mat_nom.lower(), n).ratio()
                if s > mejor_s:
                    mejor_s, mejor_id = s, mid
            if mejor_s >= 0.75:
                mat_id = mejor_id
                mat_index[mat_k] = mat_id   # cache
            else:
                if not dry_run:
                    cur.execute(
                        "INSERT INTO materias (nombre, programa_id) VALUES (%s,%s) RETURNING id",
                        (mat_nom, prog_id)
                    )
                    mat_id = cur.fetchone()['id']
                    mat_index[mat_k] = mat_id
                    print(f"  Nueva materia: {mat_nom!r}  (prog_id={prog_id})")
                else:
                    print(f"  [DRY] Sin materia: {mat_nom!r}  (prog={prog_id}, similar={mejor_s:.2f})")
                    continue

        idx_key = (doc_id, mat_id, grupo)

        # Verificar si ya existe
        cur.execute("""
            SELECT id, modalidad, horas_semana FROM asignaciones
            WHERE docente_id=%s AND materia_id=%s AND grupo=%s AND ciclo=%s AND activa=true
        """, (doc_id, mat_id, grupo, CICLO))
        existing = cur.fetchone()

        if existing:
            new_asig_index[idx_key] = existing['id']
            # Corregir modalidad si es presencial (el PDF la crea como presencial, pero puede ser mixta)
            if existing['modalidad'] == 'presencial' and data['modalidad'] in ('virtual', 'mixta'):
                if not dry_run:
                    cur.execute(
                        "UPDATE asignaciones SET modalidad=%s WHERE id=%s",
                        (data['modalidad'], existing['id'])
                    )
                updated += 1
            else:
                skipped += 1
            continue

        if not dry_run:
            cur.execute("""
                INSERT INTO asignaciones
                    (docente_id, materia_id, grupo, ciclo, activa, costo_hora, modalidad, horas_semana)
                VALUES (%s,%s,%s,%s,true,%s,%s,%s)
                RETURNING id
            """, (doc_id, mat_id, grupo, CICLO,
                  data['tarifa'], data['modalidad'], data['horas_sem']))
            asig_id = cur.fetchone()['id']
            new_asig_index[idx_key] = asig_id
            created += 1
        else:
            created += 1   # contar en dry-run

    print(f"  Creadas:           {created}")
    print(f"  Modalidad corregida: {updated}")
    print(f"  Ya existían (OK):  {skipped}")

    # ── PASO 4: Re-enlazar EVR/EVS ──────────────────────────────────────────
    # Índices adicionales para fallbacks
    # (doc_id, grupo_norm) → [(mat_id, asig_id), ...]  — para buscar por docente+grupo
    by_doc_grupo = {}
    for (d, m, g), aid in new_asig_index.items():
        key2 = (d, g)
        by_doc_grupo.setdefault(key2, []).append((m, aid))

    # mat_id → nombre (para fuzzy match materia cuando hay varios candidatos)
    mat_by_id = {m['id']: m['nombre'] for m in materias_db}

    def find_new_asig(doc_id, old_mat_id, grupo_norm):
        """
        Búsqueda con 3 niveles de fallback:
        1. (doc_id, mat_id_old, grupo_norm)    — match exacto
        2. (doc_id, mat_id_old)  sin grupo     — mismo mat en cualquier grupo
        3. (doc_id, grupo_norm)  sin mat_id    — mismo grupo, mejor materia por fuzzy
        """
        # Nivel 1
        aid = new_asig_index.get((doc_id, old_mat_id, grupo_norm))
        if aid:
            return aid, 1

        # Nivel 2: mismo docente+materia cualquier grupo
        for (d, m, g), aid in new_asig_index.items():
            if d == doc_id and m == old_mat_id:
                return aid, 2

        # Nivel 3: mismo docente+grupo, mejor materia por nombre
        candidatos = by_doc_grupo.get((doc_id, grupo_norm), [])
        if not candidatos:
            return None, 0
        if len(candidatos) == 1:
            return candidatos[0][1], 3

        old_mat_nom = mat_by_id.get(old_mat_id, '')
        mejor_s, mejor_aid = 0.0, None
        for (mat_id_c, aid_c) in candidatos:
            cand_nom = mat_by_id.get(mat_id_c, '')
            s = SequenceMatcher(None, old_mat_nom.lower(), cand_nom.lower()).ratio()
            if s > mejor_s:
                mejor_s, mejor_aid = s, aid_c
        return (mejor_aid, 3) if mejor_s >= 0.30 else (None, 0)

    print("\n[PASO 3/3] Re-enlazando evaluacion_virtual_resultado...")
    cur.execute("""
        SELECT evr.id, evr.quincena_id, evr.docente_id, evr.asignacion_id,
               a.grupo    AS grupo_old,
               a.materia_id,
               a.activa   AS asig_activa
        FROM evaluacion_virtual_resultado evr
        LEFT JOIN asignaciones a ON evr.asignacion_id = a.id
    """)
    evr_rows = list(cur.fetchall())

    # Conjunto para detectar duplicados: (quincena_id, docente_id, asignacion_id)
    evr_existentes = {(r['quincena_id'], r['docente_id'], r['asignacion_id']) for r in evr_rows}

    relinked_evr = 0
    ya_ok_evr    = 0
    borrados_evr = 0
    no_match_evr = []
    fallback_evr = [0, 0, 0]

    for evr in evr_rows:
        doc_id     = evr['docente_id']
        old_mat_id = evr['materia_id']
        grupo_norm = normalizar_grupo_viejo(evr['grupo_old'] or '')

        new_asig_id, nivel = find_new_asig(doc_id, old_mat_id, grupo_norm)

        if not new_asig_id:
            no_match_evr.append(
                f"EVR id={evr['id']} doc={doc_id} mat={old_mat_id} grupo='{evr['grupo_old']}'"
            )
            continue

        if new_asig_id == evr['asignacion_id']:
            ya_ok_evr += 1
            continue

        # Verificar si ya existe otro EVR para (quincena_id, docente_id, new_asig_id)
        target_key = (evr['quincena_id'], doc_id, new_asig_id)
        if target_key in evr_existentes:
            # Ya existe → eliminar este duplicado
            if not dry_run:
                cur.execute("DELETE FROM evaluacion_virtual_resultado WHERE id=%s", (evr['id'],))
            borrados_evr += 1
            evr_existentes.discard((evr['quincena_id'], doc_id, evr['asignacion_id']))
            continue

        if not dry_run:
            cur.execute(
                "UPDATE evaluacion_virtual_resultado SET asignacion_id=%s WHERE id=%s",
                (new_asig_id, evr['id'])
            )
        # Actualizar conjunto en memoria
        evr_existentes.discard((evr['quincena_id'], doc_id, evr['asignacion_id']))
        evr_existentes.add(target_key)
        relinked_evr += 1
        if nivel <= 3:
            fallback_evr[nivel - 1] += 1

    print(f"  Re-enlazados: {relinked_evr}  (nivel1={fallback_evr[0]} nivel2={fallback_evr[1]} nivel3={fallback_evr[2]})")
    print(f"  Ya OK:        {ya_ok_evr}")
    print(f"  Sin match:    {len(no_match_evr)}")
    if no_match_evr:
        print("  Sin match (primeros 10):")
        for s in no_match_evr[:10]:
            print(f"    {s}")

    print("\nRe-enlazando evaluacion_virtual_semana...")
    cur.execute("""
        SELECT evs.id, evs.docente_id, evs.asignacion_id,
               evs.quincena_id, evs.semana_num,
               a.grupo    AS grupo_old,
               a.materia_id
        FROM evaluacion_virtual_semana evs
        LEFT JOIN asignaciones a ON evs.asignacion_id = a.id
    """)
    evs_rows = list(cur.fetchall())

    # Conjunto de claves existentes (quincena_id, docente_id, asignacion_id, semana_num)
    evs_existentes = {
        (r['quincena_id'], r['docente_id'], r['asignacion_id'], r['semana_num'])
        for r in evs_rows
    }

    relinked_evs = 0
    ya_ok_evs    = 0
    no_match_evs = 0
    borrados_evs = 0

    for evs in evs_rows:
        doc_id     = evs['docente_id']
        old_mat_id = evs['materia_id']
        grupo_norm = normalizar_grupo_viejo(evs['grupo_old'] or '')

        new_asig_id, _ = find_new_asig(doc_id, old_mat_id, grupo_norm)

        if not new_asig_id:
            no_match_evs += 1
            continue

        if new_asig_id == evs['asignacion_id']:
            ya_ok_evs += 1
            continue

        target_key = (evs['quincena_id'], doc_id, new_asig_id, evs['semana_num'])
        if target_key in evs_existentes:
            # Ya existe el destino → borrar este duplicado
            if not dry_run:
                cur.execute("DELETE FROM evaluacion_virtual_semana WHERE id=%s", (evs['id'],))
            borrados_evs += 1
            evs_existentes.discard((evs['quincena_id'], doc_id, evs['asignacion_id'], evs['semana_num']))
            continue

        if not dry_run:
            cur.execute(
                "UPDATE evaluacion_virtual_semana SET asignacion_id=%s WHERE id=%s",
                (new_asig_id, evs['id'])
            )
        evs_existentes.discard((evs['quincena_id'], doc_id, evs['asignacion_id'], evs['semana_num']))
        evs_existentes.add(target_key)
        relinked_evs += 1

    print(f"  Re-enlazados: {relinked_evs}  Ya OK: {ya_ok_evs}  Sin match: {no_match_evs}  Borrados (dup): {borrados_evs}")

    # ── Guardar / rollback ──────────────────────────────────────────────────
    if not dry_run:
        conn.commit()
        print("\n✓ Todos los cambios guardados.")
        print("\nPróximo paso: recalcular nómina desde la interfaz o via API.")
    else:
        conn.rollback()
        print("\n--- DRY RUN — sin cambios en la base de datos ---")

    cur.close()
    conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Importa asignaciones virtuales desde Excel de Educación Virtual'
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Muestra qué haría sin modificar la BD')
    args = parser.parse_args()
    main(dry_run=args.dry_run)
