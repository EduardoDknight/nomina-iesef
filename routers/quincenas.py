from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual, solo_admin, puede_horarios, puede_quincenas

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/quincenas", tags=["quincenas"])

def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)

# ── Modelos ────────────────────────────────────────────────────────────────────

class QuincenaCreate(BaseModel):
    fecha_inicio: date
    fecha_fin:    date
    razon_social: str = "ambas"   # 'centro', 'instituto', 'ambas'
    ciclo:        str             # '2026-1', '2026-2', etc.

class QuincenaOut(BaseModel):
    id:           int
    fecha_inicio: date
    fecha_fin:    date
    razon_social: str
    estado:       str
    ciclo:        str
    creada_por:   Optional[int]
    creada_en:    datetime
    cerrada_por:  Optional[int] = None
    cerrada_en:   Optional[datetime] = None

class QuincenaResumen(QuincenaOut):
    total_docentes:   int = 0
    total_honorarios: float = 0.0
    pendientes_revision: int = 0

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[QuincenaOut])
async def listar_quincenas(
    estado: Optional[str] = None,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    conn = get_conn()
    cur = conn.cursor()
    if estado:
        cur.execute(
            "SELECT * FROM quincenas WHERE estado = %s ORDER BY fecha_inicio DESC",
            (estado,)
        )
    else:
        cur.execute("SELECT * FROM quincenas ORDER BY fecha_inicio DESC LIMIT 20")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [QuincenaOut(**r) for r in rows]

@router.get("/ciclos-disponibles")
async def get_ciclos_disponibles(_: UsuarioActual = Depends(get_usuario_actual)):
    """Ciclos distintos en asignaciones activas (para el selector al crear quincena)."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT ciclo_label FROM asignaciones WHERE activa = true ORDER BY ciclo_label")
    ciclos = [r["ciclo_label"] for r in cur.fetchall()]
    cur.close()
    conn.close()
    return ciclos

@router.get("/activa")
async def get_quincena_activa(_: UsuarioActual = Depends(get_usuario_actual)):
    """Retorna la quincena en estado abierta o en_revision."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM quincenas WHERE estado IN ('abierta', 'en_revision') ORDER BY fecha_inicio DESC LIMIT 1"
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="No hay quincena activa")
    return QuincenaOut(**row)

