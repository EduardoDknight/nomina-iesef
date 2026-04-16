"""
Servicio de importación de horarios desde PDF de aSc Horarios.

Toda la lógica de parseo y carga está aquí.
El endpoint en routers/catalogos.py lo invoca pasando pdf_bytes + ciclo + conn.
"""
import io
import re
from collections import defaultdict
from datetime import time
from difflib import SequenceMatcher

try:
    import pdfplumber
except ImportError:
    raise ImportError("pdfplumber es necesario: pip install pdfplumber")

# ── Constantes ───────────────────────────────────────────────────────────────

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
    # 100% virtual → NO importar bloques presenciales
    'EADSE':  {'prog_id': 5, 'dias': set()},
    'MSP':    {'prog_id': 6, 'dias': set()},
    'MGDIS':  {'prog_id': 6, 'dias': set()},
    'MDIE':   {'prog_id': 6, 'dias': set()},
}

PROG_COSTO = {1: 120, 2: 140, 3: 130, 4: 160, 5: 200, 6: 220}

PROG_NOMBRE = {
    1: 'Bachillerato',
    2: 'Licenciatura en Enfermería',
    3: 'Licenciatura en Nutrición',
    4: 'LENA',
    5: 'Especialidades',
    6: 'Maestrías',
}

DIAS_COLUMNAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

# Títulos académicos a quitar en fuzzy match de docentes
TITULOS = {
    'dra', 'dr', 'mtra', 'mtro', 'lic', 'enf', 'ing', 'med', 'cir',
    'l.e', 'm.s.p', 'l.n', 'l.c.e', 'm.c', 'm.a', 'm.t.i', 'm.ped',
    'l.e.e', 'l.e.f', 'm.c.b.y.s', 'm.a.g.s.s', 'm.m', 'm.d', 'm.d.m.s.y.s',
    'l.biol', 'l.h.mex', 'lic.der', 'lic.psic', 'ing.biom', 'ing.quim',
    'l.q.a', 'med.cir', 'm.c.s', 'll.r.p.c',
}

# ── Helpers de texto ─────────────────────────────────────────────────────────

def quitar_acentos(s):
    return (s.replace('á', 'a').replace('é', 'e').replace('í', 'i')
             .replace('ó', 'o').replace('ú', 'u').replace('ñ', 'n')
             .replace('Á', 'A').replace('É', 'E').replace('Í', 'I')
             .replace('Ó', 'O').replace('Ú', 'U').replace('Ñ', 'N'))


def normalizar_nombre(nombre):
    """Quita títulos y ordena palabras para fuzzy match."""
    palabras = nombre.strip().split()
    filtradas = [p for p in palabras
                 if p.lower().rstrip('.').rstrip(',') not in TITULOS
                 and not re.match(r'^[A-Z]\.$', p)]
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
    if re.match(r'^[A-Z][a-z]?\.', l):
        return True
    if re.match(r'^(Ing|Lic|Med|Dra?|Mtr[ao]|Enf|L\.N|L\.E)\b', l, re.I):
        return True
    if l.isupper() and len(l) > 5:
        return True
    return False


def parsear_celda(contenido):
    """
    Divide 'Materia\\nDocente'.
    Devuelve (materia, docente) o (None, None) si está vacía.
    """
    if not contenido or not contenido.strip():
        return None, None

    lineas = [l.strip() for l in contenido.split('\n') if l.strip()]
    if not lineas:
        return None, None
    if len(lineas) == 1:
        return (None, lineas[0]) if es_linea_docente(lineas[0]) else (lineas[0], None)

    split_idx = None
    for i, l in enumerate(lineas):
        if es_linea_docente(l):
            split_idx = i
            break

    if split_idx is None:
        materia = ' '.join(lineas[:-1])
        docente = lineas[-1]
    else:
        materia = ' '.join(lineas[:split_idx]).strip() if split_idx > 0 else None
        docente = ' '.join(lineas[split_idx:]).strip()

    return materia or None, docente or None


