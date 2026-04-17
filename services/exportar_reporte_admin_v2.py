"""
services/exportar_reporte_admin_v2.py
Reporte de Checador Administrativos v2.0 — NEXO IESEF

Misma estructura de cuadrícula que el v1 (exportar_reporte_admin.py) pero con
diseño notablemente mejorado:

  Diferencias visuales vs v1:
  - Título en header azul marino (#1F3864) en lugar de texto llano
  - Encabezados de día con fondo azul profundo (#2B4EAC) y texto blanco
  - Fila de ID/Nombre en teal suave alternando claro/más claro
  - Entrada con retardo → fondo ámbar (#FFF3CD) en lugar de rosa
  - Falta → "FALTA" en rojo en lugar de sólo "F"
  - Salida a comer / Regreso de comer → verde moderno (#B7E1B8)
  - Columnas de resumen (RETARDOS / FALTAS / FIRMA) en lugar de O/P/Q genérico
  - Etiquetas ENTRADA / SAL.COMER / REG.COMER / SALIDA en col A de cada fila
  - Fila separadora fina entre bloques (alto 4 px, sin borde)

Estructura por trabajador — bloque de 8 filas (base = N + trabajador*8):
  base+0  : Encabezados de día — azul profundo
  base+1  : ID: chec_id  |  Nombre  — teal (alternado)
  base+2  : ENTRADA  (ámbar si retardo, rojo-suave si falta)
  base+3  : SAL.COMER  (verde si tiene_comida y hay valor)
  base+4  : REG.COMER  (verde si tiene_comida y hay valor)
  base+5  : SALIDA
  base+6  : [RETARDOS mergeado base+2..base+5 col N+2]
             [FALTAS   mergeado base+2..base+5 col N+3]
             [FIRMA    mergeado base+2..base+5 col N+4]
  base+7  : separador visual (alto=4, blanco, sin borde)
"""

from io import BytesIO
from datetime import date, time, timedelta
from collections import defaultdict
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter

from config import settings

# ── Paleta v2 ─────────────────────────────────────────────────────────────────
HDR_BG       = "1F3864"   # azul marino — título principal
HDR_FG       = "FFFFFF"
DAY_HDR_BG   = "2B4EAC"   # azul profundo — encabezados de días
DAY_HDR_FG   = "FFFFFF"

NOMBRE_BG_PAR   = "C9DDEF"   # teal claro (filas pares en nombre)
NOMBRE_BG_IMPAR = "E4EFF8"   # teal más claro (filas impares)
NOMBRE_FG       = "1F3864"

ENT_OK_BG    = "F0FDF4"   # verde muy suave — entrada normal
ENT_TARD_BG  = "FFF3CD"   # ámbar — retardo (antes era rosa)
ENT_TARD_FG  = "7C4E00"
FALTA_BG     = "FECACA"   # rojo suave — falta
FALTA_FG     = "9B1C1C"

COMIDA_BG    = "B7E1B8"   # verde moderno (comida)
COMIDA_FG    = "1B5E20"

SAL_BG       = "F0F4FF"   # azul muy suave — salida
SIN_DIA_BG   = "F9FAFB"   # gris muy suave — día no laborable

RETARDOS_BG  = "FFF3CD"   # ámbar — columna retardos
RETARDOS_FG  = "7C4E00"
FALTAS_BG    = "FECACA"   # rojo suave — columna faltas
FALTAS_FG    = "9B1C1C"
FIRMA_BG     = "FFFFFF"

LABEL_BG     = "EFF3FB"   # etiquetas col A (ENTRADA/SAL.COMER/etc.)
LABEL_FG     = "2B4EAC"

FONT_NAME = "Arial"
_THIN  = Side(style="thin")
_MED   = Side(style="medium")
BORDER_THIN = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_THIN)

DAY_ABBR = {0: "L", 1: "M", 2: "M", 3: "J", 4: "V", 5: "S", 6: "D"}
DAY_COL  = {
    0: "lunes", 1: "martes", 2: "miercoles", 3: "jueves",
    4: "viernes", 5: "sabado", 6: "domingo",
}
TOLERANCIA_COMIDA_SEG = 45 * 60

# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)


