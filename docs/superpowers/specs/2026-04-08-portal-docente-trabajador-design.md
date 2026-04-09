# Portal Docente y Trabajador — Spec de Diseño
**Fecha:** 2026-04-08  
**Sistema:** IESEF Nómina  
**Enfoque:** Opción B — vistas por rol dentro del sistema actual

---

## 1. Objetivo

Crear un portal de autoservicio para docentes y personal administrativo (trabajadores) que acceda al mismo sistema pero vea únicamente la información relevante a su rol. El mismo `POST /auth/login` sirve a todos los usuarios; el frontend redirige según `rol`.

---

## 2. Cambios de Base de Datos (Migración 008)

```sql
-- Nuevos valores en ENUM rol_usuario
ALTER TYPE rol_usuario ADD VALUE 'superadmin';
ALTER TYPE rol_usuario ADD VALUE 'trabajador';

-- Extender tabla usuarios
ALTER TABLE usuarios ADD COLUMN trabajador_id INTEGER REFERENCES trabajadores(id);
ALTER TABLE usuarios ADD COLUMN debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;
```

**Reglas:**
- Un registro en `usuarios` tiene `docente_id` OR `trabajador_id` OR ninguno (usuarios operativos), nunca ambos.
- Una persona que es trabajador Y docente tiene DOS cuentas separadas (un usuario por rol).
- `debe_cambiar_password = true` al crear la cuenta; se pone `false` cuando el usuario cambia su contraseña exitosamente.

---

## 3. Credenciales por Defecto

| Tipo | Username | Contraseña default | Ejemplo |
|---|---|---|---|
| Docente | correo institucional (`docente.xx@iesef.edu.mx`) | `IESEF{año}` | `IESEF2026` |
| Trabajador | `chec_id` como string | `IESEF{año}` | `IESEF2026` |
| Usuarios operativos | email | definida al crear | — |

El año de la contraseña default se actualiza cada enero. El campo se muestra prefilled al dar de alta un docente o trabajador, editable antes de guardar.

---

## 4. Nuevo Rol: superadmin

- Se agrega `superadmin` al ENUM `rol_usuario`.
- Tiene acceso a todo: todas las rutas del sistema operativo + portales + gestión de credenciales.
- En `auth.py`, todas las dependencias de rol existentes incluyen `superadmin` como rol válido.
- Asignado solo por Eduardo (IT) directamente en DB o desde Configuración.

---

## 5. Backend — Endpoints Nuevos

### Auth
```
POST /auth/cambiar-password     — cualquier usuario autenticado
     body: { password_actual, password_nueva, password_confirma }
     → valida actual, hashea nueva, pone debe_cambiar_password=false
```

### Portal Docente
```
GET  /portal/mi-nomina          — lista quincenas del docente (rol=docente)
GET  /portal/mi-nomina/{id}     — detalle fiscal de una quincena
GET  /portal/mis-checadas       — checadas propias, filtro por quincena_id
GET  /portal/aclaraciones       — lista aclaraciones propias
POST /portal/aclaraciones       — crear nueva aclaración
```

### Portal Trabajador
```
GET  /portal/mi-asistencia      — checadas propias del período (rol=trabajador)
```

### Gestión de Credenciales (admin)
```
GET  /usuarios/credenciales-docentes    — superadmin, dir_cap_humano, cap_humano, coord_docente
GET  /usuarios/credenciales-trabajadores — superadmin, dir_cap_humano, cap_humano
POST /usuarios/{id}/reset-password      — superadmin, dir_cap_humano solamente
GET  /usuarios/credenciales-docentes/export  — exporta Excel (openpyxl)
GET  /usuarios/credenciales-trabajadores/export
```

**Regla de visibilidad de contraseña:**
- Si `debe_cambiar_password = true` → mostrar la contraseña en texto claro (todavía no la cambió, es la default).
- Si `debe_cambiar_password = false` → mostrar `"••••••"` (ya la cambió, no se puede recuperar).

---

## 6. Frontend — Routing

```
/login                          → Login (igual, sin cambios)
/cambiar-password               → Pantalla forzada si debe_cambiar_password=true
/portal/docente                 → PortalDocente.jsx  (rol=docente)
/portal/trabajador              → PortalTrabajador.jsx (rol=trabajador)
/dashboard                      → Dashboard actual (todos los demás roles)
```

**Lógica de redirección en Login:**
```
después de login exitoso:
  if (debe_cambiar_password) → /cambiar-password
  else if (rol === 'docente') → /portal/docente
  else if (rol === 'trabajador') → /portal/trabajador
  else → /dashboard
```

---

## 7. Portal Docente — PortalDocente.jsx

Layout mínimo: header con nombre del docente + logo IESEF + botón cerrar sesión. Sin sidebar complejo.

**4 tabs:**

