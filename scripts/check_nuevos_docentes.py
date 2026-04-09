"""
check_nuevos_docentes.py
========================
Compara el archivo Base Alta Docentes con la tabla docentes en iesef_nomina.
Muestra:
  1. Docentes del Excel que NO están en la BD (candidatos a agregar)
  2. Docentes del Excel con comentarios sobre inicio próximo
  3. Diferencias en modalidad/adscripción entre Excel y BD
"""
import sys, re
from difflib import SequenceMatcher
import psycopg2
from psycopg2.extras import RealDictCursor
import openpyxl

sys.stdout.reconfigure(encoding='utf-8')

ARCHIVO = r'C:\Users\Admin\Downloads\Base Alta Docentes (1) (1) (1).xlsx'
CONN_STR = 'postgresql://nomina_user:IESEFnomina%402026%24@localhost:5432/iesef_nomina'

def norm(s):
    if not s: return ''
    repl = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n'}
    s = s.strip().lower()
    for k,v in repl.items(): s=s.replace(k,v)
    return s

def sim(a, b):
    return SequenceMatcher(None, norm(a), norm(b)).ratio()

conn = psycopg2.connect(CONN_STR, cursor_factory=RealDictCursor)
cur = conn.cursor()
cur.execute("SELECT id, nombre_completo, numero_docente, regimen_fiscal, activo FROM docentes")
docentes_db = list(cur.fetchall())
conn.close()

wb = openpyxl.load_workbook(ARCHIVO, data_only=True)
ws = wb['Hoja1']

excel_docentes = []
for row in ws.iter_rows(min_row=2, values_only=True):
    num, nombre, rfc, curp, cp, forma_pago, clabe, modalidad, adscripcion, programas, noi, correo, comentarios = \
        (row[i] if i < len(row) else None for i in range(13))
    if not nombre:
        continue
    excel_docentes.append({
        'numero': int(num) if num else None,
        'nombre': nombre.strip(),
        'modalidad': (modalidad or '').strip(),
        'adscripcion': (adscripcion or '').strip(),
        'programas': (programas or '').strip(),
        'correo': correo or '',
        'comentarios': (comentarios or '').strip(),
        'rfc': (rfc or '').strip(),
        'clabe': (clabe or '').strip(),
    })

print(f"Excel: {len(excel_docentes)} docentes  |  BD: {len(docentes_db)} docentes\n")

# ── 1. Docentes del Excel NO en BD ─────────────────────────────────────────────
print("=" * 70)
print("DOCENTES EN EXCEL QUE NO ESTÁN EN LA BD (o score bajo)")
print("=" * 70)

no_encontrados = []
for ed in excel_docentes:
    mejor = max(docentes_db, key=lambda d: sim(d['nombre_completo'], ed['nombre']))
    score = sim(mejor['nombre_completo'], ed['nombre'])
    if score < 0.80:
        no_encontrados.append((ed, mejor, score))

for ed, mejor, score in sorted(no_encontrados, key=lambda x: x[2]):
    print(f"  [{score:.2f}] Excel: {ed['nombre']}")
    print(f"         BD más cercana: {mejor['nombre_completo']}  (ID={mejor['id']})")
    if ed['comentarios']:
        print(f"         Comentario: {ed['comentarios']}")
    print()

print(f"\nTotal posibles nuevos: {len(no_encontrados)}")

# ── 2. Docentes con comentarios sobre inicio ───────────────────────────────────
print("\n" + "=" * 70)
print("DOCENTES CON COMENTARIOS DE INICIO PRÓXIMO / CAMBIO")
print("=" * 70)

palabras_inicio = re.compile(r'inicia|comienza|empieza|nuevo|nueva|agregar|alta|incorpora', re.I)
for ed in excel_docentes:
    if ed['comentarios'] and palabras_inicio.search(ed['comentarios']):
        mejor = max(docentes_db, key=lambda d: sim(d['nombre_completo'], ed['nombre']))
        score = sim(mejor['nombre_completo'], ed['nombre'])
        en_bd = "✓ EN BD" if score >= 0.80 else "✗ NO EN BD"
        print(f"  {en_bd} | {ed['nombre']}")
        print(f"    Comentario: {ed['comentarios']}")
        if score < 0.80:
            print(f"    Más cercana en BD: {mejor['nombre_completo']} ({score:.2f})")
        print()

# ── 3. Cambios de modalidad ────────────────────────────────────────────────────
print("=" * 70)
print("DIFERENCIAS DE MODALIDAD (Excel vs BD)")
print("=" * 70)

for ed in excel_docentes:
    mejor = max(docentes_db, key=lambda d: sim(d['nombre_completo'], ed['nombre']))
    score = sim(mejor['nombre_completo'], ed['nombre'])
    if score >= 0.80:
        mod_excel = ed['modalidad'].lower().strip()
        mod_bd    = (mejor['regimen_fiscal'] or '').lower().strip()
        if mod_excel and mod_bd and mod_excel not in mod_bd and mod_bd not in mod_excel:
            print(f"  {mejor['nombre_completo']}")
            print(f"    Excel modalidad: '{ed['modalidad']}'  →  BD regimen_fiscal: '{mejor['regimen_fiscal']}'")
            print()
