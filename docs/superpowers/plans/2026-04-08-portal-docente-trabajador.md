# Portal Docente y Trabajador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un portal de autoservicio para docentes y personal administrativo que acceda al mismo login pero vea solo su información; agregar rol superadmin; gestión de credenciales con reset y exportación.

**Architecture:** Opción B — vistas por rol dentro del sistema React actual. Mismo `POST /auth/login`, redirección post-login según `rol`. Nuevos routers FastAPI `portal.py`. Nuevas páginas React `PortalDocente.jsx`, `PortalTrabajador.jsx`, `CambiarPassword.jsx`. Sección "Credenciales" agregada a `Configuracion.jsx`.

**Tech Stack:** FastAPI + psycopg2 (RealDictCursor, sin SQLAlchemy) + React 18 + Vite + Tailwind CSS + openpyxl (export Excel) + bcrypt + JWT

---

## File Map

**Crear:**
- `migrations/008_portal_acceso.sql`
- `routers/portal.py`
- `frontend/src/pages/CambiarPassword.jsx`
- `frontend/src/pages/PortalDocente.jsx`
- `frontend/src/pages/PortalTrabajador.jsx`

**Modificar:**
- `routers/auth.py` — cambiar-password endpoint, superadmin en dependencias, trabajador_id + debe_cambiar_password en token
- `routers/usuarios.py` — credenciales endpoints, reset-password
- `routers/docentes.py` — crear usuario en `usuarios` al dar alta docente con portal
- `routers/administrativos.py` — crear usuario en `usuarios` al dar alta trabajador con portal
- `routers/nomina.py` — eliminar endpoints debug temporales
- `main_nomina.py` — registrar portal.router, eliminar ping-debug
- `frontend/src/context/AuthContext.jsx` — agregar debe_cambiar_password
- `frontend/src/App.jsx` — rutas nuevas + lógica redirección
- `frontend/src/pages/Configuracion.jsx` — tab "Credenciales"
- `frontend/src/pages/Docentes.jsx` — campo contraseña + checkbox portal en alta
- `frontend/src/pages/PersonalAdmin.jsx` — campo contraseña + checkbox portal en alta

---

## Task 1: Migración 008 — DB schema

**Files:**
- Create: `migrations/008_portal_acceso.sql`

- [ ] **Crear archivo de migración**

```sql
-- migrations/008_portal_acceso.sql
-- Agrega roles superadmin y trabajador, y campos de portal a usuarios

-- Nuevos valores en ENUM rol_usuario
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'superadmin';
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'trabajador';

-- Extender tabla usuarios
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS trabajador_id       INTEGER REFERENCES trabajadores(id),
    ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_usuarios_trabajador ON usuarios(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_docente    ON usuarios(docente_id);

-- Permisos
GRANT SELECT, INSERT, UPDATE, DELETE ON usuarios TO nomina_user;
```

- [ ] **Ejecutar migración**

```bash
cd C:\Proyectos\nomina-iesef
python -c "
import psycopg2
conn = psycopg2.connect('postgresql://postgres@localhost:5432/iesef_nomina')
conn.autocommit = True
cur = conn.cursor()
with open('migrations/008_portal_acceso.sql') as f:
    cur.execute(f.read())
print('OK')
cur.close(); conn.close()
"
```
Resultado esperado: `OK` sin error

- [ ] **Verificar**

```bash
python -c "
import psycopg2, psycopg2.extras
conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026\$@localhost:5432/iesef_nomina', cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()
cur.execute(\"SELECT column_name FROM information_schema.columns WHERE table_name='usuarios' ORDER BY ordinal_position\")
print([r['column_name'] for r in cur.fetchall()])
cur.close(); conn.close()
"
```
Resultado esperado: lista que incluye `'trabajador_id'` y `'debe_cambiar_password'`

- [ ] **Commit**

```bash
git add migrations/008_portal_acceso.sql
git commit -m "feat: migration 008 — add superadmin/trabajador roles, portal fields to usuarios"
```

---

## Task 2: Backend — auth.py actualizado

**Files:**
- Modify: `routers/auth.py`

- [ ] **Agregar superadmin a todas las dependencias de rol y nuevos campos al token**

Reemplazar `routers/auth.py` completo con:

```python
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import psycopg2
from psycopg2.extras import RealDictCursor
import bcrypt
import jwt
import logging

from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()

# ── Modelos ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token:          str
    token_type:            str = "bearer"
    rol:                   str
    nombre:                str
    usuario_id:            int
    programa_id:           Optional[int] = None
    debe_cambiar_password: bool = False

class CambiarPasswordRequest(BaseModel):
    password_actual:  str
    password_nueva:   str
    password_confirma: str

class UsuarioActual(BaseModel):
    id:                    int
    nombre:                str
    email:                 str
    rol:                   str
    programa_id:           Optional[int] = None
    docente_id:            Optional[int] = None
    trabajador_id:         Optional[int] = None
    debe_cambiar_password: bool = False

# ── DB ─────────────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)

# ── JWT ────────────────────────────────────────────────────────────────────────

def crear_token(usuario_id: int, rol: str, programa_id: Optional[int] = None) -> str:
    payload = {
        "sub": str(usuario_id),
        "rol": rol,
        "programa_id": programa_id,
        "exp": datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

def verificar_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=["HS256"]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

def get_usuario_actual(token: dict = Depends(verificar_token)) -> UsuarioActual:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """SELECT id, nombre, email, rol, programa_id, docente_id,
                      trabajador_id, debe_cambiar_password
               FROM usuarios WHERE id = %s AND activo = true""",
            (int(token["sub"]),)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=401, detail="Usuario no encontrado o inactivo")
        return UsuarioActual(**row)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error get_usuario_actual: {e}")
        raise HTTPException(status_code=500, detail="Error interno")

# ── Dependencias de rol ────────────────────────────────────────────────────────

def _requiere_roles(*roles: str):
    """Factory que retorna una dependencia que verifica roles.
    superadmin siempre tiene acceso a todo."""
    def _dep(usuario: UsuarioActual = Depends(get_usuario_actual)) -> UsuarioActual:
        if usuario.rol == "superadmin":
            return usuario
        if usuario.rol not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Se requiere uno de estos roles: {', '.join(roles)}"
            )
        return usuario
    return _dep

# Dependencias exportables para otros routers
solo_admin        = _requiere_roles("director_cap_humano", "cap_humano")
admin_o_finanzas  = _requiere_roles("director_cap_humano", "cap_humano", "finanzas")
puede_horarios    = _requiere_roles("director_cap_humano", "cap_humano", "coord_docente", "servicios_escolares")
puede_incidencias = _requiere_roles("director_cap_humano", "cap_humano", "coord_docente", "coord_academica")
puede_virtual_ca     = _requiere_roles("director_cap_humano", "cap_humano", "coord_academica")
puede_virtual_ev     = _requiere_roles("director_cap_humano", "cap_humano", "educacion_virtual")
puede_resumen_nomina = _requiere_roles("director_cap_humano", "cap_humano", "finanzas", "coord_docente")
puede_quincenas   = _requiere_roles("director_cap_humano", "cap_humano", "coord_docente")
cualquier_usuario = _requiere_roles(
    "director_cap_humano", "cap_humano", "finanzas",
    "coord_docente", "servicios_escolares",
    "coord_academica", "educacion_virtual",
    "docente", "trabajador", "reportes"
)

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """SELECT id, nombre, email, password_hash, rol, programa_id, debe_cambiar_password
               FROM usuarios WHERE email = %s AND activo = true""",
            (body.email.lower().strip(),)
        )
        user = cur.fetchone()
        cur.close()
        conn.close()

        if not user:
            raise HTTPException(status_code=401, detail="Credenciales incorrectas")

        if not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
            raise HTTPException(status_code=401, detail="Credenciales incorrectas")

        conn = get_conn()
        cur = conn.cursor()
        cur.execute("UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = %s", (user["id"],))
        conn.commit()
        cur.close()
        conn.close()

        token = crear_token(user["id"], user["rol"], user["programa_id"])
        return TokenResponse(
            access_token=token,
            rol=user["rol"],
            nombre=user["nombre"],
            usuario_id=user["id"],
            programa_id=user["programa_id"],
            debe_cambiar_password=user["debe_cambiar_password"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en login: {e}")
        raise HTTPException(status_code=500, detail="Error interno")

@router.get("/me", response_model=UsuarioActual)
async def get_me(usuario: UsuarioActual = Depends(get_usuario_actual)):
    return usuario

@router.post("/cambiar-password", status_code=200)
async def cambiar_password(
    body: CambiarPasswordRequest,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    """Cualquier usuario autenticado puede cambiar su propia contraseña."""
    if body.password_nueva != body.password_confirma:
        raise HTTPException(status_code=400, detail="Las contraseñas no coinciden")
    if len(body.password_nueva) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT password_hash FROM usuarios WHERE id = %s", (usuario.id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        if not bcrypt.checkpw(body.password_actual.encode(), row["password_hash"].encode()):
            raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta")

        nuevo_hash = bcrypt.hashpw(body.password_nueva.encode(), bcrypt.gensalt(rounds=10)).decode()
        cur.execute(
            "UPDATE usuarios SET password_hash = %s, debe_cambiar_password = false WHERE id = %s",
            (nuevo_hash, usuario.id)
        )
        conn.commit()
        return {"ok": True, "mensaje": "Contraseña actualizada correctamente"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error cambiar_password: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        cur.close()
        conn.close()
```

