"""
routers/portal.py
Endpoints del portal de autoservicio para docentes y trabajadores.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/portal", tags=["portal"])


def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)


def _solo_docente(usuario: UsuarioActual = Depends(get_usuario_actual)) -> UsuarioActual:
    if usuario.rol not in ("docente", "superadmin"):
        raise HTTPException(status_code=403, detail="Solo docentes")
    if usuario.rol == "docente" and not usuario.docente_id:
        raise HTTPException(status_code=403, detail="Usuario docente sin perfil asociado")
    return usuario


def _solo_trabajador(usuario: UsuarioActual = Depends(get_usuario_actual)) -> UsuarioActual:
    if usuario.rol not in ("trabajador", "superadmin"):
        raise HTTPException(status_code=403, detail="Solo trabajadores")
    if usuario.rol == "trabajador" and not usuario.trabajador_id:
        raise HTTPException(status_code=403, detail="Usuario trabajador sin perfil asociado")
    return usuario


# ── Mi Nómina (docente) ────────────────────────────────────────────────────────

@router.get("/mi-nomina")
async def mi_nomina(usuario: UsuarioActual = Depends(_solo_docente)):
    """Lista de quincenas del docente con resumen fiscal."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
                nq.id, nq.quincena_id, q.fecha_inicio, q.fecha_fin, q.estado AS quincena_estado,
                nq.horas_programadas, nq.horas_presenciales, nq.horas_virtuales,
                nq.horas_suplencia, nq.horas_reales,
                nq.honorarios, nq.iva, nq.sub_total,
                nq.retencion_isr, nq.retencion_iva,
                nq.total_a_pagar, nq.ajustes, nq.total_final,
                nq.estado AS nomina_estado
            FROM nomina_quincena nq
            JOIN quincenas q ON q.id = nq.quincena_id
            WHERE nq.docente_id = %s
            ORDER BY q.fecha_inicio DESC
        """, (usuario.docente_id,))
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        cur.close()
        conn.close()


@router.get("/mi-nomina/{quincena_id}")
async def mi_nomina_detalle(
    quincena_id: int,
    usuario: UsuarioActual = Depends(_solo_docente)
):
    """Detalle fiscal completo de una quincena específica."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
                nq.*, q.fecha_inicio, q.fecha_fin, q.ciclo,
                d.nombre_completo, d.numero_docente
            FROM nomina_quincena nq
            JOIN quincenas q ON q.id = nq.quincena_id
            JOIN docentes d  ON d.id  = nq.docente_id
            WHERE nq.docente_id = %s AND nq.quincena_id = %s
        """, (usuario.docente_id, quincena_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Nómina no encontrada")

        # Detalle por programa
        cur.execute("""
            SELECT ndp.*, p.nombre AS programa_nombre
            FROM nomina_detalle_programa ndp
            JOIN programas p ON p.id = ndp.programa_id
            WHERE ndp.nomina_id = %s
            ORDER BY p.nombre
        """, (row["id"],))
        detalle = [dict(r) for r in cur.fetchall()]

        result = dict(row)
        result["detalle_programas"] = detalle
        return result
    finally:
        cur.close()
        conn.close()


# ── Mis Checadas (docente) ─────────────────────────────────────────────────────

@router.get("/mis-checadas")
async def mis_checadas(
    fecha_inicio: Optional[str] = None,
    fecha_fin:    Optional[str] = None,
    usuario: UsuarioActual = Depends(_solo_docente)
):
    """
    Checadas propias del docente en un rango de fechas con matching contra horario.
    Sin parámetros → semana actual (lunes a sábado).
    """
    from datetime import timedelta as td

    hoy   = datetime.now().date()
    lunes = hoy - timedelta(days=hoy.weekday())
    sabado = lunes + timedelta(days=5)

    fi = date.fromisoformat(fecha_inicio) if fecha_inicio else lunes
    ff = date.fromisoformat(fecha_fin)    if fecha_fin    else sabado

    conn = get_conn()
    cur  = conn.cursor()
    try:
        # Docente y chec_id
        cur.execute(
            "SELECT nombre_completo, chec_id FROM docentes WHERE id = %s",
            (usuario.docente_id,)
        )
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(status_code=404, detail="Docente no encontrado")
        chec_id = doc["chec_id"]

        # ── Checadas en el rango ───────────────────────────────────────────────
        checadas_raw = []
        if chec_id:
            cur.execute("""
                SELECT id, timestamp_checada, tipo_punch, id_dispositivo
                FROM asistencias_checadas
                WHERE user_id = %s
                  AND timestamp_checada >= %s::timestamp
                  AND timestamp_checada <  (%s::date + INTERVAL '1 day')::timestamp
                ORDER BY timestamp_checada
            """, (chec_id, fi, ff))
            checadas_raw = list(cur.fetchall())

        # ── Horarios activos del docente ───────────────────────────────────────
        cur.execute("""
            SELECT hc.dia_semana, hc.hora_inicio, hc.hora_fin, hc.horas_bloque,
                   mat.nombre AS materia_nombre,
                   p.nombre   AS programa_nombre,
                   a.grupo, a.id AS asignacion_id, a.modalidad
            FROM horario_clases hc
            JOIN asignaciones a  ON hc.asignacion_id = a.id
            JOIN materias mat    ON a.materia_id = mat.id
            JOIN programas p     ON mat.programa_id = p.id
            WHERE a.docente_id = %s AND a.activa = true
        """, (usuario.docente_id,))
        horarios = list(cur.fetchall())

    finally:
        cur.close()
        conn.close()

    DIAS = {'lunes': 0, 'martes': 1, 'miercoles': 2, 'jueves': 3,
            'viernes': 4, 'sabado': 5, 'domingo': 6}
    DIAS_LABEL     = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
    TOL_ENTRADA    = 10
    MAX_TOL_SALIDA = 20

    # ── 1. Dedup: checadas dentro de ventana 3-min → solo la primera ──────────
    dedup = []
    skip  = set()
    for i, ch in enumerate(checadas_raw):
        if i in skip:
            continue
        dedup.append(ch)
        ts_i = ch['timestamp_checada']
        for j in range(i + 1, len(checadas_raw)):
            if j in skip:
                continue
            diff_s = (checadas_raw[j]['timestamp_checada'] - ts_i).total_seconds()
            if 0 <= diff_s <= 180:
                skip.add(j)
            elif diff_s > 180:
                break

    # ── 2. Expandir horarios a fechas concretas del rango ─────────────────────
    clases = []
    current = fi
    while current <= ff:
        wd = current.weekday()
        for h in horarios:
            if DIAS.get(h['dia_semana'], -1) == wd:
                ini_m = h['hora_inicio'].hour * 60 + h['hora_inicio'].minute
                fin_m = h['hora_fin'].hour   * 60 + h['hora_fin'].minute
                hb    = float(h['horas_bloque']) if h['horas_bloque'] else (fin_m - ini_m) / 60
                tol_s = min(int(hb * 10), MAX_TOL_SALIDA)
                modalidad  = h['modalidad'] or 'presencial'
                es_virtual = (modalidad == 'virtual') or (modalidad == 'mixta' and wd <= 4)
                clases.append({
                    'fecha':      current,
                    'wd':         wd,
                    'ini_m':      ini_m,
                    'fin_m':      fin_m,
                    'tol_s':      tol_s,
                    'hora_ini':   h['hora_inicio'].strftime('%H:%M'),
                    'hora_fin':   h['hora_fin'].strftime('%H:%M'),
                    'materia':    h['materia_nombre'],
                    'programa':   h['programa_nombre'],
                    'grupo':      h['grupo'] or '',
                    'modalidad':  modalidad,
                    'es_virtual': es_virtual,
                    '_ent':       None,
                    '_sal':       None,
                })
        current += td(days=1)
    clases.sort(key=lambda c: (c['fecha'], c['ini_m']))

    # ── 3. Agrupar y emparejar checadas a clases ──────────────────────────────
    chk_by_date = {}
    for i, ch in enumerate(dedup):
        d = ch['timestamp_checada'].date()
        chk_by_date.setdefault(d, []).append((i, ch))

    cls_by_date = {}
    for c in clases:
        cls_by_date.setdefault(c['fecha'], []).append(c)

    usadas: set = set()

    for fecha_d, cls_dia in cls_by_date.items():
        cls_dia.sort(key=lambda c: c['ini_m'])
        chk_dia = chk_by_date.get(fecha_d, [])
        n = len(cls_dia)

        for ci, clase in enumerate(cls_dia):
            ini   = clase['ini_m']
            fin   = clase['fin_m']
            tol_s = clase['tol_s']

            prev     = cls_dia[ci - 1] if ci > 0 else None
            btb_prev = prev is not None and abs(prev['fin_m'] - ini) <= 5
            nxt      = cls_dia[ci + 1] if ci < n - 1 else None
            btb_next = nxt is not None and abs(fin - nxt['ini_m']) <= 5

            ent_ini = ini - 30
            if prev is not None:
                if btb_prev:
                    ent_ini = min(ent_ini, prev['fin_m'] - prev['tol_s'])
                else:
                    prev_sal_fin = prev['fin_m'] + 15
                    ent_ini = max(ent_ini, prev_sal_fin + 1)
            ent_fin = fin - 21

            sal_ini = fin - tol_s
            sal_fin = fin + 30
            if nxt is not None:
                if btb_next:
                    sal_fin = max(sal_fin, nxt['ini_m'] + TOL_ENTRADA)
                else:
                    nxt_ent_ini = nxt['ini_m'] - 30
                    sal_fin = min(sal_fin, nxt_ent_ini - 1)

            best_ent = best_sal = None
            best_ent_d = best_sal_d = None

            for idx, ch in chk_dia:
                hm = ch['timestamp_checada'].hour * 60 + ch['timestamp_checada'].minute
                if ent_ini <= hm <= ent_fin:
                    d_dist = abs(hm - ini)
                    if best_ent_d is None or d_dist < best_ent_d:
                        best_ent   = (idx, ch, hm)
                        best_ent_d = d_dist
                if sal_ini <= hm <= sal_fin:
                    d_dist = abs(hm - fin)
                    if best_sal_d is None or d_dist < best_sal_d:
                        best_sal   = (idx, ch, hm)
                        best_sal_d = d_dist

            if best_ent:
                hm = best_ent[2]
                if hm <= ini:
                    est_ent = 'entrada_ok'
                elif hm <= ini + TOL_ENTRADA:
                    est_ent = 'retardo'
                else:
                    est_ent = 'falta'
                clase['_ent'] = {'ts': best_ent[1]['timestamp_checada'].strftime('%H:%M'), 'estado': est_ent}
                usadas.add(best_ent[0])

            if best_sal:
                hm = best_sal[2]
                if hm < fin:
                    est_sal = 'salida_anticipada'
                elif hm <= fin + 15:
                    est_sal = 'salida_ok'
                else:
                    est_sal = 'salida_tarde'
                clase['_sal'] = {'ts': best_sal[1]['timestamp_checada'].strftime('%H:%M'), 'estado': est_sal}
                usadas.add(best_sal[0])

    # ── 4. Checadas sin clase ─────────────────────────────────────────────────
    sin_clase = []
    for i, ch in enumerate(dedup):
        if i not in usadas:
            ts = ch['timestamp_checada']
            sin_clase.append({
                'fecha': ts.strftime('%Y-%m-%d'),
                'ts':    ts.strftime('%H:%M'),
                'tipo':  'Entrada' if ch['tipo_punch'] == 0 else 'Salida',
            })

    # ── 4.5. Cadenas back-to-back con extremos checados: continuidad ──────────
    hay_alerta_continuidad = False

    for fecha_d, cls_dia in cls_by_date.items():
        cls_dia.sort(key=lambda c: c['ini_m'])
        n = len(cls_dia)
        if n < 2:
            continue

        cadenas = []
        cadena_actual = [cls_dia[0]]
        for ci in range(1, n):
            prev_c = cls_dia[ci - 1]
            curr_c = cls_dia[ci]
            if abs(prev_c['fin_m'] - curr_c['ini_m']) <= 5:
                cadena_actual.append(curr_c)
            else:
                cadenas.append(cadena_actual)
                cadena_actual = [curr_c]
        cadenas.append(cadena_actual)

        for cadena in cadenas:
            if len(cadena) < 2:
                continue
            presenciales = [c for c in cadena if not c.get('es_virtual')]
            if len(presenciales) < 2:
                continue
            primera = presenciales[0]
            ultima  = presenciales[-1]
            if primera['_ent'] is None or ultima['_sal'] is None:
                continue
            incompletas = [c for c in presenciales if c['_ent'] is None or c['_sal'] is None]
            if not incompletas:
                continue
            hay_alerta_continuidad = True
            for c in presenciales:
                c['_alerta_cadena'] = True
            for c in presenciales:
                if c['_ent'] is None and c['_sal'] is None:
                    c['_asumida'] = True
                elif c['_ent'] is None or c['_sal'] is None:
                    c['_continuidad_parcial'] = True

    # ── 5. Construir respuesta ────────────────────────────────────────────────
    horas_checadas    = 0.0
    horas_asumidas    = 0.0
    horas_continuidad = 0.0

    clases_resp = []
    for c in clases:
        tiene_ent  = c['_ent'] is not None
        tiene_sal  = c['_sal'] is not None
        asumida    = c.get('_asumida', False)
        cont_parc  = c.get('_continuidad_parcial', False)
        alerta     = c.get('_alerta_cadena', False)
        hb         = (c['fin_m'] - c['ini_m']) / 60.0
        es_virtual = c.get('es_virtual', False)
        ent_estado   = c['_ent']['estado'] if tiene_ent else None
        es_falta_ent = ent_estado == 'falta'

        if es_virtual:
            est = 'virtual'
        elif asumida:
            est = 'asumida_por_continuidad'
            horas_asumidas += hb
        elif cont_parc:
            est = 'sin_salida_continuidad' if tiene_ent else 'sin_entrada_continuidad'
            horas_continuidad += hb
        elif es_falta_ent:
            est = 'falta_con_registro'
        elif tiene_ent and tiene_sal:
            est = 'completa'
            horas_checadas += hb
        elif tiene_ent or tiene_sal:
            est = 'sin_salida' if tiene_ent else 'sin_entrada'
            horas_checadas += hb
        else:
            est = 'sin_checadas'

        clases_resp.append({
            'fecha':         c['fecha'].isoformat(),
            'dia':           DIAS_LABEL[c['wd']],
            'materia':       c['materia'],
            'grupo':         c['grupo'],
            'programa':      c['programa'],
            'modalidad':     c.get('modalidad', 'presencial'),
            'es_virtual':    es_virtual,
            'horario':       f"{c['hora_ini']}-{c['hora_fin']}",
            'horas':         round(hb, 2),
            'entrada':       c['_ent'],
            'salida':        c['_sal'],
            'estado':        est,
            'alerta_cadena': alerta,
        })

    horas_totales = horas_checadas + horas_asumidas + horas_continuidad

    # ── 6. Todas las marcaciones (raw) ─────────────────────────────────────────
    todas_marcaciones = []
    for i, ch in enumerate(dedup):
        ts = ch['timestamp_checada']
        todas_marcaciones.append({
            'fecha':       ts.strftime('%Y-%m-%d'),
            'ts':          ts.strftime('%H:%M'),
            'tipo':        'E' if ch['tipo_punch'] == 0 else 'S',
            'dispositivo': ch.get('id_dispositivo', ''),
            'asignada':    i in usadas,
        })

    return {
        'fecha_inicio':       fi.isoformat(),
        'fecha_fin':          ff.isoformat(),
        'docente_nombre':     doc['nombre_completo'],
        'clases':             clases_resp,
        'sin_clase':          sin_clase,
        'todas_marcaciones':  todas_marcaciones,
        'total_clases':       len(clases_resp),
        'total_sin_clase':    len(sin_clase),
        'horas_checadas':     round(horas_checadas, 2),
        'horas_asumidas':     round(horas_asumidas, 2),
        'horas_continuidad':  round(horas_continuidad, 2),
        'horas_totales':      round(horas_totales, 2),
        'alerta_continuidad': hay_alerta_continuidad,
        'actualizado_en':     datetime.now().isoformat(),
    }


# ── Aclaraciones (docente) ─────────────────────────────────────────────────────

class AclaracionCreate(BaseModel):
    descripcion: str
    fecha_referencia: Optional[date] = None

@router.get("/aclaraciones")
async def mis_aclaraciones(usuario: UsuarioActual = Depends(_solo_docente)):
    """Lista de aclaraciones propias del docente."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT a.id, a.descripcion, a.estado, a.respuesta,
                   a.fecha_referencia, a.creado_en,
                   u.nombre AS atendido_por_nombre
            FROM aclaraciones a
            LEFT JOIN usuarios u ON u.id = a.atendido_por
            WHERE a.docente_id = %s
            ORDER BY a.creado_en DESC
        """, (usuario.docente_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


@router.post("/aclaraciones", status_code=201)
async def crear_aclaracion(
    body: AclaracionCreate,
    usuario: UsuarioActual = Depends(_solo_docente)
):
    """Crear una nueva aclaración. Estado inicial: pendiente."""
    if not body.descripcion.strip():
        raise HTTPException(status_code=400, detail="La descripción es requerida")
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO aclaraciones (docente_id, descripcion, estado, fecha_referencia)
            VALUES (%s, %s, 'pendiente', %s)
            RETURNING id, descripcion, estado, respuesta, fecha_referencia, creado_en
        """, (usuario.docente_id, body.descripcion.strip(), body.fecha_referencia))
        row = cur.fetchone()
        conn.commit()
        return dict(row)
    except Exception as e:
        conn.rollback()
        logger.error(f"Error crear_aclaracion: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        cur.close()
        conn.close()


# ── Mi Asistencia (trabajador) ─────────────────────────────────────────────────

@router.get("/mi-asistencia")
async def mi_asistencia(
    fecha_inicio: Optional[str] = None,
    fecha_fin:    Optional[str] = None,
    usuario: UsuarioActual = Depends(_solo_trabajador)
):
    """
    Checadas del trabajador agrupadas por día en un rango de fechas.
    Sin parámetros → semana actual (lunes a sábado).
    """
    from datetime import timedelta as td

    hoy    = datetime.now().date()
    lunes  = hoy - timedelta(days=hoy.weekday())
    sabado = lunes + timedelta(days=5)

    fi = date.fromisoformat(fecha_inicio) if fecha_inicio else lunes
    ff = date.fromisoformat(fecha_fin)    if fecha_fin    else sabado

    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT chec_id FROM trabajadores WHERE id = %s", (usuario.trabajador_id,))
        trab = cur.fetchone()
        if not trab or not trab["chec_id"]:
            return {
                "fecha_inicio": fi.isoformat(),
                "fecha_fin":    ff.isoformat(),
                "dias":         [],
                "resumen":      {"dias_con_registro": 0, "dias_completos": 0, "dias_parciales": 0},
                "actualizado_en": datetime.now().isoformat(),
            }

        chec_id = trab["chec_id"]

        cur.execute("""
            SELECT
                DATE(timestamp_checada)  AS fecha,
                timestamp_checada::time  AS hora,
                tipo_punch
            FROM asistencias_checadas
            WHERE user_id = %s
              AND timestamp_checada::date BETWEEN %s AND %s
            ORDER BY timestamp_checada
        """, (chec_id, fi, ff))

        DIAS_ES_TW = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

        def _hora_a_seg(t):
            if isinstance(t, timedelta):
                return int(t.total_seconds())
            return t.hour * 3600 + t.minute * 60 + t.second

        def _dedup(checadas):
            """Elimina duplicados dentro de 3 min (MB360 registra la misma checada varias veces)."""
            if not checadas:
                return []
            result = [checadas[0]]
            for c in checadas[1:]:
                if _hora_a_seg(c["hora"]) - _hora_a_seg(result[-1]["hora"]) >= 180:
                    result.append(c)
            return result

        # Acumular todas las checadas por fecha
        por_fecha: dict = {}
        for r in cur.fetchall():
            f = str(r["fecha"])
            if f not in por_fecha:
                por_fecha[f] = []
            por_fecha[f].append({"hora": r["hora"], "tipo": r["tipo_punch"]})

        # Construir lista de días lunes→sábado para cada semana del rango
        dias = []
        current = fi
        while current <= ff:
            wd = current.weekday()
            if wd <= 5:  # 0=lun … 5=sáb, omitir domingo
                fecha_str    = str(current)
                checadas_dia = _dedup(por_fecha.get(fecha_str, []))

                # Posición determina entrada/salida — tipo_punch del MB360 no es confiable
                n = len(checadas_dia)
                if n == 0:
                    entrada = None
                    salida  = None
                    todas   = []
                elif n == 1:
                    entrada = str(checadas_dia[0]["hora"])[:5]
                    salida  = None
                    todas   = [{"hora": entrada, "tipo": "entrada"}]
                else:
                    entrada = str(checadas_dia[0]["hora"])[:5]
                    salida  = str(checadas_dia[-1]["hora"])[:5]
                    todas   = (
                        [{"hora": str(checadas_dia[0]["hora"])[:5],  "tipo": "entrada"}]
                        + [{"hora": str(c["hora"])[:5], "tipo": "entrada"} for c in checadas_dia[1:-1]]
                        + [{"hora": str(checadas_dia[-1]["hora"])[:5], "tipo": "salida"}]
                    )

                dias.append({
                    "fecha":          fecha_str,
                    "dia_semana":     DIAS_ES_TW[wd],
                    "es_hoy":         current == hoy,
                    "entrada":        entrada,
                    "salida":         salida,
                    "todas":          todas,
                    "tiene_checadas": bool(checadas_dia),
                })
            current += timedelta(days=1)

        dias_con_reg  = sum(1 for d in dias if d["tiene_checadas"])
        dias_completos = sum(1 for d in dias if d["entrada"] and d["salida"])
        dias_parciales = sum(
            1 for d in dias if d["tiene_checadas"] and not (d["entrada"] and d["salida"])
        )

        return {
            "fecha_inicio": fi.isoformat(),
            "fecha_fin":    ff.isoformat(),
            "dias":         dias,
            "resumen": {
                "dias_con_registro": dias_con_reg,
                "dias_completos":    dias_completos,
                "dias_parciales":    dias_parciales,
            },
            "actualizado_en": datetime.now().isoformat(),
        }
    finally:
        cur.close()
        conn.close()


# ── Lista de quincenas disponibles para selector (docente) ────────────────────

@router.get("/quincenas-disponibles")
async def quincenas_disponibles(usuario: UsuarioActual = Depends(_solo_docente)):
    """Lista de quincenas donde el docente tiene nómina registrada."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT q.id, q.fecha_inicio, q.fecha_fin, q.estado, q.ciclo
            FROM quincenas q
            JOIN nomina_quincena nq ON nq.quincena_id = q.id
            WHERE nq.docente_id = %s
            ORDER BY q.fecha_inicio DESC
        """, (usuario.docente_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


# ── Lista de períodos disponibles para selector (trabajador) ──────────────────

@router.get("/periodos-disponibles")
async def periodos_disponibles(usuario: UsuarioActual = Depends(_solo_trabajador)):
    """Lista de períodos admin para el selector del trabajador."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, nombre, fecha_inicio, fecha_fin, estado
            FROM periodos_admin
            ORDER BY fecha_inicio DESC
            LIMIT 20
        """)
        return [dict(r) for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()


# ── Checadas semana actual (docente) ──────────────────────────────────────────

DOW_ENUM = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
DIAS_ES  = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']


@router.get("/mis-checadas-semana")
async def mis_checadas_semana(usuario: UsuarioActual = Depends(_solo_docente)):
    """Checadas de la semana actual con matching contra horario de clases."""
    hoy    = datetime.now().date()
    lunes  = hoy - timedelta(days=hoy.weekday())   # weekday() 0=Lun, 6=Dom
    sabado = lunes + timedelta(days=5)

    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT chec_id FROM docentes WHERE id = %s", (usuario.docente_id,))
        doc = cur.fetchone()
        chec_id = doc["chec_id"] if doc else None

        # Checadas de la semana agrupadas por fecha
        por_fecha: dict = {}
        if chec_id:
            cur.execute("""
                SELECT DATE(timestamp_checada) AS fecha,
                       timestamp_checada::time AS hora,
                       tipo_punch
                FROM asistencias_checadas
                WHERE user_id = %s
                  AND timestamp_checada::date BETWEEN %s AND %s
                ORDER BY timestamp_checada
            """, (chec_id, lunes, sabado))
            for r in cur.fetchall():
                por_fecha.setdefault(str(r["fecha"]), []).append(
                    {"hora": r["hora"], "tipo": r["tipo_punch"]}
                )

        # Horarios activos del docente
        cur.execute("""
            SELECT hc.dia_semana, hc.hora_inicio, hc.hora_fin, hc.horas_bloque,
                   m.nombre AS materia, p.nombre AS programa,
                   a.grupo, a.modalidad
            FROM horario_clases hc
            JOIN asignaciones a ON a.id = hc.asignacion_id
            JOIN materias    m ON m.id = a.materia_id
            JOIN programas   p ON p.id = a.programa_id
            WHERE a.docente_id = %s AND a.activa = true
            ORDER BY hc.hora_inicio
        """, (usuario.docente_id,))
        horarios_por_dia: dict = {}
        for h in cur.fetchall():
            horarios_por_dia.setdefault(h["dia_semana"], []).append(dict(h))

        dias = []
        for i in range(5, -1, -1):   # sábado → lunes (más reciente primero)
            fecha     = lunes + timedelta(days=i)
            fecha_str = str(fecha)
            checadas_dia  = por_fecha.get(fecha_str, [])
            clases_dia    = horarios_por_dia.get(DOW_ENUM[i], [])

            usadas: set = set()
            clases_resultado = []

            for clase in clases_dia:
                hi      = clase["hora_inicio"]
                hf      = clase["hora_fin"]
                horas_b = clase["horas_bloque"] or 1
                tol_sal = min(horas_b * 10, 20)

                base_ent = datetime.combine(fecha, hi)
                ent_min  = (base_ent - timedelta(minutes=10)).time()
                ent_max  = (base_ent + timedelta(minutes=30)).time()
                base_sal = datetime.combine(fecha, hf)
                sal_min  = (base_sal - timedelta(minutes=tol_sal)).time()
                sal_max  = (base_sal + timedelta(minutes=30)).time()

                idx_ent = next(
                    (j for j, ch in enumerate(checadas_dia)
                     if j not in usadas and ch["tipo"] == 0
                     and ent_min <= ch["hora"] <= ent_max),
                    None
                )
                idx_sal = next(
                    (j for j, ch in enumerate(checadas_dia)
                     if j not in usadas and ch["tipo"] == 1
                     and sal_min <= ch["hora"] <= sal_max),
                    None
                )

                if idx_ent is not None: usadas.add(idx_ent)
                if idx_sal is not None: usadas.add(idx_sal)

                ent_h = str(checadas_dia[idx_ent]["hora"])[:5] if idx_ent is not None else None
                sal_h = str(checadas_dia[idx_sal]["hora"])[:5] if idx_sal is not None else None

                if ent_h and sal_h:
                    hi_tol = (datetime.combine(fecha, hi) + timedelta(minutes=10)).time()
                    estado = "retardo" if checadas_dia[idx_ent]["hora"] > hi_tol else "completa"
                elif ent_h or sal_h:
                    estado = "parcial"
                else:
                    estado = "sin_checada"

                clases_resultado.append({
                    "materia":    clase["materia"],
                    "programa":   clase["programa"],
                    "grupo":      clase["grupo"],
                    "modalidad":  clase["modalidad"],
                    "hora_inicio": str(hi)[:5],
                    "hora_fin":    str(hf)[:5],
                    "entrada":    ent_h,
                    "salida":     sal_h,
                    "estado":     estado,
                })

            sin_clase = [
                {"hora": str(ch["hora"])[:5], "tipo": "entrada" if ch["tipo"] == 0 else "salida"}
                for j, ch in enumerate(checadas_dia) if j not in usadas
            ]

            dias.append({
                "fecha":          fecha_str,
                "dia_semana":     DIAS_ES[i],
                "es_hoy":         fecha == hoy,
                "clases":         clases_resultado,
                "sin_clase":      sin_clase,
                "tiene_checadas": bool(checadas_dia),
            })

        return {
            "semana_inicio":  str(lunes),
            "semana_fin":     str(sabado),
            "actualizado_en": datetime.now().isoformat(),
            "dias":           dias,
        }
    finally:
        cur.close()
        conn.close()


# ── Asistencia semana actual (trabajador) ─────────────────────────────────────

@router.get("/mi-asistencia-semana")
async def mi_asistencia_semana(usuario: UsuarioActual = Depends(_solo_trabajador)):
    """Checadas de la semana actual del trabajador agrupadas por día."""
    hoy    = datetime.now().date()
    lunes  = hoy - timedelta(days=hoy.weekday())
    sabado = lunes + timedelta(days=5)

    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT chec_id FROM trabajadores WHERE id = %s", (usuario.trabajador_id,))
        trab = cur.fetchone()
        chec_id = trab["chec_id"] if trab else None

        por_fecha: dict = {}
        if chec_id:
            cur.execute("""
                SELECT DATE(timestamp_checada) AS fecha,
                       timestamp_checada::time AS hora,
                       tipo_punch
                FROM asistencias_checadas
                WHERE user_id = %s
                  AND timestamp_checada::date BETWEEN %s AND %s
                ORDER BY timestamp_checada
            """, (chec_id, lunes, sabado))
            for r in cur.fetchall():
                por_fecha.setdefault(str(r["fecha"]), []).append(
                    {"hora": r["hora"], "tipo": r["tipo_punch"]}
                )

        dias = []
        for i in range(5, -1, -1):
            fecha     = lunes + timedelta(days=i)
            fecha_str = str(fecha)
            checadas_dia = por_fecha.get(fecha_str, [])

            entrada = next((str(c["hora"])[:5] for c in checadas_dia if c["tipo"] == 0), None)
            salida  = next((str(c["hora"])[:5] for c in reversed(checadas_dia) if c["tipo"] == 1), None)
            todas   = [
                {"hora": str(c["hora"])[:5], "tipo": "entrada" if c["tipo"] == 0 else "salida"}
                for c in checadas_dia
            ]

            dias.append({
                "fecha":          fecha_str,
                "dia_semana":     DIAS_ES[i],
                "es_hoy":         fecha == hoy,
                "entrada":        entrada,
                "salida":         salida,
                "todas":          todas,
                "tiene_checadas": bool(checadas_dia),
            })

        return {
            "semana_inicio":  str(lunes),
            "semana_fin":     str(sabado),
            "actualizado_en": datetime.now().isoformat(),
            "dias":           dias,
        }
    finally:
        cur.close()
        conn.close()
