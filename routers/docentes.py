from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import bcrypt
import io
import logging

from fastapi import Request
from config import settings
from routers.auth import get_usuario_actual, UsuarioActual, solo_admin, admin_o_finanzas, puede_horarios
from services.auditoria import registrar, ip_from_request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/docentes", tags=["docentes"])

# ── DB ─────────────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)

# ── Modelos ────────────────────────────────────────────────────────────────────

class DocenteBase(BaseModel):
    numero_docente:       Optional[str]   = None
    noi:                  Optional[int]   = None
    chec_id:              Optional[int]   = None
    nombre_completo:      str
    rfc:                  Optional[str]   = None
    curp:                 Optional[str]   = None
    codigo_postal:        Optional[str]   = None
    clabe:                Optional[str]   = None
    forma_pago:           Optional[str]   = None
    regimen_fiscal:       str             = "honorarios"
    adscripcion:          str             = "instituto"
    tipo:                 str             = "por_horas"
    costo_hora_centro:    Optional[float] = None
    costo_hora_instituto: Optional[float] = None
    horas_contrato_semana: Optional[int]  = None
    hora_entrada:         Optional[str]   = None   # "08:00"
    hora_salida:          Optional[str]   = None   # "16:00"
    monto_fijo_quincenal: Optional[float] = None
    correo:               Optional[str]   = None
    activo:               bool            = True

class DocenteCreate(DocenteBase):
    password: Optional[str] = None   # si se omite, se genera del número docente
    crear_portal: bool = True
    password_portal: Optional[str] = None

class DocenteUpdate(BaseModel):
    noi:                  Optional[int]   = None
    chec_id:              Optional[int]   = None
    nombre_completo:      Optional[str]   = None
    rfc:                  Optional[str]   = None
    curp:                 Optional[str]   = None
    codigo_postal:        Optional[str]   = None
    clabe:                Optional[str]   = None
    forma_pago:           Optional[str]   = None
    regimen_fiscal:       Optional[str]   = None
    adscripcion:          Optional[str]   = None
    tipo:                 Optional[str]   = None
    costo_hora_centro:    Optional[float] = None
    costo_hora_instituto: Optional[float] = None
    correo:               Optional[str]   = None
    activo:               Optional[bool]  = None

class DocenteOut(DocenteBase):
    id: int
    creado_en: datetime
    modificado_en: datetime

class CargaMasivaResultado(BaseModel):
    total:      int
    insertados: int
    actualizados: int
    errores:    int
    detalle_errores: List[str] = []

# ── Helpers ────────────────────────────────────────────────────────────────────

def _hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()

def _tarifa_por_adscripcion(row: dict) -> tuple:
    """Deriva costo_hora_centro y costo_hora_instituto desde el Excel."""
    centro    = row.get("costo_hora_centro")
    instituto = row.get("costo_hora_instituto")
    return centro, instituto

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[DocenteOut])
async def listar_docentes(
    activo: Optional[bool] = True,
    adscripcion: Optional[str] = None,
    _: UsuarioActual = Depends(admin_o_finanzas)
):
    try:
        conn = get_conn()
        cur = conn.cursor()
        sql = "SELECT * FROM docentes WHERE 1=1"
        params = []
        if activo is not None:
            sql += " AND activo = %s"
            params.append(activo)
        if adscripcion:
            sql += " AND adscripcion = %s"
            params.append(adscripcion)
        sql += " ORDER BY nombre_completo"
        cur.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [DocenteOut(**r) for r in rows]
    except Exception as e:
        logger.error(f"Error listar_docentes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{docente_id}", response_model=DocenteOut)
async def get_docente(
    docente_id: int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    # Un docente solo puede ver su propio perfil
    if usuario.rol == "docente" and usuario.docente_id != docente_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM docentes WHERE id = %s", (docente_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Docente no encontrado")
        return DocenteOut(**row)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=DocenteOut, status_code=201)
