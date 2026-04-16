"""
Importa horarios desde el PDF de aSc Horarios generado por Coord. Docente.
Este PDF es la FUENTE DE VERDAD — reemplaza completamente los horarios de eStudy.

Estrategia de modalidad por prefijo de grupo:
  PREPA, LEE, LNUTE, LNUT  → todos los días = presencial
  LNUTS (Nutrición Sabatina) → solo sábado = presencial
  LENA                       → solo sábado = presencial (viernes = virtual)
  EEQ, EECI, EEP, EEG        → solo sábado = presencial (L-V = virtual)
  EADSE, MSP, MGDIS, MDIE    → 100% virtual, NO se importan bloques

Uso:
  python importar_horarios_pdf.py --dry-run      # muestra qué haría sin cambios
  python importar_horarios_pdf.py                # limpia e importa
  python importar_horarios_pdf.py --aprobar-maestrias  # también aprueba Q3 Maestrías
"""
import sys, os, re, argparse
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import time
from difflib import SequenceMatcher

try:
    import pdfplumber
except ImportError:
    print("ERROR: pip install pdfplumber")
    sys.exit(1)

# ── Configuración ───────────────────────────────────────────────────────────────

DB_URL    = 'postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina'
PDF_PATH  = r'C:\Users\Admin\Downloads\HORARIOS.pdf'
CICLO     = '2026-1'
QUINCENA_MAESTRIAS = 3   # quincena ID para aprobar maestrías

# Grupos a ignorar (pruebas / datos internos)
GRUPOS_IGNORAR = {'PRUEBA', 'INTERNO', 'TEST'}

# Prefijo → {prog_id, dias_presenciales}
# dias_presenciales: None = todos; set() = ninguno; {'sabado'} = solo sábado
PREFIJOS = {
    'PREPA':  {'prog_id': 1, 'dias': None},
    'LEE':    {'prog_id': 2, 'dias': None},
    'LNUTE':  {'prog_id': 3, 'dias': None},
    'LNUT':   {'prog_id': 3, 'dias': None},       # grupos históricos
    'LNUTS':  {'prog_id': 3, 'dias': {'sabado'}}, # Nutrición Sabatina
    'LENA':   {'prog_id': 4, 'dias': {'sabado'}},
    'EEQ':    {'prog_id': 5, 'dias': {'sabado'}},
    'EECI':   {'prog_id': 5, 'dias': {'sabado'}},
    'EEP':    {'prog_id': 5, 'dias': {'sabado'}},
    'EEG':    {'prog_id': 5, 'dias': {'sabado'}},
    # 100% virtual → NO importar bloques
    'EADSE':  {'prog_id': 5, 'dias': set()},
    'MSP':    {'prog_id': 6, 'dias': set()},
    'MGDIS':  {'prog_id': 6, 'dias': set()},
    'MDIE':   {'prog_id': 6, 'dias': set()},
}

PROG_COSTO = {1: 120, 2: 140, 3: 130, 4: 160, 5: 200, 6: 220}

DIAS_COLUMNAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

# Títulos académicos a ignorar en fuzzy match de docentes
TITULOS = {
    'dra','dr','mtra','mtro','lic','enf','ing','med','cir',
    'l.e','m.s.p','l.n','l.c.e','m.c','m.a','m.t.i','m.ped',
    'l.e.e','l.e.f','m.c.b.y.s','m.a.g.s.s','m.m','m.d','m.d.m.s.y.s',
    'l.biol','l.h.mex','lic.der','lic.psic','ing.biom','ing.quim',
    'l.q.a','med.cir','m.c.s','ll.r.p.c',
}

# ── Parseo del PDF ──────────────────────────────────────────────────────────────

def quitar_acentos(s):
    return (s.replace('á','a').replace('é','e').replace('í','i')
             .replace('ó','o').replace('ú','u').replace('ñ','n')
             .replace('Á','A').replace('É','E').replace('Í','I')
             .replace('Ó','O').replace('Ú','U').replace('Ñ','N'))

def normalizar_nombre(nombre):
    """Quita títulos y ordena palabras para fuzzy match."""
    palabras = nombre.strip().split()
    filtradas = [p for p in palabras
                 if p.lower().rstrip('.').rstrip(',') not in TITULOS
                 and not re.match(r'^[A-Z]\.$', p)]   # single capital letter abbreviation
    return ' '.join(sorted(filtradas, key=str.lower)).lower()

def sim_norm(a, b):
    return SequenceMatcher(None, normalizar_nombre(a), normalizar_nombre(b)).ratio()