def detectar_grupo(page_text):
    """Extrae el nombre del grupo de la página (ej. 'PREPA 2°1', 'LEE 1°1')."""
    lines = [l.strip() for l in page_text.split('\n') if l.strip()]
    for i, line in enumerate(lines):
        if re.search(r'(ENERO|FEBRERO|MARZO|AGOSTO|SEPTIEMBRE|OCTUBRE)\s*[-–]\s*'
                     r'(ENERO|FEBRERO|MARZO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|DICIEMBRE)',
                     line, re.I):
            if i + 1 < len(lines):
                return lines[i + 1].strip()
    for line in lines[:15]:
        if re.match(r'^[A-Z]{2,8}\s+\d+[°o]\d+', line):
            return line
    return None


def detectar_prefijo(grupo):
    """Extrae el prefijo del nombre del grupo, ej. 'LNUTS 1°1' → 'LNUTS'."""
    if not grupo:
        return None
    upper = grupo.upper()
    for kw in GRUPOS_IGNORAR:
        if kw in upper:
            return None
    m = re.match(r'^([A-Z]+)', grupo)
    if m:
        prefix = m.group(1)
        for p in sorted(PREFIJOS.keys(), key=len, reverse=True):
            if prefix == p or prefix.startswith(p):
                return p
    return None


def _finalizar_bloque(b, dia, grupo):
    h_ini = b['hora_inicio']
    h_fin = b['hora_fin']
    mins = (h_fin.hour * 60 + h_fin.minute) - (h_ini.hour * 60 + h_ini.minute)
    return {
        'dia':          dia,
        'hora_inicio':  h_ini,
        'hora_fin':     h_fin,
        'horas_bloque': max(1, round(mins / 60)),
        'materia':      b['materia'],
        'docente':      b['docente'],
    }


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
    dias_presenciales = config['dias']

    tables = page.extract_tables()
    if not tables:
        return grupo, prefijo, []

    tabla = max(tables, key=lambda t: len(t) * len(t[0]) if t else 0)

    header = [str(c or '').strip().lower() for c in tabla[0]]
    if 'lunes' not in header and 'martes' not in header:
        return grupo, prefijo, []

    col_dia = {}
    for j, h in enumerate(header):
        h_norm = quitar_acentos(h).lower().strip()
        for d in DIAS_COLUMNAS:
            if d in h_norm:
                col_dia[j] = d
                break

    bloques = []
    for col_idx, dia_nombre in col_dia.items():
        if dias_presenciales is not None and dia_nombre not in dias_presenciales:
            continue

        bloque_actual = None

        for fila in tabla[1:]:
            label = str(fila[0] or '').strip()
            t_ini, t_fin = parse_tiempo(label)
            if t_ini is None:
                continue

            celda = str(fila[col_idx] or '').strip() if col_idx < len(fila) else ''
            materia, docente = parsear_celda(celda)

            if materia and docente:
                if (bloque_actual
                        and bloque_actual['materia'] == materia
                        and bloque_actual['docente'] == docente
                        and bloque_actual['hora_fin'] == t_ini):
                    bloque_actual['hora_fin'] = t_fin
                else:
                    if bloque_actual:
                        bloques.append(_finalizar_bloque(bloque_actual, dia_nombre, grupo))
                    bloque_actual = {
                        'hora_inicio': t_ini,
                        'hora_fin':    t_fin,
                        'materia':     materia,
                        'docente':     docente,
                    }
            else:
                if bloque_actual:
                    bloques.append(_finalizar_bloque(bloque_actual, dia_nombre, grupo))
                    bloque_actual = None

        if bloque_actual:
            bloques.append(_finalizar_bloque(bloque_actual, dia_nombre, grupo))

    return grupo, prefijo, bloques


# ── Match de docentes ─────────────────────────────────────────────────────────

