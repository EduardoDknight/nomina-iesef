-- Crear usuario administrador inicial para Capital Humano
-- Ejecutar después de la migración 001
-- Cambiar el password_hash por uno generado con bcrypt

-- Para generar el hash desde Python:
--   import bcrypt
--   print(bcrypt.hashpw(b"tu_password_aqui", bcrypt.gensalt()).decode())

INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
VALUES (
    'Administrador Capital Humano',
    'caphumano@iesef.edu.mx',
    -- Hash de 'IESEF2026admin' — CAMBIAR ANTES DE PRODUCCIÓN
    '$2b$12$K44oj8KtuL8qZo7ExuvZk.SxZSOOx7H6mYRhgPTnRy9cV0Sj45Piq',
    'director_cap_humano',
    true
);

-- Para generar el hash en el servidor:
-- python3 -c "import bcrypt; print(bcrypt.hashpw(b'IESEF2026admin', bcrypt.gensalt()).decode())"
-- Luego actualizar el INSERT arriba con el hash generado