def parse_tiempo(label):
    """'7:00 -7 8:00' → (time(7,0), time(8,0))"""
    nums = re.findall(r'\d{1,2}:\d{2}', label)
    if len(nums) >= 2:
        def t(s):
            h, m = map(int, s.split(':'))
            return time(h, m)
        return t(nums[0]), t(nums[-1])
    return None, None

def es_linea_docente(linea):
    """Detecta si una línea es el nombre del docente (empieza con título/abreviatura)."""
    l = linea.strip()
    # Patrones de títulos: "L.E.", "M.C.", "Ing.", "Dr.", "Lic.", "Med."
    if re.match(r'^[A-Z][a-z]?\.', l):          # ej. "L.E.", "M.C.", "Dr."
        return True
    if re.match(r'^(Ing|Lic|Med|Dra?|Mtr[ao]|Enf|L\.N|L\.E)\b', l, re.I):
        return True
    if l.isupper() and len(l) > 5:              # nombre en mayúsculas
        return True
    return False

def parsear_celda(contenido):
    """
    Divide 'Materia\\nDocente' (con posible salto en medio de cada uno).
    Devuelve (materia, docente) o (None, None) si está vacía.
    """
    if not contenido or not contenido.strip():
        return None, None

    lineas = [l.strip() for l in contenido.split('\n') if l.strip()]
    if not lineas:
        return None, None
    if len(lineas) == 1:
        # Solo una línea: ¿es docente o materia?
        return (None, lineas[0]) if es_linea_docente(lineas[0]) else (lineas[0], None)

    # Buscar primera línea que sea docente
    split_idx = None
    for i, l in enumerate(lineas):
        if es_linea_docente(l):
            split_idx = i
            break

    if split_idx is None:
        # Todas son materia (sin docente identificado): última línea podría ser docente
        materia  = ' '.join(lineas[:-1])
        docente  = lineas[-1]
    else:
        materia  = ' '.join(lineas[:split_idx]).strip() if split_idx > 0 else None
        docente  = ' '.join(lineas[split_idx:]).strip()

    return materia or None, docente or None

def detectar_grupo(page_text):
    """Extrae el nombre del grupo de la página (ej. 'PREPA 2°1', 'LEE 1°1')."""
    lines = [l.strip() for l in page_text.split('\n') if l.strip()]
    # Buscar línea después del período (FEBRERO - JULIO 2026, etc.)
    for i, line in enumerate(lines):
        if re.search(r'(ENERO|FEBRERO|MARZO|AGOSTO|SEPTIEMBRE|OCTUBRE)\s*[-–]\s*'
                     r'(ENERO|FEBRERO|MARZO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|DICIEMBRE)',
                     line, re.I):
            if i + 1 < len(lines):
                return lines[i + 1].strip()
    # Fallback: buscar línea con patrón de grupo
    for line in lines[:15]:
        if re.match(r'^[A-Z]{2,8}\s+\d+[°o]\d+', line):
            return line
    return None

def detectar_prefijo(grupo):
    """Extrae el prefijo del nombre del grupo, ej. 'LNUTS 1°1' → 'LNUTS'."""
    if not grupo:
        return None
    # Ignorar grupos de prueba
    upper = grupo.upper()
    for kw in GRUPOS_IGNORAR:
        if kw in upper:
            return None
    # Match prefijo
    m = re.match(r'^([A-Z]+)', grupo)
    if m:
        prefix = m.group(1)
        # Buscar match por prefijo más largo primero
        for p in sorted(PREFIJOS.keys(), key=len, reverse=True):
            if prefix.startswith(p) or p.startswith(prefix):
                if prefix == p or prefix.startswith(p):
                    return p
    return None

