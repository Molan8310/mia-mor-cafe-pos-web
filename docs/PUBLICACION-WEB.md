# Publicacion web estable

Sistema: Mía Mor Café POS / SaaS Web Comercial

URL publica definitiva:
Pendiente de asignar en hosting estable.

Importante:
No usar enlaces `trycloudflare.com` como enlace comercial del negocio. Esos enlaces son de prueba, se generan al azar y dejan de existir cuando se apaga el tunel, se reinicia la laptop o Cloudflare cierra la sesion temporal.

Acceso administrador/licenciante:
- Usuario: molan831001@outlook.com
- Rol: SUPER_ADMIN
- Pantalla: dashboard matriz para alta/baja de clientes, licencias, planes, usuarios y auditoria global.

Acceso cliente POS inicial:
- Licencia: MAZE-FINAL-MIAM-2026
- Usuario: admin@miamorcafe.local
- Contrasena: Admin#2026
- Rol: ADMINISTRADOR
- Pantalla: punto de venta, clientes, productos, ventas, sincronizacion y auditoria segun permisos.

Validacion realizada:
- La pagina principal responde por HTTPS.
- La API responde en /api/health.
- La licencia final fue validada.
- Se inicio sesion con usuario administrador.
- Se creo un cliente desde la URL publica.
- Se registro una venta desde la URL publica.
- Se cancelo la venta desde la URL publica.
- La sincronizacion regreso eventos y clientes actualizados.

Publicacion recomendada:
- Hosting Node.js persistente con URL fija, por ejemplo Render, Railway, Fly.io, VPS o Cloud Run.
- Dominio propio para venta comercial, por ejemplo `pos.miamorcafe.com`.
- Base persistente PostgreSQL mediante `DATABASE_URL`. Para despliegue gratuito se recomienda Neon o Supabase antes que Render Postgres Free, porque Render Postgres gratuito expira a los 30 dias.
- Para Render se incluye `render.yaml` en plan gratuito. El dato persistente debe venir de PostgreSQL externo.

Modelo de acceso:
Administrador/licenciante y clientes ingresan al mismo enlace web. La pantalla de acceso solo solicita correo y contrasena; la API del backend y la validacion de licencia trabajan de forma interna.

El sistema identifica el rol despues del login. Si el usuario es SUPER_ADMIN, abre el panel matriz. Si el usuario pertenece a una empresa cliente, valida que su empresa y licencia esten activas y abre el POS con los modulos permitidos por licencia, rol y permisos.

En el panel matriz, el administrador/licenciante administra negocios, licencias y usuarios de acceso. El alta de usuarios puede generar contrasena temporal automatica cuando se deja vacio el campo de contrasena. Dentro del POS, el modulo Clientes corresponde a compradores del negocio.

El administrador principal del negocio ve Alta de usuarios para crear accesos del personal del punto de venta y tambien ve Clientes compradores. Los usuarios operativos ven los modulos operativos del POS, incluyendo Clientes compradores, pero no ven Alta de usuarios.
