"""
comparar_pdf_vs_db.py
Compara los docentes en el PDF de horarios con los docentes activos en la DB.
Muestra:
  1. Docentes en PDF sin match en DB (posibles errores de nombre)
  2. Docentes en DB con asignaciones activas que NO están en el PDF
  3. Docentes activos en DB sin ninguna asignación activa
"""
import sys, os, re
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pdfplumber
import psycopg2
from psycopg2.extras import RealDictCursor
from difflib import SequenceMatcher
from datetime import time

PDF_PATH = r'C:\Users\Admin\Downloads\HORARIOS.pdf'
DB_URL   = 'postgresql://nomina_user:IESEFnomina%402026$@localhost:5432/iesef_nomina'
UMBRAL   = 0.60   # score mínimo para considerar match

# ─── Config (copiada de importar_horarios_pdf.py) ────────────────────────────
TITULOS = {
    'dra','dr','mtra','mtro','lic','enf','ing','med','cir',
    'l.e','m.s.p','l.n','l.c.e','m.c','m.a','m.t.i','m.ped',
    'l.e.e','l.e.f','m.c.b.y.s','m.a.g.s.s','m.m','m.d','m.d.m.s.y.s',
    'l.biol','l.h.mex','lic.der','lic.psic','ing.biom','ing.quim',
    'l.q.a','med.cir','m.c.s','ll.r.p.c',
}
PREFIJOS = {
    'PREPA': {'prog_id':1,'dias':None},
    'LEE':   {'prog_id':2,'dias':None},
    'LNUTE': {'prog_id':3,'dias':None},
    'LNUT':  {'prog_id':3,'dias':None},
    'LNUTS': {'prog_id':3,'dias':{'sabado'}},
    'LENA':  {'prog_id':4,'dias':{'sabado'}},
    'EEQ':   {'prog_id':5,'dias':{'sabado'}},
    'EECI':  {'prog_id':5,'dias':{'sabado'}},
    'EEP':   {'prog_id':5,'dias':{'sabado'}},
    'EEG':   {'prog_id':5,'dias':{'sabado'}},
    'EADSE': {'prog_id':5,'dias':set()},
    'MSP':   {'prog_id':6,'dias':set()},
    'MGDIS': {'prog_id':6,'dias':set()},
    'MDIE':  {'prog_id':6,'dias':set()},
}
DIAS_COLUMNAS = ['lunes','martes','miercoles','jueves','viernes','sabado']

# ─── Helpers ─────────────────────────────────────────────────────────────────
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

def sim_norm(a, b):
    return SequenceMatcher(None, normalizar_nombre(a), normalizar_nombre(b)).ratio()

def es_linea_docente(linea):
    l = linea.strip()
    if re.match(r'^[A-Z][a-z]?\.', l): return True
    if re.match(r'^(Ing|Lic|Med|Dra?|Mtr[ao]|Enf|L\.N|L\.E)\b', l, re.I): return True
    if l.isupper() and len(l) > 5: return True
    return False

def parsear_celda(contenido):
    if not contenido or not contenido.strip(): return None, None
    lineas = [l.strip() for l in contenido.split('\n') if l.strip()]
    if not lineas: return None, None
    if len(lineas) == 1:
        return (None, lineas[0]) if es_linea_docente(lineas[0]) else (lineas[0], None)
    split_idx = None
    for i, l in enumerate(lineas):
        if es_linea_docente(l):
            split_idx = i
            break
    if split_idx is None:
        materia  = ' '.join(lineas[:-1])
        docente  = lineas[-1]
    else:
        materia  = ' '.join(lineas[:split_idx]).strip() if split_idx > 0 else None
        docente  = ' '.join(lineas[split_idx:]).strip()
    return materia or None, docente or None