def parsear_pagina(page):
    """
    Extrae (grupo, prefijo, bloques) de una página del PDF.
    bloques: [{dia, hora_inicio, hora_fin, horas_bloque, materia, docente_nombre}]
    """
    text   = page.extract_text() or ''
    grupo  = detectar_grupo(text)
    prefijo = detectar_prefijo(grupo)

    if not prefijo or prefijo not in PREFIJOS:
        return grupo, None, []

    config = PREFIJOS[prefijo]
    dias_presenciales = config['dias']  # None=todos, set()=ninguno, {'sabado'}=solo sábado

    tables = page.extract_tables()
    if not tables:
        return grupo, prefijo, []

    # Tomar la tabla más grande (la del horario)
    tabla = max(tables, key=lambda t: len(t) * len(t[0]) if t else 0)

    # Verificar que tenga la estructura esperada (primera fila = días)
    header = [str(c or '').strip().lower() for c in tabla[0]]
    if 'lunes' not in header and 'martes' not in header:
        return grupo, prefijo, []

    # Mapear columna → nombre del día
    col_dia = {}
    for j, h in enumerate(header):
        h_norm = quitar_acentos(h).lower().strip()
        for d in DIAS_COLUMNAS:
            if d in h_norm:
                col_dia[j] = d
                break

    # Parsear filas de horario
    # Cada fila es una franja horaria de 1h
    # Bloques contiguos (misma materia+docente en filas consecutivas) se fusionan
    bloques = []
    for col_idx, dia_nombre in col_dia.items():
        # Filtrar por días presenciales
        if dias_presenciales is not None and dia_nombre not in dias_presenciales:
            continue  # Este día no es presencial, saltar

        bloque_actual = None  # {hora_inicio, hora_fin, materia, docente}

        for fila in tabla[1:]:  # saltar header
            # Leer hora de la primera columna
            label = str(fila[0] or '').strip()
            t_ini, t_fin = parse_tiempo(label)
            if t_ini is None:
                continue

            # Contenido de la celda para este día
            celda = str(fila[col_idx] or '').strip() if col_idx < len(fila) else ''
            materia, docente = parsear_celda(celda)

            if materia and docente:
                # ¿Continúa el bloque anterior?
                if (bloque_actual
                        and bloque_actual['materia'] == materia
                        and bloque_actual['docente'] == docente
                        and bloque_actual['hora_fin'] == t_ini):
                    # Extender bloque
                    bloque_actual['hora_fin'] = t_fin
                else:
                    # Guardar bloque anterior
                    if bloque_actual:
                        bloques.append(_finalizar_bloque(bloque_actual, dia_nombre, grupo))
                    bloque_actual = {
                        'hora_inicio': t_ini,
                        'hora_fin':    t_fin,
                        'materia':     materia,
                        'docente':     docente,
                    }
            else:
                # Celda vacía → cerrar bloque actual
                if bloque_actual:
                    bloques.append(_finalizar_bloque(bloque_actual, dia_nombre, grupo))
                    bloque_actual = None

        # Cerrar el último bloque de la columna
        if bloque_actual:
            bloques.append(_finalizar_bloque(bloque_actual, dia_nombre, grupo))

    return grupo, prefijo, bloques

def _finalizar_bloque(b, dia, grupo):
    h_ini = b['hora_inicio']
    h_fin = b['hora_fin']
    mins  = (h_fin.hour * 60 + h_fin.minute) - (h_ini.hour * 60 + h_ini.minute)
    return {
        'dia':         dia,
        'hora_inicio': h_ini,
        'hora_fin':    h_fin,
        'horas_bloque': max(1, round(mins / 60)),
        'materia':     b['materia'],
        'docente':     b['docente'],
    }

# ── Match de docentes ────────────────────────────────────────────────────────────

def buscar_docente(nombre_pdf, docentes_db, by_nombre):
    """Busca docente en DB por fuzzy match de nombre."""
    # Intentar exacto primero
    norm = normalizar_nombre(nombre_pdf)
    if norm in by_nombre:
        return by_nombre[norm], 1.0

    # Fuzzy
    mejor_id, mejor_score = None, 0.0
    for d in docentes_db:
        s = sim_norm(nombre_pdf, d['nombre_completo'])
        if s > mejor_score:
            mejor_score = s
            mejor_id = d['id']
    if mejor_score >= 0.60:
        return mejor_id, mejor_score
    return None, mejor_score

# ── Import a DB ──────────────────────────────────────────────────────────────────

def limpiar_horarios(cur, prog_ids_limpiar):
    """Elimina horario_clases y asignaciones de los programas indicados."""
    # Desactivar horario_clases
    cur.execute("""
        UPDATE horario_clases hc
        SET activo = false
        FROM asignaciones a
        JOIN materias m ON a.materia_id = m.id
        WHERE hc.asignacion_id = a.id
          AND a.ciclo = %s
          AND m.programa_id = ANY(%s)
          AND hc.activo = true
    """, (CICLO, prog_ids_limpiar))
    n_hc = cur.rowcount

    # Desactivar asignaciones
    cur.execute("""
        UPDATE asignaciones a
        SET activa = false
        FROM materias m
        WHERE a.materia_id = m.id
          AND a.ciclo = %s
          AND m.programa_id = ANY(%s)
          AND a.activa = true
    """, (CICLO, prog_ids_limpiar))
    n_asig = cur.rowcount

    return n_hc, n_asig