@router.get("/{quincena_id}", response_model=QuincenaResumen)
async def get_quincena(
    quincena_id: int,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM quincenas WHERE id = %s", (quincena_id,))
    q = cur.fetchone()
    if not q:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Quincena no encontrada")

    # Resumen de nómina
    cur.execute("""
        SELECT
            COUNT(*)           AS total_docentes,
            COALESCE(SUM(total_final), 0) AS total_honorarios
        FROM nomina_quincena
        WHERE quincena_id = %s
    """, (quincena_id,))
    resumen = cur.fetchone()

    # Incidencias pendientes
    cur.execute(
        "SELECT COUNT(*) AS pendientes FROM incidencias WHERE quincena_id = %s AND estado = 'pendiente'",
        (quincena_id,)
    )
    pendientes = cur.fetchone()

    cur.close()
    conn.close()

    return QuincenaResumen(
        **q,
        total_docentes=resumen["total_docentes"] or 0,
        total_honorarios=float(resumen["total_honorarios"] or 0),
        pendientes_revision=pendientes["pendientes"] or 0
    )

@router.post("", response_model=QuincenaOut, status_code=201)
async def crear_quincena(
    body: QuincenaCreate,
    usuario: UsuarioActual = Depends(puede_quincenas)
):
    if body.fecha_fin <= body.fecha_inicio:
        raise HTTPException(status_code=400, detail="fecha_fin debe ser posterior a fecha_inicio")

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO quincenas (fecha_inicio, fecha_fin, razon_social, ciclo, creada_por)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """, (body.fecha_inicio, body.fecha_fin, body.razon_social, body.ciclo, usuario.id))
        row = cur.fetchone()
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Ya existe una quincena con ese período y razón social")
    finally:
        cur.close()
        conn.close()
    return QuincenaOut(**row)

@router.patch("/{quincena_id}/estado")
async def cambiar_estado(
    quincena_id: int,
    nuevo_estado: str,
    usuario: UsuarioActual = Depends(puede_quincenas)
):
    """
    Transiciones válidas:
      abierta → en_revision → cerrada → pagada
    """
    transiciones_validas = {
        "abierta":      ["en_revision"],
        "en_revision":  ["abierta", "cerrada"],
        "cerrada":      ["pagada"],
        "pagada":       []
    }

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT estado FROM quincenas WHERE id = %s FOR UPDATE", (quincena_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Quincena no encontrada")

    estado_actual = row["estado"]
    if nuevo_estado not in transiciones_validas.get(estado_actual, []):
        cur.close()
        conn.close()
        raise HTTPException(
            status_code=400,
            detail=f"No se puede pasar de '{estado_actual}' a '{nuevo_estado}'"
        )

    # Si se está cerrando, registrar quién cerró
    if nuevo_estado == "cerrada":
        cur.execute("""
            UPDATE quincenas
            SET estado = %s, cerrada_por = %s, cerrada_en = NOW()
            WHERE id = %s
            RETURNING *
        """, (nuevo_estado, usuario.id, quincena_id))
    else:
        cur.execute(
            "UPDATE quincenas SET estado = %s WHERE id = %s RETURNING *",
            (nuevo_estado, quincena_id)
        )

    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return {"mensaje": f"Quincena actualizada a '{nuevo_estado}'", "quincena": QuincenaOut(**row)}


# ── ALIAS /resumen ─────────────────────────────────────────────────────────────

@router.get("/{quincena_id}/resumen", response_model=QuincenaResumen)
async def get_quincena_resumen(
    quincena_id: int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Alias de GET /{quincena_id} — devuelve la quincena con estadísticas."""
    return await get_quincena(quincena_id, usuario)


# ── ASISTENCIA ─────────────────────────────────────────────────────────────────

@router.get("/{quincena_id}/asistencia")
async def get_asistencia_quincena(
    quincena_id: int,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Docentes con asignaciones activas en el ciclo de la quincena.
    Incluye total de checadas brutas en el período y datos de nómina si ya fue calculada.
    """
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT * FROM quincenas WHERE id = %s", (quincena_id,))
    q = cur.fetchone()
    if not q:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Quincena no encontrada")

    cur.execute("""
        SELECT
            d.id,
            d.nombre_completo,
            d.chec_id,
            d.tipo,
            ARRAY_AGG(DISTINCT p.nombre ORDER BY p.nombre) AS programas,
            SUM(a.horas_semana)                             AS horas_semana_total,
            (
                -- Dedup: misma lógica que el endpoint de detalle (ventana 3 min)
                SELECT COUNT(*) FROM (
                    SELECT timestamp_checada,
                           LAG(timestamp_checada) OVER (ORDER BY timestamp_checada) AS prev_ts
                    FROM asistencias_checadas
                    WHERE user_id = d.chec_id
                      AND timestamp_checada >= %s::timestamp
                      AND timestamp_checada <  (%s::date + INTERVAL '1 day')::timestamp
                ) t
                WHERE prev_ts IS NULL
                   OR EXTRACT(EPOCH FROM (timestamp_checada - prev_ts)) > 180
            ) AS total_checadas,
            nq.horas_presenciales,
            nq.horas_virtuales,
            nq.horas_descuento,
            nq.estado AS nomina_estado
        FROM docentes d
        JOIN asignaciones a   ON a.docente_id   = d.id
                              AND a.vigente_desde <= %s
                              AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= %s)
                              AND a.activa       = true
        JOIN materias mat     ON a.materia_id    = mat.id
        JOIN programas p      ON mat.programa_id = p.id
        LEFT JOIN nomina_quincena nq
                             ON nq.docente_id   = d.id
                             AND nq.quincena_id = %s
        WHERE d.activo = true
          AND d.chec_id IS NOT NULL
        GROUP BY d.id, d.nombre_completo, d.chec_id, d.tipo,
                 nq.horas_presenciales, nq.horas_virtuales,
                 nq.horas_descuento, nq.estado
        ORDER BY d.nombre_completo
    """, (q['fecha_inicio'], q['fecha_fin'],   # total_checadas subquery
          q['fecha_fin'], q['fecha_inicio'],   # vigente_desde <= fecha_fin, vigente_hasta >= fecha_inicio
          quincena_id))

    rows = cur.fetchall()
    cur.close(); conn.close()

    result = []
    for r in rows:
        row = dict(r)
        row['programas'] = list(r['programas']) if r['programas'] else []
        result.append(row)
    return result


# ── INCIDENCIAS ────────────────────────────────────────────────────────────────

class IncidenciaCreate(BaseModel):
    docente_titular_id:  int
    asignacion_id:       int
    tipo:                str   # 'falta', 'retardo', 'suplencia'
    fecha:               date
    horas_afectadas:     float = 0
    docente_suplente_id: Optional[int]  = None
    horas_suplidas:      Optional[float] = None
    notas:               Optional[str]  = None


@router.get("/{quincena_id}/incidencias")
async def listar_incidencias(
    quincena_id: int,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            i.*,
            dt.nombre_completo AS docente_titular_nombre,
            ds.nombre_completo AS docente_suplente_nombre,
            mat.nombre         AS materia_nombre,
            p.nombre           AS programa_nombre,
            a.grupo,
            -- Horario como texto: bloque del día que corresponde a la fecha de la incidencia
            (
                SELECT TO_CHAR(hc.hora_inicio,'HH24:MI') || '-' || TO_CHAR(hc.hora_fin,'HH24:MI')
                FROM horario_clases hc
                WHERE hc.asignacion_id = a.id
                  AND hc.dia_semana::text = CASE EXTRACT(DOW FROM i.fecha)
                      WHEN 1 THEN 'lunes'
                      WHEN 2 THEN 'martes'
                      WHEN 3 THEN 'miercoles'
                      WHEN 4 THEN 'jueves'
                      WHEN 5 THEN 'viernes'
                      WHEN 6 THEN 'sabado'
                      ELSE 'domingo'
                  END
                ORDER BY hc.hora_inicio
                LIMIT 1
            ) AS horario_texto
        FROM incidencias i
        JOIN docentes dt  ON i.docente_titular_id  = dt.id
        LEFT JOIN docentes ds ON i.docente_suplente_id = ds.id
        JOIN asignaciones a   ON i.asignacion_id      = a.id
        JOIN materias mat     ON a.materia_id          = mat.id
        JOIN programas p      ON mat.programa_id       = p.id
        WHERE i.quincena_id = %s
        ORDER BY i.fecha, i.creado_en DESC
    """, (quincena_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [dict(r) for r in rows]


@router.post("/{quincena_id}/incidencias", status_code=201)
async def crear_incidencia(
    quincena_id: int,
    body: IncidenciaCreate,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    roles_ok = ('superadmin', 'director_cap_humano', 'cap_humano', 'coord_docente',
                'coord_academica', 'servicios_escolares')
    if usuario.rol not in roles_ok:
        raise HTTPException(status_code=403, detail="Sin permiso para registrar incidencias")

    # Cap. Humano y Director crean incidencias ya aprobadas (no requieren validación adicional)
    # Coord. Docente crea en estado validada_coord (ya revisó, falta aprobación de Cap. Humano)
    # Coord. Académica y otros crean en pendiente (requieren validación completa)
    if usuario.rol in ('director_cap_humano', 'cap_humano'):
        estado_inicial = 'aprobada'
    elif usuario.rol == 'coord_docente':
        estado_inicial = 'validada_coord'
    else:
        estado_inicial = 'pendiente'

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO incidencias
            (quincena_id, docente_titular_id, asignacion_id, tipo, fecha,
             horas_afectadas, docente_suplente_id, horas_suplidas,
             estado, registrado_por, notas)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING *
    """, (
        quincena_id, body.docente_titular_id, body.asignacion_id,
        body.tipo, body.fecha, body.horas_afectadas,
        body.docente_suplente_id, body.horas_suplidas,
        estado_inicial, usuario.id, body.notas
    ))
    row = cur.fetchone()
    conn.commit()
    cur.close(); conn.close()
    return dict(row)


@router.put("/{quincena_id}/incidencias/{incidencia_id}")
async def editar_incidencia(
    quincena_id:   int,
    incidencia_id: int,
    body: IncidenciaCreate,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Editar campos de una incidencia existente (solo si está en estado pendiente)."""
    roles_ok = ('superadmin', 'director_cap_humano', 'cap_humano', 'coord_docente',
                'coord_academica', 'servicios_escolares')
    if usuario.rol not in roles_ok:
        raise HTTPException(status_code=403, detail="Sin permiso para editar incidencias")

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT estado FROM incidencias WHERE id = %s AND quincena_id = %s",
                (incidencia_id, quincena_id))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    if row['estado'] not in ('pendiente',) and usuario.rol not in ('superadmin', 'director_cap_humano', 'cap_humano'):
        cur.close(); conn.close()
        raise HTTPException(status_code=409, detail="Solo Capital Humano puede editar incidencias ya validadas")

    cur.execute("""
        UPDATE incidencias
        SET tipo = %s, fecha = %s, horas_afectadas = %s,
            docente_suplente_id = %s, horas_suplidas = %s, notas = %s,
            asignacion_id = %s
        WHERE id = %s AND quincena_id = %s
        RETURNING *
    """, (
        body.tipo, body.fecha, body.horas_afectadas,
        body.docente_suplente_id, body.horas_suplidas, body.notas,
        body.asignacion_id, incidencia_id, quincena_id
    ))
    updated = cur.fetchone()
    conn.commit()
    cur.close(); conn.close()
    return dict(updated)


@router.patch("/{quincena_id}/incidencias/{incidencia_id}/estado")
async def actualizar_estado_incidencia(
    quincena_id:    int,
    incidencia_id:  int,
    nuevo_estado:   str,
    usuario:        UsuarioActual = Depends(get_usuario_actual)
):
    """
    coord_academica              → pendiente → validada_coord
    coord_docente / cap_humano / director → aprobada|rechazada (skip validada_coord si quieren)
    superadmin puede todo
    """
    puede_validar  = usuario.rol in ('coord_academica',)
    puede_aprobar  = usuario.rol in ('director_cap_humano', 'cap_humano', 'coord_docente')

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM incidencias WHERE id = %s AND quincena_id = %s",
        (incidencia_id, quincena_id)
    )
    inc = cur.fetchone()
    if not inc:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")

    if nuevo_estado == 'validada_coord':
        if not puede_validar and not puede_aprobar:
            raise HTTPException(status_code=403, detail="Sin permiso")
        cur.execute("""
            UPDATE incidencias
            SET estado = %s, validado_coord_por = %s, validado_coord_en = NOW()
            WHERE id = %s RETURNING *
        """, (nuevo_estado, usuario.id, incidencia_id))
    elif nuevo_estado in ('aprobada', 'rechazada'):
        if not puede_aprobar:
            raise HTTPException(status_code=403, detail="Solo Capital Humano puede aprobar/rechazar")
        cur.execute("""
            UPDATE incidencias
            SET estado = %s, aprobado_cap_por = %s, aprobado_cap_en = NOW()
            WHERE id = %s RETURNING *
        """, (nuevo_estado, usuario.id, incidencia_id))
    else:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail=f"Estado '{nuevo_estado}' no válido")

    row = cur.fetchone()
    conn.commit()
    cur.close(); conn.close()
    return dict(row)


