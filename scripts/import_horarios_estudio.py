"""
Importa horarios desde los 4 archivos Excel de eStudy.
Estrategia: reemplaza asignaciones + horario_clases de los programas cubiertos
(todos excepto Bachillerato, que no está en estos archivos).

Columnas Excel: Nombre docente | CURP | Día semana | Hora inicio | Hora fin |
                Asignatura | Grupo | Programa educativo | Adscripción
"""
import sys; sys.stdout.reconfigure(encoding='utf-8')
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import psycopg2
from psycopg2.extras import RealDictCursor
from difflib import SequenceMatcher
from datetime import datetime, time
import re
import openpyxl

DB_URL = 'postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina'
CICLO  = '2026-1'

ARCHIVOS = [
    # Ciclo actual (2026-1): estos 3 archivos cubren la quincena Mar 11-25
    r'C:\Users\Admin\Downloads\Reporte horarios Enero Abril 2026.xlsx',    # LENA, Esp, Maestrías, Nutrición cuatrimestral
    r'C:\Users\Admin\Downloads\Reporte horarios Febrero Julio 2026.xlsx',  # Enfermería, Nutrición semestral
    r'C:\Users\Admin\Downloads\Reporte horarios Marzo Julio 2026.xlsx',    # LENA nuevo grupo
    # Excluido: agosto 2025 - enero 2026 (ciclo anterior, ya terminó)
    # r'C:\Users\Admin\Downloads\Reporte horarios agosto 2025 enero 2026.xlsx',
]

# Mapeo de nombres de programa del Excel → programa_id en DB
# Se normaliza quitando prefijo numérico tipo "08_", "13_", etc.
PROG_MAP = {
    # Bachillerato (se carga pero se excluye por PROGRAMAS_A_REIMPORTAR)
    'bachillerato general':              1,
    # Licenciatura Enfermería
    'licenciatura en enfermería':        2,
    # Nutrición (con y sin prefijo numérico)
    'nutrición':                         3,
    'nutricion':                         3,
    # LENA
    'enfermería (nivelación académica)': 4,
    'enfermeria (nivelacion academica)': 4,
    # Especialidades — todas las subespecialidades van al mismo programa_id=5
    'especialidad en administración y docencia de los servicios de enfermería': 5,
    'especialidad en enfermeria geriatrica': 5,
    'especialidad en enfermería perinatal': 5,
    'especialidad en enfermería quirúrgica': 5,
    'especialidad en enfermería en cuidados intensivos': 5,
    'especialidad en enfermería geriátrica': 5,
    # Maestrías — todas las maestrías van al mismo programa_id=6
    'salud pública':                     6,
    'salud publica':                     6,
    'docencia para la educación media superior y superior': 6,
    'gestión y dirección de instituciones de salud': 6,
    'gestion y direccion de instituciones de salud': 6,
}

# Programas que sí se reemplazan (excluir Bachillerato=1 porque no hay archivo actual)
PROGRAMAS_A_REIMPORTAR = {2, 3, 4, 5, 6}

