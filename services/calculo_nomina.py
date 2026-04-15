"""
Motor de cálculo de nómina IESEF
Fórmula fija Art. 106 LISR — honorarios profesionales

Flujo:
  1. Por cada docente en la quincena, recopilar horas por programa
  2. Calcular honorarios brutos (horas × tarifa por programa)
  3. Consolidar en un solo total de honorarios
  4. Aplicar fórmula fiscal sobre el total consolidado
  5. Sumar ajustes de quincenas anteriores
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional
from dataclasses import dataclass, field
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

logger = logging.getLogger(__name__)

# ── Tipos de datos ─────────────────────────────────────────────────────────────

@dataclass
class DetallePrograma:
    programa_id:       int
    programa_nombre:   str
    costo_hora:        Decimal
    horas_presenciales: Decimal = Decimal("0")
    horas_virtuales:   Decimal = Decimal("0")
    horas_suplencia:   Decimal = Decimal("0")
    horas_reales:      Decimal = Decimal("0")
    honorarios:        Decimal = Decimal("0")

@dataclass
class ResultadoNomina:
    docente_id:          int
    docente_nombre:      str
    quincena_id:         int
    detalle_programas:   List[DetallePrograma] = field(default_factory=list)
    # totales
    horas_programadas:   Decimal = Decimal("0")
    horas_presenciales:  Decimal = Decimal("0")
    horas_virtuales:     Decimal = Decimal("0")
    horas_suplencia:     Decimal = Decimal("0")
    horas_reales:        Decimal = Decimal("0")
    horas_descuento:     Decimal = Decimal("0")
    horas_continuidad:   Decimal = Decimal("0")   # presenciales pagadas por cadena back-to-back
    # fiscal (Art. 106 LISR)
    honorarios:          Decimal = Decimal("0")  # horas_reales × costo_hora (multi-prog)
    iva:                 Decimal = Decimal("0")  # honorarios × 0.16
    sub_total:           Decimal = Decimal("0")  # honorarios + iva
    retencion_isr:       Decimal = Decimal("0")  # honorarios × 0.10
    retencion_iva:       Decimal = Decimal("0")  # iva × (2/3)
    total_a_pagar:       Decimal = Decimal("0")  # sub_total - isr - ret_iva
    ajustes:             Decimal = Decimal("0")
    total_final:         Decimal = Decimal("0")  # total_a_pagar + ajustes
    # campo clínico (pago fijo adicional)
    monto_campo_clinico: Decimal = Decimal("0")
    # tiempo completo: sueldo fijo separado de las horas extra
    monto_fijo_tc:       Decimal = Decimal("0")
    horas_dentro_jornada: Decimal = Decimal("0")  # horas asistidas pero NO pagadas (cubiertas por sueldo fijo)
    error:               Optional[str] = None

# ── Fórmula fiscal ─────────────────────────────────────────────────────────────

def aplicar_formula_fiscal(honorarios_brutos: Decimal) -> dict:
    """
    Art. 106 LISR — Honorarios profesionales.
    Entrada: honorarios brutos (suma de todos los programas del docente).
    Retorna dict con todos los componentes fiscales, redondeados a 2 decimales.

    Verificado contra Excel real:
      6h × $120 = $720 → IVA $115.20 → Sub $835.20
      ISR $72.00 → Ret.IVA $76.80 → TOTAL $686.40 ✅
    """
    IVA_RATE     = Decimal("0.16")
    ISR_RATE     = Decimal("0.10")
    RET_IVA_RATE = Decimal("2") / Decimal("3")   # ≈ 0.6667
    CENTS        = Decimal("0.01")

    hon   = honorarios_brutos.quantize(CENTS, rounding=ROUND_HALF_UP)
    iva   = (hon * IVA_RATE).quantize(CENTS, rounding=ROUND_HALF_UP)
    sub   = (hon + iva).quantize(CENTS, rounding=ROUND_HALF_UP)
    isr   = (hon * ISR_RATE).quantize(CENTS, rounding=ROUND_HALF_UP)
    r_iva = (iva * RET_IVA_RATE).quantize(CENTS, rounding=ROUND_HALF_UP)
    total = (sub - isr - r_iva).quantize(CENTS, rounding=ROUND_HALF_UP)

    return {
        "honorarios":    hon,
        "iva":           iva,
        "sub_total":     sub,
        "retencion_isr": isr,
        "retencion_iva": r_iva,
        "total_a_pagar": total,
    }

# ── Helpers TC ────────────────────────────────────────────────────────────────

def _minutos(t) -> int:
    """Convierte un objeto time a minutos desde medianoche."""
    return t.hour * 60 + t.minute if t else 0

def _horas_fuera_jornada(hora_ini_bloque, hora_fin_bloque, jornadas_dia: list) -> Decimal:
    """
    Calcula las horas del bloque que caen FUERA de la jornada contrato.
    Ejemplo: bloque 7:00-9:00, jornada 8:00-16:00  → 1 hora fuera (7:00-8:00)
    Ejemplo: bloque 8:00-10:00, jornada 8:00-16:00 → 0 horas (todo dentro)
    Ejemplo: bloque 15:00-17:00, jornada 8:00-16:00 → 1 hora fuera (16:00-17:00)

    jornadas_dia: lista de (hora_entrada, hora_salida) para ese día.
    Si el docente no tiene jornada ese día, TODO el bloque se paga.
    """
    ini_b = _minutos(hora_ini_bloque)
    fin_b = _minutos(hora_fin_bloque)
    total_bloque = fin_b - ini_b
    if total_bloque <= 0:
        return Decimal("0")
    if not jornadas_dia:
        return Decimal(str(total_bloque)) / Decimal("60")

    # Calcular minutos del bloque cubiertos por CUALQUIER jornada (unión de intervalos)
    cubiertos = 0
    for (j_ent, j_sal) in jornadas_dia:
        j_ini = _minutos(j_ent)
        j_fin = _minutos(j_sal)
        overlap_ini = max(ini_b, j_ini)
        overlap_fin = min(fin_b, j_fin)
        if overlap_fin > overlap_ini:
            cubiertos += overlap_fin - overlap_ini

    minutos_fuera = max(0, total_bloque - cubiertos)
    return Decimal(str(minutos_fuera)) / Decimal("60")


# ── Motor principal ────────────────────────────────────────────────────────────

def calcular_nomina_docente(
    conn,
    docente_id: int,
    quincena_id: int,
    fecha_inicio,
    fecha_fin,
    razon_social: str = "ambas"   # 'centro', 'instituto', 'ambas'
) -> ResultadoNomina:
    """
    Calcula la nómina completa de un docente para una quincena.
    Usa psycopg2 directo (sin SQLAlchemy).
    """
    cur = conn.cursor(cursor_factory=RealDictCursor)
    resultado = ResultadoNomina(docente_id=docente_id, docente_nombre="", quincena_id=quincena_id)

    try:
        # Datos del docente
        cur.execute("""
            SELECT d.id, d.nombre_completo, d.tipo, d.monto_fijo_quincenal
            FROM docentes d WHERE d.id = %s AND d.activo = true
        """, (docente_id,))
        docente = cur.fetchone()
        if not docente:
            resultado.error = f"Docente {docente_id} no encontrado"
            return resultado
        resultado.docente_nombre = docente["nombre_completo"]

        # ── TC: cargar jornada contrato ──────────────────────────────────────
        # jornada_tc = {'lunes': [(time_entrada, time_salida), ...], ...}
        es_tc = (docente["tipo"] == "tiempo_completo")
        jornada_tc: dict = {}
        if es_tc:
            resultado.monto_fijo_tc = Decimal(str(docente.get("monto_fijo_quincenal") or "0"))
            cur.execute("""
                SELECT lunes, martes, miercoles, jueves, viernes, sabado, domingo,
                       hora_entrada, hora_salida
                FROM horarios_docente_tc
                WHERE docente_id = %s
            """, (docente_id,))
            for jrow in cur.fetchall():
                for dia in ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']:
                    if jrow[dia]:
                        jornada_tc.setdefault(dia, []).append(
                            (jrow['hora_entrada'], jrow['hora_salida'])
                        )

        # ── 1. Horas presenciales por programa ──────────────────────────────
        # Genera una fila por (horario_clase × fecha real en la quincena) para
        # contar correctamente múltiples ocurrencias del mismo día de semana.
        # Ej: Mar 11-25 tiene 2 lunes, 2 martes, 3 miércoles → cada uno se valida.
        cur.execute("""
            WITH
            fechas AS (
                SELECT gs::date AS fecha,
                       EXTRACT(DOW FROM gs) AS dow
                FROM generate_series(%s::date, %s::date, '1 day'::interval) gs
                WHERE EXTRACT(DOW FROM gs) != 0   -- excluir domingos
            ),
            checadas AS (
                SELECT
                    DATE(ac.timestamp_checada)   AS fecha,
                    ac.timestamp_checada::time   AS hora,
                    ac.tipo_punch
                FROM asistencias_checadas ac
                WHERE ac.timestamp_checada >= %s::date
                  AND ac.timestamp_checada <  (%s::date + INTERVAL '1 day')::timestamp
                  AND ac.user_id = (
                      SELECT chec_id FROM docentes WHERE id = %s AND chec_id IS NOT NULL
                  )
            ),
            bloques AS (
                SELECT
                    hc.id              AS horario_id,
                    hc.dia_semana,
                    hc.hora_inicio,
                    hc.hora_fin,
                    hc.horas_bloque,
                    m.programa_id,
                    p.nombre           AS programa_nombre,
                    p.id               AS programa_id_val,
                    COALESCE(a.costo_hora, p.costo_hora) AS tarifa,
                    a.modalidad,
                    CASE hc.dia_semana
                        WHEN 'lunes'     THEN 1
                        WHEN 'martes'    THEN 2
                        WHEN 'miercoles' THEN 3
                        WHEN 'jueves'    THEN 4
                        WHEN 'viernes'   THEN 5
                        WHEN 'sabado'    THEN 6
                    END AS dow_num
                FROM horario_clases hc
                JOIN asignaciones a ON hc.asignacion_id = a.id
                                   AND a.docente_id = %s
                                   AND a.activa = true
                JOIN materias m    ON a.materia_id = m.id
                JOIN programas p   ON m.programa_id = p.id
                WHERE hc.activo = true
                  AND (%s = 'ambas' OR p.razon_social = %s)
            ),
            bloques_por_fecha AS (
                SELECT b.*, f.fecha
                FROM bloques b
                JOIN fechas f ON f.dow = b.dow_num
            )
            SELECT
                bf.programa_id_val AS programa_id,
                bf.programa_nombre,
                bf.tarifa,
                bf.horas_bloque,
                bf.fecha,
                bf.hora_inicio,
                bf.hora_fin,
                bf.dia_semana,
                -- Bloque virtual: modalidad='virtual' siempre, o 'mixta' en días L-V
                -- (sábado mixta = presencial). Igual que la lógica de quincenas.py.
                (bf.modalidad = 'virtual'
                 OR (bf.modalidad = 'mixta' AND bf.dow_num < 6)
                ) AS es_virtual,
                -- El MB360 alterna tipo_punch 0/1 sin garantía de dirección real.
                -- Se ignora tipo_punch y se busca cualquier checada en ventana de entrada
                -- y cualquier checada en ventana de salida.
                EXISTS (
                    SELECT 1 FROM checadas c
                    WHERE c.fecha = bf.fecha
                      AND c.hora BETWEEN bf.hora_inicio - INTERVAL '20 minutes'
                                    AND bf.hora_inicio + INTERVAL '10 minutes'
                ) AS tiene_entrada,
                EXISTS (
                    SELECT 1 FROM checadas c
                    WHERE c.fecha = bf.fecha
                      AND c.hora >= bf.hora_fin
                              - (LEAST(bf.horas_bloque * 10, 20) || ' minutes')::INTERVAL
                ) AS tiene_salida
            FROM bloques_por_fecha bf
        """, (fecha_inicio, fecha_fin,          # fechas CTE
              fecha_inicio, fecha_fin,          # checadas CTE
              docente_id,                       # chec_id lookup
              docente_id,                       # bloques CTE: docente_id
              razon_social, razon_social))       # bloques CTE: filtro razon_social

        bloques_raw = cur.fetchall()

        # ── Post-processing: regla de continuidad para cadenas back-to-back ─────
        # Cadena = secuencia de bloques presenciales consecutivos en el mismo día
        # (fin_A == ini_B). Si la cadena está "anclada" (primer bloque tiene
        # tiene_entrada y último tiene tiene_salida), todos sus bloques se pagan.
        # Los bloques que faltan entrada o salida se marcan es_continuidad=True.
        from collections import defaultdict as _dd

        def _tm(t):
            return t.hour * 60 + t.minute if t else 0

        bloques = [dict(b) for b in bloques_raw]

        por_fecha = _dd(list)
        for i, b in enumerate(bloques):
            if not b['es_virtual']:
                por_fecha[b['fecha']].append(i)

        for _fecha, idxs in por_fecha.items():
            idxs.sort(key=lambda i: _tm(bloques[i]['hora_inicio']))
            # Construir cadenas de bloques consecutivos
            cadenas = []
            cadena_act = [idxs[0]]
            for k in range(1, len(idxs)):
                ba = bloques[cadena_act[-1]]
                bb = bloques[idxs[k]]
                if _tm(ba['hora_fin']) == _tm(bb['hora_inicio']):
                    cadena_act.append(idxs[k])
                else:
                    cadenas.append(cadena_act)
                    cadena_act = [idxs[k]]
            cadenas.append(cadena_act)

            for cadena in cadenas:
                if len(cadena) < 2:
                    continue
                primero = bloques[cadena[0]]
                ultimo  = bloques[cadena[-1]]
                # Cadena anclada = primer bloque tiene entrada Y último tiene salida
                if not (primero['tiene_entrada'] and ultimo['tiene_salida']):
                    continue
                # Aplicar continuidad a bloques incompletos dentro de la cadena
                for idx in cadena:
                    b = bloques[idx]
                    if not b['tiene_entrada']:
                        bloques[idx]['tiene_entrada'] = True
                        bloques[idx]['es_continuidad'] = True
                    if not b['tiene_salida']:
                        bloques[idx]['tiene_salida']  = True
                        bloques[idx]['es_continuidad'] = True

        # ── Aplicar overrides manuales de pago ────────────────────────────────
        overrides_map: dict = {}
        try:
            cur.execute("""
                SELECT fecha::text, hora_ini::text, hora_fin::text, decision
                FROM overrides_pago_clase
                WHERE quincena_id = %s AND docente_id = %s
            """, (quincena_id, docente_id))
            for r in cur.fetchall():
                key = (r['fecha'], r['hora_ini'][:5], r['hora_fin'][:5])
                overrides_map[key] = r['decision']
        except Exception:
            pass  # tabla puede no existir aun

        for b in bloques:
            if not b.get('es_virtual'):
                key = (str(b['fecha']), str(b['hora_inicio'])[:5], str(b['hora_fin'])[:5])
                ov = overrides_map.get(key)
                if ov == 'pagar':
                    b['tiene_entrada'] = True
                    b['tiene_salida']  = True
                elif ov == 'no_pagar':
                    b['tiene_entrada'] = False
                    b['tiene_salida']  = False

        # Agrupar por programa
        programas_dict: dict = {}
        horas_programadas = Decimal("0")

        for b in bloques:
            # Bloques virtuales (modalidad='virtual', o 'mixta' en L-V) se pagan
            # a través de evaluacion_virtual, no del biométrico. Excluirlos aquí
            # evita que aparezcan como "descuento" por no tener checada.
            if b["es_virtual"]:
                continue

            pid = b["programa_id"]
            tarifa = Decimal(str(b["tarifa"] or "0"))
            horas = Decimal(str(b["horas_bloque"] or "0"))
            horas_programadas += horas

            if pid not in programas_dict:
                programas_dict[pid] = DetallePrograma(
                    programa_id=pid,
                    programa_nombre=b["programa_nombre"],
                    costo_hora=tarifa
                )

            dp = programas_dict[pid]
            if b["tiene_entrada"] and b["tiene_salida"]:
                if es_tc:
                    # Solo pagar horas FUERA de la jornada contrato
                    dia = b.get("dia_semana", "")
                    jornadas_dia = jornada_tc.get(dia, [])
                    horas_extra = _horas_fuera_jornada(
                        b["hora_inicio"], b["hora_fin"], jornadas_dia
                    )
                    horas_cubiertas = horas - horas_extra
                    resultado.horas_dentro_jornada += horas_cubiertas
                    horas_pagables = horas_extra
                else:
                    horas_pagables = horas

                dp.horas_presenciales += horas_pagables
                if b.get("es_continuidad"):
                    resultado.horas_continuidad += horas_pagables
            else:
                resultado.horas_descuento += horas

        # ── 2. Horas virtuales aprobadas (de evaluacion_virtual_resultado) ──
        cur.execute("""
            SELECT evr.asignacion_id, evr.horas_reales_a_pagar, evr.tarifa,
                   m.programa_id, p.nombre AS programa_nombre
            FROM evaluacion_virtual_resultado evr
            JOIN asignaciones a  ON evr.asignacion_id = a.id
            JOIN materias m      ON a.materia_id = m.id
            JOIN programas p     ON m.programa_id = p.id
            WHERE evr.quincena_id = %s
              AND evr.docente_id = %s
              AND evr.aprobada = true
        """, (quincena_id, docente_id))

        for virt in cur.fetchall():
            pid = virt["programa_id"]
            tarifa = Decimal(str(virt["tarifa"] or "0"))
            horas = Decimal(str(virt["horas_reales_a_pagar"] or "0"))
            horas_programadas += horas

            if pid not in programas_dict:
                programas_dict[pid] = DetallePrograma(
                    programa_id=pid,
                    programa_nombre=virt["programa_nombre"],
                    costo_hora=tarifa
                )
            programas_dict[pid].horas_virtuales += horas

        # ── 3. Horas de suplencia ────────────────────────────────────────────
        cur.execute("""
            SELECT
                COALESCE(i.horas_suplidas, i.horas_afectadas) AS horas_suplencia,
                COALESCE(a.costo_hora, p.costo_hora) AS tarifa,
                m.programa_id, p.nombre AS programa_nombre
            FROM incidencias i
            JOIN asignaciones a ON i.asignacion_id = a.id
            JOIN materias m     ON a.materia_id = m.id
            JOIN programas p    ON m.programa_id = p.id
            WHERE i.quincena_id = %s
              AND i.docente_suplente_id = %s
              AND i.estado = 'aprobada'
              AND i.tipo = 'suplencia'
        """, (quincena_id, docente_id))

        for sup in cur.fetchall():
            pid = sup["programa_id"]
            tarifa = Decimal(str(sup["tarifa"] or "0"))
            horas = Decimal(str(sup["horas_suplencia"] or "0"))
            horas_programadas += horas

            if pid not in programas_dict:
                programas_dict[pid] = DetallePrograma(
                    programa_id=pid,
                    programa_nombre=sup["programa_nombre"],
                    costo_hora=tarifa
                )
            programas_dict[pid].horas_suplencia += horas

        # ── 4. Calcular honorarios por programa ──────────────────────────────
        honorarios_total = Decimal("0")
        for dp in programas_dict.values():
            dp.horas_reales = dp.horas_presenciales + dp.horas_virtuales + dp.horas_suplencia
            dp.honorarios   = (dp.horas_reales * dp.costo_hora).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            honorarios_total += dp.honorarios

        # ── 5. Fórmula fiscal consolidada ────────────────────────────────────
        fiscal = aplicar_formula_fiscal(honorarios_total)

        # ── 6. Ajustes de quincenas anteriores ───────────────────────────────
        cur.execute("""
            SELECT COALESCE(
                SUM(CASE tipo WHEN 'abono' THEN monto ELSE -monto END), 0
            ) AS total_ajustes
            FROM ajustes_quincena
            WHERE docente_id = %s AND quincena_id = %s
        """, (docente_id, quincena_id))
        ajustes = Decimal(str(cur.fetchone()["total_ajustes"] or "0"))

        # ── 7. Campo Clínico (pago fijo adicional) ──────────────────────────
        cur.execute("""
            SELECT COALESCE(monto, 0) AS monto
            FROM campo_clinico_quincena
            WHERE quincena_id = %s AND docente_id = %s AND pago_completo = true
        """, (quincena_id, docente_id))
        campo = cur.fetchone()
        monto_campo = Decimal(str(campo["monto"])) if campo else Decimal("0")

        # ── 8. Consolidar resultado ──────────────────────────────────────────
        resultado.detalle_programas  = list(programas_dict.values())
        resultado.horas_programadas  = horas_programadas
        resultado.horas_presenciales = sum(dp.horas_presenciales for dp in programas_dict.values())
        resultado.horas_virtuales    = sum(dp.horas_virtuales    for dp in programas_dict.values())
        resultado.horas_suplencia    = sum(dp.horas_suplencia    for dp in programas_dict.values())
        resultado.horas_reales       = sum(dp.horas_reales       for dp in programas_dict.values())
        resultado.honorarios         = fiscal["honorarios"]
        resultado.iva                = fiscal["iva"]
        resultado.sub_total          = fiscal["sub_total"]
        resultado.retencion_isr      = fiscal["retencion_isr"]
        resultado.retencion_iva      = fiscal["retencion_iva"]
        resultado.total_a_pagar      = fiscal["total_a_pagar"]
        resultado.ajustes            = ajustes
        resultado.monto_campo_clinico = monto_campo
        resultado.total_final        = (
            fiscal["total_a_pagar"] + ajustes + monto_campo
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    except Exception as e:
        logger.error(f"Error calculando nómina docente {docente_id}: {e}")
        resultado.error = str(e)
    finally:
        cur.close()

    return resultado


def guardar_nomina(conn, resultado: ResultadoNomina, generado_por_id: int) -> int:
    """
    Inserta o actualiza la nómina de un docente en nomina_quincena.
    Retorna el id del registro.
    """
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO nomina_quincena (
                docente_id, quincena_id,
                horas_programadas, horas_presenciales, horas_virtuales,
                horas_suplencia, horas_reales, horas_descuento,
                honorarios, iva, sub_total, retencion_isr, retencion_iva,
                total_a_pagar, ajustes, total_final,
                estado, generado_en
            ) VALUES (
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'borrador',NOW()
            )
            ON CONFLICT (docente_id, quincena_id) DO UPDATE SET
                horas_programadas  = EXCLUDED.horas_programadas,
                horas_presenciales = EXCLUDED.horas_presenciales,
                horas_virtuales    = EXCLUDED.horas_virtuales,
                horas_suplencia    = EXCLUDED.horas_suplencia,
                horas_reales       = EXCLUDED.horas_reales,
                horas_descuento    = EXCLUDED.horas_descuento,
                honorarios         = EXCLUDED.honorarios,
                iva                = EXCLUDED.iva,
                sub_total          = EXCLUDED.sub_total,
                retencion_isr      = EXCLUDED.retencion_isr,
                retencion_iva      = EXCLUDED.retencion_iva,
                total_a_pagar      = EXCLUDED.total_a_pagar,
                ajustes            = EXCLUDED.ajustes,
                total_final        = EXCLUDED.total_final,
                estado             = 'borrador',
                generado_en        = NOW()
            RETURNING id
        """, (
            resultado.docente_id, resultado.quincena_id,
            resultado.horas_programadas, resultado.horas_presenciales,
            resultado.horas_virtuales, resultado.horas_suplencia,
            resultado.horas_reales, resultado.horas_descuento,
            resultado.honorarios, resultado.iva, resultado.sub_total,
            resultado.retencion_isr, resultado.retencion_iva,
            resultado.total_a_pagar, resultado.ajustes, resultado.total_final
        ))
        nomina_id = cur.fetchone()["id"]

        # Guardar detalle por programa
        for dp in resultado.detalle_programas:
            cur.execute("""
                INSERT INTO nomina_detalle_programa
                    (nomina_id, programa_id, horas_presenciales, horas_virtuales,
                     horas_suplencia, horas_reales, costo_hora, honorarios)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (nomina_id, programa_id) DO UPDATE SET
                    horas_presenciales = EXCLUDED.horas_presenciales,
                    horas_virtuales    = EXCLUDED.horas_virtuales,
                    horas_suplencia    = EXCLUDED.horas_suplencia,
                    horas_reales       = EXCLUDED.horas_reales,
                    costo_hora         = EXCLUDED.costo_hora,
                    honorarios         = EXCLUDED.honorarios
            """, (
                nomina_id, dp.programa_id,
                dp.horas_presenciales, dp.horas_virtuales,
                dp.horas_suplencia, dp.horas_reales,
                dp.costo_hora, dp.honorarios
            ))

        return nomina_id
    finally:
        cur.close()