def limpiar_evaluaciones_incorrectas(cur):
    """Elimina registros de evaluacion_virtual_resultado para programas no-virtuales (Nutrición presencial)."""
    # Nutrición (prog_id=3) no es virtual excepto LNUTS. Los registros de evaluacion virtual
    # para Nutrición son datos incorrectos de pruebas anteriores.
    cur.execute("""
        DELETE FROM evaluacion_virtual_resultado evr
        WHERE EXISTS (
            SELECT 1 FROM asignaciones a
            JOIN materias m ON a.materia_id = m.id
            WHERE a.id = evr.asignacion_id
              AND m.programa_id = 3
        )
    """)
    n = cur.rowcount
    return n

def aprobar_maestrias(cur, quincena_id):
    """Aprueba todos los evaluacion_virtual_resultado de Maestrías para la quincena."""
    cur.execute("""
        UPDATE evaluacion_virtual_resultado evr
        SET aprobada = true,
            horas_reales_a_pagar = evr.horas_quincena,
            monto_a_pagar = evr.horas_quincena * evr.tarifa
        FROM asignaciones a
        JOIN materias m ON a.materia_id = m.id
        WHERE evr.asignacion_id = a.id
          AND m.programa_id = 6
          AND evr.quincena_id = %s
          AND evr.aprobada = false
    """, (quincena_id,))
    return cur.rowcount