1. **Mi Nómina** — tabla de quincenas propias ordenadas por fecha desc. Columnas: Período, Estado (chip color), Honorarios, Total a Pagar. Click en fila expande desglose fiscal completo (horas, IVA, retenciones).

2. **Mis Checadas** — selector desplegable de quincena. Tabla por fecha: Fecha, Día, Entrada, Salida, Estado (chip). Si falta entrada o salida muestra advertencia. Solo datos propios de `asistencias_checadas` cruzados con el `chec_id` del docente.

3. **Aclaraciones** — lista de sus aclaraciones con chip de estado. Botón "Nueva aclaración" abre modal con: campo de descripción (textarea), opcionalmente referencia a una fecha/checada. Estado inicial siempre `pendiente`. El equipo de Cap. Humano atiende desde el sistema operativo.

4. **Mi Cuenta** — formulario cambio de contraseña: campo actual, nueva, confirmar.

---

## 8. Portal Trabajador — PortalTrabajador.jsx

Layout idéntico al portal docente (mismo componente de header).

**2 tabs:**

1. **Mi Asistencia** — selector de período (periodos_admin). Tabla por fecha: Fecha, Día, Entrada, Salida, Estado. Resumen arriba: días presentes / retardos / faltas del período.

2. **Mi Cuenta** — formulario cambio de contraseña.

---

## 9. Flujo Primer Login — CambiarPassword.jsx

Pantalla independiente (no dentro del layout del portal). Muestra:
- Mensaje: "Es tu primer acceso. Por seguridad debes establecer tu contraseña personal."
- Campo: Nueva contraseña (mínimo 6 caracteres)
- Campo: Confirmar contraseña
- Botón: Guardar y entrar

No tiene botón de "omitir". Hasta que complete este paso no puede acceder al portal.

---

## 10. Gestión de Credenciales — en Configuracion.jsx

Nueva sección "Credenciales de Acceso" visible solo para: `superadmin`, `director_cap_humano`, `cap_humano`, `coord_docente` (solo docentes), `cap_humano`/`director_cap_humano`/`superadmin` (trabajadores).

Dos subsecciones (tabs o acordeón):

**Docentes:**
- Tabla: Nombre, Usuario (correo), Estado contraseña (chip "Pendiente cambio" / "Personalizada"), Último acceso, Botón Reset (solo superadmin y dir_cap_humano)
- Barra de búsqueda
- Botón "Exportar Excel" → descarga archivo con nombre, usuario, contraseña (solo si pendiente)

**Trabajadores:**
- Misma estructura, visible solo para superadmin, director_cap_humano, cap_humano
- Columnas: Nombre, Usuario (chec_id), Estado contraseña, Último acceso, Botón Reset

---

## 11. Alta de Docente — Cambio en formulario existente

En el drawer de alta de docente (`Docentes.jsx`) se agrega:
- Campo "Contraseña inicial" con valor default `IESEF{año_actual}` prefilled
- Checkbox "Crear acceso al portal" (activado por default)
- Al guardar el docente: si está marcado, crea automáticamente el registro en `usuarios` con `rol='docente'`, `email=correo_docente`, `password=campo_contraseña`, `debe_cambiar_password=true`, `docente_id=id_nuevo`

Mismo flujo para alta de trabajador en `PersonalAdmin.jsx`.

---

## 12. Permisos por Operación

| Operación | Roles permitidos |
|---|---|
| Ver credenciales docentes | superadmin, director_cap_humano, cap_humano, coord_docente |
| Ver credenciales trabajadores | superadmin, director_cap_humano, cap_humano |
| Reset password | superadmin, director_cap_humano |
| Crear usuario docente | superadmin, director_cap_humano, cap_humano |
| Crear usuario trabajador | superadmin, director_cap_humano, cap_humano |
| Ver portal docente | docente |
| Ver portal trabajador | trabajador |

---

## 13. Archivos a Crear/Modificar

**Backend:**
- `migrations/008_portal_acceso.sql` — nueva migración
- `routers/auth.py` — agregar endpoint cambiar-password, incluir superadmin en todos los roles, agregar trabajador_id y debe_cambiar_password al token
- `routers/portal.py` — nuevo router con todos los endpoints /portal/*
- `routers/usuarios.py` — endpoints credenciales y reset-password
- `main_nomina.py` — registrar portal.router

**Frontend:**
- `src/pages/CambiarPassword.jsx` — pantalla forzada primer login
- `src/pages/PortalDocente.jsx` — portal completo del docente
- `src/pages/PortalTrabajador.jsx` — portal del trabajador
- `src/pages/Configuracion.jsx` — sección credenciales
- `src/pages/Docentes.jsx` — campo contraseña en alta
- `src/pages/PersonalAdmin.jsx` — campo contraseña en alta
- `src/App.jsx` — rutas nuevas + lógica redirección
- `src/context/AuthContext.jsx` — incluir debe_cambiar_password en contexto