async def crear_docente(
    request: Request,
    body: DocenteCreate,
    usuario: UsuarioActual = Depends(solo_admin)
):
    pwd = body.password or body.numero_docente or "iesef2026"
    password_hash = _hash_password(pwd)
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO docentes (
                numero_docente, noi, chec_id, nombre_completo, rfc, curp,
                codigo_postal, clabe, forma_pago, regimen_fiscal, adscripcion,
                tipo, costo_hora_centro, costo_hora_instituto,
                horas_contrato_semana, hora_entrada, hora_salida,
                monto_fijo_quincenal, correo, password_hash, activo
            ) VALUES (
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
            )
            RETURNING *
        """, (
            body.numero_docente, body.noi, body.chec_id, body.nombre_completo,
            body.rfc, body.curp, body.codigo_postal, body.clabe, body.forma_pago,
            body.regimen_fiscal, body.adscripcion, body.tipo,
            body.costo_hora_centro, body.costo_hora_instituto,
            body.horas_contrato_semana, body.hora_entrada, body.hora_salida,
            body.monto_fijo_quincenal, body.correo, password_hash, body.activo
        ))
        row = cur.fetchone()
        registrar(conn, usuario, accion="crear_docente", entidad="docente",
                  entidad_id=str(row["id"]),
                  descripcion=f"Creó docente {body.nombre_completo} (No. {body.numero_docente})",
                  detalle={"numero_docente": body.numero_docente, "nombre": body.nombre_completo,
                           "adscripcion": body.adscripcion, "tipo": body.tipo},
                  ip=ip_from_request(request))
        conn.commit()

        # Crear acceso al portal si se solicitó y hay correo
        if body.crear_portal and body.correo:
            from datetime import datetime as _dt2
            import bcrypt as _bcrypt
            pwd_portal = body.password_portal or f"IESEF{_dt2.now().year}"
            pwd_hash_portal = _bcrypt.hashpw(pwd_portal.encode(), _bcrypt.gensalt(rounds=10)).decode()
            try:
                cur2 = conn.cursor()
                cur2.execute("""
                    INSERT INTO usuarios (docente_id, nombre, email, password_hash, rol,
                                         activo, debe_cambiar_password)
                    VALUES (%s, %s, %s, %s, 'docente', true, true)
                    ON CONFLICT (email) DO NOTHING
                """, (row["id"], row["nombre_completo"],
                      body.correo.lower().strip(), pwd_hash_portal))
                conn.commit()
                cur2.close()
            except Exception as e2:
                logger.warning(f"No se pudo crear usuario portal para docente {row['id']}: {e2}")

        cur.close()
        conn.close()
        return DocenteOut(**row)
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="Número de docente o NOI ya existe")
    except Exception as e:
        logger.error(f"Error crear_docente: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{docente_id}", response_model=DocenteOut)
async def actualizar_docente(
    docente_id: int,
    body: DocenteUpdate,
    request: Request,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    campos_enviados = {k for k, v in body.model_dump(exclude_none=True).items()}

    # Finanzas: solo NOI, RFC, régimen fiscal y adscripción
    if usuario.rol == "finanzas":
        campos_permitidos = {"noi", "rfc", "regimen_fiscal", "adscripcion"}
        if not campos_enviados.issubset(campos_permitidos):
            raise HTTPException(status_code=403, detail="Finanzas solo puede actualizar NOI, RFC, régimen fiscal y adscripción")
    elif usuario.rol == "coord_docente":
        pass  # coord_docente puede editar todo de docentes
    elif usuario.rol not in ("director_cap_humano", "cap_humano", "superadmin"):
        raise HTTPException(status_code=403, detail="Sin permiso para editar docentes")

    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="Sin campos para actualizar")

    updates["modificado_en"] = datetime.now()
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [docente_id]

    try:
        conn = get_conn()
        cur = conn.cursor()
        # Leer valores anteriores para auditoría
        cur.execute("SELECT nombre_completo, activo FROM docentes WHERE id = %s", (docente_id,))
        antes = cur.fetchone()
        if not antes:
            raise HTTPException(status_code=404, detail="Docente no encontrado")

        cur.execute(f"UPDATE docentes SET {set_clause} WHERE id = %s RETURNING *", values)
        row = cur.fetchone()

        # Determinar descripción de auditoría
        if "activo" in updates and not updates["activo"]:
            desc = f"Dio de baja a {antes['nombre_completo']}"
            accion = "dar_baja_docente"
        elif "activo" in updates and updates["activo"]:
            desc = f"Reactivó a {antes['nombre_completo']}"
            accion = "reactivar_docente"
        else:
            campos_str = ", ".join(campos_enviados)
            desc = f"Actualizó {campos_str} de {antes['nombre_completo']}"
            accion = "actualizar_docente"

        registrar(conn, usuario, accion=accion, entidad="docente",
                  entidad_id=str(docente_id), descripcion=desc,
                  detalle={"campos_modificados": list(campos_enviados), "valores_nuevos": updates},
                  ip=ip_from_request(request))
        conn.commit()
        cur.close()
        conn.close()
        return DocenteOut(**row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error actualizar_docente: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/carga-masiva", response_model=CargaMasivaResultado)
async def carga_masiva_excel(
    request: Request,
    file: UploadFile = File(...),
    usuario: UsuarioActual = Depends(solo_admin)
):
    """
    Carga docentes desde el Excel 'Base Alta Docentes'.
    Columnas esperadas: F | Nombre completo | RFC | CURP | Código postal |
                        Forma de pago | No. Cuenta / CLABE | Modalidad |
                        Adscripciones | Programas educativos | Número NOI |
                        Correo electrónico | Comentarios
    """
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl no instalado en el servidor")

    contenido = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(contenido), data_only=True)
        ws = wb.active
    except Exception:
        raise HTTPException(status_code=400, detail="Archivo Excel inválido")

    insertados = actualizados = errores = 0
    detalle_errores = []

    conn = get_conn()
    cur = conn.cursor()

    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row or not row[1]:  # columna Nombre completo vacía
            continue
        try:
            # Col 0: NO. DOCENTE CHECADOR (int o vacío)
            chec_raw = row[0]
            if chec_raw is not None and str(chec_raw).strip() not in ("", "None"):
                try:
                    chec_id = int(float(chec_raw))
                    numero_docente = str(chec_id)
                except (ValueError, TypeError):
                    chec_id = None
                    numero_docente = str(chec_raw).strip() or None
            else:
                chec_id = None
                numero_docente = None  # se asigna después con NOI

            nombre         = str(row[1]).strip()
            rfc            = str(row[2]).strip()[:13] if row[2] else None
            curp           = str(row[3]).strip()[:18] if row[3] else None
            cp             = str(row[4]).strip()[:5]  if row[4] else None
            forma_pago     = str(row[5]).strip()      if row[5] else None
            clabe          = str(row[6]).strip()[:18] if row[6] else None
            modalidad      = str(row[7]).strip()      if row[7] else "honorarios"
            adscripcion_raw= str(row[8]).strip().lower() if row[8] else "instituto"
            noi_raw        = row[10]
            correo         = str(row[11]).strip() if row[11] else None

            noi = int(noi_raw) if noi_raw and str(noi_raw).strip() not in ("", "None") else None

            # Sin número checador → no se puede importar, requiere asignación manual
            if numero_docente is None:
                errores += 1
                detalle_errores.append(f"Fila {i}: '{nombre}' sin número de checador — omitida, requiere alta manual")
                continue

            # Normalizar adscripción
            if "centro" in adscripcion_raw and "instituto" in adscripcion_raw:
                adscripcion = "ambos"
            elif "centro" in adscripcion_raw:
                adscripcion = "centro"
            else:
                adscripcion = "instituto"

            # Normalizar régimen fiscal
            regimen = "asimilados_salarios" if "asimilad" in modalidad.lower() else "honorarios"

            # Password inicial — rounds=6 para carga masiva (evita timeout en 150+ registros)
            pwd = bcrypt.hashpw(
                (numero_docente or "iesef2026").encode(),
                bcrypt.gensalt(rounds=6)
            ).decode()

            # Upsert por numero_docente
            cur.execute("""
                INSERT INTO docentes (
                    numero_docente, chec_id, noi, nombre_completo, rfc, curp,
                    codigo_postal, clabe, forma_pago, regimen_fiscal,
                    adscripcion, correo, password_hash
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (numero_docente) DO UPDATE SET
                    chec_id        = EXCLUDED.chec_id,
                    noi            = EXCLUDED.noi,
                    nombre_completo= EXCLUDED.nombre_completo,
                    rfc            = EXCLUDED.rfc,
                    curp           = EXCLUDED.curp,
                    codigo_postal  = EXCLUDED.codigo_postal,
                    clabe          = EXCLUDED.clabe,
                    forma_pago     = EXCLUDED.forma_pago,
                    regimen_fiscal = EXCLUDED.regimen_fiscal,
                    adscripcion    = EXCLUDED.adscripcion,
                    correo         = EXCLUDED.correo,
                    modificado_en  = NOW()
                RETURNING (xmax = 0) AS es_insert
            """, (numero_docente, chec_id, noi, nombre, rfc, curp, cp, clabe,
                  forma_pago, regimen, adscripcion, correo, pwd))

            result = cur.fetchone()
            if result and result["es_insert"]:
                insertados += 1
            else:
                actualizados += 1

        except Exception as e:
            errores += 1
            detalle_errores.append(f"Fila {i}: {str(e)[:100]}")
            logger.warning(f"Error carga masiva fila {i}: {e}")

    registrar(conn, usuario, accion="carga_masiva_docentes", entidad="docente",
              descripcion=f"Carga masiva Excel: {insertados} nuevos, {actualizados} actualizados, {errores} omitidos",
              detalle={"archivo": file.filename, "insertados": insertados,
                       "actualizados": actualizados, "errores": errores,
                       "detalle_errores": detalle_errores},
              ip=ip_from_request(request))
    conn.commit()
    cur.close()
    conn.close()

    return CargaMasivaResultado(
        total=insertados + actualizados + errores,
        insertados=insertados,
        actualizados=actualizados,
        errores=errores,
        detalle_errores=detalle_errores
    )


# ── Jornada Tiempo Completo ────────────────────────────────────────────────────

class JornadaTCBlock(BaseModel):
    lunes:        bool = False
    martes:       bool = False
    miercoles:    bool = False
    jueves:       bool = False
    viernes:      bool = False
    sabado:       bool = False
    domingo:      bool = False
    hora_entrada: str   # "HH:MM"
    hora_salida:  str   # "HH:MM"


@router.get("/{docente_id}/jornada")
async def get_jornada_tc(
    docente_id: int,
    usuario: UsuarioActual = Depends(puede_horarios)
):
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute(
            "SELECT id, lunes, martes, miercoles, jueves, viernes, sabado, domingo, "
            "       hora_entrada::text AS hora_entrada, hora_salida::text AS hora_salida "
            "FROM horarios_docente_tc WHERE docente_id = %s ORDER BY id",
            (docente_id,)
        )
        rows = cur.fetchall()
        return [
            {**dict(r),
             "hora_entrada": str(r["hora_entrada"])[:5],
             "hora_salida":  str(r["hora_salida"])[:5]}
            for r in rows
        ]
    finally:
        cur.close()
        conn.close()


@router.put("/{docente_id}/jornada", status_code=200)
async def save_jornada_tc(
    docente_id: int,
    body: List[JornadaTCBlock],
    usuario: UsuarioActual = Depends(puede_horarios)
):
    """Reemplaza completo la jornada del docente TC."""
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT id FROM docentes WHERE id = %s", (docente_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Docente no encontrado")

        cur.execute("DELETE FROM horarios_docente_tc WHERE docente_id = %s", (docente_id,))

        for h in body:
            cur.execute("""
                INSERT INTO horarios_docente_tc
                    (docente_id, lunes, martes, miercoles, jueves, viernes,
                     sabado, domingo, hora_entrada, hora_salida)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                docente_id,
                h.lunes, h.martes, h.miercoles, h.jueves, h.viernes,
                h.sabado, h.domingo, h.hora_entrada, h.hora_salida
            ))

        conn.commit()
        return {"mensaje": "Jornada guardada", "bloques": len(body)}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.get("/{docente_id}/horarios")
