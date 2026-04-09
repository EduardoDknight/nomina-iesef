"""
Servicio de auditoría — registra todas las acciones sensibles del sistema.
Uso en cualquier router:

    from services.auditoria import registrar
    registrar(conn, usuario, accion="crear_docente",
              entidad="docente", entidad_id=str(docente_id),
              descripcion=f"Creó docente {nombre}",
              detalle={"numero": numero_docente})
"""
import logging
from typing import Optional, Any
from fastapi import Request

logger = logging.getLogger(__name__)


def registrar(
    conn,
    usuario,                     # UsuarioActual del token JWT
    accion: str,                 # snake_case: 'crear_docente', 'dar_baja_docente', etc.
    entidad: str,                # 'docente', 'quincena', 'usuario', 'nomina', 'tarifa', etc.
    descripcion: str,            # Texto legible: "Dio de baja a García Soto"
    entidad_id: Optional[str] = None,
    detalle: Optional[dict] = None,
    ip: Optional[str] = None,
):
    """Inserta un registro en audit_log. No lanza excepción si falla."""
    try:
        import json
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO audit_log
                (usuario_id, usuario_email, usuario_rol, accion, entidad,
                 entidad_id, descripcion, detalle, ip_cliente)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            usuario.id,
            usuario.email,
            usuario.rol,
            accion,
            entidad,
            entidad_id,
            descripcion,
            json.dumps(detalle, ensure_ascii=False, default=str) if detalle else None,
            ip,
        ))
        # No llamar conn.commit() aquí — el caller lo hará junto con su transacción principal
        cur.close()
    except Exception as e:
        logger.error(f"Error audit_log: {e}")


def ip_from_request(request: Optional[Request]) -> Optional[str]:
    """Extrae la IP real del cliente considerando Cloudflare."""
    if not request:
        return None
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