- [ ] **Verificar sintaxis**

```bash
cd C:\Proyectos\nomina-iesef
python -c "import routers.auth; print('OK')"
```
Resultado esperado: `OK`

- [ ] **Commit**

```bash
git add routers/auth.py
git commit -m "feat: add superadmin role bypass, trabajador_id in token, cambiar-password endpoint"
```

---

## Task 3: Backend — portal.py (nuevo router)

**Files:**
- Create: `routers/portal.py`

- [ ] **Crear routers/portal.py**

```python
"""
routers/portal.py
Endpoints del portal de autoservicio para docentes y trabajadores.
Toda ruta requiere rol 'docente' o 'trabajador' según corresponda.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
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
                nq.id, q.fecha_inicio, q.fecha_fin, q.estado AS quincena_estado,
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
    quincena_id: Optional[int] = None,
    usuario: UsuarioActual = Depends(_solo_docente)
):
    """Checadas propias del docente, filtradas opcionalmente por quincena."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Obtener chec_id del docente
        cur.execute("SELECT chec_id FROM docentes WHERE id = %s", (usuario.docente_id,))
        doc = cur.fetchone()
        if not doc or not doc["chec_id"]:
            return []

        if quincena_id:
            cur.execute(
                "SELECT fecha_inicio, fecha_fin FROM quincenas WHERE id = %s",
                (quincena_id,)
            )
            q = cur.fetchone()
            if not q:
                raise HTTPException(status_code=404, detail="Quincena no encontrada")
            fecha_ini, fecha_fin = q["fecha_inicio"], q["fecha_fin"]
        else:
            # Quincena activa más reciente
            cur.execute("""
                SELECT fecha_inicio, fecha_fin FROM quincenas
                WHERE estado IN ('abierta', 'en_revision')
                ORDER BY fecha_inicio DESC LIMIT 1
            """)
            q = cur.fetchone()
            if not q:
                return []
            fecha_ini, fecha_fin = q["fecha_inicio"], q["fecha_fin"]

        cur.execute("""
            SELECT
                id,
                DATE(timestamp_checada)         AS fecha,
                TO_CHAR(timestamp_checada, 'Dy') AS dia_semana,
                timestamp_checada::time          AS hora,
                tipo_punch,
                estado
            FROM asistencias_checadas
            WHERE user_id = %s
              AND timestamp_checada::date BETWEEN %s AND %s
            ORDER BY timestamp_checada
        """, (doc["chec_id"], fecha_ini, fecha_fin))

        # Agrupar por fecha: entrada (tipo_punch=0), salida (tipo_punch=1)
        por_fecha = {}
        for r in cur.fetchall():
            f = str(r["fecha"])
            if f not in por_fecha:
                por_fecha[f] = {"fecha": f, "dia_semana": r["dia_semana"],
                                "entrada": None, "salida": None, "extras": []}
            if r["tipo_punch"] == 0 and not por_fecha[f]["entrada"]:
                por_fecha[f]["entrada"] = str(r["hora"])[:5]
            elif r["tipo_punch"] == 1 and not por_fecha[f]["salida"]:
                por_fecha[f]["salida"] = str(r["hora"])[:5]
            else:
                por_fecha[f]["extras"].append(str(r["hora"])[:5])

        return list(por_fecha.values())
    finally:
        cur.close()
        conn.close()


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
    periodo_id: Optional[int] = None,
    usuario: UsuarioActual = Depends(_solo_trabajador)
):
    """Checadas del trabajador agrupadas por día para el período seleccionado."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        # Obtener chec_id del trabajador
        cur.execute("SELECT chec_id FROM trabajadores WHERE id = %s", (usuario.trabajador_id,))
        trab = cur.fetchone()
        if not trab or not trab["chec_id"]:
            return {"resumen": {}, "dias": []}

        if periodo_id:
            cur.execute(
                "SELECT nombre, fecha_inicio, fecha_fin FROM periodos_admin WHERE id = %s",
                (periodo_id,)
            )
            periodo = cur.fetchone()
            if not periodo:
                raise HTTPException(status_code=404, detail="Período no encontrado")
        else:
            cur.execute("""
                SELECT nombre, fecha_inicio, fecha_fin FROM periodos_admin
                WHERE estado = 'abierto'
                ORDER BY fecha_inicio DESC LIMIT 1
            """)
            periodo = cur.fetchone()
            if not periodo:
                return {"resumen": {}, "dias": [], "periodo": None}

        cur.execute("""
            SELECT
                DATE(timestamp_checada)         AS fecha,
                TO_CHAR(timestamp_checada, 'Dy') AS dia_semana,
                timestamp_checada::time          AS hora,
                tipo_punch
            FROM asistencias_checadas
            WHERE user_id = %s
              AND timestamp_checada::date BETWEEN %s AND %s
            ORDER BY timestamp_checada
        """, (trab["chec_id"], periodo["fecha_inicio"], periodo["fecha_fin"]))

        por_fecha = {}
        for r in cur.fetchall():
            f = str(r["fecha"])
            if f not in por_fecha:
                por_fecha[f] = {"fecha": f, "dia_semana": r["dia_semana"],
                                "entrada": None, "salida": None}
            if r["tipo_punch"] == 0 and not por_fecha[f]["entrada"]:
                por_fecha[f]["entrada"] = str(r["hora"])[:5]
            elif r["tipo_punch"] == 1 and not por_fecha[f]["salida"]:
                por_fecha[f]["salida"] = str(r["hora"])[:5]

        dias = list(por_fecha.values())
        presentes  = sum(1 for d in dias if d["entrada"] and d["salida"])
        incompletos = sum(1 for d in dias if (d["entrada"] or d["salida"]) and not (d["entrada"] and d["salida"]))

        return {
            "periodo": dict(periodo),
            "resumen": {
                "dias_con_registro": len(dias),
                "presentes":         presentes,
                "incompletos":       incompletos,
            },
            "dias": dias,
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
```