DIA_MAP = {
    'LUNES': 'lunes', 'MARTES': 'martes', 'MIERCOLES': 'miercoles',
    'MIÉRCOLES': 'miercoles', 'JUEVES': 'jueves', 'VIERNES': 'viernes',
    'SABADO': 'sabado', 'SÁBADO': 'sabado',
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def quitar_acentos(s):
    return (s.replace('é','e').replace('É','E')
             .replace('í','i').replace('Í','I')
             .replace('ó','o').replace('Ó','O')
             .replace('á','a').replace('Á','A')
             .replace('ú','u').replace('Ú','U')
             .replace('ñ','n').replace('Ñ','N'))

def normalizar_programa(nombre):
    if not nombre:
        return None
    # Quitar prefijo numérico tipo "08_", "13_", "24_"
    n = re.sub(r'^\d+_', '', str(nombre)).strip()
    n = quitar_acentos(n).lower()
    return n

def get_prog_id(nombre):
    n = normalizar_programa(nombre)
    if n is None:
        return None
    # Coincidencia exacta primero
    if n in PROG_MAP:
        return PROG_MAP[n]
    # Coincidencia parcial (substring)
    for k, v in PROG_MAP.items():
        if k in n or n in k:
            return v
    # Palabras clave específicas
    if 'bachillerato' in n:
        return 1
    if 'enfermeria' in n and 'nivelacion' not in n and 'especialidad' not in n:
        return 2
    if 'nutricion' in n or 'nutrición' in n:
        return 3
    if 'nivelacion' in n or 'nivelación' in n:
        return 4
    if 'especialidad' in n:
        return 5
    if 'salud publica' in n or 'docencia' in n or 'gestion' in n or 'maestria' in n:
        return 6
    return None

def parse_time(val):
    if val is None:
        return None
    if isinstance(val, time):
        return val
    if isinstance(val, datetime):
        return val.time()
    s = str(val).strip()
    for fmt in ('%H:%M:%S', '%H:%M'):
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            pass
    return None

TITULOS = {'dra','dr','mtra','mtro','lic','enf','l.e','m.s.p','m.a.h.s.p',
           'l.n','l.c.e','l.biol','med','cir','m.c.a','m.biotec','ing',
           'dra.','dr.','mtra.','mtro.','lic.','enf.','l.e.','m.s.p.'}

def normalizar_nombre(nombre):
    """Quita títulos académicos y ordena palabras alfabéticamente para comparación."""
    palabras = nombre.strip().split()
    filtradas = [p for p in palabras if p.lower().rstrip('.') not in TITULOS]
    return ' '.join(sorted(filtradas, key=str.lower)).lower()

def sim(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def sim_norm(a, b):
    """Similitud usando nombres normalizados (sin títulos, orden alfabético)."""
    return SequenceMatcher(None, normalizar_nombre(a), normalizar_nombre(b)).ratio()

def buscar_por_nombre(nombre, docentes_list):
    """Fallback cuando no hay CURP: fuzzy match con normalización de nombre."""
    mejor_id, mejor_score = None, 0.0
    for d in docentes_list:
        s = sim_norm(nombre, d['nombre_completo'])
        if s > mejor_score:
            mejor_score = s
            mejor_id = d['id']
    return mejor_id if mejor_score >= 0.60 else None, mejor_score

# ── Leer Excel ─────────────────────────────────────────────────────────────────

def leer_archivo(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    # Detectar header (buscar fila con 'CURP' o 'Nombre docente')
    header_idx = 0
    for i, row in enumerate(rows[:5]):
        vals = [str(v or '').upper() for v in row]
        if any('CURP' in v or 'NOMBRE' in v for v in vals):
            header_idx = i
            break

    headers = [str(v or '').strip().lower() for v in rows[header_idx]]

    def col(kw):
        for j, h in enumerate(headers):
            if kw in h:
                return j
        return None

    c_nombre  = col('nombre') or 0
    c_curp    = col('curp')
    c_dia     = col('día') or col('dia')
    c_inicio  = col('inicio')
    c_fin     = col('fin')
    c_asig    = col('asignatura')
    c_grupo   = col('grupo')
    c_prog    = col('programa')

    registros = []
    for row in rows[header_idx+1:]:
        nombre = str(row[c_nombre] or '').strip() if c_nombre is not None else ''
        if not nombre or nombre.upper() == 'NOMBRE DOCENTE':
            continue
        curp   = str(row[c_curp]   or '').strip().upper() if c_curp   is not None else ''
        dia    = str(row[c_dia]    or '').strip().upper()  if c_dia    is not None else ''
        inicio = parse_time(row[c_inicio]) if c_inicio is not None else None
        fin    = parse_time(row[c_fin])    if c_fin    is not None else None
        asig   = str(row[c_asig]   or '').strip() if c_asig   is not None else ''
        grupo  = str(row[c_grupo]  or '').strip() if c_grupo  is not None else ''
        prog   = str(row[c_prog]   or '').strip() if c_prog   is not None else ''

        if not dia or not inicio or not fin:
            continue

        dia_norm = DIA_MAP.get(dia)
        if not dia_norm:
            continue

        prog_id = get_prog_id(prog)
        if not prog_id:
            continue  # programa desconocido

        # Calcular horas del bloque
        mins = (fin.hour*60+fin.minute) - (inicio.hour*60+inicio.minute)
        if mins <= 0:
            continue
        horas_bloque = round(mins / 60, 2)

        registros.append({
            'nombre': nombre,
            'curp':   curp if len(curp) == 18 else '',
            'dia':    dia_norm,
            'inicio': inicio,
            'fin':    fin,
            'horas':  horas_bloque,
            'asig':   asig,
            'grupo':  grupo,
            'prog_id': prog_id,
        })

    return registros

# ── Agrupar por asignación ─────────────────────────────────────────────────────

def agrupar_asignaciones(registros):
    """
    Agrupa los registros por (curp/nombre, asignatura, grupo, prog_id).
    Devuelve lista de { docente_key, prog_id, asig_nombre, grupo, dias: [...] }.
    """
    asigs = {}
    for r in registros:
        key = (r['curp'] or r['nombre'], r['asig'], r['grupo'], r['prog_id'])
        if key not in asigs:
            asigs[key] = {
                'curp':     r['curp'],
                'nombre':   r['nombre'],
                'prog_id':  r['prog_id'],
                'asig':     r['asig'],
                'grupo':    r['grupo'],
                'dias':     [],
            }
        asigs[key]['dias'].append({
            'dia':    r['dia'],
            'inicio': r['inicio'],
            'fin':    r['fin'],
            'horas':  r['horas'],
        })
    return list(asigs.values())

# ── Importar ───────────────────────────────────────────────────────────────────

def main(dry_run=False):
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    cur  = conn.cursor(cursor_factory=RealDictCursor)

    # Cargar docentes
    cur.execute("SELECT id, nombre_completo, curp FROM docentes WHERE activo=true")
    docentes = cur.fetchall()
    by_curp   = {d['curp'].strip().upper(): d['id'] for d in docentes if d['curp'] and len(d['curp'].strip())==18}

    # Cargar materias existentes por programa
    cur.execute("SELECT id, nombre, programa_id FROM materias ORDER BY programa_id, nombre")
    materias_db = cur.fetchall()
    # por (prog_id, nombre_lower) → materia_id
    mat_index = {(m['programa_id'], m['nombre'].lower()): m['id'] for m in materias_db}

    # Leer todos los archivos
    print("Leyendo archivos Excel...")
    todos_registros = []
    for path in ARCHIVOS:
        recs = leer_archivo(path)
        prog_ids = set(r['prog_id'] for r in recs)
        print(f"  {os.path.basename(path)}: {len(recs)} filas, progs={sorted(prog_ids)}")
        todos_registros.extend(recs)

    # Solo programas a reimportar
    registros_activos = [r for r in todos_registros if r['prog_id'] in PROGRAMAS_A_REIMPORTAR]
    print(f"\nTotal filas a importar (progs {PROGRAMAS_A_REIMPORTAR}): {len(registros_activos)}")

    asignaciones = agrupar_asignaciones(registros_activos)
    print(f"Asignaciones únicas: {len(asignaciones)}")

    if dry_run:
        print("\n--- DRY RUN (sin cambios en DB) ---")
        sin_match_list = []
        for a in asignaciones:
            doc_id = by_curp.get(a['curp'])
            if not doc_id:
                doc_id, score = buscar_por_nombre(a['nombre'], docentes)
                if not doc_id:
                    sin_match_list.append(a)
        print(f"Sin match de docente: {len(sin_match_list)}")
        for a in sin_match_list:
            print(f"  prog={a['prog_id']}  {a['nombre']}  CURP={a['curp']}")
        conn.close()
        return

    # ── 1. Desactivar horarios y asignaciones de los programas a reimportar ──
    print(f"\nDesactivando horarios existentes para progs {PROGRAMAS_A_REIMPORTAR}...")
    cur.execute("""
        UPDATE horario_clases hc
        SET activo = false
        FROM asignaciones a
        JOIN materias m ON a.materia_id = m.id
        WHERE hc.asignacion_id = a.id
          AND a.ciclo = %s
          AND m.programa_id = ANY(%s)
          AND hc.activo = true
    """, (CICLO, list(PROGRAMAS_A_REIMPORTAR)))
    n_hc_off = cur.rowcount
    print(f"  {n_hc_off} horario_clases desactivados")

    cur.execute("""
        UPDATE asignaciones a
        SET activa = false
        FROM materias m
        WHERE a.materia_id = m.id
          AND a.ciclo = %s
          AND m.programa_id = ANY(%s)
          AND a.activa = true
    """, (CICLO, list(PROGRAMAS_A_REIMPORTAR)))
    n_asig_off = cur.rowcount
    print(f"  {n_asig_off} asignaciones desactivadas")

    # ── 2. Crear asignaciones y horarios nuevos ──────────────────────────────
    creados_asig = creados_hc = sin_match = sin_materia = 0
    prog_costo = {1:120, 2:140, 3:130, 4:160, 5:200, 6:220}

    for asig in asignaciones:
        # Resolver docente
        doc_id = by_curp.get(asig['curp'])
        if not doc_id:
            doc_id, score = buscar_por_nombre(asig['nombre'], docentes)
            if not doc_id:
                sin_match += 1
                print(f"  ❓ Sin docente: {asig['nombre']}  CURP={asig['curp']}")
                continue

        prog_id  = asig['prog_id']
        asig_nom = asig['asig']
        grupo    = asig['grupo']
        tarifa   = prog_costo.get(prog_id, 0)

        # Resolver materia (buscar o crear)
        mat_key = (prog_id, asig_nom.lower())
        mat_id  = mat_index.get(mat_key)
        if not mat_id:
            # Buscar por similitud
            candidatos = [(k, v) for k, v in mat_index.items() if k[0] == prog_id]
            mejor_k, mejor_v, mejor_s = None, None, 0.0
            for (pk, mn), mid in candidatos:
                s = sim(asig_nom.lower(), mn)
                if s > mejor_s:
                    mejor_s = s
                    mejor_k = (pk, mn)
                    mejor_v = mid
            if mejor_v and mejor_s >= 0.75:
                mat_id = mejor_v
            else:
                # Crear materia nueva
                cur.execute("""
                    INSERT INTO materias (nombre, programa_id) VALUES (%s, %s) RETURNING id
                """, (asig_nom, prog_id))
                mat_id = cur.fetchone()['id']
                mat_index[mat_key] = mat_id
                sin_materia += 1

        # Crear asignación
        cur.execute("""
            INSERT INTO asignaciones (docente_id, materia_id, grupo, ciclo, activa, costo_hora,
                                      modalidad, horas_semana)
            VALUES (%s, %s, %s, %s, true, %s, 'presencial', %s)
            RETURNING id
        """, (doc_id, mat_id, grupo, CICLO, tarifa,
              sum(d['horas'] for d in asig['dias'])))
        new_asig_id = cur.fetchone()['id']
        creados_asig += 1

        # Crear horario_clases por día
        for dia in asig['dias']:
            mins = (dia['fin'].hour*60+dia['fin'].minute) - (dia['inicio'].hour*60+dia['inicio'].minute)
            horas_bloque = round(mins / 60, 2)
            cur.execute("""
                INSERT INTO horario_clases (asignacion_id, dia_semana, hora_inicio, hora_fin, horas_bloque, activo)
                VALUES (%s, %s, %s, %s, %s, true)
            """, (new_asig_id, dia['dia'], dia['inicio'], dia['fin'], horas_bloque))
            creados_hc += 1

    conn.commit()
    cur.close(); conn.close()

    print(f"\n{'='*60}")
    print(f"Asignaciones creadas:    {creados_asig}")
    print(f"Horario_clases creados:  {creados_hc}")
    print(f"Materias nuevas:         {sin_materia}")
    print(f"Sin match de docente:    {sin_match}")
    print(f"{'='*60}")

if __name__ == '__main__':
    import sys
    dry = '--dry-run' in sys.argv
    main(dry_run=dry)
