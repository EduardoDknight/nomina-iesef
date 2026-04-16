from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/evaluacion", tags=["evaluacion-virtual"])

def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)


def contar_semanas(fecha_inicio: date, fecha_fin: date) -> int:
    """Número de semanas calendáricas (L-D) que intersectan con el período."""
    lunes = fecha_inicio - timedelta(days=fecha_inicio.weekday())
    n = 0
    while lunes <= fecha_fin:
        n += 1
        lunes += timedelta(weeks=1)
    return n


def semanas_del_periodo(fecha_inicio: date, fecha_fin: date) -> list:
    """
    Retorna lista de dicts {semana_num, inicio (date), fin (date)} para cada
    semana L-S que intersecte con el período.
    """
    lunes = fecha_inicio - timedelta(days=fecha_inicio.weekday())
    semanas = []
    num = 1
    while lunes <= fecha_fin:
        sabado = lunes + timedelta(days=5)
        ini = max(lunes, fecha_inicio)
        fin = min(sabado, fecha_fin)
        semanas.append({'semana_num': num, 'inicio': ini, 'fin': fin})
        num += 1
        lunes += timedelta(weeks=1)
    return semanas


def _calcular_pct(semanas: list, n_semanas: int, params: dict) -> dict:
    """
    Calcula % de cumplimiento virtual.
    CA: max 0.10 por criterio × 4 criterios × n_semanas → denom = n_semanas × 0.40
    EV: max 0.15 por criterio × 4 criterios × n_semanas → denom = n_semanas × 0.60
      CA_contribution = (SUM(criterios_CA) / (n_semanas × 0.40)) × peso_CA
      EV_contribution = (SUM(criterios_EV) / (n_semanas × 0.60)) × peso_EV
      pct = CA_contribution + EV_contribution
      aprobada = pct > umbral_pago  (debe SUPERAR, no igualar)
    """
    denom_ca = n_semanas * 0.40
    denom_ev = n_semanas * 0.60
    if not semanas or denom_ca == 0:
        return dict(ca_contribution=0.0, ev_contribution=0.0,
                    pct_cumplimiento=0.0, aprobada=False)

    ca_sum = sum(
        float(s.get('ca_1') or 0) + float(s.get('ca_2') or 0) +
        float(s.get('ca_3') or 0) + float(s.get('ca_4') or 0)
        for s in semanas
    )
    ev_sum = sum(
        float(s.get('ev_1') or 0) + float(s.get('ev_2') or 0) +
        float(s.get('ev_3') or 0) + float(s.get('ev_4') or 0)
        for s in semanas
    )

    ca_contrib = (ca_sum / denom_ca) * params['peso_ca']
    ev_contrib = (ev_sum / denom_ev) * params['peso_ev']
    pct = ca_contrib + ev_contrib

    return dict(
        ca_contribution=round(ca_contrib, 4),
        ev_contribution=round(ev_contrib, 4),
        pct_cumplimiento=round(pct, 4),
        aprobada=pct > params['umbral_pago'],
    )


def _get_params(cur) -> dict:
    cur.execute(
        "SELECT * FROM evaluacion_parametros WHERE activo = true ORDER BY id DESC LIMIT 1"
    )
    row = cur.fetchone()
    return {
        'peso_ca':     float(row['peso_ca'])    if row else 0.40,
        'peso_ev':     float(row['peso_ev'])    if row else 0.60,
        'umbral_pago': float(row['umbral_pago']) if row else 0.60,
    }


# ── Modelos ────────────────────────────────────────────────────────────────────

class SemanaIn(BaseModel):
    # CA: valores válidos 0.0, 0.05, 0.10
    ca_1: Optional[float] = None
    ca_2: Optional[float] = None
    ca_3: Optional[float] = None
    ca_4: Optional[float] = None
    obs_ca: Optional[str] = None
    # EV: valores válidos 0.0, 0.075, 0.15
    ev_1: Optional[float] = None
    ev_2: Optional[float] = None
    ev_3: Optional[float] = None
    ev_4: Optional[float] = None
    obs_ev: Optional[str] = None


# ── GET /evaluacion/{quincena_id}/virtual ─────────────────────────────────────