- [ ] **Verificar sintaxis**

```bash
cd C:\Proyectos\nomina-iesef
python -c "import routers.portal; print('OK')"
```
Resultado esperado: `OK`

- [ ] **Commit**

```bash
git add routers/portal.py
git commit -m "feat: portal.py — mi-nomina, mis-checadas, aclaraciones, mi-asistencia endpoints"
```

---

## Task 4: Backend — usuarios.py — credenciales y reset

**Files:**
- Modify: `routers/usuarios.py`

- [ ] **Agregar al final de routers/usuarios.py los nuevos endpoints**

Agregar después de la última función en el archivo:

```python
# ── Credenciales de acceso ─────────────────────────────────────────────────────

PUEDE_VER_CREDS_DOCENTES   = ("superadmin", "director_cap_humano", "cap_humano", "coord_docente")
PUEDE_VER_CREDS_TRABAJADORES = ("superadmin", "director_cap_humano", "cap_humano")
PUEDE_RESETEAR = ("superadmin", "director_cap_humano")

import io
from datetime import datetime as _dt

@router.get("/credenciales-docentes")
async def credenciales_docentes(usuario: UsuarioActual = Depends(get_usuario_actual)):
    if usuario.rol not in PUEDE_VER_CREDS_DOCENTES:
        raise HTTPException(status_code=403, detail="Sin permiso")
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT u.id, u.nombre, u.email AS username, u.debe_cambiar_password,
                   u.ultimo_acceso, u.activo,
                   d.numero_docente
            FROM usuarios u
            JOIN docentes d ON d.id = u.docente_id
            WHERE u.rol = 'docente' AND u.docente_id IS NOT NULL
            ORDER BY u.nombre
        """)
        rows = cur.fetchall()
        return [
            {
                "id":                    r["id"],
                "nombre":                r["nombre"],
                "username":              r["username"],
                "numero_docente":        r["numero_docente"],
                "debe_cambiar_password": r["debe_cambiar_password"],
                "password_visible":      f"IESEF{_dt.now().year}" if r["debe_cambiar_password"] else "••••••",
                "ultimo_acceso":         r["ultimo_acceso"],
                "activo":                r["activo"],
            }
            for r in rows
        ]
    finally:
        cur.close()
        conn.close()


@router.get("/credenciales-trabajadores")
async def credenciales_trabajadores(usuario: UsuarioActual = Depends(get_usuario_actual)):
    if usuario.rol not in PUEDE_VER_CREDS_TRABAJADORES:
        raise HTTPException(status_code=403, detail="Sin permiso")
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT u.id, u.nombre, u.email AS username, u.debe_cambiar_password,
                   u.ultimo_acceso, u.activo,
                   t.chec_id, t.cargo
            FROM usuarios u
            JOIN trabajadores t ON t.id = u.trabajador_id
            WHERE u.rol = 'trabajador' AND u.trabajador_id IS NOT NULL
            ORDER BY u.nombre
        """)
        rows = cur.fetchall()
        return [
            {
                "id":                    r["id"],
                "nombre":                r["nombre"],
                "username":              r["username"],
                "chec_id":               r["chec_id"],
                "cargo":                 r["cargo"],
                "debe_cambiar_password": r["debe_cambiar_password"],
                "password_visible":      f"IESEF{_dt.now().year}" if r["debe_cambiar_password"] else "••••••",
                "ultimo_acceso":         r["ultimo_acceso"],
                "activo":                r["activo"],
            }
            for r in rows
        ]
    finally:
        cur.close()
        conn.close()


@router.post("/{usuario_id}/reset-password", status_code=200)
async def reset_password(
    usuario_id: int,
    usuario: UsuarioActual = Depends(get_usuario_actual)
):
    if usuario.rol not in PUEDE_RESETEAR:
        raise HTTPException(status_code=403, detail="Solo superadmin o Director de Capital Humano")
    password_default = f"IESEF{_dt.now().year}"
    nuevo_hash = bcrypt.hashpw(password_default.encode(), bcrypt.gensalt(rounds=10)).decode()
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE usuarios
            SET password_hash = %s, debe_cambiar_password = true
            WHERE id = %s AND rol IN ('docente', 'trabajador')
            RETURNING id, nombre, email
        """, (nuevo_hash, usuario_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuario no encontrado o no es docente/trabajador")
        conn.commit()
        return {"ok": True, "nombre": row["nombre"], "password_reset_a": password_default}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error reset_password: {e}")
        raise HTTPException(status_code=500, detail="Error interno")
    finally:
        cur.close()
        conn.close()


@router.get("/credenciales-docentes/export")
async def export_credenciales_docentes(usuario: UsuarioActual = Depends(get_usuario_actual)):
    """Exporta Excel con usuarios docentes. Contraseña visible solo si no ha sido cambiada."""
    if usuario.rol not in PUEDE_VER_CREDS_DOCENTES:
        raise HTTPException(status_code=403, detail="Sin permiso")
    from fastapi.responses import StreamingResponse
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT u.nombre, u.email AS username, u.debe_cambiar_password,
                   u.ultimo_acceso, d.numero_docente
            FROM usuarios u
            JOIN docentes d ON d.id = u.docente_id
            WHERE u.rol = 'docente' AND u.docente_id IS NOT NULL
            ORDER BY u.nombre
        """)
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Credenciales Docentes"

    header_fill = PatternFill("solid", fgColor="1E40AF")
    header_font = Font(color="FFFFFF", bold=True)
    headers = ["No. Docente", "Nombre", "Usuario (correo)", "Contraseña", "Estado", "Último acceso"]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    for row_num, r in enumerate(rows, 2):
        ws.cell(row=row_num, column=1, value=r["numero_docente"])
        ws.cell(row=row_num, column=2, value=r["nombre"])
        ws.cell(row=row_num, column=3, value=r["username"])
        pwd = f"IESEF{_dt.now().year}" if r["debe_cambiar_password"] else "••••••"
        ws.cell(row=row_num, column=4, value=pwd)
        ws.cell(row=row_num, column=5, value="Pendiente cambio" if r["debe_cambiar_password"] else "Personalizada")
        ws.cell(row=row_num, column=6, value=str(r["ultimo_acceso"]) if r["ultimo_acceso"] else "Nunca")

    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 24

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"credenciales_docentes_{_dt.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/credenciales-trabajadores/export")
async def export_credenciales_trabajadores(usuario: UsuarioActual = Depends(get_usuario_actual)):
    """Exporta Excel con usuarios trabajadores."""
    if usuario.rol not in PUEDE_VER_CREDS_TRABAJADORES:
        raise HTTPException(status_code=403, detail="Sin permiso")
    from fastapi.responses import StreamingResponse
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT u.nombre, u.email AS username, t.chec_id, t.cargo,
                   u.debe_cambiar_password, u.ultimo_acceso
            FROM usuarios u
            JOIN trabajadores t ON t.id = u.trabajador_id
            WHERE u.rol = 'trabajador' AND u.trabajador_id IS NOT NULL
            ORDER BY u.nombre
        """)
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Credenciales Trabajadores"
    header_fill = PatternFill("solid", fgColor="065F46")
    header_font = Font(color="FFFFFF", bold=True)
    headers = ["Chec ID", "Nombre", "Usuario", "Cargo", "Contraseña", "Estado", "Último acceso"]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    for row_num, r in enumerate(rows, 2):
        ws.cell(row=row_num, column=1, value=r["chec_id"])
        ws.cell(row=row_num, column=2, value=r["nombre"])
        ws.cell(row=row_num, column=3, value=r["username"])
        ws.cell(row=row_num, column=4, value=r["cargo"] or "")
        pwd = f"IESEF{_dt.now().year}" if r["debe_cambiar_password"] else "••••••"
        ws.cell(row=row_num, column=5, value=pwd)
        ws.cell(row=row_num, column=6, value="Pendiente cambio" if r["debe_cambiar_password"] else "Personalizada")
        ws.cell(row=row_num, column=7, value=str(r["ultimo_acceso"]) if r["ultimo_acceso"] else "Nunca")

    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 22

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"credenciales_trabajadores_{_dt.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
```

