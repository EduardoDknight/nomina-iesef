"""
Fix: re-liga evaluacion_virtual_semana y evaluacion_virtual_resultado
a los nuevos asignacion_ids creados por importar_horarios_pdf.py.

Problema: los grupos viejos tenían prefijo 'EA26 ' (ej 'EA26 LENA 1°1')
pero los nuevos del PDF no lo tienen ('LENA 1°1').
La re-liga usa doc+materia+ciclo+grupo_normalizado.

También corrige el modalidad de las asignaciones del PDF:
  LENA, EEQ, EECI, EEP, EEG → mixta
  EADSE, MSP, MGDIS, MDIE   → virtual
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = 'postgresql://nomina_user:IESEFnomina%402026$@localhost:5432/iesef_nomina'

# Prefijos → modalidad correcta
PREFIJO_MODAL = {
    'LENA':  'mixta',
    'EEQ':   'mixta', 'EEQX': 'mixta',
    'EECI':  'mixta',
    'EEP':   'mixta', 'EEPER':'mixta',
    'EEG':   'mixta',
    'EADSE': 'virtual',
    'MSP':   'virtual',
    'MGDIS': 'virtual',
    'MDIE':  'virtual',
}

def normalizar_grupo(g):
    """Elimina prefijo 'EA26 ' y espacios extra."""
    if not g:
        return ''
    g = g.strip()
    if g.upper().startswith('EA26 '):
        g = g[5:].strip()
    return g

def detectar_modalidad(grupo):
    """Devuelve la modalidad correcta según el prefijo del grupo."""
    if not grupo:
        return None
    norm = normalizar_grupo(grupo)
    for prefijo, modal in sorted(PREFIJO_MODAL.items(), key=lambda x: -len(x[0])):
        if norm.upper().startswith(prefijo):
            return modal
    return None

def main():
    conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
    conn.autocommit = False
    cur = conn.cursor()

    # ── PASO 1: Corregir modalidad de asignaciones activas ─────────────────────
    cur.execute("SELECT id, grupo FROM asignaciones WHERE activa = true AND modalidad = 'presencial'")
    asigs = cur.fetchall()
    modal_updates = 0
    for a in asigs:
        modal = detectar_modalidad(a['grupo'])
        if modal and modal != 'presencial':
            cur.execute("UPDATE asignaciones SET modalidad = %s WHERE id = %s", (modal, a['id']))
            modal_updates += 1
    print(f"Modalidades actualizadas: {modal_updates}")

    # ── PASO 2: Construir índice docente+materia+ciclo+grupo_norm → nuevo asig_id ──
    cur.execute("""
        SELECT a.id, a.docente_id, a.materia_id, a.ciclo, a.grupo
        FROM asignaciones a
        WHERE a.activa = true
    """)
    idx = {}
    for a in cur.fetchall():
        key = (a['docente_id'], a['materia_id'], a['ciclo'], normalizar_grupo(a['grupo']))
        idx[key] = a['id']

    # ── PASO 3: Re-ligar evaluacion_virtual_semana ──────────────────────────────
    cur.execute("""
        SELECT evs.id, a.docente_id, a.materia_id, a.ciclo, a.grupo
        FROM evaluacion_virtual_semana evs
        JOIN asignaciones a ON evs.asignacion_id = a.id
        WHERE a.activa = false
    """)
    evs_rows = cur.fetchall()
    evs_ok = evs_miss = 0
    for r in evs_rows:
        key = (r['docente_id'], r['materia_id'], r['ciclo'], normalizar_grupo(r['grupo']))
        nuevo_id = idx.get(key)
        if nuevo_id:
            cur.execute("UPDATE evaluacion_virtual_semana SET asignacion_id = %s WHERE id = %s",
                        (nuevo_id, r['id']))
            evs_ok += 1
        else:
            evs_miss += 1
    print(f"evaluacion_virtual_semana re-ligadas: {evs_ok}  sin match: {evs_miss}")

    # ── PASO 4: Re-ligar evaluacion_virtual_resultado ──────────────────────────
    cur.execute("""
        SELECT evr.id, a.docente_id, a.materia_id, a.ciclo, a.grupo
        FROM evaluacion_virtual_resultado evr
        JOIN asignaciones a ON evr.asignacion_id = a.id
        WHERE a.activa = false
    """)
    evr_rows = cur.fetchall()
    evr_ok = evr_miss = 0
    for r in evr_rows:
        key = (r['docente_id'], r['materia_id'], r['ciclo'], normalizar_grupo(r['grupo']))
        nuevo_id = idx.get(key)
        if nuevo_id:
            cur.execute("UPDATE evaluacion_virtual_resultado SET asignacion_id = %s WHERE id = %s",
                        (nuevo_id, r['id']))
            evr_ok += 1
        else:
            evr_miss += 1
    print(f"evaluacion_virtual_resultado re-ligadas: {evr_ok}  sin match: {evr_miss}")

    # ── PASO 4b: Reactivar asignaciones viejas sin match (virtual-only) ────────
    # Docentes que solo enseñan virtual (ej. viernes LENA) no están en el PDF.
    # Re-activar su asignacion vieja (sin horario_clases → motor presencial no los cuenta).
    cur.execute("""
        SELECT DISTINCT evr.asignacion_id
        FROM evaluacion_virtual_resultado evr
        JOIN asignaciones a ON evr.asignacion_id = a.id AND a.activa = false
    """)
    to_reactivate = [r['asignacion_id'] for r in cur.fetchall()]
    if to_reactivate:
        cur.execute("""
            UPDATE asignaciones SET activa = true, modalidad = 'virtual'
            WHERE id = ANY(%s)
        """, (to_reactivate,))
        print(f"Asignaciones virtuales re-activadas: {cur.rowcount}")
    else:
        print("No quedan asignaciones sin re-activar.")

    # ── PASO 5: Verificar resultado ────────────────────────────────────────────
    cur.execute("""
        SELECT COUNT(*) n, SUM(CASE WHEN a.activa THEN 1 ELSE 0 END) activas
        FROM evaluacion_virtual_resultado evr
        JOIN asignaciones a ON evr.asignacion_id = a.id
    """)
    r = cur.fetchone()
    print(f"\nVerificación post-fix: {r['n']} EVR, {r['activas']} con asignacion activa")

    cur.execute("""
        SELECT a.modalidad, COUNT(*) n
        FROM asignaciones a WHERE a.activa=true
        GROUP BY a.modalidad ORDER BY a.modalidad
    """)
    print("Modalidades activas post-fix:")
    for r in cur.fetchall():
        print(f"  {r['modalidad']:<12} {r['n']}")

    conn.commit()
    print("\nFix aplicado.")
    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
