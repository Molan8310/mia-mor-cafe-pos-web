# Validación De Sincronización

## Objetivo

Confirmar que las cuentas/clientes se sincronizan con ventas, reportes, auditoría e inventario.

## Prueba Recomendada

1. Iniciar backend:

```bash
cd backend
npm start
```

2. Abrir `frontend/index.html`.

3. Entrar con:

```text
admin@miamorcafe.local
Admin#2026
```

4. Crear cliente:

```text
Nombre: Cliente Prueba Web
Teléfono: 5551234567
```

5. Validar:

- Aparece en Clientes.
- API responde en `GET /api/clients`.
- Dashboard aumenta contador de clientes.

6. Crear venta con ese cliente.

7. Validar:

- Venta aparece en Ventas.
- Producto descuenta inventario.
- Dashboard aumenta ingresos.
- Auditoría registra `SALE_CREATE`.

8. Cancelar venta.

9. Validar:

- Venta queda `CANCELLED`.
- Inventario se regresa.
- Dashboard ya no suma esa venta como ingreso.
- Auditoría registra `SALE_CANCEL`.

10. Probar sincronización offline:

- Desconectar internet/red.
- Crear cliente.
- Confirmar que queda pendiente.
- Reconectar.
- Presionar Sincronizar.
- Confirmar que el cliente se envía al backend.

## Endpoints Clave

- `POST /api/auth/login`
- `POST /api/licenses/validate`
- `GET /api/clients`
- `POST /api/clients`
- `GET /api/products`
- `POST /api/sales`
- `POST /api/sales/:id/cancel`
- `GET /api/sync/pull?since=0`
- `POST /api/sync/push`
- `GET /api/audit`