- [ ] **Agregar import bcrypt al inicio de usuarios.py** (ya está, verificar)

```bash
grep "import bcrypt" routers/usuarios.py
```

- [ ] **Verificar sintaxis**

```bash
python -c "import routers.usuarios; print('OK')"
```
Resultado esperado: `OK`

- [ ] **Commit**

```bash
git add routers/usuarios.py
git commit -m "feat: credenciales-docentes/trabajadores, reset-password, export Excel"
```

---

## Task 5: Backend — docentes.py — crear usuario al dar alta

**Files:**
- Modify: `routers/docentes.py`

- [ ] **En crear_docente, agregar lógica para crear registro en usuarios cuando se envía crear_portal=True**

Localizar el modelo `DocenteCreate` en `routers/docentes.py` y agregar el campo:

```python
class DocenteCreate(BaseModel):
    # ... campos existentes ...
    crear_portal:     bool = True
    password_portal:  Optional[str] = None  # default: IESEF{año}
```

- [ ] **En la función `crear_docente`, después del `conn.commit()` y antes de `return DocenteOut(**row)`, agregar:**

```python
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
```

- [ ] **Verificar sintaxis**

```bash
python -c "import routers.docentes; print('OK')"
```
Resultado esperado: `OK`

- [ ] **Commit**

```bash
git add routers/docentes.py
git commit -m "feat: auto-create portal user when creating docente with correo"
```

---

## Task 6: Backend — administrativos.py — crear usuario trabajador al dar alta

**Files:**
- Modify: `routers/administrativos.py`

- [ ] **Agregar campos crear_portal y password_portal al modelo de creación de trabajador**

Buscar en `administrativos.py` el modelo de body para crear trabajador (probablemente `TrabajadorCreate` o similar en el endpoint POST de trabajadores). Agregar campos:

```python
crear_portal:    bool = True
password_portal: Optional[str] = None
```

- [ ] **Después de crear el trabajador en DB y hacer commit, agregar la creación del usuario portal**

En el endpoint `POST /trabajadores` (o equivalente), después del commit del trabajador:

```python
        # Crear acceso al portal si se solicitó (username = str(chec_id))
        if body.crear_portal and body.chec_id:
            from datetime import datetime as _dt3
            import bcrypt as _bcrypt3
            pwd_portal = body.password_portal or f"IESEF{_dt3.now().year}"
            pwd_hash_portal = _bcrypt3.hashpw(pwd_portal.encode(), _bcrypt3.gensalt(rounds=10)).decode()
            username_trab = str(body.chec_id)
            try:
                cur2 = conn.cursor()
                cur2.execute("""
                    INSERT INTO usuarios (trabajador_id, nombre, email, password_hash, rol,
                                         activo, debe_cambiar_password)
                    VALUES (%s, %s, %s, %s, 'trabajador', true, true)
                    ON CONFLICT (email) DO NOTHING
                """, (row["id"], row["nombre"], username_trab, pwd_hash_portal))
                conn.commit()
                cur2.close()
            except Exception as e2:
                logger.warning(f"No se pudo crear usuario portal para trabajador {row['id']}: {e2}")
```

- [ ] **Verificar sintaxis**

```bash
python -c "import routers.administrativos; print('OK')"
```
Resultado esperado: `OK`

- [ ] **Commit**

```bash
git add routers/administrativos.py
git commit -m "feat: auto-create portal user when creating trabajador with chec_id"
```

---

## Task 7: Backend — main_nomina.py y nomina.py limpieza

**Files:**
- Modify: `main_nomina.py`
- Modify: `routers/nomina.py`

- [ ] **Eliminar endpoint debug de main_nomina.py y registrar portal.router**

`main_nomina.py` debe quedar:

```python
"""
main_nomina.py — Módulo principal del sistema de nómina IESEF
"""
from fastapi import FastAPI
from routers import auth, docentes, catalogos, quincenas, nomina, exportar, usuarios, evaluacion, administrativos, portal

app = FastAPI(title="IESEF Nómina — Dev", docs_url="/docs")
app.include_router(auth.router)
app.include_router(docentes.router)
app.include_router(catalogos.router)
app.include_router(quincenas.router)
app.include_router(nomina.router)
app.include_router(exportar.router)
app.include_router(usuarios.router)
app.include_router(evaluacion.router)
app.include_router(administrativos.router)
app.include_router(portal.router)

@app.get("/")
async def root():
    return {"status": "ok", "sistema": "nomina-iesef"}
```

- [ ] **Eliminar endpoints debug de routers/nomina.py**

Eliminar los endpoints `/debug-suplencia` y (si existe) `/debug/{quincena_id}/{docente_id}` que se agregaron durante el diagnóstico.

- [ ] **Verificar**

```bash
python -c "import main_nomina; print('OK')"
```
Resultado esperado: `OK`

- [ ] **Commit**

```bash
git add main_nomina.py routers/nomina.py
git commit -m "chore: register portal router, remove debug endpoints"
```

---

## Task 8: Frontend — AuthContext.jsx

**Files:**
- Modify: `frontend/src/context/AuthContext.jsx`

- [ ] **Agregar debe_cambiar_password al contexto**