def importar(pdf_path, dry_run=False, aprobar_mae=False):
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    cur  = conn.cursor()

    # Cargar docentes
    cur.execute("SELECT id, nombre_completo FROM docentes WHERE activo=true")
    docentes_db = cur.fetchall()
    by_nombre = {normalizar_nombre(d['nombre_completo']): d['id'] for d in docentes_db}

    # Cargar materias existentes
    cur.execute("SELECT id, nombre, programa_id FROM materias")
    materias_db = cur.fetchall()
    mat_index = {(m['programa_id'], m['nombre'].lower()): m['id'] for m in materias_db}

    print("Leyendo PDF...")
    all_bloques = []  # (grupo, prefijo, bloque)
    sin_prefijo = []
    paginas_vacias = 0

    with pdfplumber.open(pdf_path) as pdf:
        print(f"  {len(pdf.pages)} páginas")
        for i, page in enumerate(pdf.pages):
            grupo, prefijo, bloques = parsear_pagina(page)
            if prefijo is None:
                if grupo:
                    sin_prefijo.append(f"p{i+1}: {grupo}")
                continue
            config = PREFIJOS[prefijo]
            if not config['dias'] and config['dias'] is not None:
                # set() vacío = 100% virtual, omitir
                paginas_vacias += 1
                continue
            for b in bloques:
                b['grupo'] = grupo
                b['prefijo'] = prefijo
                b['prog_id'] = config['prog_id']
            all_bloques.extend([(grupo, prefijo, b) for b in bloques])

    print(f"  Bloques presenciales extraídos: {len(all_bloques)}")
    print(f"  Páginas 100% virtual (omitidas): {paginas_vacias}")
    if sin_prefijo:
        print(f"  Páginas sin prefijo reconocido ({len(sin_prefijo)}): {sin_prefijo[:5]}")

    # Estadísticas
    prog_stats = {}
    sin_match  = []
    for grupo, prefijo, b in all_bloques:
        pid = b['prog_id']
        prog_stats[pid] = prog_stats.get(pid, 0) + 1
        doc_id, score = buscar_docente(b['docente'], docentes_db, by_nombre)
        if doc_id is None:
            sin_match.append(f"  {b['docente']} ({grupo}) score={score:.2f}")

    print("\nBloques por programa:")
    for pid, n in sorted(prog_stats.items()):
        print(f"  prog_id={pid}  {n} bloques")

    # Deduplicar sin_match
    sin_match_uniq = sorted(set(sin_match))
    if sin_match_uniq:
        print(f"\nSin match ({len(sin_match_uniq)}) — primeros 15:")
        for s in sin_match_uniq[:15]:
            print(s)

    if dry_run:
        print("\n--- DRY RUN, sin cambios en DB ---")
        conn.close()
        return

    # ── LIMPIEZA ──
    # Limpiar programas presenciales (1-4) y sábados de especialidades (5)
    # NO limpiar Maestrías (6) porque tienen evaluacion_virtual_resultado
    prog_limpiar = [1, 2, 3, 4, 5]
    print(f"\nLimpiando horarios existentes (prog_ids {prog_limpiar})...")
    n_hc, n_asig = limpiar_horarios(cur, prog_limpiar)
    print(f"  {n_hc} horario_clases desactivados")
    print(f"  {n_asig} asignaciones desactivadas")

    n_ev_bad = limpiar_evaluaciones_incorrectas(cur)
    print(f"  {n_ev_bad} evaluaciones virtuales incorrectas eliminadas (Nutrición)")

    if aprobar_mae:
        n_mae = aprobar_maestrias(cur, QUINCENA_MAESTRIAS)
        print(f"  {n_mae} Maestrías aprobadas en quincena {QUINCENA_MAESTRIAS}")

    # ── IMPORTAR ──
    print("\nImportando bloques del PDF...")
    creados_asig = creados_hc = sin_match_final = nuevas_mat = 0

    # Agrupar bloques por (docente_id, materia, grupo, prog_id)
    from collections import defaultdict
    asig_bloques = defaultdict(list)
    asig_meta    = {}

    for grupo, prefijo, b in all_bloques:
        doc_id, score = buscar_docente(b['docente'], docentes_db, by_nombre)
        if doc_id is None:
            sin_match_final += 1
            continue

        pid   = b['prog_id']
        mat_k = (pid, b['materia'].lower())
        key   = (doc_id, b['materia'].lower(), grupo, pid)

        asig_meta[key]  = {'doc_id': doc_id, 'pid': pid, 'materia': b['materia'], 'grupo': grupo}
        asig_bloques[key].append({
            'dia':          b['dia'],
            'hora_inicio':  b['hora_inicio'],
            'hora_fin':     b['hora_fin'],
            'horas_bloque': b['horas_bloque'],
        })

    for key, meta in asig_meta.items():
        doc_id = meta['doc_id']
        pid    = meta['pid']
        grupo  = meta['grupo']
        mat_nom = meta['materia']
        tarifa = PROG_COSTO.get(pid, 0)

        # Resolver materia
        mat_k  = (pid, mat_nom.lower())
        mat_id = mat_index.get(mat_k)
        if not mat_id:
            # Buscar por similitud
            candidatos = [(n, mid) for (p, n), mid in mat_index.items() if p == pid]
            mejor_n, mejor_id, mejor_s = None, None, 0.0
            for n, mid in candidatos:
                s = SequenceMatcher(None, mat_nom.lower(), n).ratio()
                if s > mejor_s:
                    mejor_s = s
                    mejor_n = n
                    mejor_id = mid
            if mejor_s >= 0.80:
                mat_id = mejor_id
            else:
                cur.execute(
                    "INSERT INTO materias (nombre, programa_id) VALUES (%s, %s) RETURNING id",
                    (mat_nom, pid)
                )
                mat_id = cur.fetchone()['id']
                mat_index[mat_k] = mat_id
                nuevas_mat += 1

        # Calcular horas_semana
        horas_sem = sum(b['horas_bloque'] for b in asig_bloques[key])

        # Crear asignación
        cur.execute("""
            INSERT INTO asignaciones
                (docente_id, materia_id, grupo, ciclo, activa, costo_hora, modalidad, horas_semana)
            VALUES (%s, %s, %s, %s, true, %s, 'presencial', %s)
            RETURNING id
        """, (doc_id, mat_id, grupo, CICLO, tarifa, horas_sem))
        asig_id = cur.fetchone()['id']
        creados_asig += 1

        # Crear horario_clases
        for b in asig_bloques[key]:
            cur.execute("""
                INSERT INTO horario_clases
                    (asignacion_id, dia_semana, hora_inicio, hora_fin, horas_bloque, activo)
                VALUES (%s, %s, %s, %s, %s, true)
            """, (asig_id, b['dia'], b['hora_inicio'], b['hora_fin'], b['horas_bloque']))
            creados_hc += 1

    conn.commit()
    cur.close()
    conn.close()

    print(f"\n{'='*60}")
    print(f"Asignaciones creadas:    {creados_asig}")
    print(f"Horario_clases creados:  {creados_hc}")
    print(f"Materias nuevas:         {nuevas_mat}")
    print(f"Sin match docente:       {sin_match_final}")
    print(f"{'='*60}")

# ── Main ────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--dry-run', action='store_true')
    p.add_argument('--aprobar-maestrias', action='store_true')
    args = p.parse_args()

    importar(
        pdf_path    = PDF_PATH,
        dry_run     = args.dry_run,
        aprobar_mae = args.aprobar_maestrias,
    )