async def get_horarios_docente(
    docente_id: int,
    ciclo: str = None,
    _: UsuarioActual = Depends(get_usuario_actual)
):
    """
    Retorna todas las asignaciones activas del docente con sus bloques horarios,
    agrupadas por programa. Si se pasa ?ciclo= filtra por ciclo_label.
    """
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT id, nombre_completo FROM docentes WHERE id = %s", (docente_id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(404, "Docente no encontrado")

        ciclo_filter = "AND a.ciclo_label = %s" if ciclo else ""
        params = [docente_id] + ([ciclo] if ciclo else [])

        # Seleccionar las asignaciones activas; si no tiene ninguna (docente dado de baja,
        # duplicados desactivados, etc.) mostrar la más reciente por (materia, grupo)
        # para que el usuario vea el contexto del horario aunque sea inactivo.
        cur.execute(f"""
            WITH candidatas AS (
                SELECT
                    a.id            AS asignacion_id,
                    a.grupo,
                    a.horas_semana,
                    a.modalidad,
                    a.ciclo_label,
                    a.activa,
                    a.vigente_desde,
                    COALESCE(a.costo_hora, p.costo_hora) AS costo_hora,
                    mat.id          AS materia_id,
                    mat.nombre      AS materia_nombre,
                    p.id            AS programa_id,
                    p.nombre        AS programa_nombre,
                    p.razon_social::text AS razon_social,
                    -- Rango de partición: por (materia, grupo) para deduplicar
                    ROW_NUMBER() OVER (
                        PARTITION BY mat.id, COALESCE(a.grupo,'')
                        ORDER BY a.activa DESC, a.vigente_desde DESC, a.id DESC
                    ) AS rn,
                    -- ¿Existe al menos una asig activa para este docente?
                    COUNT(*) FILTER (WHERE a.activa = true)
                        OVER (PARTITION BY a.docente_id) AS total_activas
                FROM asignaciones a
                JOIN materias mat  ON a.materia_id  = mat.id
                JOIN programas p   ON mat.programa_id = p.id
                WHERE a.docente_id = %s
                  {ciclo_filter}
            )
            SELECT
                c.asignacion_id, c.grupo, c.horas_semana, c.modalidad,
                c.ciclo_label, c.activa, c.costo_hora,
                c.materia_id, c.materia_nombre,
                c.programa_id, c.programa_nombre, c.razon_social,
                hc.id           AS bloque_id,
                hc.dia_semana,
                hc.hora_inicio::text AS hora_inicio,
                hc.hora_fin::text    AS hora_fin,
                hc.horas_bloque
            FROM candidatas c
            LEFT JOIN horario_clases hc ON hc.asignacion_id = c.asignacion_id
                                       AND hc.activo = true
            WHERE c.rn = 1
              -- Si hay activas, mostrar solo activas; si no, mostrar la mejor inactiva
              AND (c.total_activas > 0 AND c.activa = true
                   OR c.total_activas = 0)
            ORDER BY c.programa_nombre, c.materia_nombre, c.grupo,
                     CASE hc.dia_semana
                         WHEN 'lunes' THEN 1 WHEN 'martes' THEN 2 WHEN 'miercoles' THEN 3
                         WHEN 'jueves' THEN 4 WHEN 'viernes' THEN 5 WHEN 'sabado' THEN 6
                     END
        """, params)
        rows = cur.fetchall()

        # Agrupar: programa → asignacion → bloques
        programas: dict = {}
        for r in rows:
            pid = r["programa_id"]
            aid = r["asignacion_id"]

            if pid not in programas:
                programas[pid] = {
                    "programa_id":     pid,
                    "programa_nombre": r["programa_nombre"],
                    "razon_social":    r["razon_social"],
                    "asignaciones":    {},
                }
            prog = programas[pid]

            if aid not in prog["asignaciones"]:
                prog["asignaciones"][aid] = {
                    "asignacion_id":  aid,
                    "materia_nombre": r["materia_nombre"],
                    "grupo":          r["grupo"] or "",
                    "horas_semana":   int(r["horas_semana"] or 0),
                    "modalidad":      r["modalidad"] or "presencial",
                    "costo_hora":     float(r["costo_hora"] or 0),
                    "ciclo_label":    r["ciclo_label"] or "",
                    "bloques":        [],
                }
            asig = prog["asignaciones"][aid]

            if r["bloque_id"]:
                asig["bloques"].append({
                    "bloque_id":   r["bloque_id"],
                    "dia_semana":  r["dia_semana"],
                    "hora_inicio": str(r["hora_inicio"])[:5],
                    "hora_fin":    str(r["hora_fin"])[:5],
                    "horas_bloque": int(r["horas_bloque"] or 0),
                })

        # Serializar a lista
        result = []
        for prog in programas.values():
            asigs = list(prog["asignaciones"].values())
            result.append({**prog, "asignaciones": asigs})

        return {
            "docente_id":     docente_id,
            "docente_nombre": doc["nombre_completo"],
            "programas":      result,
        }
    finally:
        cur.close()
        conn.close()