def _td_to_time(t) -> time:
    if isinstance(t, timedelta):
        total = int(t.total_seconds())
        h, rem = divmod(total, 3600)
        m, s   = divmod(rem, 60)
        return time(h % 24, m, s)
    return t


def _time_to_secs(t) -> int:
    if isinstance(t, timedelta):
        return int(t.total_seconds())
    return t.hour * 3600 + t.minute * 60 + t.second


def _fmt_hms(t) -> str:
    tt = _td_to_time(t)
    return f"{tt.hour:02d}:{tt.minute:02d}:{tt.second:02d}"


def _font(bold=False, color="000000", size=10) -> Font:
    return Font(name=FONT_NAME, bold=bold, color=color, size=size)


def _fill(hex_color: str) -> PatternFill:
    return PatternFill("solid", fgColor=hex_color)


def _put(ws, row: int, col: int, value=None,
         bg: str = "FFFFFF", fg: str = "000000",
         bold: bool = False, size: int = 10,
         halign: str = "center", valign: str = "center",
         wrap: bool = False, border: bool = True) -> None:
    c = ws.cell(row=row, column=col, value=value)
    c.fill      = _fill(bg)
    c.font      = _font(bold=bold, color=fg, size=size)
    c.alignment = Alignment(horizontal=halign, vertical=valign, wrap_text=wrap)
    if border:
        c.border = BORDER_THIN


# ── Clasificación idéntica al v1 ──────────────────────────────────────────────

def _clasificar_checadas(checadas_raw: list, hora_entrada: time,
                          hora_salida: time, tiene_comida: bool) -> dict:
    checadas_sorted = sorted(checadas_raw, key=lambda x: _time_to_secs(x["hora"]))

    entrada_secs = _time_to_secs(hora_entrada)
    salida_secs  = _time_to_secs(hora_salida)
    mid_secs     = (entrada_secs + salida_secs) // 2

    entrada_checada:    Optional[time] = None
    salida_checada:     Optional[time] = None
    comida_sal_checada: Optional[time] = None
    comida_ent_checada: Optional[time] = None

    by_type: dict = defaultdict(list)
    for c in checadas_sorted:
        by_type[c["tipo_punch"]].append(_td_to_time(c["hora"]))

    if by_type.get(2):
        comida_sal_checada = by_type[2][0]
    if by_type.get(3):
        comida_ent_checada = by_type[3][0]
    if by_type.get(0):
        entrada_checada = by_type[0][0]
    if by_type.get(1):
        salida_checada = by_type[1][-1]

    all_horas = [_td_to_time(c["hora"]) for c in checadas_sorted]
    if tiene_comida and comida_sal_checada is None and comida_ent_checada is None:
        candidatas = [h for h in all_horas
                      if abs(_time_to_secs(h) - mid_secs) <= TOLERANCIA_COMIDA_SEG]
        if candidatas:
            comida_sal_checada = candidatas[0]
        if len(candidatas) >= 2:
            comida_ent_checada = candidatas[1]
        clasificadas = {comida_sal_checada, comida_ent_checada} - {None}
        if entrada_checada is None:
            for h in all_horas:
                if h not in clasificadas and _time_to_secs(h) <= mid_secs:
                    entrada_checada = h
                    break
        if salida_checada is None:
            for h in reversed(all_horas):
                if h not in clasificadas and _time_to_secs(h) >= mid_secs:
                    salida_checada = h
                    break
    elif not tiene_comida:
        if entrada_checada is None and all_horas:
            entrada_checada = all_horas[0]
        if salida_checada is None and len(all_horas) >= 2:
            salida_checada = all_horas[-1]

    es_retardo = False
    if entrada_checada:
        es_retardo = _time_to_secs(entrada_checada) > entrada_secs + 10 * 60

    comida_incompleta = (
        tiene_comida and
        (comida_sal_checada is None or comida_ent_checada is None)
    )
    return {
        "entrada":           entrada_checada,
        "salida":            salida_checada,
        "comida_sal":        comida_sal_checada,
        "comida_ent":        comida_ent_checada,
        "es_retardo":        es_retardo,
        "comida_incompleta": comida_incompleta,
    }


# ── Función principal ──────────────────────────────────────────────────────────