```jsx
import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(() => {
    const u = localStorage.getItem('usuario')
    return u ? JSON.parse(u) : null
  })

  const login = (data) => {
    localStorage.setItem('token', data.access_token)
    const u = {
      id:                    data.usuario_id,
      nombre:                data.nombre,
      rol:                   data.rol,
      programa_id:           data.programa_id,
      debe_cambiar_password: data.debe_cambiar_password ?? false,
    }
    localStorage.setItem('usuario', JSON.stringify(u))
    setUsuario(u)
  }

  const marcarPasswordCambiado = () => {
    setUsuario(prev => {
      const updated = { ...prev, debe_cambiar_password: false }
      localStorage.setItem('usuario', JSON.stringify(updated))
      return updated
    })
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, marcarPasswordCambiado }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

- [ ] **Commit**

```bash
git add frontend/src/context/AuthContext.jsx
git commit -m "feat: add debe_cambiar_password and marcarPasswordCambiado to AuthContext"
```

---

## Task 9: Frontend — App.jsx routing

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Agregar rutas de portales y lógica de redirección**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Docentes from './pages/Docentes'
import Quincenas from './pages/Quincenas'
import Configuracion from './pages/Configuracion'
import QuincenaDetalle from './pages/QuincenaDetalle'
import Horarios from './pages/Horarios'
import PersonalAdmin from './pages/PersonalAdmin'
import AdminQuincenas from './pages/AdminQuincenas'
import AdminQuincenaDetalle from './pages/AdminQuincenaDetalle'
import CambiarPassword from './pages/CambiarPassword'
import PortalDocente from './pages/PortalDocente'
import PortalTrabajador from './pages/PortalTrabajador'

// Ruta que requiere autenticación — si debe cambiar password redirige ahí primero
function PrivateRoute({ children }) {
  const { usuario } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />
  return children
}

// Ruta exclusiva para docentes
function DocenteRoute({ children }) {
  const { usuario } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />
  if (usuario.rol !== 'docente') return <Navigate to="/dashboard" replace />
  return children
}

// Ruta exclusiva para trabajadores
function TrabajadorRoute({ children }) {
  const { usuario } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />
  if (usuario.rol !== 'trabajador') return <Navigate to="/dashboard" replace />
  return children
}

// Ruta de staff operativo (todos los roles excepto docente y trabajador)
function StaffRoute({ children }) {
  const { usuario } = useAuth()
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />
  if (usuario.rol === 'docente') return <Navigate to="/portal/docente" replace />
  if (usuario.rol === 'trabajador') return <Navigate to="/portal/trabajador" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cambiar-password" element={<CambiarPassword />} />

        {/* Portal docente */}
        <Route path="/portal/docente" element={<DocenteRoute><PortalDocente /></DocenteRoute>} />

        {/* Portal trabajador */}
        <Route path="/portal/trabajador" element={<TrabajadorRoute><PortalTrabajador /></TrabajadorRoute>} />

        {/* Sistema operativo (staff) */}
        <Route path="/" element={<StaffRoute><Layout /></StaffRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="docentes" element={<Docentes />} />
          <Route path="quincenas" element={<Quincenas />} />
          <Route path="quincenas/:id" element={<QuincenaDetalle />} />
          <Route path="horarios" element={<Horarios />} />
          <Route path="configuracion" element={<Configuracion />} />
          <Route path="admin/personal" element={<PersonalAdmin />} />
          <Route path="admin/nomina" element={<AdminQuincenas />} />
          <Route path="admin/nomina/:id" element={<AdminQuincenaDetalle />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Modificar Login.jsx para redirigir según rol**

Buscar en `Login.jsx` la llamada `login(res.data)` y la redirección post-login. Reemplazar la redirección por:

```jsx
login(res.data)
if (res.data.debe_cambiar_password) {
  navigate('/cambiar-password', { replace: true })
} else if (res.data.rol === 'docente') {
  navigate('/portal/docente', { replace: true })
} else if (res.data.rol === 'trabajador') {
  navigate('/portal/trabajador', { replace: true })
} else {
  navigate('/dashboard', { replace: true })
}
```

- [ ] **Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/Login.jsx
git commit -m "feat: role-based routing — docente/trabajador portal routes, redirect logic"
```

---

## Task 10: Frontend — CambiarPassword.jsx

**Files:**
- Create: `frontend/src/pages/CambiarPassword.jsx`

- [ ] **Crear pantalla de cambio obligatorio de contraseña**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