def detectar_grupo(page_text):
    lines = [l.strip() for l in page_text.split('\n') if l.strip()]
    for i, line in enumerate(lines):
        if re.search(
            r'(ENERO|FEBRERO|MARZO|AGOSTO|SEPTIEMBRE|OCTUBRE)\s*[-\u2013]\s*'
            r'(ENERO|FEBRERO|MARZO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|DICIEMBRE)',
            line, re.I
        ):
            if i + 1 < len(lines): return lines[i+1].strip()
    for line in lines[:15]:
        if re.match(r'^[A-Z]{2,8}\s+\d+[\xb0o]\d+', line): return line
    return None

def detectar_prefijo(grupo):
    if not grupo: return None
    m = re.match(r'^([A-Z]+)', grupo)
    if m:
        prefix = m.group(1)
        for p in sorted(PREFIJOS.keys(), key=len, reverse=True):
            if prefix == p or prefix.startswith(p): return p
    return None

def parse_tiempo(label):
    nums = re.findall(r'\d{1,2}:\d{2}', label)
    if len(nums) >= 2:
        def t(s):
            h, m = map(int, s.split(':'))
            return time(h, m)
        return t(nums[0]), t(nums[-1])
    return None, None

def parsear_pagina(page):
    text = page.extract_text() or ''
    grupo = detectar_grupo(text)
    prefijo = detectar_prefijo(grupo)
    if not prefijo or prefijo not in PREFIJOS: return grupo, None, []
    dias_presenciales = PREFIJOS[prefijo]['dias']
    tables = page.extract_tables()
    if not tables: return grupo, prefijo, []
    tabla = max(tables, key=lambda t: len(t) * len(t[0]) if t else 0)
    header = [str(c or '').strip().lower() for c in tabla[0]]
    if 'lunes' not in header and 'martes' not in header: return grupo, prefijo, []
    col_dia = {}
    for j, h in enumerate(header):
        h_norm = quitar_acentos(h).lower().strip()
        for d in DIAS_COLUMNAS:
            if d in h_norm:
                col_dia[j] = d
                break
    bloques = []
    for col_idx, dia_nombre in col_dia.items():
        if dias_presenciales is not None and dia_nombre not in dias_presenciales: continue
        bloque_actual = None
        for fila in tabla[1:]:
            label = str(fila[0] or '').strip()
            t_ini, t_fin = parse_tiempo(label)
            if t_ini is None: continue
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
                        bloques.append({
                            'dia': dia_nombre,
                            'materia': bloque_actual['materia'],
                            'docente': bloque_actual['docente'],
                        })
                    bloque_actual = {'hora_inicio':t_ini,'hora_fin':t_fin,
                                     'materia':materia,'docente':docente}
            else:
                if bloque_actual:
                    bloques.append({'dia':dia_nombre,'materia':bloque_actual['materia'],
                                    'docente':bloque_actual['docente']})
                    bloque_actual = None
        if bloque_actual:
            bloques.append({'dia':dia_nombre,'materia':bloque_actual['materia'],
                            'docente':bloque_actual['docente']})
    return grupo, prefijo, bloques


# ─── Extraer docentes del PDF ─────────────────────────────────────────────────
print('Parseando PDF...')
nombres_pdf = set()
grupos_por_docente = {}

with pdfplumber.open(PDF_PATH) as pdf:
    print(f'  {len(pdf.pages)} paginas')
    for page in pdf.pages:
        grupo, prefijo, bloques = parsear_pagina(page)
        for b in bloques:
            nombre = b.get('docente')
            if nombre:
                nombres_pdf.add(nombre)
                grupos_por_docente.setdefault(nombre, set()).add(grupo or '?')

print(f'  Docentes unicos extraidos del PDF: {len(nombres_pdf)}')

# ─── Cargar docentes de la DB ─────────────────────────────────────────────────
conn = psycopg2.connect(DB_URL)
cur  = conn.cursor(cursor_factory=RealDictCursor)