@router.get("/{quincena_id}/virtual")
async def listar_virtual(
    quincena_id: int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Lista todas las asignaciones virtuales/mixtas del ciclo de la quincena,
    con su estado de evaluación (semanas capturadas + % cumplimiento calculado).
    coord_academica solo ve su programa.
    """
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT * FROM quincenas WHERE id = %s", (quincena_id,))
    q = cur.fetchone()
    if not q:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Quincena no encontrada")

    semanas_periodo = semanas_del_periodo(q['fecha_inicio'], q['fecha_fin'])
    n_semanas = len(semanas_periodo)
    params = _get_params(cur)

    # Filtro de programa para coord_academica
    prog_filter = ""
    prog_params: list = []
    if usuario.rol == 'coord_academica' and usuario.programa_id:
        prog_filter = "AND mat.programa_id = %s"
        prog_params = [usuario.programa_id]

    cur.execute(f"""
        SELECT
            a.id              AS asignacion_id,
            a.docente_id,
            d.nombre_completo AS docente_nombre,
            mat.id            AS materia_id,
            mat.nombre        AS materia_nombre,
            mat.programa_id,
            p.nombre          AS programa_nombre,
            COALESCE(a.costo_hora, p.costo_hora) AS tarifa,
            a.horas_semana,
            a.grupo,
            a.modalidad
        FROM asignaciones a
        JOIN docentes d   ON a.docente_id  = d.id
        JOIN materias mat ON a.materia_id  = mat.id
        JOIN programas p  ON mat.programa_id = p.id
        WHERE a.vigente_desde <= %s AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= %s)
          AND a.activa = true
          AND a.modalidad IN ('virtual', 'mixta')
          AND d.activo = true
          {prog_filter}
        ORDER BY p.nombre, d.nombre_completo, mat.nombre
    """, [q['fecha_fin'], q['fecha_inicio']] + prog_params)

    asignaciones = cur.fetchall()
    resultado = []

    for asig in asignaciones:
        asig_id = asig['asignacion_id']
        horas_quincena = int(asig['horas_semana'] or 0) * n_semanas

        cur.execute("""
            SELECT * FROM evaluacion_virtual_semana
            WHERE quincena_id = %s AND asignacion_id = %s
            ORDER BY semana_num
        """, (quincena_id, asig_id))
        semanas = [dict(s) for s in cur.fetchall()]

        cur.execute("""
            SELECT * FROM evaluacion_virtual_resultado
            WHERE quincena_id = %s AND asignacion_id = %s
        """, (quincena_id, asig_id))
        res = cur.fetchone()

        pct_data = _calcular_pct(semanas, n_semanas, params)

        resultado.append({
            'asignacion_id':    asig_id,
            'docente_id':       asig['docente_id'],
            'docente_nombre':   asig['docente_nombre'],
            'materia_nombre':   asig['materia_nombre'],
            'programa_nombre':  asig['programa_nombre'],
            'programa_id':      asig['programa_id'],
            'modalidad':        asig['modalidad'],
            'tarifa':           float(asig['tarifa'] or 0),
            'horas_semana':     float(asig['horas_semana'] or 0),
            'horas_quincena':   horas_quincena,
            'n_semanas':        n_semanas,
            'semanas':          semanas,
            'pct_cumplimiento': pct_data['pct_cumplimiento'],
            'ca_contribution':  pct_data['ca_contribution'],
            'ev_contribution':  pct_data['ev_contribution'],
            'aprobada':         pct_data['aprobada'],
            'resultado_guardado': dict(res) if res else None,
        })

    cur.close(); conn.close()
    return {
        'n_semanas': n_semanas,
        'semanas_periodo': [
            {'semana_num': s['semana_num'],
             'inicio': s['inicio'].isoformat(),
             'fin':    s['fin'].isoformat()}
            for s in semanas_periodo
        ],
        'params': params,
        'asignaciones': resultado,
    }


# ── PUT /evaluacion/{quincena_id}/virtual/{asignacion_id}/semana/{n} ──────────

@router.put("/{quincena_id}/virtual/{asignacion_id}/semana/{semana_num}")
async def guardar_semana_virtual(
    quincena_id:   int,
    asignacion_id: int,
    semana_num:    int,
    body:          SemanaIn,
    usuario:       UsuarioActual = Depends(get_usuario_actual)
):
    """
    Guarda criterios de una semana. Role-based:
      coord_academica  → solo ca_1..ca_4, obs_ca
      educacion_virtual → solo ev_1..ev_4, obs_ev
      cap_humano / director → ambos
    """
    puede_ca = usuario.rol in ('coord_academica', 'director_cap_humano', 'cap_humano')
    puede_ev = usuario.rol in ('educacion_virtual', 'director_cap_humano', 'cap_humano')

    if not puede_ca and not puede_ev:
        raise HTTPException(status_code=403, detail="Sin permiso para capturar evaluación virtual")
    if semana_num not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="semana_num debe ser 1, 2 o 3")

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT estado FROM quincenas WHERE id = %s", (quincena_id,))
    q = cur.fetchone()
    if not q:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Quincena no encontrada")
    if q['estado'] not in ('abierta', 'en_revision'):
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="La quincena no está abierta para edición")

    cur.execute("SELECT docente_id FROM asignaciones WHERE id = %s", (asignacion_id,))
    asig = cur.fetchone()
    if not asig:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Asignación no encontrada")

    # coord_academica solo puede editar su programa
    if usuario.rol == 'coord_academica' and usuario.programa_id:
        cur.execute("""
            SELECT 1 FROM asignaciones a
            JOIN materias m ON a.materia_id = m.id
            WHERE a.id = %s AND m.programa_id = %s
        """, (asignacion_id, usuario.programa_id))
        if not cur.fetchone():
            cur.close(); conn.close()
            raise HTTPException(status_code=403, detail="No tienes acceso a esta asignación")

    cur.execute("""
        SELECT * FROM evaluacion_virtual_semana
        WHERE quincena_id = %s AND asignacion_id = %s AND semana_num = %s
    """, (quincena_id, asignacion_id, semana_num))
    existente = cur.fetchone()
    now = datetime.now()

    if existente:
        updates: dict = {}
        if puede_ca:
            for f in ('ca_1', 'ca_2', 'ca_3', 'ca_4', 'obs_ca'):
                val = getattr(body, f)
                if val is not None:
                    updates[f] = val
            if any(getattr(body, f) is not None for f in ('ca_1', 'ca_2', 'ca_3', 'ca_4')):
                updates['capturado_ca_por'] = usuario.id
                updates['capturado_ca_en']  = now
        if puede_ev:
            for f in ('ev_1', 'ev_2', 'ev_3', 'ev_4', 'obs_ev'):
                val = getattr(body, f)
                if val is not None:
                    updates[f] = val
            if any(getattr(body, f) is not None for f in ('ev_1', 'ev_2', 'ev_3', 'ev_4')):
                updates['capturado_ev_por'] = usuario.id
                updates['capturado_ev_en']  = now

        if updates:
            set_clause = ", ".join(f"{k} = %s" for k in updates)
            cur.execute(
                f"UPDATE evaluacion_virtual_semana SET {set_clause} "
                f"WHERE quincena_id = %s AND asignacion_id = %s AND semana_num = %s RETURNING *",
                list(updates.values()) + [quincena_id, asignacion_id, semana_num]
            )
    else:
        cur.execute("""
            INSERT INTO evaluacion_virtual_semana
                (quincena_id, docente_id, asignacion_id, semana_num,
                 ca_1, ca_2, ca_3, ca_4,
                 ev_1, ev_2, ev_3, ev_4,
                 obs_ca, obs_ev,
                 capturado_ca_por, capturado_ca_en,
                 capturado_ev_por, capturado_ev_en)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING *
        """, (
            quincena_id, asig['docente_id'], asignacion_id, semana_num,
            body.ca_1 if body.ca_1 is not None else 0.0,
            body.ca_2 if body.ca_2 is not None else 0.0,
            body.ca_3 if body.ca_3 is not None else 0.0,
            body.ca_4 if body.ca_4 is not None else 0.0,
            body.ev_1 if body.ev_1 is not None else 0.0,
            body.ev_2 if body.ev_2 is not None else 0.0,
            body.ev_3 if body.ev_3 is not None else 0.0,
            body.ev_4 if body.ev_4 is not None else 0.0,
            body.obs_ca, body.obs_ev,
            usuario.id if puede_ca else None, now if puede_ca else None,
            usuario.id if puede_ev else None, now if puede_ev else None,
        ))

    row = cur.fetchone()
    conn.commit()
    cur.close(); conn.close()
    return dict(row)


# ── POST /evaluacion/{quincena_id}/virtual/calcular ───────────────────────────

@router.post("/{quincena_id}/virtual/calcular")
async def calcular_resultados_virtual(
    quincena_id: int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Recalcula y guarda evaluacion_virtual_resultado para todas las asignaciones
    virtuales/mixtas de la quincena. Puede llamarse múltiples veces.
    """
    if usuario.rol not in ('director_cap_humano', 'cap_humano', 'educacion_virtual'):
        raise HTTPException(status_code=403, detail="Sin permiso para calcular evaluación virtual")

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT * FROM quincenas WHERE id = %s", (quincena_id,))
    q = cur.fetchone()
    if not q:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Quincena no encontrada")

    n_semanas = len(semanas_del_periodo(q['fecha_inicio'], q['fecha_fin']))
    params = _get_params(cur)

    cur.execute("""
        SELECT a.id AS asignacion_id, a.docente_id, a.horas_semana,
               COALESCE(a.costo_hora, p.costo_hora) AS tarifa
        FROM asignaciones a
        JOIN materias m ON a.materia_id = m.id
        JOIN programas p ON m.programa_id = p.id
        WHERE a.vigente_desde <= %s AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= %s)
          AND a.activa = true
          AND a.modalidad IN ('virtual', 'mixta')
    """, (q['fecha_fin'], q['fecha_inicio']))
    asignaciones = cur.fetchall()

    procesados = 0
    for asig in asignaciones:
        asig_id = asig['asignacion_id']
        horas_quincena = int(asig['horas_semana'] or 0) * n_semanas
        tarifa = float(asig['tarifa'] or 0)
        monto_base = horas_quincena * tarifa

        cur.execute("""
            SELECT * FROM evaluacion_virtual_semana
            WHERE quincena_id = %s AND asignacion_id = %s
            ORDER BY semana_num
        """, (quincena_id, asig_id))
        semanas = [dict(s) for s in cur.fetchall()]

        pct = _calcular_pct(semanas, n_semanas, params)
        horas_pagar = horas_quincena if pct['aprobada'] else 0
        monto_pagar = horas_pagar * tarifa
        monto_desc  = monto_base - monto_pagar

        cur.execute("""
            INSERT INTO evaluacion_virtual_resultado
                (quincena_id, docente_id, asignacion_id,
                 horas_quincena, tarifa, monto_base,
                 ca_contribution, ev_contribution, pct_cumplimiento,
                 aprobada, horas_reales_a_pagar, monto_a_pagar, monto_descontado,
                 calculado_en, validado_por)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),%s)
            ON CONFLICT (quincena_id, docente_id, asignacion_id) DO UPDATE SET
                horas_quincena       = EXCLUDED.horas_quincena,
                tarifa               = EXCLUDED.tarifa,
                monto_base           = EXCLUDED.monto_base,
                ca_contribution      = EXCLUDED.ca_contribution,
                ev_contribution      = EXCLUDED.ev_contribution,
                pct_cumplimiento     = EXCLUDED.pct_cumplimiento,
                aprobada             = EXCLUDED.aprobada,
                horas_reales_a_pagar = EXCLUDED.horas_reales_a_pagar,
                monto_a_pagar        = EXCLUDED.monto_a_pagar,
                monto_descontado     = EXCLUDED.monto_descontado,
                calculado_en         = NOW(),
                validado_por         = EXCLUDED.validado_por
        """, (
            quincena_id, asig['docente_id'], asig_id,
            horas_quincena, tarifa, monto_base,
            pct['ca_contribution'], pct['ev_contribution'], pct['pct_cumplimiento'],
            pct['aprobada'], horas_pagar, monto_pagar, monto_desc,
            usuario.id
        ))
        procesados += 1

    conn.commit()
    cur.close(); conn.close()
    return {'procesados': procesados, 'n_semanas': n_semanas, 'params': params}