# ── CAMPO CLÍNICO ─────────────────────────────────────────────────────────────

class CampoClinicoUpdate(BaseModel):
    monto:  float
    notas:  Optional[str]  = None   # alias: motivo_descuento en DB
    pagado: Optional[bool] = False  # alias: pago_completo en DB

@router.get("/{quincena_id}/campo_clinico")
async def listar_campo_clinico(
    quincena_id: int,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    """Lista supervisores de campo clínico con su monto editable para esta quincena."""
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT ciclo, fecha_inicio, fecha_fin FROM quincenas WHERE id = %s", (quincena_id,))
    q = cur.fetchone()
    if not q:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Quincena no encontrada")

    # Incluye docentes con asignación al programa 7 (campo clínico)
    # Y docentes con tipo='campo_clinico' aunque no tengan asignación al prog 7
    cur.execute("""
        SELECT
            d.id               AS docente_id,
            d.nombre_completo,
            d.numero_docente,
            p.nombre           AS programa_nombre,
            d.monto_fijo_quincenal AS monto_default,
            COALESCE(cc.monto, d.monto_fijo_quincenal) AS monto,
            cc.motivo_descuento  AS notas,
            COALESCE(cc.pago_completo, false) AS pagado,
            cc.id              AS registro_id
        FROM docentes d
        JOIN asignaciones a   ON a.docente_id = d.id
                              AND a.vigente_desde <= %s AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= %s)
                              AND a.activa = true
        JOIN materias mat     ON a.materia_id = mat.id AND mat.programa_id = 7
        JOIN programas p      ON p.id = mat.programa_id
        LEFT JOIN campo_clinico_quincena cc
                             ON cc.docente_id = d.id AND cc.quincena_id = %s
        WHERE d.activo = true

        UNION

        SELECT
            d.id               AS docente_id,
            d.nombre_completo,
            d.numero_docente,
            'Campo Clínico'    AS programa_nombre,
            d.monto_fijo_quincenal AS monto_default,
            COALESCE(cc.monto, d.monto_fijo_quincenal) AS monto,
            cc.motivo_descuento  AS notas,
            COALESCE(cc.pago_completo, false) AS pagado,
            cc.id              AS registro_id
        FROM docentes d
        LEFT JOIN campo_clinico_quincena cc
                             ON cc.docente_id = d.id AND cc.quincena_id = %s
        WHERE d.activo = true
          AND d.tipo = 'campo_clinico'
          AND NOT EXISTS (
              SELECT 1 FROM asignaciones ax
              JOIN materias mx ON ax.materia_id = mx.id AND mx.programa_id = 7
              WHERE ax.docente_id = d.id
                AND ax.vigente_desde <= %s AND (ax.vigente_hasta IS NULL OR ax.vigente_hasta >= %s)
                AND ax.activa = true
          )

        ORDER BY nombre_completo
    """, (q['fecha_fin'], q['fecha_inicio'], quincena_id,
          quincena_id,
          q['fecha_fin'], q['fecha_inicio']))

    rows = cur.fetchall()
    cur.close(); conn.close()
    return [dict(r) for r in rows]


@router.put("/{quincena_id}/campo_clinico/{docente_id}")
async def actualizar_campo_clinico(
    quincena_id: int,
    docente_id:  int,
    body: CampoClinicoUpdate,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Permite a cap_humano, coord_docente y director_cap_humano editar campo clínico."""
    ROLES_PERMITIDOS = {'superadmin', 'cap_humano', 'director_cap_humano', 'coord_docente'}
    if usuario.rol not in ROLES_PERMITIDOS:
        raise HTTPException(status_code=403, detail="Sin permiso para editar campo clínico")

    conn = get_conn()
    cur = conn.cursor()

    # Upsert manual: la tabla no tiene UNIQUE constraint (nomina_user no es owner)
    cur.execute(
        "SELECT id FROM campo_clinico_quincena WHERE quincena_id=%s AND docente_id=%s",
        (quincena_id, docente_id)
    )
    existing = cur.fetchone()

    if existing:
        cur.execute("""
            UPDATE campo_clinico_quincena
            SET monto=%s, motivo_descuento=%s, pago_completo=%s, registrado_por=%s
            WHERE id=%s RETURNING *
        """, (body.monto, body.notas, body.pagado, usuario.id, existing['id']))
    else:
        cur.execute("""
            INSERT INTO campo_clinico_quincena
                (quincena_id, docente_id, monto, motivo_descuento, pago_completo, registrado_por)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING *
        """, (quincena_id, docente_id, body.monto, body.notas, body.pagado, usuario.id))

    row = cur.fetchone()
    conn.commit()
    cur.close(); conn.close()
    return dict(row)


class CampoClinicoAdd(BaseModel):
    docente_id: int
    monto:      Optional[float] = None  # None = usar monto_fijo_quincenal del docente

@router.post("/{quincena_id}/campo_clinico", status_code=201)
async def agregar_campo_clinico(
    quincena_id: int,
    body: CampoClinicoAdd,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Agrega un supervisor a campo clínico para esta quincena.
    Si el docente no tiene asignación activa para campo clínico en el ciclo, la crea.
    """
    ROLES_PERMITIDOS = {'superadmin', 'cap_humano', 'director_cap_humano', 'coord_docente'}
    if usuario.rol not in ROLES_PERMITIDOS:
        raise HTTPException(status_code=403, detail="Sin permiso para agregar supervisor")

    conn = get_conn()
    cur = conn.cursor()

    # Obtener ciclo y verificar que la quincena existe
    cur.execute("SELECT ciclo FROM quincenas WHERE id = %s", (quincena_id,))
    q = cur.fetchone()
    if not q:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Quincena no encontrada")
    ciclo = q['ciclo']

    # Verificar que el docente existe
    cur.execute("SELECT id, nombre_completo, monto_fijo_quincenal FROM docentes WHERE id = %s AND activo = true",
                (body.docente_id,))
    doc = cur.fetchone()
    if not doc:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Docente no encontrado")

    # Verificar que no esté ya en campo clínico para esta quincena
    cur.execute("""
        SELECT a.id FROM asignaciones a
        JOIN materias mat ON a.materia_id = mat.id AND mat.programa_id = 7
        WHERE a.docente_id = %s
          AND a.vigente_desde <= %s AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= %s)
          AND a.activa = true
        LIMIT 1
    """, (body.docente_id, q['fecha_fin'], q['fecha_inicio']))
    asig = cur.fetchone()

    if not asig:
        # Crear asignación a campo clínico
        cur.execute("""
            INSERT INTO asignaciones
                (docente_id, materia_id, grupo, horas_semana, modalidad, costo_hora, ciclo_label, activa, vigente_desde)
            VALUES (%s, 289, 'Campo Clínico', 0, 'presencial', 0, %s, true, %s)
            RETURNING id
        """, (body.docente_id, ciclo, q['fecha_inicio']))
        asig = cur.fetchone()

    # Monto: usar el del body, o el del docente, o $2,500 por defecto
    monto = body.monto if body.monto is not None else (
        float(doc['monto_fijo_quincenal']) if doc['monto_fijo_quincenal'] else 2500.0
    )

    # Verificar que no esté ya en campo_clinico_quincena
    cur.execute("SELECT id FROM campo_clinico_quincena WHERE quincena_id=%s AND docente_id=%s",
                (quincena_id, body.docente_id))
    cc = cur.fetchone()
    if cc:
        # Ya existe — actualizar (reactivar si estaba dado de baja)
        cur.execute("""
            UPDATE campo_clinico_quincena
            SET monto=%s, pago_completo=false, motivo_descuento=NULL, registrado_por=%s
            WHERE id=%s
        """, (monto, usuario.id, cc['id']))
    else:
        cur.execute("""
            INSERT INTO campo_clinico_quincena
                (quincena_id, docente_id, monto, pago_completo, registrado_por)
            VALUES (%s, %s, %s, false, %s)
        """, (quincena_id, body.docente_id, monto, usuario.id))

    conn.commit()
    cur.close(); conn.close()
    return {"ok": True, "docente_id": body.docente_id, "monto": monto}


@router.patch("/{quincena_id}/campo_clinico/{docente_id}/baja")
async def baja_campo_clinico(
    quincena_id: int,
    docente_id:  int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Marca al supervisor como 'sin prácticas esta quincena' (monto=0, pago_completo=false).
    No elimina la asignación — seguirá apareciendo en quincenas futuras.
    """
    ROLES_PERMITIDOS = {'superadmin', 'cap_humano', 'director_cap_humano', 'coord_docente'}
    if usuario.rol not in ROLES_PERMITIDOS:
        raise HTTPException(status_code=403, detail="Sin permiso")

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM campo_clinico_quincena WHERE quincena_id=%s AND docente_id=%s",
                (quincena_id, docente_id))
    cc = cur.fetchone()
    if cc:
        cur.execute("""
            UPDATE campo_clinico_quincena
            SET monto=0, pago_completo=false, motivo_descuento='Sin prácticas esta quincena'
            WHERE id=%s
        """, (cc['id'],))
    else:
        cur.execute("""
            INSERT INTO campo_clinico_quincena
                (quincena_id, docente_id, monto, pago_completo, motivo_descuento)
            VALUES (%s, %s, 0, false, 'Sin prácticas esta quincena')
        """, (quincena_id, docente_id))

    conn.commit()
    cur.close(); conn.close()
    return {"ok": True}


@router.delete("/{quincena_id}/campo_clinico/{docente_id}", status_code=200)
async def eliminar_campo_clinico(
    quincena_id: int,
    docente_id:  int,
    permanente:  bool = False,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Elimina el registro de campo clínico de un docente en esta quincena.
    Si permanente=true, además desactiva su(s) asignación(es) de campo clínico
    (programa_id=7) para que no aparezca en quincenas futuras.
    """
    ROLES = ['superadmin', 'director_cap_humano', 'cap_humano', 'coord_docente', 'admin']
    if usuario.rol not in ROLES:
        raise HTTPException(403, "Sin permisos")

    conn = get_conn()
    cur = conn.cursor()

    # 1. Eliminar registro de esta quincena
    cur.execute(
        "DELETE FROM campo_clinico_quincena WHERE quincena_id=%s AND docente_id=%s RETURNING id",
        (quincena_id, docente_id)
    )
    deleted = cur.fetchone()

    if not deleted:
        conn.rollback(); cur.close(); conn.close()
        raise HTTPException(404, "Registro no encontrado")

    # 2. Si permanente, desactivar asignaciones de campo clínico del docente
    asignaciones_desactivadas = 0
    if permanente:
        cur.execute("""
            UPDATE asignaciones
            SET activa = false
            WHERE docente_id = %s
              AND activa = true
              AND materia_id IN (
                  SELECT id FROM materias WHERE programa_id = 7
              )
        """, (docente_id,))
        asignaciones_desactivadas = cur.rowcount

    conn.commit()
    cur.close(); conn.close()
    return {"ok": True, "permanente": permanente, "asignaciones_desactivadas": asignaciones_desactivadas}


# ── CHECADAS DETALLE POR DOCENTE ───────────────────────────────────────────────

@router.get("/{quincena_id}/asistencia/{docente_id}/checadas")
async def get_checadas_docente(
    quincena_id: int,
    docente_id:  int,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Retorna las clases del docente en el período con sus checadas de entrada/salida.

    Reglas aplicadas:
    - Dedup: checadas dentro de 3-min se colapsan a la primera (misma checada repetida).
    - Back-to-back: si dos clases son consecutivas sin brecha, la checada en la
      frontera sirve como salida de la clase A Y entrada de la clase B.
    - Una checada NO comparte clases si hay brecha de tiempo entre ellas.
    """
    from datetime import timedelta as td

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT * FROM quincenas WHERE id = %s", (quincena_id,))
    q = cur.fetchone()
    if not q:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Quincena no encontrada")

    cur.execute("SELECT id, nombre_completo, chec_id FROM docentes WHERE id = %s", (docente_id,))
    docente = cur.fetchone()
    if not docente or not docente['chec_id']:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Docente no encontrado o sin chec_id")

    cur.execute("""
        SELECT id, timestamp_checada, tipo_punch, id_dispositivo
        FROM asistencias_checadas
        WHERE user_id = %s
          AND timestamp_checada >= %s::timestamp
          AND timestamp_checada <  (%s::date + INTERVAL '1 day')::timestamp
        ORDER BY timestamp_checada
    """, (docente['chec_id'], q['fecha_inicio'], q['fecha_fin']))
    checadas_raw = list(cur.fetchall())

    cur.execute("""
        SELECT
            hc.dia_semana, hc.hora_inicio, hc.hora_fin, hc.horas_bloque,
            mat.nombre AS materia_nombre,
            p.nombre   AS programa_nombre,
            a.grupo, a.id AS asignacion_id, a.modalidad
        FROM horario_clases hc
        JOIN asignaciones a  ON hc.asignacion_id = a.id
        JOIN materias mat    ON a.materia_id = mat.id
        JOIN programas p     ON mat.programa_id = p.id
        WHERE a.docente_id = %s
          AND a.vigente_desde <= %s AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= %s)
          AND a.activa = true
    """, (docente_id, q['fecha_fin'], q['fecha_inicio']))
    horarios = list(cur.fetchall())

    cur.close(); conn.close()

    DIAS = {'lunes': 0, 'martes': 1, 'miercoles': 2, 'jueves': 3,
            'viernes': 4, 'sabado': 5, 'domingo': 6}
    DIAS_LABEL     = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
    TOL_ENTRADA    = 10   # minutos
    MAX_TOL_SALIDA = 20   # minutos

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
                break  # lista ordenada, ya no hay más dentro de ventana

    # ── 2. Expandir horarios a fechas concretas del período ───────────────────
    clases = []
    current = q['fecha_inicio']
    while current <= q['fecha_fin']:
        wd = current.weekday()
        for h in horarios:
            if DIAS.get(h['dia_semana'], -1) == wd:
                ini_m = h['hora_inicio'].hour * 60 + h['hora_inicio'].minute
                fin_m = h['hora_fin'].hour   * 60 + h['hora_fin'].minute
                hb    = float(h['horas_bloque']) if h['horas_bloque'] else (fin_m - ini_m) / 60
                tol_s = min(int(hb * 10), MAX_TOL_SALIDA)
                modalidad = h['modalidad'] or 'presencial'
                # sesión virtual si: modalidad='virtual' siempre,
                # o modalidad='mixta' en día L-V (wd 0-4); sábados son presenciales
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

    # Una checada puede quedar "usada" en MÚLTIPLES clases si son back-to-back
    usadas: set = set()

    for fecha, cls_dia in cls_by_date.items():
        cls_dia.sort(key=lambda c: c['ini_m'])
        chk_dia = chk_by_date.get(fecha, [])
        n = len(cls_dia)

        for ci, clase in enumerate(cls_dia):
            ini   = clase['ini_m']
            fin   = clase['fin_m']
            tol_s = clase['tol_s']

            # ¿Contigua con la anterior? (fin_prev == ini_esta ±5 min)
            prev     = cls_dia[ci - 1] if ci > 0 else None
            btb_prev = prev is not None and abs(prev['fin_m'] - ini) <= 5

            # ¿Contigua con la siguiente?
            nxt      = cls_dia[ci + 1] if ci < n - 1 else None
            btb_next = nxt is not None and abs(fin - nxt['ini_m']) <= 5

            # Ventana entrada: [ent_ini, fin-21]
            # - ent_ini a ini:                  entrada_ok (llegó antes del inicio)
            # - ini+1   a ini+TOL_ENTRADA(10):  retardo (dentro de tolerancia, se paga)
            # - ini+11  a fin-21:               falta   (>10 min tarde — evidencia, no se paga)
            # Se cierra en fin-21 para NO solapar con la ventana de salida [fin-tol_s, …].
            #
            # Regla de entrada temprana (hasta 30 min antes):
            #   • Primera clase del día o gap amplio → acepta hasta ini-30
            #   • Hay clase previa con gap:  ent_ini = max(ini-30, prev_sal_fin+1)
            #     → descarta checadas que podrían ser salida de la clase anterior
            #   • Clases back-to-back: extiende hasta el inicio de la ventana de salida prev
            #     → permite la checada compartida (salida A / entrada B)
            ent_ini = ini - 30
            if prev is not None:
                if btb_prev:
                    # back-to-back: retroceder hasta sal_ini_prev para captura compartida
                    ent_ini = min(ent_ini, prev['fin_m'] - prev['tol_s'])
                else:
                    # hay gap: no aceptar checadas dentro de la ventana de salida anterior
                    prev_sal_fin = prev['fin_m'] + 15
                    ent_ini = max(ent_ini, prev_sal_fin + 1)
            ent_fin = fin - 21   # cierra antes de la ventana de salida (fin-20)

            # Ventana salida: [fin-tol_s, sal_fin]
            # - Hasta 30 min después del fin se acepta como salida (informativa)
            # - Si btb_next: extender hasta [nxt.ini + TOL_ENTRADA] para captura compartida
            # - Si hay siguiente clase con gap: no solapar con su ventana de entrada
            sal_ini = fin - tol_s
            sal_fin = fin + 30   # base: hasta 30 min después
            if nxt is not None:
                if btb_next:
                    sal_fin = max(sal_fin, nxt['ini_m'] + TOL_ENTRADA)
                else:
                    # hay gap: cerrar antes de la ventana de entrada de la próxima clase
                    nxt_ent_ini = nxt['ini_m'] - 30
                    sal_fin = min(sal_fin, nxt_ent_ini - 1)

            best_ent = best_sal = None
            best_ent_d = best_sal_d = None

            for idx, ch in chk_dia:
                hm = ch['timestamp_checada'].hour * 60 + ch['timestamp_checada'].minute

                if ent_ini <= hm <= ent_fin:
                    d = abs(hm - ini)
                    if best_ent_d is None or d < best_ent_d:
                        best_ent   = (idx, ch, hm)
                        best_ent_d = d

                if sal_ini <= hm <= sal_fin:
                    d = abs(hm - fin)
                    if best_sal_d is None or d < best_sal_d:
                        best_sal   = (idx, ch, hm)
                        best_sal_d = d

            if best_ent:
                hm = best_ent[2]
                if hm <= ini:
                    est_ent = 'entrada_ok'      # llegó antes del inicio (sin nota)
                elif hm <= ini + TOL_ENTRADA:
                    est_ent = 'retardo'          # 1-10 min tarde — dentro de tolerancia, se paga
                else:
                    est_ent = 'falta'            # >10 min tarde — falta, no se paga, se muestra como evidencia
                clase['_ent'] = {
                    'ts':     best_ent[1]['timestamp_checada'].strftime('%H:%M'),
                    'estado': est_ent,
                }
                usadas.add(best_ent[0])

            if best_sal:
                hm = best_sal[2]
                if hm < fin:
                    est_sal = 'salida_anticipada'   # salió antes del fin (dentro de tolerancia)
                elif hm <= fin + 15:
                    est_sal = 'salida_ok'            # salió puntual o hasta 15 min después
                else:
                    est_sal = 'salida_tarde'         # salió 16-30 min después del fin (informativo)
                clase['_sal'] = {
                    'ts':     best_sal[1]['timestamp_checada'].strftime('%H:%M'),
                    'estado': est_sal,
                }
                usadas.add(best_sal[0])

    # ── 4. Checadas sin clase ─────────────────────────────────────────────────
    sin_clase = []
    for i, ch in enumerate(dedup):
        if i not in usadas:
            ts = ch['timestamp_checada']
            sin_clase.append({
                'fecha': ts.strftime('%a %d %b'),
                'ts':    ts.strftime('%H:%M'),
                'tipo':  'Entrada' if ch['tipo_punch'] == 0 else 'Salida',
            })

    # ── 4.5. Cadenas back-to-back con extremos checados: continuidad ──────────
    # Una cadena = secuencia de clases presenciales consecutivas el mismo día
    # (fin_A == ini_B ±5 min). Si la cadena está ANCLADA (primera tiene _ent
    # y última tiene _sal), todas las clases incompletas se pagan por continuidad.
    #
    # Tres casos de clases dentro de la cadena:
    #   _asumida       = sin ninguna checada (ni entrada ni salida)
    #   _continuidad_parcial = tiene UNA checada pero le falta la otra
    #   _alerta_cadena = flag de aviso en TODA la cadena cuando hay incompletas
    hay_alerta_continuidad = False

    for fecha, cls_dia in cls_by_date.items():
        cls_dia.sort(key=lambda c: c['ini_m'])
        n = len(cls_dia)
        if n < 2:
            continue

        # Identificar cadenas continuas (solo clases presenciales)
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
            # Filtrar virtuales de la cadena para la lógica de continuidad
            presenciales = [c for c in cadena if not c.get('es_virtual')]
            if len(presenciales) < 2:
                continue
            primera = presenciales[0]
            ultima  = presenciales[-1]
            # Cadena anclada: primera tiene entrada Y última tiene salida
            if primera['_ent'] is None or ultima['_sal'] is None:
                continue
            # ¿Hay alguna clase incompleta en la cadena?
            incompletas = [
                c for c in presenciales
                if c['_ent'] is None or c['_sal'] is None
            ]
            if not incompletas:
                continue  # Todos tienen checadas completas — no se necesita continuidad

            hay_alerta_continuidad = True
            # Marcar toda la cadena con alerta
            for c in presenciales:
                c['_alerta_cadena'] = True

            # Clasificar cada clase incompleta
            for c in presenciales:
                if c['_ent'] is None and c['_sal'] is None:
                    c['_asumida'] = True        # Completamente vacía
                elif c['_ent'] is None or c['_sal'] is None:
                    c['_continuidad_parcial'] = True   # Tiene una checada, falta la otra

    # ── 5. Construir respuesta ────────────────────────────────────────────────
    horas_checadas     = 0.0
    horas_asumidas     = 0.0
    horas_continuidad  = 0.0   # parcialmente verificadas, pagadas por cadena

    clases_resp = []
    for c in clases:
        tiene_ent  = c['_ent'] is not None
        tiene_sal  = c['_sal'] is not None
        asumida    = c.get('_asumida', False)
        cont_parc  = c.get('_continuidad_parcial', False)
        alerta     = c.get('_alerta_cadena', False)

        hb         = (c['fin_m'] - c['ini_m']) / 60.0  # horas del bloque
        es_virtual = c.get('es_virtual', False)

        # Sub-estado de la entrada (para determinar si se paga)
        ent_estado   = c['_ent']['estado'] if tiene_ent else None
        es_falta_ent = ent_estado == 'falta'   # llegó >10 min tarde → falta, no se paga

        if es_virtual:
            est = 'virtual'
        elif asumida:
            est = 'asumida_por_continuidad'
            horas_asumidas += hb
        elif cont_parc:
            # Tiene UNA checada y es parte de cadena anclada → pagar por continuidad
            est = 'sin_salida_continuidad' if tiene_ent else 'sin_entrada_continuidad'
            horas_continuidad += hb
        elif es_falta_ent:
            # Llegó >10 min tarde → falta para efectos de pago, pero se registra como evidencia
            est = 'falta_con_registro'
            # NO suma a horas_checadas
        elif tiene_ent and tiene_sal:
            est = 'completa'
            horas_checadas += hb
        elif tiene_ent or tiene_sal:
            est = 'sin_salida' if tiene_ent else 'sin_entrada'
            horas_checadas += hb
        else:
            est = 'sin_checadas'

        clases_resp.append({
            'fecha':      c['fecha'].isoformat(),
            'dia':        DIAS_LABEL[c['wd']],
            'materia':    c['materia'],
            'grupo':      c['grupo'],
            'programa':   c['programa'],
            'modalidad':  c.get('modalidad', 'presencial'),
            'es_virtual': es_virtual,
            'horario':    f"{c['hora_ini']}-{c['hora_fin']}",
            'horas':      round(hb, 2),
            'entrada':    c['_ent'],
            'salida':     c['_sal'],
            'estado':     est,
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

    # ── 7. Overrides manuales de pago ─────────────────────────────────────────
    overrides_map = {}
    try:
        cur.execute("""
            SELECT o.fecha::text, o.hora_ini::text, o.hora_fin::text,
                   o.decision, o.motivo,
                   u.nombre AS registrado_por_nombre,
                   TO_CHAR(o.registrado_en AT TIME ZONE 'America/Mexico_City', 'DD/MM/YY HH24:MI') AS registrado_en
            FROM overrides_pago_clase o
            LEFT JOIN usuarios u ON u.id = o.registrado_por
            WHERE o.quincena_id = %s AND o.docente_id = %s
        """, (quincena_id, docente_id))
        for r in cur.fetchall():
            key = (r['fecha'], r['hora_ini'][:5], r['hora_fin'][:5])
            overrides_map[key] = {
                'decision':   r['decision'],
                'motivo':     r['motivo'],
                'por':        r['registrado_por_nombre'],
                'en':         r['registrado_en'],
            }
    except Exception:
        pass   # la tabla puede no existir aún en el servidor

    for c in clases_resp:
        h_ini, h_fin = c['horario'].split('-')
        c['override'] = overrides_map.get((c['fecha'], h_ini, h_fin))

    return {
        'docente_id':         docente_id,
        'docente_nombre':     docente['nombre_completo'],
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
    }


# ── Override manual de pago por clase ─────────────────────────────────────────

class OverrideBody(BaseModel):
    fecha:    date
    hora_ini: str              # 'HH:MM'
    hora_fin: str              # 'HH:MM'
    decision: str              # 'pagar' | 'no_pagar' | 'auto' (elimina el override)
    motivo:   Optional[str] = None

ROLES_OVERRIDE = {'superadmin', 'director_cap_humano', 'cap_humano', 'coord_docente', 'admin'}

@router.post("/{quincena_id}/asistencia/{docente_id}/override")
async def set_override_clase(
    quincena_id: int,
    docente_id:  int,
    body: OverrideBody,
    usuario: UsuarioActual = Depends(get_usuario_actual),
):
    if usuario.rol not in ROLES_OVERRIDE:
        raise HTTPException(403, "Sin permiso para ajustar pagos de clases")

    conn = get_conn()
    try:
        cur = conn.cursor()

        if body.decision == 'auto':
            # Eliminar override → vuelve al cálculo automático
            cur.execute("""
                DELETE FROM overrides_pago_clase
                WHERE quincena_id = %s AND docente_id = %s
                  AND fecha = %s AND hora_ini = %s::time AND hora_fin = %s::time
            """, (quincena_id, docente_id, body.fecha, body.hora_ini, body.hora_fin))
        else:
            if body.decision not in ('pagar', 'no_pagar'):
                raise HTTPException(400, "decision debe ser 'pagar', 'no_pagar' o 'auto'")
            cur.execute("""
                INSERT INTO overrides_pago_clase
                    (quincena_id, docente_id, fecha, hora_ini, hora_fin,
                     decision, motivo, registrado_por)
                VALUES (%s, %s, %s, %s::time, %s::time, %s, %s, %s)
                ON CONFLICT (quincena_id, docente_id, fecha, hora_ini, hora_fin)
                DO UPDATE SET
                    decision       = EXCLUDED.decision,
                    motivo         = EXCLUDED.motivo,
                    registrado_por = EXCLUDED.registrado_por,
                    registrado_en  = NOW()
            """, (
                quincena_id, docente_id, body.fecha, body.hora_ini, body.hora_fin,
                body.decision, body.motivo, usuario.id,
            ))

        conn.commit()

        # Recalcular nomina_quincena del docente para reflejar el override
        try:
            cur.execute("SELECT fecha_inicio, fecha_fin FROM quincenas WHERE id = %s", (quincena_id,))
            q = cur.fetchone()
            if q:
                from services.calculo_nomina import calcular_nomina_docente, guardar_nomina
                resultado = calcular_nomina_docente(
                    conn, docente_id, quincena_id, q['fecha_inicio'], q['fecha_fin']
                )
                if not resultado.error:
                    guardar_nomina(conn, resultado, usuario.id)
                    conn.commit()
        except Exception as e_calc:
            logger.warning(f"Override guardado pero no se pudo recalcular nomina: {e_calc}")

        return {'ok': True, 'decision': body.decision}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error al guardar override: {e}", exc_info=True)
        raise HTTPException(500, f"Error al guardar el ajuste: {e}")
    finally:
        conn.close()
