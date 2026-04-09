from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from datetime import date
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

from config import settings
from routers.auth import get_usuario_actual, UsuarioActual, admin_o_finanzas, puede_resumen_nomina
from services.exportar_honorarios import generar_honorarios_excel
from services.exportar_nomina_resumen import generar_nomina_resumen_excel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/exportar", tags=["exportar"])

def get_conn():
    return psycopg2.connect(settings.database_url_nomina, cursor_factory=RealDictCursor)

@router.get("/quincenas/{quincena_id}/honorarios/{razon_social}")
async def exportar_honorarios(
    quincena_id:  int,
    razon_social: str,          # 'centro' o 'instituto'
    fecha_pago:   date,
    _: UsuarioActual = Depends(admin_o_finanzas)
):
    """
    Genera y descarga el Excel HONORARIOS CENTRO o HONORARIOS INSTITUTO.
    Formato exacto del Excel actual.
    """
    if razon_social not in ("centro", "instituto"):
        raise HTTPException(status_code=400, detail="razon_social debe ser 'centro' o 'instituto'")

    conn = None
    try:
        conn = get_conn()
        excel_bytes = generar_honorarios_excel(conn, quincena_id, razon_social, fecha_pago)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error exportar_honorarios: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generando Excel: {e}")
    finally:
        if conn:
            conn.close()

    nombre = f"HONORARIOS_{razon_social.upper()}_Q{quincena_id}_{fecha_pago}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'}
    )


@router.get("/quincenas/{quincena_id}/nomina_resumen")
async def exportar_nomina_resumen(
    quincena_id: int,
    _: UsuarioActual = Depends(puede_resumen_nomina)
):
    """
    Genera y descarga el Excel RESUMEN DE NÓMINA.
    Dos hojas: CENTRO e INSTITUTO (agrupado por programa).
    Útil para carga masiva a Aspel NOI.
    """
    conn = None
    try:
        conn = get_conn()
        excel_bytes = generar_nomina_resumen_excel(conn, quincena_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error exportar_nomina_resumen: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generando resumen: {e}")
    finally:
        if conn:
            conn.close()

    nombre = f"NOMINA_RESUMEN_Q{quincena_id}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'}
    )