def generar_reporte_admin_v2(periodo_id: int) -> bytes:
    """
    Genera el Excel de Reporte de Checador Administrativos v2.0.
    Misma lógica que v1, diseño notablemente mejorado.
    """
    conn = _get_conn()
    cur  = conn.cursor()

    # 1. Período
    cur.execute(
        "SELECT id, nombre, fecha_inicio, fecha_fin FROM periodos_admin WHERE id = %s",
        (periodo_id,)
    )
    periodo = cur.fetchone()
    if not periodo:
        conn.close()
        raise ValueError(f"Período {periodo_id} no encontrado")

    fecha_inicio: date = periodo["fecha_inicio"]
    fecha_fin:    date = periodo["fecha_fin"]
    nombre_periodo     = periodo["nombre"] or f"{fecha_inicio} – {fecha_fin}"

    dias: list[date] = []
    d = fecha_inicio
    while d <= fecha_fin:
        dias.append(d)
        d += timedelta(days=1)
    n_dias = len(dias)

    # 2. Trabajadores activos
    cur.execute(
        "SELECT id, chec_id, nombre, cargo FROM trabajadores WHERE activo = TRUE ORDER BY nombre"
    )
    trabajadores = [dict(r) for r in cur.fetchall()]

    # 3. Horarios
    trab_ids = [t["id"] for t in trabajadores]
    horarios_por_trab: dict = defaultdict(list)
    if trab_ids:
        cur.execute(
            """SELECT trabajador_id, lunes, martes, miercoles, jueves, viernes,
                      sabado, domingo, hora_entrada, hora_salida, tiene_comida
               FROM horarios_trabajador
               WHERE trabajador_id = ANY(%s)""",
            (trab_ids,)
        )
        for h in cur.fetchall():
            horarios_por_trab[h["trabajador_id"]].append(dict(h))

    # 4. Checadas del período
    chec_ids = [t["chec_id"] for t in trabajadores if t["chec_id"] is not None]
    checadas_por_chec_dia: dict = defaultdict(lambda: defaultdict(list))
    if chec_ids:
        cur.execute(
            """SELECT user_id,
                      timestamp_checada::date AS dia,
                      timestamp_checada::time AS hora,
                      tipo_punch
               FROM asistencias_checadas
               WHERE user_id = ANY(%s)
                 AND timestamp_checada::date >= %s
                 AND timestamp_checada::date <= %s
               ORDER BY timestamp_checada""",
            (chec_ids, fecha_inicio, fecha_fin)
        )
        for c in cur.fetchall():
            checadas_por_chec_dia[c["user_id"]][c["dia"]].append({
                "hora":       c["hora"],
                "tipo_punch": c["tipo_punch"],
            })

    conn.close()

    # 5. Construir Excel ────────────────────────────────────────────────────────
    # Columnas: A(etiqueta) + B..{n_dias+1}(días) + N+2(retardos) + N+3(faltas) + N+4(firma)
    COL_RETARDOS = n_dias + 2
    COL_FALTAS   = n_dias + 3
    COL_FIRMA    = n_dias + 4
    NCOLS        = n_dias + 4

    wb = Workbook()
    ws = wb.active
    ws.title = "REPORTE v2"

    # Anchos de columna
    ws.column_dimensions["A"].width = 11.0   # etiqueta
    for c in range(2, n_dias + 2):
        ws.column_dimensions[get_column_letter(c)].width = 9.0
    ws.column_dimensions[get_column_letter(COL_RETARDOS)].width = 10.0
    ws.column_dimensions[get_column_letter(COL_FALTAS)].width   = 8.0
    ws.column_dimensions[get_column_letter(COL_FIRMA)].width    = 24.0

    # ── Título principal ──────────────────────────────────────────────────────
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=NCOLS)
    c = ws.cell(1, 1)
    c.value     = "REPORTE DE CHECADOR  —  PERSONAL ADMINISTRATIVO  v2.0"
    c.fill      = _fill(HDR_BG)
    c.font      = Font(name=FONT_NAME, size=13, bold=True, color=HDR_FG)
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 26

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=NCOLS)
    c = ws.cell(2, 1)
    c.value     = (f"{nombre_periodo}  ·  "
                   f"{fecha_inicio.strftime('%d/%m/%Y')} — {fecha_fin.strftime('%d/%m/%Y')}")
    c.fill      = _fill(DAY_HDR_BG)
    c.font      = Font(name=FONT_NAME, size=10, color=HDR_FG)
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 18

    ws.row_dimensions[3].height = 5   # spacer

    # ── Bloque por trabajador ─────────────────────────────────────────────────
    for idx, trab in enumerate(trabajadores):
        base     = 4 + idx * 8
        chec_id  = trab.get("chec_id")
        horarios = horarios_por_trab.get(trab["id"], [])
        bg_nom   = NOMBRE_BG_PAR if idx % 2 == 0 else NOMBRE_BG_IMPAR

        # Horario efectivo por día
        horario_por_dia: dict = {}
        for dia in dias:
            col = DAY_COL[dia.weekday()]
            for h in horarios:
                if h.get(col):
                    horario_por_dia[dia] = h
                    break

        # Checadas del trabajador (dedup 3 min)
        raw_por_dia = checadas_por_chec_dia.get(chec_id, {}) if chec_id else {}
        checadas_por_dia: dict = {}
        for dia, raw_list in raw_por_dia.items():
            sorted_list = sorted(raw_list, key=lambda x: _time_to_secs(x["hora"]))
            deduped = []
            for c in sorted_list:
                if (not deduped or
                        _time_to_secs(c["hora"]) - _time_to_secs(deduped[-1]["hora"]) >= 180):
                    deduped.append(c)
            checadas_por_dia[dia] = deduped

        # ── base+0: Encabezados de días ──────────────────────────────────────
        ws.row_dimensions[base].height = 26
        # Col A del encabezado vacía, mismo azul
        _put(ws, base, 1, None, bg=DAY_HDR_BG, fg=DAY_HDR_FG)
        for col_i, dia in enumerate(dias, 2):
            abbr = DAY_ABBR[dia.weekday()]
            _put(ws, base, col_i,
                 f"{abbr}\n{dia.day}",
                 bg=DAY_HDR_BG, fg=DAY_HDR_FG,
                 bold=True, wrap=True)
        _put(ws, base, COL_RETARDOS, "RETARDOS",
             bg=DAY_HDR_BG, fg=DAY_HDR_FG, bold=True, size=9)
        _put(ws, base, COL_FALTAS,   "FALTAS",
             bg=DAY_HDR_BG, fg=DAY_HDR_FG, bold=True, size=9)
        _put(ws, base, COL_FIRMA,    "FIRMA DE CONFORMIDAD",
             bg=DAY_HDR_BG, fg=DAY_HDR_FG, bold=True, size=9)

        # ── base+1: ID y nombre ───────────────────────────────────────────────
        ws.row_dimensions[base + 1].height = 16
        _put(ws, base+1, 1,
             f"ID: {chec_id or '—'}",
             bg=bg_nom, fg=NOMBRE_FG, bold=True, size=9)
        ws.merge_cells(start_row=base+1, start_column=2,
                       end_row=base+1, end_column=n_dias+1)
        c = ws.cell(base+1, 2)
        c.value     = f"  {trab['nombre'].upper()}"
        c.fill      = _fill(bg_nom)
        c.font      = Font(name=FONT_NAME, size=10, bold=True, color=NOMBRE_FG)
        c.alignment = Alignment(horizontal="left", vertical="center")
        c.border    = BORDER_THIN
        # Resumen merge verticalmente base+1..base+5
        for col_r in (COL_RETARDOS, COL_FALTAS, COL_FIRMA):
            ws.merge_cells(start_row=base+1, start_column=col_r,
                           end_row=base+5, end_column=col_r)

        # ── base+2..base+5: datos de tiempo + acumular estadísticas ───────────
        cnt_retardos = 0
        cnt_faltas   = 0
        obs_set: set = set()

        LABELS = {
            base+2: "ENTRADA",
            base+3: "SAL.COMER",
            base+4: "REG.COMER",
            base+5: "SALIDA",
        }
        for row_off in (2, 3, 4, 5):
            ws.row_dimensions[base + row_off].height = 15
            _put(ws, base+row_off, 1, LABELS[base+row_off],
                 bg=LABEL_BG, fg=LABEL_FG, bold=True, size=8, halign="right")

        for col_i, dia in enumerate(dias, 2):
            checadas_hoy = checadas_por_dia.get(dia, [])
            horario_hoy  = horario_por_dia.get(dia)

            if not horario_hoy:
                for row_off in (2, 3, 4, 5):
                    _put(ws, base+row_off, col_i, None, bg=SIN_DIA_BG)
                continue

            hora_entrada = _td_to_time(horario_hoy["hora_entrada"])
            hora_salida  = _td_to_time(horario_hoy["hora_salida"])
            tiene_comida = bool(horario_hoy.get("tiene_comida", False))

            if not checadas_hoy:
                cnt_faltas += 1
                # Falta: texto "FALTA" en rojo
                _put(ws, base+2, col_i, "FALTA",
                     bg=FALTA_BG, fg=FALTA_FG, bold=True, size=8)
                _put(ws, base+3, col_i, None, bg=FALTA_BG)
                _put(ws, base+4, col_i, None, bg=FALTA_BG)
                _put(ws, base+5, col_i, None, bg=FALTA_BG)
                continue

            r = _clasificar_checadas(checadas_hoy, hora_entrada, hora_salida, tiene_comida)
            if r["comida_incompleta"]:
                obs_set.add("OMISIÓN REGISTRO ALIMENTOS")

            # base+2: ENTRADA
            if r["es_retardo"]:
                cnt_retardos += 1
                _put(ws, base+2, col_i,
                     _fmt_hms(r["entrada"]) if r["entrada"] else None,
                     bg=ENT_TARD_BG, fg=ENT_TARD_FG, bold=True, size=9)
            else:
                _put(ws, base+2, col_i,
                     _fmt_hms(r["entrada"]) if r["entrada"] else None,
                     bg=ENT_OK_BG, size=9)

            # base+3: SALIDA A COMER
            if tiene_comida and r["comida_sal"]:
                _put(ws, base+3, col_i, _fmt_hms(r["comida_sal"]),
                     bg=COMIDA_BG, fg=COMIDA_FG, size=9)
            else:
                _put(ws, base+3, col_i, None,
                     bg=COMIDA_BG if tiene_comida else SIN_DIA_BG)

            # base+4: REGRESO DE COMER
            if tiene_comida and r["comida_ent"]:
                _put(ws, base+4, col_i, _fmt_hms(r["comida_ent"]),
                     bg=COMIDA_BG, fg=COMIDA_FG, size=9)
            else:
                _put(ws, base+4, col_i, None,
                     bg=COMIDA_BG if tiene_comida else SIN_DIA_BG)

            # base+5: SALIDA
            _put(ws, base+5, col_i,
                 _fmt_hms(r["salida"]) if r["salida"] else None,
                 bg=SAL_BG, size=9)

        # Resumen en columnas mergeadas
        _put(ws, base+1, COL_RETARDOS,
             cnt_retardos if cnt_retardos > 0 else None,
             bg=RETARDOS_BG if cnt_retardos > 0 else "FAFAFA",
             fg=RETARDOS_FG if cnt_retardos > 0 else "9CA3AF",
             bold=cnt_retardos > 0, size=16)
        _put(ws, base+1, COL_FALTAS,
             cnt_faltas if cnt_faltas > 0 else None,
             bg=FALTAS_BG if cnt_faltas > 0 else "FAFAFA",
             fg=FALTAS_FG if cnt_faltas > 0 else "9CA3AF",
             bold=cnt_faltas > 0, size=16)
        _put(ws, base+1, COL_FIRMA, None, bg=FIRMA_BG)

        # ── base+6: separador visual (vacío fino) ─────────────────────────────
        ws.row_dimensions[base + 6].height = 4
        for ci in range(1, NCOLS + 1):
            ws.cell(base + 6, ci).fill = _fill("FFFFFF")

        # base+7 queda vacío (la altura default es suficiente)
        ws.row_dimensions[base + 7].height = 1

    # ── Orientación de página ─────────────────────────────────────────────────
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.fitToPage   = True
    ws.page_setup.fitToWidth  = 1
    ws.page_setup.fitToHeight = 0
    ws.freeze_panes = "B4"

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()