cur.execute('SELECT id, nombre_completo FROM docentes WHERE activo=true ORDER BY nombre_completo')
docentes_db = list(cur.fetchall())
by_norm = {normalizar_nombre(d['nombre_completo']): d for d in docentes_db}

# Docentes con asignaciones activas
cur.execute('''
    SELECT DISTINCT d.id, d.nombre_completo
    FROM docentes d
    JOIN asignaciones a ON a.docente_id = d.id
    WHERE a.activa = true AND d.activo = true
    ORDER BY d.nombre_completo
''')
con_asig = {r['id']: r['nombre_completo'] for r in cur.fetchall()}

# Docentes SIN asignaciones activas
cur.execute('''
    SELECT d.id, d.nombre_completo
    FROM docentes d
    WHERE d.activo = true
      AND NOT EXISTS (
        SELECT 1 FROM asignaciones a WHERE a.docente_id = d.id AND a.activa = true
      )
    ORDER BY d.nombre_completo
''')
sin_asig = list(cur.fetchall())
conn.close()

print(f'  Docentes en DB con asignaciones activas: {len(con_asig)}')
print(f'  Docentes en DB SIN asignaciones activas: {len(sin_asig)}')

# ─── Match PDF → DB ────────────────────────────────────────────────────────────
print()
pdf_matched_ids = set()   # IDs de DB que aparecen en el PDF
sin_match_pdf   = []      # Nombres en PDF sin match en DB

for nombre_pdf in sorted(nombres_pdf):
    norm = normalizar_nombre(nombre_pdf)
    if norm in by_norm:
        pdf_matched_ids.add(by_norm[norm]['id'])
    else:
        # Fuzzy
        mejor_id, mejor_score = None, 0.0
        for d in docentes_db:
            s = sim_norm(nombre_pdf, d['nombre_completo'])
            if s > mejor_score:
                mejor_score = s
                mejor_id = d['id']
        if mejor_score >= UMBRAL:
            pdf_matched_ids.add(mejor_id)
        else:
            mejor_nombre = next((d['nombre_completo'] for d in docentes_db if d['id']==mejor_id), '?')
            sin_match_pdf.append((nombre_pdf, mejor_score, mejor_nombre,
                                   sorted(grupos_por_docente[nombre_pdf])))

# ─── Resultado 1: PDF sin match en DB ─────────────────────────────────────────
print(f'[1] Docentes en PDF sin match en DB (score < {UMBRAL}): {len(sin_match_pdf)}')
for nombre, score, candidato, grupos in sorted(sin_match_pdf, key=lambda x: -x[1]):
    print(f'    score={score:.2f}  PDF: "{nombre}"')
    print(f'           grupos: {grupos}')
    print(f'           mejor candidato DB: "{candidato}"')

# ─── Resultado 2: DB con asignaciones activas pero NO en PDF ───────────────────
db_no_en_pdf = {id_: nombre for id_, nombre in con_asig.items()
                if id_ not in pdf_matched_ids}
print(f'\n[2] Docentes en DB con asignaciones activas pero AUSENTES del PDF: {len(db_no_en_pdf)}')
for nombre in sorted(db_no_en_pdf.values()):
    print(f'    {nombre}')

# ─── Resultado 3: Sin asignaciones ────────────────────────────────────────────
print(f'\n[3] Docentes activos en DB sin NINGUNA asignacion activa: {len(sin_asig)}')
for d in sin_asig:
    print(f'    {d["nombre_completo"]}')

print()
print(f'Resumen:')
print(f'  PDF docentes: {len(nombres_pdf)}')
print(f'  PDF matcheados en DB: {len(pdf_matched_ids)}')
print(f'  DB con asignaciones: {len(con_asig)}')
print(f'  DB SIN asignaciones (activos): {len(sin_asig)}')
print(f'  Recomendacion: dar de baja a los {len(sin_asig)} sin asignaciones')
print(f'  Y revisar los {len(db_no_en_pdf)} ausentes del PDF')