def buscar_docente(nombre_pdf, docentes_db, by_nombre):
    """Busca docente en DB por fuzzy match de nombre."""
    norm = normalizar_nombre(nombre_pdf)
    if norm in by_nombre:
        return by_nombre[norm], 1.0

    mejor_id, mejor_score = None, 0.0
    for d in docentes_db:
        s = sim_norm(nombre_pdf, d['nombre_completo'])
        if s > mejor_score:
            mejor_score = s
            mejor_id = d['id']
    if mejor_score >= 0.60:
        return mejor_id, mejor_score
    return None, mejor_score


# ── Limpieza de horarios existentes ──────────────────────────────────────────

def limpiar_horarios(cur, ciclo, prog_ids_limpiar):
    """Desactiva horario_clases y asignaciones de los programas indicados para el ciclo."""
    cur.execute("""
        UPDATE horario_clases hc
        SET activo = false
        FROM asignaciones a
        JOIN materias m ON a.materia_id = m.id
        WHERE hc.asignacion_id = a.id
          AND a.ciclo_label = %s
          AND m.programa_id = ANY(%s)
          AND hc.activo = true
    """, (ciclo, prog_ids_limpiar))
    n_hc = cur.rowcount

    cur.execute("""
        UPDATE asignaciones a
        SET activa = false
        FROM materias m
        WHERE a.materia_id = m.id
          AND a.ciclo_label = %s
          AND m.programa_id = ANY(%s)
          AND a.activa = true
    """, (ciclo, prog_ids_limpiar))
    n_asig = cur.rowcount

    return n_hc, n_asig


# ── Función principal ─────────────────────────────────────────────────────────

