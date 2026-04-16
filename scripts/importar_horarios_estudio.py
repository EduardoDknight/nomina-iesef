"""
Importador de horarios desde reporte eStudy.
Lee el xlsx exportado por eStudy ("Reporte horarios") y pobla:
  materias, asignaciones, horario_clases

Uso:
    python scripts/importar_horarios_estudio.py <ruta_xlsx> --ciclo 2026-1 [--dry-run]

Columnas esperadas del xlsx (hoja ReporteGeneral):
  Nombre docente | CURP | Dia de la semana | Hora de inicio | Hora de fin
  Asignatura | Grupo | Programa educativo | Adscripcion
"""

import sys
import re
import unicodedata
import argparse
from collections import defaultdict
import openpyxl
import psycopg2
from psycopg2.extras import RealDictCursor

# ── Mapeo eStudy programa → programa_id en BD ────────────────────────────────
# Clave: fragmento normalizado del nombre de programa en eStudy
PROG_MAP = [
    # ⚠️ Orden importa: fragmentos más específicos primero
    ('bachillerato',                  1, 'presencial'),
    # Especialidades (contienen "enfermería" — deben ir antes)
    ('administracion y docencia de los servicios', 5, 'virtual'),  # ADSE
    ('especialidad',                  5, 'mixta'),
    # LENA (contiene "enfermería" — antes que Licenciatura en Enfermería)
    ('nivelacion academica',          4, 'mixta'),
    ('licenciatura en enfermeria',    2, 'presencial'),
    ('enfermeria',                    2, 'presencial'),  # catch-all enfermería
    ('nutricion',                     3, 'mixta'),
    ('salud publica',                 6, 'virtual'),
    ('docencia para la educacion',    6, 'virtual'),
    ('gestion y direccion',           6, 'virtual'),
    ('maestria',                      6, 'virtual'),
]

DIA_MAP = {
    'lunes':     'lunes',
    'martes':    'martes',
    'miercoles': 'miercoles',
    'jueves':    'jueves',
    'viernes':   'viernes',
    'sabado':    'sabado',
}


def norm(texto: str) -> str:
    if not texto:
        return ''
    nfkd = unicodedata.normalize('NFD', str(texto))
    sin_tildes = ''.join(c for c in nfkd if unicodedata.category(c) != 'Mn')
    return sin_tildes.lower().strip()


def map_programa(nombre_estudio: str) -> tuple[int, str] | tuple[None, None]:
    n = norm(nombre_estudio)
    for fragmento, prog_id, modalidad in PROG_MAP:
        if fragmento in n:
            return prog_id, modalidad
    return None, None


def parse_time(t) -> str | None:
    if t is None:
        return None
    s = str(t).strip()
    # Handle 'HH:MM:SS' or 'HH:MM'
    m = re.match(r'(\d{1,2}):(\d{2})', s)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    return None


def horas_bloque(inicio: str, fin: str) -> int:
    h1, m1 = map(int, inicio.split(':'))
    h2, m2 = map(int, fin.split(':'))
    return max(1, round(((h2 * 60 + m2) - (h1 * 60 + m1)) / 60))


def leer_xlsx(ruta: str) -> list[dict]:
    wb = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
    ws = wb.active
    filas = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        nombre, curp, dia, hora_ini, hora_fin, asignatura, grupo, programa, adscripcion = (
            row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]
        )
        if not curp or not dia:
            continue
        dia_norm = DIA_MAP.get(norm(str(dia)), None)
        t_ini = parse_time(hora_ini)
        t_fin = parse_time(hora_fin)
        if not (dia_norm and t_ini and t_fin):
            continue
        filas.append({
            'nombre':     str(nombre).strip() if nombre else '',
            'curp':       str(curp).strip(),
            'dia':        dia_norm,
            'hora_ini':   t_ini,
            'hora_fin':   t_fin,
            'asignatura': str(asignatura).strip() if asignatura else 'Sin nombre',
            'grupo':      str(grupo).strip() if grupo else '',
            'programa':   str(programa).strip() if programa else '',
        })
    print(f"  {len(filas)} filas leidas")
    return filas


def build_curp_index(conn) -> dict:
    cur = conn.cursor()
    cur.execute("SELECT id, curp, nombre_completo FROM docentes WHERE activo=TRUE AND curp IS NOT NULL")
    idx = {r[1].strip(): (r[0], r[2]) for r in cur.fetchall()}
    cur.close()
    return idx


def get_or_create_materia(cur, nombre: str, programa_id: int, dry_run: bool) -> int | None:
    cur.execute(
        "SELECT id FROM materias WHERE nombre=%s AND programa_id=%s LIMIT 1",
        (nombre, programa_id)
    )
    row = cur.fetchone()
    if row:
        return row[0]
    if dry_run:
        return -1
    cur.execute(
        "INSERT INTO materias (nombre, programa_id, semestre) VALUES (%s, %s, 'General') RETURNING id",
        (nombre, programa_id)
    )
    return cur.fetchone()[0]


