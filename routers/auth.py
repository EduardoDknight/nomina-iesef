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