def procesar_pdf(
    pdf_bytes: bytes,
    ciclo: str,
    conn,
    dry_run: bool = True,
) -> dict:
    """
    Parsea el PDF de aSc Horarios e importa opcionalmente a la BD.

    Args:
        pdf_bytes: Contenido del PDF como bytes.
        ciclo: Identificador del ciclo académico, ej. '2026-1'.
        conn: Conexión psycopg2 activa (sin cursor). El commit lo hace el llamador.
        dry_run: Si True, solo analiza sin tocar la BD.

    Returns:
        dict con estadísticas del proceso.
    """
    from psycopg2.extras import RealDictCursor

    cur = conn.cursor(cursor_factory=RealDictCursor)

    # ── Cargar datos de DB ──
    cur.execute("SELECT id, nombre_completo FROM docentes WHERE activo = true")
    docentes_db = cur.fetchall()
    by_nombre = {normalizar_nombre(d['nombre_completo']): d['id'] for d in docentes_db}

    cur.execute("SELECT id, nombre, programa_id FROM materias")
    materias_db = cur.fetchall()
    mat_index = {(m['programa_id'], m['nombre'].lower()): m['id'] for m in materias_db}

    # ── Parsear PDF ──
    all_bloques = []   # lista de (grupo, prefijo, bloque_dict)
    sin_prefijo = []
    grupos_virtuales = 0

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        total_paginas = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            grupo, prefijo, bloques = parsear_pagina(page)
            if prefijo is None:
                if grupo:
                    sin_prefijo.append(f"p{i + 1}: {grupo}")
                continue
            config = PREFIJOS[prefijo]
            # set() vacío = 100% virtual → omitir
            if isinstance(config['dias'], set) and len(config['dias']) == 0:
                grupos_virtuales += 1
                continue
            for b in bloques:
                b['grupo']   = grupo
                b['prefijo'] = prefijo
                b['prog_id'] = config['prog_id']
            all_bloques.extend([(grupo, prefijo, b) for b in bloques])

    # ── Recopilar estadísticas y sin_match ──
    prog_stats: dict = {}
    sin_match_set: set = set()

    for grupo, prefijo, b in all_bloques:
        pid = b['prog_id']
        prog_stats[pid] = prog_stats.get(pid, 0) + 1
        doc_id, score = buscar_docente(b['docente'], docentes_db, by_nombre)
        if doc_id is None:
            sin_match_set.add(f"{b['docente']} ({grupo}) score={score:.2f}")

    # Programas con nombre legible
    programas_resultado = {
        PROG_NOMBRE.get(pid, f'prog_id={pid}'): n
        for pid, n in sorted(prog_stats.items())
    }

    resultado = {
        'grupos_procesados':       len({g for g, _, _ in all_bloques}),
        'grupos_virtuales_omitidos': grupos_virtuales,
        'grupos_sin_prefijo':      len(sin_prefijo),
        'bloques_extraidos':       len(all_bloques),
        'asignaciones_creadas':    0,
        'horarios_creados':        0,
        'materias_nuevas':         0,
        'sin_match':               sorted(sin_match_set),
        'sin_prefijo':             sin_prefijo,
        'programas':               programas_resultado,
    }

    if dry_run:
        cur.close()
        return resultado

    # ── LIMPIEZA ──
    # Limpiar programas 1-5 (NO 6=Maestrías porque tienen evaluacion_virtual_resultado)
    prog_limpiar = [1, 2, 3, 4, 5]
    limpiar_horarios(cur, ciclo, prog_limpiar)

    # ── IMPORTAR ──
    creados_asig = 0
    creados_hc   = 0
    nuevas_mat   = 0
    sin_match_final = 0

    # Agrupar bloques por (docente_id, materia_lower, grupo, prog_id)
    asig_bloques: dict = defaultdict(list)
    asig_meta:    dict = {}

    for grupo, prefijo, b in all_bloques:
        doc_id, score = buscar_docente(b['docente'], docentes_db, by_nombre)
        if doc_id is None:
            sin_match_final += 1
            continue

        pid    = b['prog_id']
        key    = (doc_id, b['materia'].lower(), grupo, pid)

        asig_meta[key] = {
            'doc_id':  doc_id,
            'pid':     pid,
            'materia': b['materia'],
            'grupo':   grupo,
        }
        asig_bloques[key].append({
            'dia':          b['dia'],
            'hora_inicio':  b['hora_inicio'],
            'hora_fin':     b['hora_fin'],
            'horas_bloque': b['horas_bloque'],
        })

    for key, meta in asig_meta.items():
        doc_id  = meta['doc_id']
        pid     = meta['pid']
        grupo   = meta['grupo']
        mat_nom = meta['materia']
        tarifa  = PROG_COSTO.get(pid, 0)

        # Resolver materia (exacta → fuzzy ≥ 0.80 → crear nueva)
        mat_k  = (pid, mat_nom.lower())
        mat_id = mat_index.get(mat_k)
        if not mat_id:
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
                (docente_id, materia_id, grupo, ciclo_label, activa, costo_hora,
                 modalidad, horas_semana, vigente_desde, vigente_hasta)
            VALUES (%s, %s, %s, %s, true, %s, 'presencial', %s, CURRENT_DATE, NULL)
            RETURNING id
        """, (doc_id, mat_id, grupo, ciclo, tarifa, horas_sem))
        asig_id = cur.fetchone()['id']
        creados_asig += 1

        # Crear bloques de horario
        for b in asig_bloques[key]:
            cur.execute("""
                INSERT INTO horario_clases
                    (asignacion_id, dia_semana, hora_inicio, hora_fin, horas_bloque, activo)
                VALUES (%s, %s, %s, %s, %s, true)
            """, (asig_id, b['dia'], b['hora_inicio'], b['hora_fin'],
                  max(1, b['horas_bloque'])))
            creados_hc += 1

    cur.close()

    resultado['asignaciones_creadas'] = creados_asig
    resultado['horarios_creados']     = creados_hc
    resultado['materias_nuevas']      = nuevas_mat
    # Actualizar sin_match con el conteo real de la importación
    resultado['sin_match_count_import'] = sin_match_final

    return resultado