def importar(ruta: str, ciclo: str, dry_run: bool):
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Importando desde: {ruta}")
    print(f"Ciclo: {ciclo}\n")

    filas = leer_xlsx(ruta)
    if not filas:
        print("ERROR: No se leyeron filas validas.")
        return

    conn = psycopg2.connect(
        host='localhost', port=5432,
        dbname='iesef_nomina',
        user='nomina_user',
        password='IESEFnomina@2026$'
    )
    cur = conn.cursor()

    curp_index = build_curp_index(conn)
    print(f"{len(curp_index)} docentes activos con CURP en BD\n")

    # Agrupar filas por (CURP, grupo, asignatura, programa)
    # Cada grupo = una asignacion; cada fila = un bloque de horario
    grupos: dict = defaultdict(list)
    for f in filas:
        key = (f['curp'], f['grupo'], f['asignatura'], f['programa'])
        grupos[key].append(f)

    stats = {'asig_nuevas': 0, 'asig_exist': 0, 'bloques': 0,
             'sin_curp': 0, 'sin_prog': 0, 'mat_nuevas': 0}
    sin_curp = []
    sin_prog = []

    for (curp, grupo, asignatura, programa_str), bloques in grupos.items():
        # Resolver docente por CURP
        if curp not in curp_index:
            sin_curp.append({'curp': curp, 'nombre': bloques[0]['nombre'], 'grupo': grupo})
            stats['sin_curp'] += 1
            continue

        docente_id, docente_nombre = curp_index[curp]

        # Resolver programa
        prog_id, modalidad = map_programa(programa_str)
        if prog_id is None:
            sin_prog.append({'curp': curp, 'nombre': docente_nombre, 'programa': programa_str})
            stats['sin_prog'] += 1
            continue

        # Obtener costo_hora del programa
        cur.execute("SELECT costo_hora FROM programas WHERE id=%s", (prog_id,))
        p = cur.fetchone()
        costo_hora = float(p[0]) if p else 0.0

        # Calcular horas_semana (suma de todos los bloques únicos por día)
        # Cada grupo de filas tiene los bloques semanales
        horas_sem = sum(horas_bloque(b['hora_ini'], b['hora_fin']) for b in bloques)

        # Verificar si ya existe la asignación
        cur.execute(
            "SELECT id FROM asignaciones WHERE docente_id=%s AND grupo=%s AND ciclo=%s "
            "AND materia_id IN (SELECT id FROM materias WHERE nombre=%s AND programa_id=%s)",
            (docente_id, grupo, ciclo, asignatura, prog_id)
        )
        row = cur.fetchone()

        if row:
            stats['asig_exist'] += 1
            continue

        # Crear materia si no existe
        materia_id = get_or_create_materia(cur, asignatura, prog_id, dry_run)
        if materia_id and materia_id == -1 and dry_run:
            materia_id = None

        if dry_run:
            asig_id = 'DRY'
            stats['asig_nuevas'] += 1
        else:
            if materia_id:
                cur.execute(
                    """INSERT INTO asignaciones
                       (docente_id, materia_id, grupo, horas_semana, modalidad, costo_hora, ciclo, activa)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE)
                       RETURNING id""",
                    (docente_id, materia_id, grupo, horas_sem, modalidad, costo_hora, ciclo)
                )
                asig_id = cur.fetchone()[0]
                stats['asig_nuevas'] += 1
            else:
                continue

        # Insertar bloques de horario
        for b in bloques:
            hb = horas_bloque(b['hora_ini'], b['hora_fin'])
            if not dry_run and asig_id != 'DRY':
                cur.execute(
                    """INSERT INTO horario_clases
                       (asignacion_id, dia_semana, hora_inicio, hora_fin, horas_bloque, activo)
                       VALUES (%s, %s, %s, %s, %s, TRUE)""",
                    (asig_id, b['dia'], b['hora_ini'], b['hora_fin'], hb)
                )
            stats['bloques'] += 1

    if not dry_run:
        conn.commit()
        print("OK Cambios guardados en BD")
    else:
        conn.rollback()
        print("[DRY RUN] Sin cambios en BD")

    cur.close()
    conn.close()

    print(f"\n{'-'*50}")
    print(f"  Asignaciones nuevas : {stats['asig_nuevas']}")
    print(f"  Bloques de horario  : {stats['bloques']}")
    print(f"  Ya existian         : {stats['asig_exist']}")
    print(f"  Sin CURP en BD      : {stats['sin_curp']}")
    print(f"  Sin programa match  : {stats['sin_prog']}")

    if sin_curp:
        print(f"\n  Docentes sin CURP en BD ({len(sin_curp)}):")
        shown = set()
        for d in sin_curp:
            if d['curp'] not in shown:
                print(f"    {d['curp']} | {d['nombre']}")
                shown.add(d['curp'])

    if sin_prog:
        print(f"\n  Programas sin mapeo ({len(set(d['programa'] for d in sin_prog))}):")
        for prog in sorted(set(d['programa'] for d in sin_prog)):
            print(f"    '{prog}'")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Importar horarios desde reporte eStudy')
    parser.add_argument('excel', help='Ruta al xlsx exportado de eStudy')
    parser.add_argument('--ciclo', default='2026-1', help='Ciclo academico (ej. 2026-1)')
    parser.add_argument('--dry-run', action='store_true', help='Solo mostrar sin guardar')
    args = parser.parse_args()
    importar(args.excel, args.ciclo, args.dry_run)