export default function CambiarPassword() {
  const { usuario, marcarPasswordCambiado, logout } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ password_actual: '', password_nueva: '', password_confirma: '' })
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (form.password_nueva !== form.password_confirma) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (form.password_nueva.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setGuardando(true)
    try {
      await api.post('/auth/cambiar-password', {
        password_actual:  form.password_actual,
        password_nueva:   form.password_nueva,
        password_confirma: form.password_confirma,
      })
      marcarPasswordCambiado()
      // Redirigir al portal correspondiente
      if (usuario?.rol === 'docente') navigate('/portal/docente', { replace: true })
      else if (usuario?.rol === 'trabajador') navigate('/portal/trabajador', { replace: true })
      else navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cambiar la contraseña.')
    } finally {
      setGuardando(false)
    }
  }

  const inputCls = "w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Establece tu contraseña</h1>
          <p className="text-slate-500 text-sm mt-2">
            Es tu primer acceso. Por seguridad debes crear una contraseña personal.
          </p>
          {usuario?.nombre && (
            <p className="text-blue-600 text-sm font-medium mt-1">Hola, {usuario.nombre}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Contraseña actual (la que te dieron)
              </label>
              <input
                type="password"
                value={form.password_actual}
                onChange={e => set('password_actual', e.target.value)}
                className={inputCls}
                placeholder="Contraseña inicial"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Nueva contraseña
              </label>
              <input
                type="password"
                value={form.password_nueva}
                onChange={e => set('password_nueva', e.target.value)}
                className={inputCls}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Confirmar nueva contraseña
              </label>
              <input
                type="password"
                value={form.password_confirma}
                onChange={e => set('password_confirma', e.target.value)}
                className={inputCls}
                placeholder="Repite la contraseña"
                required
              />
            </div>

            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={guardando}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              {guardando ? 'Guardando...' : 'Guardar y entrar'}
            </button>
          </form>

          <button
            onClick={() => { logout(); navigate('/login') }}
            className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add frontend/src/pages/CambiarPassword.jsx
git commit -m "feat: CambiarPassword.jsx — forced password change on first login"
```

---

## Task 11: Frontend — PortalDocente.jsx

**Files:**
- Create: `frontend/src/pages/PortalDocente.jsx`

- [ ] **Crear portal completo del docente con 4 tabs**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
const fmtFecha = (d) => d ? new Date(d + 'T12:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const ESTADO_NOMINA = {
  borrador: { label: 'Borrador', cls: 'bg-amber-100 text-amber-700' },
  validado: { label: 'Validado', cls: 'bg-blue-100 text-blue-700' },
  pagado:   { label: 'Pagado',   cls: 'bg-emerald-100 text-emerald-700' },
}

const ESTADO_ACLARACION = {
  pendiente: { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-700' },
  revisando: { label: 'Revisando', cls: 'bg-blue-100 text-blue-700' },
  resuelta:  { label: 'Resuelta',  cls: 'bg-emerald-100 text-emerald-700' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-700' },
}

// ── Tab: Mi Nómina ────────────────────────────────────────────────────────────
function TabNomina() {
  const [nominas, setNominas] = useState([])
  const [expandida, setExpandida] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/portal/mi-nomina').then(r => setNominas(r.data)).finally(() => setLoading(false))
  }, [])

  const verDetalle = async (quincena_id) => {
    if (expandida === quincena_id) { setExpandida(null); setDetalle(null); return }
    setExpandida(quincena_id)
    const r = await api.get(`/portal/mi-nomina/${quincena_id}`)
    setDetalle(r.data)
  }

  if (loading) return <div className="text-center py-12 text-slate-400 text-sm">Cargando...</div>
  if (!nominas.length) return <div className="text-center py-12 text-slate-400 text-sm">No hay nóminas registradas aún.</div>

  return (
    <div className="space-y-3">
      {nominas.map(n => {
        const cfg = ESTADO_NOMINA[n.nomina_estado] || { label: n.nomina_estado, cls: 'bg-slate-100 text-slate-600' }
        return (
          <div key={n.quincena_id || n.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              className="w-full px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              onClick={() => verDetalle(n.quincena_id || n.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {fmtFecha(n.fecha_inicio)} — {fmtFecha(n.fecha_fin)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {n.horas_reales} hrs · Honorarios {fmt(n.honorarios)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                  <p className="text-base font-bold text-slate-800">{fmt(n.total_final)}</p>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandida === (n.quincena_id || n.id) ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {expandida === (n.quincena_id || n.id) && detalle && (
              <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-4">
                  <div className="flex justify-between"><span className="text-slate-500">H. Presenciales</span><span className="font-medium">{Math.round(detalle.horas_presenciales)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">H. Virtuales</span><span className="font-medium">{Math.round(detalle.horas_virtuales)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">H. Suplencia</span><span className="font-medium">{Math.round(detalle.horas_suplencia)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">H. Totales</span><span className="font-medium">{Math.round(detalle.horas_reales)}</span></div>
                </div>
                <div className="border-t border-slate-200 pt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Honorarios</span><span className="font-mono">{fmt(detalle.honorarios)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">IVA 16%</span><span className="font-mono">{fmt(detalle.iva)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Sub-total</span><span className="font-mono">{fmt(detalle.sub_total)}</span></div>
                  <div className="flex justify-between text-red-600"><span>Ret. ISR 10%</span><span className="font-mono">-{fmt(detalle.retencion_isr)}</span></div>
                  <div className="flex justify-between text-red-600"><span>Ret. IVA</span><span className="font-mono">-{fmt(detalle.retencion_iva)}</span></div>
                  {detalle.ajustes !== 0 && (
                    <div className={`flex justify-between ${detalle.ajustes > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      <span>Ajustes</span><span className="font-mono">{fmt(detalle.ajustes)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-slate-200">
                    <span>Total a pagar</span><span className="font-mono">{fmt(detalle.total_final)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Mis Checadas ─────────────────────────────────────────────────────────
function TabChecadas() {
  const [quincenas, setQuincenas] = useState([])
  const [quincenaId, setQuincenaId] = useState(null)
  const [checadas, setChecadas] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/portal/quincenas-disponibles').then(r => {
      setQuincenas(r.data)
      if (r.data.length > 0) setQuincenaId(r.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!quincenaId) return
    setLoading(true)
    api.get('/portal/mis-checadas', { params: { quincena_id: quincenaId } })
      .then(r => setChecadas(r.data))
      .finally(() => setLoading(false))
  }, [quincenaId])

  const ESTADO_CHK = {
    asistencia:         { label: '✓ Asistencia',    cls: 'bg-emerald-100 text-emerald-700' },
    retardo:            { label: '⚠ Retardo',       cls: 'bg-amber-100 text-amber-700' },
    incompleta:         { label: '! Incompleta',    cls: 'bg-orange-100 text-orange-700' },
    fuera_ventana:      { label: 'Fuera ventana',   cls: 'bg-slate-100 text-slate-500' },
    pendiente_revision: { label: 'En revisión',     cls: 'bg-blue-100 text-blue-700' },
  }

  return (
    <div>
      {quincenas.length > 0 && (
        <div className="mb-4">
          <select
            value={quincenaId || ''}
            onChange={e => setQuincenaId(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {quincenas.map(q => (
              <option key={q.id} value={q.id}>
                {fmtFecha(q.fecha_inicio)} — {fmtFecha(q.fecha_fin)}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Cargando...</div>
      ) : checadas.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">No hay checadas registradas para este período.</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Día</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Entrada</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Salida</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {checadas.map((c, i) => {
                const incompleta = !c.entrada || !c.salida
                return (
                  <tr key={i} className={incompleta ? 'bg-orange-50/40' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{c.fecha}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{c.dia_semana}</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-700">{c.entrada || <span className="text-red-400">—</span>}</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-700">{c.salida || <span className="text-red-400">—</span>}</td>
                    <td className="px-4 py-3">
                      {incompleta
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Incompleta</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">✓</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab: Aclaraciones ─────────────────────────────────────────────────────────
function TabAclaraciones() {
  const [aclaraciones, setAclaraciones] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ descripcion: '', fecha_referencia: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const cargar = () => api.get('/portal/aclaraciones').then(r => setAclaraciones(r.data))
  useEffect(() => { cargar() }, [])

  const enviar = async (e) => {
    e.preventDefault()
    if (!form.descripcion.trim()) { setError('Describe tu aclaración.'); return }
    setEnviando(true); setError(null)
    try {
      await api.post('/portal/aclaraciones', {
        descripcion: form.descripcion.trim(),
        fecha_referencia: form.fecha_referencia || null,
      })
      setModal(false)
      setForm({ descripcion: '', fecha_referencia: '' })
      cargar()
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al enviar.')
    } finally {
      setEnviando(false) }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => { setModal(true); setError(null) }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Nueva aclaración
        </button>
      </div>

      {aclaraciones.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">No tienes aclaraciones registradas.</div>
      ) : (
        <div className="space-y-3">
          {aclaraciones.map(a => {
            const cfg = ESTADO_ACLARACION[a.estado] || { label: a.estado, cls: 'bg-slate-100 text-slate-600' }
            return (
              <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-slate-800">{a.descripcion}</p>
                    {a.fecha_referencia && (
                      <p className="text-xs text-slate-400 mt-1">Fecha referencia: {a.fecha_referencia}</p>
                    )}
                    {a.respuesta && (
                      <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-700">
                        <span className="font-medium">Respuesta:</span> {a.respuesta}
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(a.creado_en).toLocaleDateString('es-MX')}
                      {a.atendido_por_nombre && ` · Atendido por ${a.atendido_por_nombre}`}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Nueva aclaración</h3>
            <form onSubmit={enviar} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Descripción
                </label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  rows={4}
                  placeholder="Describe tu duda o aclaración..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Fecha de referencia (opcional)
                </label>
                <input
                  type="date"
                  value={form.fecha_referencia}
                  onChange={e => setForm(f => ({ ...f, fecha_referencia: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(false)}
                  className="flex-1 py-2.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={enviando}
                  className="flex-1 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-50">
                  {enviando ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Mi Cuenta ────────────────────────────────────────────────────────────
function TabCuenta() {
  const [form, setForm] = useState({ password_actual: '', password_nueva: '', password_confirma: '' })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (form.password_nueva !== form.password_confirma) { setMsg({ tipo: 'error', texto: 'Las contraseñas no coinciden.' }); return }
    if (form.password_nueva.length < 6) { setMsg({ tipo: 'error', texto: 'Mínimo 6 caracteres.' }); return }
    setGuardando(true)
    try {
      await api.post('/auth/cambiar-password', form)
      setMsg({ tipo: 'ok', texto: 'Contraseña actualizada correctamente.' })
      setForm({ password_actual: '', password_nueva: '', password_confirma: '' })
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.response?.data?.detail || 'Error al cambiar.' })
    } finally {
      setGuardando(false)
    }
  }

  const inputCls = "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {['password_actual', 'password_nueva', 'password_confirma'].map((k, i) => (
          <div key={k}>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {['Contraseña actual', 'Nueva contraseña', 'Confirmar nueva'][i]}
            </label>
            <input type="password" value={form[k]} onChange={e => set(k, e.target.value)}
              className={inputCls} required minLength={k !== 'password_actual' ? 6 : 1} />
          </div>
        ))}
        {msg && (
          <div className={`px-4 py-2.5 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {msg.texto}
          </div>
        )}
        <button type="submit" disabled={guardando}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
          {guardando ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  )
}

// ── Portal Principal ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'nomina',      label: 'Mi Nómina',    icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
  { id: 'checadas',    label: 'Mis Checadas', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'aclaraciones',label: 'Aclaraciones', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  { id: 'cuenta',      label: 'Mi Cuenta',    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

export default function PortalDocente() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('nomina')

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">IE</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-none">{usuario?.nombre}</p>
              <p className="text-xs text-slate-400 mt-0.5">Portal Docente</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Salir
          </button>
        </div>
        {/* Tab bar */}
        <div className="max-w-3xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {tab === 'nomina'       && <TabNomina />}
        {tab === 'checadas'     && <TabChecadas />}
        {tab === 'aclaraciones' && <TabAclaraciones />}
        {tab === 'cuenta'       && <TabCuenta />}
      </main>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add frontend/src/pages/PortalDocente.jsx
git commit -m "feat: PortalDocente.jsx — nómina, checadas, aclaraciones, mi cuenta"
```

---

## Task 12: Frontend — PortalTrabajador.jsx

**Files:**
- Create: `frontend/src/pages/PortalTrabajador.jsx`

- [ ] **Crear portal del trabajador con 2 tabs**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

const fmtFecha = (d) => d ? new Date(d + 'T12:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Tab: Mi Asistencia ────────────────────────────────────────────────────────
function TabAsistencia() {
  const [periodos, setPeriodos] = useState([])
  const [periodoId, setPeriodoId] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/portal/periodos-disponibles').then(r => {
      setPeriodos(r.data)
      if (r.data.length > 0) setPeriodoId(r.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!periodoId) return
    setLoading(true)
    api.get('/portal/mi-asistencia', { params: { periodo_id: periodoId } })
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [periodoId])

  return (
    <div>
      {periodos.length > 0 && (
        <div className="mb-4">
          <select
            value={periodoId || ''}
            onChange={e => setPeriodoId(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {periodos.map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Cargando...</div>
      ) : data ? (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Días con registro', val: data.resumen?.dias_con_registro ?? 0, cls: 'text-blue-600' },
              { label: 'Completos', val: data.resumen?.presentes ?? 0, cls: 'text-emerald-600' },
              { label: 'Incompletos', val: data.resumen?.incompletos ?? 0, cls: 'text-orange-500' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <p className={`text-2xl font-bold ${s.cls}`}>{s.val}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {data.dias?.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">Sin registros en este período.</div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Día</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Entrada</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Salida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.dias.map((d, i) => {
                    const incompleto = !d.entrada || !d.salida
                    return (
                      <tr key={i} className={incompleto ? 'bg-orange-50/40' : 'hover:bg-slate-50'}>
                        <td className="px-4 py-3 text-slate-700 tabular-nums">{d.fecha}</td>
                        <td className="px-4 py-3 text-slate-500 capitalize">{d.dia_semana}</td>
                        <td className="px-4 py-3 text-center font-mono text-slate-700">{d.entrada || <span className="text-red-400">—</span>}</td>
                        <td className="px-4 py-3 text-center font-mono text-slate-700">{d.salida || <span className="text-red-400">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8 text-slate-400 text-sm">Selecciona un período.</div>
      )}
    </div>
  )
}

// ── Tab: Mi Cuenta ────────────────────────────────────────────────────────────
function TabCuenta() {
  const [form, setForm] = useState({ password_actual: '', password_nueva: '', password_confirma: '' })
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (form.password_nueva !== form.password_confirma) { setMsg({ tipo: 'error', texto: 'Las contraseñas no coinciden.' }); return }
    if (form.password_nueva.length < 6) { setMsg({ tipo: 'error', texto: 'Mínimo 6 caracteres.' }); return }
    setGuardando(true)
    try {
      await api.post('/auth/cambiar-password', form)
      setMsg({ tipo: 'ok', texto: 'Contraseña actualizada.' })
      setForm({ password_actual: '', password_nueva: '', password_confirma: '' })
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.response?.data?.detail || 'Error al cambiar.' })
    } finally { setGuardando(false) }
  }

  const inputCls = "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {['password_actual', 'password_nueva', 'password_confirma'].map((k, i) => (
          <div key={k}>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {['Contraseña actual', 'Nueva contraseña', 'Confirmar nueva'][i]}
            </label>
            <input type="password" value={form[k]} onChange={e => set(k, e.target.value)}
              className={inputCls} required />
          </div>
        ))}
        {msg && (
          <div className={`px-4 py-2.5 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {msg.texto}
          </div>
        )}
        <button type="submit" disabled={guardando}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </div>
  )
}

// ── Portal Principal ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'asistencia', label: 'Mi Asistencia', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'cuenta',     label: 'Mi Cuenta',     icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

export default function PortalTrabajador() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('asistencia')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">IE</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-none">{usuario?.nombre}</p>
              <p className="text-xs text-slate-400 mt-0.5">Portal Administrativo</p>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/login') }}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Salir
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-4 flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        {tab === 'asistencia' && <TabAsistencia />}
        {tab === 'cuenta'     && <TabCuenta />}
      </main>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add frontend/src/pages/PortalTrabajador.jsx
git commit -m "feat: PortalTrabajador.jsx — asistencia por período, mi cuenta"
```

---

## Task 13: Frontend — Configuracion.jsx — tab Credenciales

**Files:**
- Modify: `frontend/src/pages/Configuracion.jsx`

- [ ] **Agregar componente TabCredenciales y agregarlo al array TABS**

Agregar antes de la función `Configuracion` (función principal al final del archivo):

```jsx
// ── Tab: Credenciales de Acceso ───────────────────────────────────────────────

function TabCredenciales() {
  const { usuario } = useAuth()
  const [subtab, setSubtab] = useState('docentes')
  const [docentes, setDocentes] = useState([])
  const [trabajadores, setTrabajadores] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(null)
  const [msg, setMsg] = useState(null)

  const puedeVerTrabajadores = ['superadmin','director_cap_humano','cap_humano'].includes(usuario?.rol)
  const puedeResetear = ['superadmin','director_cap_humano'].includes(usuario?.rol)

  const cargarDocentes = () => {
    setLoading(true)
    api.get('/usuarios/credenciales-docentes')
      .then(r => setDocentes(r.data))
      .catch(() => setDocentes([]))
      .finally(() => setLoading(false))
  }

  const cargarTrabajadores = () => {
    if (!puedeVerTrabajadores) return
    setLoading(true)
    api.get('/usuarios/credenciales-trabajadores')
      .then(r => setTrabajadores(r.data))
      .catch(() => setTrabajadores([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (subtab === 'docentes') cargarDocentes()
    else cargarTrabajadores()
    setBusqueda('')
  }, [subtab])

  const resetear = async (id, nombre) => {
    if (!confirm(`¿Restablecer contraseña de ${nombre} a IESEF${new Date().getFullYear()}?`)) return
    setResetting(id)
    setMsg(null)
    try {
      const r = await api.post(`/usuarios/${id}/reset-password`)
      setMsg({ tipo: 'ok', texto: `Contraseña de ${r.data.nombre} restablecida a ${r.data.password_reset_a}` })
      if (subtab === 'docentes') cargarDocentes(); else cargarTrabajadores()
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.response?.data?.detail || 'Error al restablecer.' })
    } finally {
      setResetting(null)
    }
  }

  const exportar = () => {
    const url = subtab === 'docentes'
      ? '/usuarios/credenciales-docentes/export'
      : '/usuarios/credenciales-trabajadores/export'
    const token = localStorage.getItem('token')
    fetch(`http://localhost:8000${url}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `credenciales_${subtab}_${new Date().toISOString().slice(0,10)}.xlsx`
        a.click()
      })
  }

  const lista = subtab === 'docentes' ? docentes : trabajadores
  const filtrada = lista.filter(u =>
    !busqueda || u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.username.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Credenciales de acceso al portal</h2>
          <p className="text-xs text-slate-500 mt-0.5">La contraseña solo se muestra cuando no ha sido cambiada por el usuario.</p>
        </div>
        <button onClick={exportar}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exportar Excel
        </button>
      </div>

      {/* Sub-tabs docentes/trabajadores */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setSubtab('docentes')}
          className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${subtab === 'docentes' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}>
          Docentes
        </button>
        {puedeVerTrabajadores && (
          <button onClick={() => setSubtab('trabajadores')}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${subtab === 'trabajadores' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'}`}>
            Trabajadores
          </button>
        )}
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      {/* Búsqueda */}
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o usuario..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Usuario</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Contraseña</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Último acceso</th>
              {puedeResetear && <th className="px-4 py-3 w-24" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[...Array(puedeResetear ? 6 : 5)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : filtrada.map(u => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{u.nombre}</td>
                <td className="px-4 py-3 font-mono text-slate-600 text-xs">{u.username}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {u.debe_cambiar_password
                    ? <span className="text-amber-600">{u.password_visible}</span>
                    : <span className="text-slate-400">{u.password_visible}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.debe_cambiar_password ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {u.debe_cambiar_password ? 'Pendiente' : 'Personalizada'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">
                  {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca'}
                </td>
                {puedeResetear && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => resetear(u.id, u.nombre)}
                      disabled={resetting === u.id}
                      className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg disabled:opacity-50 transition-colors"
                      title="Restablecer contraseña">
                      {resetting === u.id ? '...' : 'Reset'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtrada.length === 0 && (
          <p className="text-center py-6 text-slate-400 text-sm">Sin resultados.</p>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-2">{filtrada.length} usuarios</p>
    </div>
  )
}
```

- [ ] **Agregar 'superadmin' a ROLES_LABEL y ROLES_COLOR en Configuracion.jsx**

```jsx
// En ROLES_LABEL agregar:
superadmin: 'Superadmin',

// En ROLES_COLOR agregar:
superadmin: 'bg-red-100 text-red-700',
```

- [ ] **Agregar la tab y el componente a la sección principal**

En el array `TABS`:
```jsx
const TABS = [
  { id: 'programas',    label: 'Programas y tarifas' },
  { id: 'tolerancias',  label: 'Tolerancias' },
  { id: 'usuarios',     label: 'Administradores' },
  { id: 'credenciales', label: 'Credenciales portal' },
]
```

Y en el JSX final:
```jsx
{tab === 'credenciales' && <TabCredenciales />}
```

- [ ] **Commit**

```bash
git add frontend/src/pages/Configuracion.jsx
git commit -m "feat: Configuracion — tab Credenciales portal con docentes/trabajadores, export, reset"
```

---

## Task 14: Frontend — Docentes.jsx — campo contraseña en alta

**Files:**
- Modify: `frontend/src/pages/Docentes.jsx`

- [ ] **Agregar campos crear_portal y password_portal al EMPTY_FORM del drawer**

Buscar el `EMPTY_FORM` o el estado inicial del formulario de alta de docentes. Agregar:

```jsx
crear_portal:    true,
password_portal: `IESEF${new Date().getFullYear()}`,
```

- [ ] **Agregar los campos JSX en el formulario de alta (dentro del drawer, sección de acceso)**

Después del campo de correo, agregar:

```jsx
{/* Acceso al portal */}
<div className="col-span-2 pt-2 border-t border-slate-100">
  <div className="flex items-center justify-between mb-2">
    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Acceso al portal docente</span>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={form.crear_portal}
        onChange={e => setForm(f => ({ ...f, crear_portal: e.target.checked }))}
        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-slate-600">Crear acceso</span>
    </label>
  </div>
  {form.crear_portal && (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">Contraseña inicial</label>
      <input
        type="text"
        value={form.password_portal}
        onChange={e => setForm(f => ({ ...f, password_portal: e.target.value }))}
        className={inputCls}
        placeholder={`IESEF${new Date().getFullYear()}`}
      />
      <p className="text-xs text-slate-400 mt-1">
        El docente deberá cambiarla en su primer ingreso. Usuario: correo institucional.
      </p>
    </div>
  )}
</div>
```

- [ ] **Enviar los nuevos campos en el body del POST al crear docente**

En la llamada `api.post('/docentes', { ...form })`, verificar que `crear_portal` y `password_portal` se incluyan en el body.

- [ ] **Commit**

```bash
git add frontend/src/pages/Docentes.jsx
git commit -m "feat: Docentes — crear_portal y password_portal en formulario de alta"
```

---

## Task 15: Frontend — PersonalAdmin.jsx — campo contraseña en alta trabajador

**Files:**
- Modify: `frontend/src/pages/PersonalAdmin.jsx`

- [ ] **Agregar crear_portal y password_portal al EMPTY_FORM de ModalTrabajador**

```jsx
const EMPTY_FORM = {
  chec_id: '',
  nombre: '',
  cargo: '',
  sueldo_quincenal: '',
  horarios: [{ ...EMPTY_BLOQUE }],
  crear_portal:    true,
  password_portal: `IESEF${new Date().getFullYear()}`,
}
```

- [ ] **Agregar sección de acceso en el formulario del modal**

Antes del botón de guardar en `ModalTrabajador`, agregar:

```jsx
{/* Acceso al portal */}
<div className="pt-3 border-t border-slate-100">
  <div className="flex items-center justify-between mb-2">
    <span className="text-xs font-semibold text-slate-500 uppercase">Acceso al portal</span>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={form.crear_portal}
        onChange={e => setForm(f => ({ ...f, crear_portal: e.target.checked }))}
        className="rounded border-slate-300 text-blue-600"
      />
      <span className="text-sm text-slate-600">Crear acceso</span>
    </label>
  </div>
  {form.crear_portal && (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">Contraseña inicial</label>
      <input
        type="text"
        value={form.password_portal}
        onChange={e => setForm(f => ({ ...f, password_portal: e.target.value }))}
        className={input}
      />
      <p className="text-xs text-slate-400 mt-1">Usuario: número de checador ({form.chec_id || '—'})</p>
    </div>
  )}
</div>
```

- [ ] **Verificar que crear_portal y password_portal se envíen en el body del POST**

- [ ] **Commit**

```bash
git add frontend/src/pages/PersonalAdmin.jsx
git commit -m "feat: PersonalAdmin — crear_portal y password_portal en alta de trabajador"
```

---

## Task 16: Verificación final

- [ ] **Reiniciar backend y verificar que arranca sin errores**

```bash
cd C:\Proyectos\nomina-iesef
python -c "import main_nomina; print('OK')"
```

- [ ] **Verificar que los endpoints portal aparecen en docs**

Abrir: `http://localhost:8000/docs` y confirmar que aparecen rutas `/portal/*`, `/auth/cambiar-password`, `/usuarios/credenciales-docentes`.

- [ ] **Crear usuario docente de prueba en DB**

```bash
python -c "
import psycopg2, psycopg2.extras, bcrypt
from datetime import datetime
conn = psycopg2.connect('postgresql://nomina_user:IESEFnomina%402026\$@localhost:5432/iesef_nomina', cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()
# Obtener primer docente con correo
cur.execute(\"SELECT id, nombre_completo, correo FROM docentes WHERE correo IS NOT NULL AND correo != '' LIMIT 1\")
doc = cur.fetchone()
if doc:
    pwd = f'IESEF{datetime.now().year}'
    pwd_hash = bcrypt.hashpw(pwd.encode(), bcrypt.gensalt(10)).decode()
    cur.execute('''
        INSERT INTO usuarios (docente_id, nombre, email, password_hash, rol, activo, debe_cambiar_password)
        VALUES (%s, %s, %s, %s, 'docente', true, true)
        ON CONFLICT (email) DO NOTHING
        RETURNING id, email
    ''', (doc['id'], doc['nombre_completo'], doc['correo'].lower().strip(), pwd_hash))
    row = cur.fetchone()
    conn.commit()
    print(f'Usuario creado: {row}')
    print(f'Login: {doc[\"correo\"]} / {pwd}')
else:
    print('No hay docentes con correo')
cur.close(); conn.close()
"
```

- [ ] **Probar flujo completo en browser**

1. Ir a `http://localhost:5173/login`
2. Iniciar sesión con el usuario docente creado
3. Verificar redirección a `/cambiar-password`
4. Cambiar la contraseña
5. Verificar redirección a `/portal/docente`
6. Navegar por las 4 tabs: Mi Nómina, Mis Checadas, Aclaraciones, Mi Cuenta

- [ ] **Commit final**

```bash
git add -A
git commit -m "feat: portal docente/trabajador completo — migration, backend, frontend"
```
