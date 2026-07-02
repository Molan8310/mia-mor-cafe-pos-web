# Mía Mor Café SaaS Web Comercial

Entregable funcional para comercialización inicial del sistema POS web.

## Qué Incluye

- Frontend web conectado por API.
- Backend REST sin dependencias externas, listo para despliegue Node.js.
- Autenticación por token firmado.
- Panel administrador/licenciante para alta y baja de negocios, licencias y usuarios.
- Generación y validación de licencias por cliente y plan.
- Permisos por rol y módulo.
- Alta de usuarios de punto de venta con permisos por modulo.
- Clientes compradores sincronizados.
- Productos e inventario sincronizados.
- Ventas y cancelación de ventas.
- Auditoría.
- Sincronización incremental.
- Modo offline para alta de clientes con cola pendiente.

## Credenciales Version Final

```text
Administrador/licenciante:
Correo: molan831001@outlook.com

Cliente POS inicial:
Correo: admin@miamorcafe.local
Contrasena: Admin#2026
```

## Ejecutar Local

```bash
cd backend
npm start
```

Abrir `http://localhost:4100` cuando el backend este activo.

## Despliegue Web

Backend:
- Render
- Railway
- VPS Node.js
- Fly.io
- Cloud Run

Frontend:
- Cloudflare Pages
- Netlify
- Vercel
- cPanel / hosting estático

La URL del backend se configura internamente. No se muestra ni se captura en el login.

## Base de Datos

La version web puede trabajar en dos modos:

- Local: usa `backend/data/database.json`.
- Produccion web: usa PostgreSQL cuando se configura `DATABASE_URL`.

Para la version web comercial se recomienda PostgreSQL externo, por ejemplo Neon o Supabase, y configurar `DATABASE_URL` como variable de entorno en Render. El sistema crea automaticamente la tabla `app_state` y guarda ahi el estado sincronizado del POS.

## Nota Comercial

Este entregable es funcional para MVP comercial. En local puede guardar la informacion en `backend/data/database.json`, un archivo simple y practico para pruebas, pilotos y primeras ventas. En web comercial se recomienda activar PostgreSQL mediante `DATABASE_URL`.

Para produccion avanzada, conviene migrar a PostgreSQL con Prisma. PostgreSQL es una base de datos profesional para muchos usuarios y negocios trabajando al mismo tiempo; Prisma es una capa de acceso a datos que ayuda a definir tablas, relaciones, migraciones y consultas de forma mas ordenada. El beneficio seria mayor estabilidad, respaldos mas robustos, consultas mas rapidas, mejor control de concurrencia, crecimiento para varios clientes y una ruta mas clara para operar el sistema como SaaS comercial.
