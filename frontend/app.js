const API_DEFAULT = location.protocol.startsWith("http") ? `${location.origin}/api` : "http://localhost:4100/api";
const POS_MODULES = [
  ["dashboard", "Dashboard"],
  ["pos", "Punto de venta"],
  ["clients", "Clientes"],
  ["users", "Alta de usuarios"],
  ["products", "Productos"],
  ["sales", "Ventas"],
  ["sync", "Sincronizacion"]
];
const PLATFORM_MODULES = [
  ["platformDashboard", "Dashboard matriz"],
  ["platformCustomers", "Negocios / licencias"],
  ["platformUsers", "Alta de usuarios"],
  ["platformPlans", "Planes"],
  ["platformSync", "Sincronizacion global"],
  ["platformAudit", "Auditoria matriz"]
];
const CLIENT_ATTRIBUTES = [
  ["active", "Activo"],
  ["frequent", "Frecuente"],
  ["credit", "Credito autorizado"],
  ["whatsapp", "WhatsApp/promos"],
  ["invoice", "Factura"],
  ["wholesale", "Mayoreo"]
];
const ROLE_DEFAULT_PERMISSIONS = {
  SUPER_ADMIN: PLATFORM_MODULES.map(([key]) => key),
  ADMINISTRADOR: ["dashboard", "pos", "clients", "products", "sales", "sync"],
  CAJERO: ["dashboard", "pos", "clients", "sales", "sync"],
  INVENTARIO: ["dashboard", "products", "sync"],
  REPORTES: ["dashboard", "sales", "sync"]
};
const PAYMENT_METHODS = ["Efectivo", "Tarjeta", "Transferencia", "Cheque"];
const POS_PAGE_SIZE = 6;

const state = {
  api: API_DEFAULT,
  token: localStorage.getItem("mia_saas_token") || "",
  user: JSON.parse(localStorage.getItem("mia_saas_user") || "null"),
  clients: [],
  companyUsers: [],
  products: [],
  sales: [],
  audit: [],
  cart: [],
  saleMethod: "Efectivo",
  posPage: 1,
  productEditingId: "",
  platform: { summary: {}, customers: [], licenses: [], users: [], plans: [], audit: [], sync: {} },
  lastCredentials: null,
  view: localStorage.getItem("mia_saas_view") || "dashboard",
  sequence: Number(localStorage.getItem("mia_saas_sequence") || 0),
  pending: JSON.parse(localStorage.getItem("mia_saas_pending") || "[]")
};

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const app = document.querySelector("#app");
const toastNode = document.querySelector("#toast");

function toast(message) {
  toastNode.textContent = message;
  toastNode.classList.add("show");
  setTimeout(() => toastNode.classList.remove("show"), 2600);
}

function isPlatform() {
  return state.user?.role === "SUPER_ADMIN";
}

function permissions() {
  return Array.isArray(state.user?.permissions) && state.user.permissions.length
    ? state.user.permissions
    : ROLE_DEFAULT_PERMISSIONS[state.user?.role] || [];
}

function can(view) {
  return isPlatform() ? PLATFORM_MODULES.some(([key]) => key === view) : permissions().includes(view);
}

async function api(path, options = {}) {
  const response = await fetch(`${state.api}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(state.user?.companyId ? { "X-Company-Id": state.user.companyId } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Error de API");
  return data;
}

function saveSession() {
  localStorage.setItem("mia_saas_token", state.token);
  localStorage.setItem("mia_saas_user", JSON.stringify(state.user));
  localStorage.setItem("mia_saas_sequence", String(state.sequence));
  localStorage.setItem("mia_saas_pending", JSON.stringify(state.pending));
  localStorage.setItem("mia_saas_view", state.view);
}

function bindProductFormActions(root = document) {
  const form = root.querySelector("#productForm");
  const button = form?.querySelector("[data-save-product]");
  if (!form || !button || button.dataset.bound === "true") return;
  button.dataset.bound = "true";
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await saveProductForm(form, button);
    } catch (error) {
      toast(error.message);
    }
  });
}

function render() {
  if (!state.token) return renderLogin();
  if (isPlatform() && !state.view.startsWith("platform")) state.view = "platformDashboard";
  if (!isPlatform() && state.view.startsWith("platform")) state.view = "dashboard";
  if (!isPlatform() && !can(state.view)) state.view = permissions()[0] || "dashboard";
  saveSession();

  app.innerHTML = `
    <main class="app-shell ${isPlatform() ? "platform-shell" : ""}">
      <aside class="sidebar">
        <div class="brand"><img src="assets/logo-ui.png" alt="Mía Mor Café" /><div><strong>Mía Mor Café</strong></div></div>
        <nav class="nav">${navItems()}</nav>
        <div class="sync-box">
          <div class="user-summary">
            <strong>${state.user?.name || "Usuario"}</strong>
            <span>${state.user?.role || ""}</span>
            <small>${isPlatform() ? "Control comercial central" : `Pendientes offline: ${state.pending.length}`}</small>
          </div>
          <div class="sidebar-actions">
            <button class="secondary" data-sync>Sincronizar</button>
            <button class="ghost" data-logout>Cerrar sesion</button>
          </div>
        </div>
      </aside>
      <section class="main">
        <header class="topbar"><h2>${title()}</h2></header>
        <section class="content">${view()}</section>
      </section>
    </main>
  `;
  bindProductFormActions(app);
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-hero">
        <div><img src="assets/logo-ui.png" alt="Mía Mor Café" /><h1>Mía Mor Café</h1><p>Sistema comercial para punto de venta, clientes sincronizados, inventario, cancelaciones, licencias, permisos por modulo y auditoria.</p></div>
        <p>El administrador licenciante crea clientes, licencias y usuarios. Cada negocio entra con su propia cuenta y permisos.</p>
      </section>
      <section class="login-card">
        <h2>Ingresar al sistema</h2>
        <form id="loginForm" class="stack">
          <label class="field">Correo<input name="email" autocomplete="username" /></label>
          <label class="field">Contrasena<input name="password" type="password" autocomplete="current-password" /></label>
          <button class="primary">Entrar</button>
        </form>
      </section>
    </main>
  `;
}

function navItems() {
  const list = isPlatform() ? PLATFORM_MODULES : POS_MODULES.filter(([key]) => can(key));
  return list.map(([key, label]) => nav(key, label)).join("");
}

function nav(view, label) {
  return `<button class="${state.view === view ? "active" : ""}" data-view="${view}">${label}</button>`;
}

function title() {
  return {
    dashboard: "Dashboard",
    pos: "Punto de venta",
    clients: "Clientes sincronizados",
    users: "Alta de usuarios",
    products: "Productos / inventario",
    sales: "Ventas y cancelaciones",
    sync: "Sincronizacion",
    platformDashboard: "Dashboard matriz",
    platformCustomers: "Negocios / licencias",
    platformUsers: "Alta de usuarios",
    platformPlans: "Planes comerciales",
    platformSync: "Sincronizacion global",
    platformAudit: "Auditoria matriz"
  }[state.view] || "Dashboard";
}

function view() {
  if (state.view === "platformDashboard") return platformDashboardView();
  if (state.view === "platformCustomers") return platformCustomersView();
  if (state.view === "platformUsers") return platformUsersView();
  if (state.view === "platformPlans") return platformPlansView();
  if (state.view === "platformSync") return platformSyncView();
  if (state.view === "platformAudit") return platformAuditView();
  if (state.view === "pos") return posView();
  if (state.view === "clients") return clientsView();
  if (state.view === "users") return companyUsersView();
  if (state.view === "products") return productsView();
  if (state.view === "sales") return salesView();
  if (state.view === "sync") return syncView();
  return dashboardView();
}

function dashboardView() {
  const validSales = state.sales.filter((sale) => sale.status !== "CANCELLED");
  return `
    <div class="cards">
      <article class="card"><span>Clientes</span><strong>${state.clients.length}</strong></article>
      <article class="card"><span>Productos</span><strong>${state.products.length}</strong></article>
      <article class="card"><span>Ventas validas</span><strong>${validSales.length}</strong></article>
      <article class="card"><span>Ingresos</span><strong>${money.format(validSales.reduce((s, v) => s + v.total, 0))}</strong></article>
    </div>
    <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>Estado comercial del cliente</h3></div><p>Clientes, ventas, inventario y cancelaciones se sincronizan con la API central.</p></div>
  `;
}

function platformDashboardView() {
  const s = state.platform.summary || {};
  return `
    <div class="cards">
      <article class="card"><span>Clientes activos</span><strong>${s.companies || 0}</strong></article>
      <article class="card"><span>Licencias activas</span><strong>${s.activeLicenses || 0}</strong></article>
      <article class="card"><span>Usuarios</span><strong>${s.users || 0}</strong></article>
      <article class="card"><span>Ventas sincronizadas</span><strong>${money.format(s.income || 0)}</strong></article>
    </div>
    <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>Estructura recomendada</h3><span class="muted">Secuencia ${s.sequence || state.sequence}</span></div><p>Tu cuenta administra negocios, licencias y usuarios de acceso. Cada usuario entra con correo, contrasena y permisos propios; dentro del POS, el modulo Clientes corresponde a compradores del negocio.</p></div>
  `;
}

function platformCustomersView() {
  return `
    <div class="panel">
      <div class="panel-head"><h3>Agregar negocio y licencia</h3><span class="muted">Alta comercial desde administrador licenciante</span></div>
      <form id="platformCustomerForm" class="grid-form">
        <input name="companyName" placeholder="Nombre del negocio" required />
        <input name="ownerName" placeholder="Nombre del propietario" />
        <input name="phone" placeholder="Telefono" />
        <input name="adminName" placeholder="Nombre del usuario administrador" required />
        <input name="adminEmail" type="email" placeholder="Correo de acceso del usuario" required />
        <input name="adminPassword" placeholder="Contrasena inicial o dejar vacio para generar" />
        <select name="planId">${state.platform.plans.map((plan) => `<option value="${plan.id}">${plan.name} - ${money.format(plan.price)}</option>`).join("")}</select>
        <input name="licenseKey" placeholder="Licencia automatica si se deja vacio" />
        <label><input type="checkbox" name="modules" value="dashboard" checked /> Dashboard</label>
        <label><input type="checkbox" name="modules" value="pos" checked /> Punto de venta</label>
        <label><input type="checkbox" name="modules" value="clients" checked /> Clientes</label>
        <label><input type="checkbox" name="modules" value="users" checked /> Alta de usuarios</label>
        <label><input type="checkbox" name="modules" value="products" checked /> Productos</label>
        <label><input type="checkbox" name="modules" value="sales" checked /> Ventas</label>
        <label><input type="checkbox" name="modules" value="sync" checked /> Sincronizacion</label>
        <button class="primary">Crear negocio y usuario</button>
      </form>
    </div>
    ${credentialsPanel()}
    <div class="panel" style="margin-top:16px">
      <div class="table-wrap"><table><thead><tr><th>Negocio</th><th>Plan</th><th>Licencia</th><th>Usuarios</th><th>Datos</th><th>Acciones</th></tr></thead><tbody>
        ${state.platform.customers.map((c) => `<tr><td><strong>${c.name}</strong><br><small>${c.email || "-"}</small></td><td>${c.plan}</td><td>${c.license?.key || c.license || "-"}</td><td>${c.users?.length || 0}</td><td>${c.totals?.clients || 0} clientes · ${c.totals?.sales || 0} ventas</td><td><div class="actions"><button class="ghost" data-edit-customer="${c.id}">Modificar</button><button class="danger" data-delete-customer="${c.id}">Cancelar</button></div></td></tr>`).join("")}
      </tbody></table></div>
    </div>
  `;
}

function platformUsersView() {
  return `
    <div class="panel">
      <div class="panel-head"><h3>Alta de usuario de acceso</h3><span class="muted">Correo, contrasena y modulos permitidos</span></div>
      <form id="platformUserForm" class="grid-form">
        <select name="companyId" required>${state.platform.customers.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</select>
        <input name="name" placeholder="Nombre" required />
        <input name="email" type="email" placeholder="Correo" required />
        <input name="password" placeholder="Contrasena inicial o dejar vacio para generar" />
        <select name="role"><option>CAJERO</option><option>INVENTARIO</option><option>REPORTES</option><option>ADMINISTRADOR</option></select>
        ${POS_MODULES.map(([value, label]) => `<label><input type="checkbox" name="permissions" value="${value}" checked /> ${label}</label>`).join("")}
        <button class="primary">Crear usuario</button>
      </form>
    </div>
    ${credentialsPanel()}
    <div class="panel" style="margin-top:16px"><div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Empresa</th><th>Rol</th><th>Permisos</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${state.platform.users.map((u) => `<tr><td>${u.name}<br><small>${u.email}</small></td><td>${u.company}</td><td>${u.role}</td><td>${(u.permissions || []).join(", ")}</td><td>${u.active ? "Activo" : "Inactivo"}</td><td><div class="actions">${u.role === "SUPER_ADMIN" ? "" : `<button class="ghost" data-edit-user="${u.id}">Modificar</button><button class="danger" data-delete-user="${u.id}">Desactivar</button>`}</div></td></tr>`).join("")}</tbody></table></div></div>
  `;
}

function companyUsersView() {
  return `
    <div class="panel">
      <div class="panel-head"><h3>Alta de usuario del punto de venta</h3><span class="muted">Acceso por rol y modulos</span></div>
      <form id="companyUserForm" class="grid-form">
        <input name="name" placeholder="Nombre del usuario" required />
        <input name="email" type="email" placeholder="Correo de acceso" required />
        <input name="password" placeholder="Contrasena inicial o dejar vacio para generar" />
        <select name="role"><option>CAJERO</option><option>INVENTARIO</option><option>REPORTES</option><option>ADMINISTRADOR</option></select>
        ${POS_MODULES.filter(([value]) => value !== "users").map(([value, label]) => `<label><input type="checkbox" name="permissions" value="${value}" checked /> ${label}</label>`).join("")}
        <button class="primary">Crear usuario</button>
      </form>
    </div>
    ${credentialsPanel()}
    <div class="panel" style="margin-top:16px">
      <div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Permisos</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        ${state.companyUsers.map((u) => `<tr><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>${(u.permissions || []).join(", ")}</td><td>${u.active ? "Activo" : "Inactivo"}</td><td><div class="actions">${u.id === state.user?.id ? "" : `<button class="ghost" data-edit-company-user="${u.id}">Modificar</button><button class="danger" data-delete-company-user="${u.id}">Desactivar</button>`}</div></td></tr>`).join("")}
      </tbody></table></div>
    </div>
  `;
}

function credentialsPanel() {
  if (!state.lastCredentials) return "";
  return `<div class="panel credential-panel" style="margin-top:16px"><div class="panel-head"><h3>Acceso generado</h3><span class="muted">Entregar al usuario</span></div><div class="rows"><div class="row"><strong>Negocio</strong><span>${state.lastCredentials.company || "-"}</span></div><div class="row"><strong>Usuario</strong><span>${state.lastCredentials.name || "-"}</span></div><div class="row"><strong>Correo</strong><span>${state.lastCredentials.email}</span></div><div class="row"><strong>Contrasena temporal</strong><span>${state.lastCredentials.password}</span></div><div class="row"><strong>Licencia</strong><span>${state.lastCredentials.license || "-"}</span></div></div></div>`;
}

function platformPlansView() {
  return `<div class="panel"><div class="table-wrap"><table><thead><tr><th>Plan</th><th>Duracion</th><th>Precio</th><th>Usuarios</th><th>Sucursales</th></tr></thead><tbody>${state.platform.plans.map((p) => `<tr><td>${p.name}</td><td>${p.permanent ? "Permanente" : `${p.durationDays} dias`}</td><td>${money.format(p.price)}</td><td>${p.maxUsers}</td><td>${p.maxBranches}</td></tr>`).join("")}</tbody></table></div></div>`;
}

function platformSyncView() {
  const sync = state.platform.sync || {};
  return `<div class="panel"><h3>Sincronizacion global</h3><p>Secuencia central: ${sync.sequence || state.sequence}</p><p>Empresas registradas: ${sync.companies || 0}</p><p>Usuarios registrados: ${sync.users || 0}</p><button class="primary" data-sync>Actualizar estado global</button></div>`;
}

function platformAuditView() {
  return `<div class="panel"><div class="rows">${state.platform.audit.map((a) => `<div class="row"><strong>${a.action}</strong><small>${new Date(a.createdAt).toLocaleString("es-MX")}</small></div>`).join("") || `<div class="row">Sin auditoria cargada</div>`}</div></div>`;
}

function posView() {
  const total = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const pageCount = Math.max(1, Math.ceil(state.products.length / POS_PAGE_SIZE));
  state.posPage = Math.min(Math.max(1, state.posPage), pageCount);
  const start = (state.posPage - 1) * POS_PAGE_SIZE;
  const pageProducts = state.products.slice(start, start + POS_PAGE_SIZE);
  return `
    <div class="pos-layout">
      <section class="panel">
        <div class="panel-head"><div><h3>Productos</h3><span class="muted">Panel de venta con imagen, descripcion y stock actual.</span></div><button class="ghost" data-refresh>Actualizar</button></div>
        <div class="products">${pageProducts.map(productCard).join("")}</div>
        <div class="pager"><span>Mostrando ${state.products.length ? start + 1 : 0} a ${Math.min(start + POS_PAGE_SIZE, state.products.length)} de ${state.products.length} productos</span><div class="actions"><button class="ghost" data-page="prev" ${state.posPage <= 1 ? "disabled" : ""}>‹</button><strong>${state.posPage}</strong><button class="ghost" data-page="next" ${state.posPage >= pageCount ? "disabled" : ""}>›</button></div></div>
      </section>
      <aside class="panel cart">
        <div class="panel-head"><h3>Carrito</h3><button class="ghost" data-clear>Limpiar</button></div>
        <label class="field">Cliente<select id="saleClient">${state.clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</select></label>
        <label class="field">Pago<select id="saleMethod">${[...PAYMENT_METHODS, "Mixto"].map((method) => `<option ${state.saleMethod === method ? "selected" : ""}>${method}</option>`).join("")}</select></label>
        ${state.saleMethod === "Mixto" ? mixedPaymentView(total) : ""}
        <div class="rows" style="margin-top:12px">${state.cart.map((item) => `<div class="row cart-line"><div class="cart-item-info"><strong>${item.name}</strong><small>${item.qty} x ${money.format(item.price)}</small></div><div class="actions"><button class="ghost" data-dec="${item.id}">-</button><button class="ghost" data-inc="${item.id}">+</button></div></div>`).join("") || `<div class="row"><span class="muted">Carrito vacio</span></div>`}</div>
        <div class="total"><span>Total</span><span>${money.format(total)}</span></div>
        <button class="primary" data-checkout ${state.cart.length ? "" : "disabled"} style="width:100%;margin-top:12px">Cobrar venta</button>
      </aside>
    </div>
  `;
}

function productCard(product) {
  const stock = Number(product.stock || 0);
  return `
    <button class="product product-card ${stock <= 0 ? "out-of-stock" : ""}" data-add="${product.id}">
      <img src="${productImage(product)}" alt="${escapeHtml(product.name)}" />
      <span class="product-info">
        <strong>${product.name}</strong>
        <small>${product.category || "Sin categoria"} · Stock ${stock}</small>
        <span class="product-description">${product.description || "Producto disponible para venta."}</span>
        <span class="price">${money.format(product.price)}</span>
      </span>
    </button>
  `;
}

function mixedPaymentView(total) {
  return `
    <div class="mixed-payments">
      <strong>Pago mixto</strong>
      <small class="muted">Selecciona dos o mas formas y captura el importe de cada una.</small>
      ${PAYMENT_METHODS.map((method) => `<label><input type="checkbox" data-mixed-check="${method}" /> ${method}<input type="number" min="0" step="0.01" placeholder="$0.00" data-mixed-amount="${method}" /></label>`).join("")}
      <small>Total a cubrir: ${money.format(total)}</small>
    </div>
  `;
}

function clientsView() {
  return `
    <div class="panel">
      <div class="panel-head"><h3>Nuevo cliente del negocio</h3></div>
      <form id="clientForm" class="client-form">
        <input name="name" placeholder="Nombre" required />
        <input name="phone" placeholder="Telefono" />
        <input name="email" placeholder="Correo" />
        <div class="check-grid">
          ${CLIENT_ATTRIBUTES.map(([value, label]) => `<label><input type="checkbox" name="attributes" value="${value}" ${value === "active" ? "checked" : ""} /> ${label}</label>`).join("")}
        </div>
        <button class="primary">Guardar cliente</button>
      </form>
    </div>
    <div class="panel" style="margin-top:16px"><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Telefono</th><th>Correo</th><th>Atributos</th><th>Sync</th><th>Acciones</th></tr></thead><tbody>${state.clients.map((c) => `<tr><td>${c.name}</td><td>${c.phone || "-"}</td><td>${c.email || "-"}</td><td>${attributeBadges(c.attributes)}</td><td>${c.syncedAt ? "Sincronizado" : "Pendiente"}</td><td>${clientActions(c)}</td></tr>`).join("")}</tbody></table></div></div>
  `;
}

function isCounterClient(client) {
  const name = String(client?.name || "").trim().toLowerCase();
  return name === "publico en general" || name === "cliente mostrador";
}

function clientActions(client) {
  if (isCounterClient(client)) return `<span class="badge">Venta general</span>`;
  return `<div class="actions"><button class="ghost" data-edit-client="${client.id}">Modificar</button><button class="danger" data-delete-client="${client.id}">Eliminar</button></div>`;
}

function productsView() {
  const editing = state.products.find((product) => product.id === state.productEditingId);
  return `
    <div class="panel">
      <div class="panel-head"><h3>${editing ? "Editar producto" : "Nuevo producto"}</h3><div class="actions"><button class="ghost" data-export-products>Exportar inventario</button>${editing ? `<button class="ghost" data-cancel-product-edit>Cancelar edicion</button>` : ""}</div></div>
      <form id="productForm" class="product-form">
        <input type="hidden" name="id" value="${editing?.id || ""}" />
        <label class="field">Producto<input name="name" placeholder="Nombre del producto" value="${escapeHtml(editing?.name || "")}" required /></label>
        <label class="field">Categoria<input name="category" placeholder="Categoria" value="${escapeHtml(editing?.category || "")}" /></label>
        <label class="field field-span-2">Descripcion<input name="description" placeholder="Descripcion del producto" value="${escapeHtml(editing?.description || "")}" /></label>
        <label class="field">Precio<input name="price" type="number" min="0" step="0.01" placeholder="0.00" value="${editing?.price ?? ""}" /></label>
        <label class="field">Costo<input name="cost" type="number" min="0" step="0.01" placeholder="0.00" value="${editing?.cost ?? ""}" /></label>
        <label class="field">Stock actual<input name="stock" type="number" min="0" step="1" placeholder="0" value="${editing?.stock ?? 0}" /></label>
        <label class="field">Stock minimo<input name="minStock" type="number" min="0" step="1" placeholder="0" value="${editing?.minStock ?? 0}" /></label>
        <label class="field">Vendidos<input name="sold" type="number" min="0" step="1" placeholder="0" value="${editing?.sold ?? 0}" /></label>
        <label class="field">Fecha de elaboracion<input name="productionDate" type="date" value="${editing?.productionDate || ""}" /></label>
        <label class="field">Fecha de caducidad<input name="expirationDate" type="date" value="${editing?.expirationDate || ""}" /></label>
        <label class="field field-span-2">Ruta o URL de imagen<input name="imageUrl" placeholder="assets/products/mi-producto.jpg" value="${escapeHtml(editing?.imageUrl || "")}" /></label>
        <label class="field field-span-2">Imagen del producto<input name="imageFile" type="file" accept="image/*" /></label>
        <button class="primary" type="button" data-save-product>${editing ? "Actualizar producto" : "Guardar producto"}</button>
      </form>
    </div>
    <div class="panel" style="margin-top:16px"><div class="table-wrap"><table><thead><tr><th>Producto</th><th>Categoria</th><th>Precio</th><th>Stock</th><th>Vendidos</th><th>Elaboracion</th><th>Caducidad</th><th>Acciones</th></tr></thead><tbody>${state.products.map((p) => `<tr><td><div class="product-cell"><img src="${productImage(p)}" alt="" /><span>${p.name}</span></div></td><td>${p.category || "-"}</td><td>${money.format(p.price)}</td><td>${p.stock}</td><td>${p.sold || 0}</td><td>${p.productionDate || "-"}</td><td>${p.expirationDate || "-"}</td><td><div class="actions"><button class="ghost" data-edit-product="${p.id}">Editar</button><button class="danger" data-delete-product="${p.id}">Eliminar</button></div></td></tr>`).join("")}</tbody></table></div></div>
  `;
}

function salesView() {
  return `<div class="panel"><div class="panel-head"><h3>Historial de ventas</h3><button class="ghost" data-export-sales>Exportar ventas</button></div><div class="table-wrap"><table><thead><tr><th>Folio</th><th>Total</th><th>Pago</th><th>Estado</th><th>Cliente</th><th></th></tr></thead><tbody>${state.sales.map((s) => `<tr class="${s.status === "CANCELLED" ? "cancelled" : ""}"><td>${s.folio}</td><td>${money.format(s.total)}</td><td>${s.method || "Efectivo"}</td><td>${s.status}</td><td>${clientName(s.clientId)}</td><td><div class="actions"><button class="ghost" data-print-sale="${s.id}">Ticket</button>${s.status === "CANCELLED" ? "" : `<button class="danger" data-cancel="${s.id}">Cancelar</button>`}</div></td></tr>`).join("") || `<tr><td colspan="6">Sin ventas registradas</td></tr>`}</tbody></table></div></div>`;
}

function syncView() {
  return `<div class="panel"><h3>Sincronizacion</h3><p>Secuencia local: ${state.sequence}</p><p>Cambios offline pendientes: ${state.pending.length}</p><div class="actions"><button class="primary" data-sync>Enviar/recibir cambios</button><button class="ghost" data-export>Exportar snapshot</button></div></div>`;
}

function auditView() {
  return `<div class="panel"><div class="rows">${state.audit.map((a) => `<div class="row"><strong>${a.action}</strong><small>${new Date(a.createdAt).toLocaleString("es-MX")}</small></div>`).join("") || `<div class="row">Sin auditoria cargada</div>`}</div></div>`;
}

function clientName(id) {
  return state.clients.find((c) => c.id === id)?.name || "Publico en General";
}

function productImage(product) {
  return product?.imageUrl || "assets/logo-ui.png";
}

function productName(id) {
  return state.products.find((p) => p.id === id)?.name || "Producto";
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.size) return resolve("");
    if (!file.type.startsWith("image/")) return reject(new Error("El archivo seleccionado no es una imagen valida."));
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 900;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("No se pudo procesar la imagen seleccionada."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

async function saveProductForm(form, submitButton) {
  const data = new FormData(form);
  const body = Object.fromEntries(data);
  const imageFile = form.elements.imageFile?.files?.[0];
  if (imageFile && imageFile.size) body.imageUrl = await readImageFile(imageFile);
  delete body.imageFile;
  const id = body.id;
  delete body.id;
  const payload = {
    ...body,
    price: Number(body.price || 0),
    cost: Number(body.cost || 0),
    stock: Number(body.stock || 0),
    minStock: Number(body.minStock || 0),
    sold: Number(body.sold || 0)
  };
  if (!payload.name?.trim()) throw new Error("Captura el nombre del producto.");
  const buttonLabel = id ? "Actualizar producto" : "Guardar producto";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = id ? "Actualizando..." : "Guardando...";
  }
  try {
    if (id) await api(`/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    else await api("/products", { method: "POST", body: JSON.stringify(payload) });
    state.productEditingId = "";
    form.reset();
    await loadAll();
    toast(id ? "Producto actualizado." : "Producto agregado.");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = buttonLabel;
    }
  }
}

function exportTable(filename, rows) {
  const tableRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  const html = `<html><head><meta charset="utf-8" /></head><body><table>${tableRows}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

function exportInventory() {
  exportTable("inventario-mia-mor-cafe.xls", [
    ["Producto", "Categoria", "Descripcion", "Precio", "Costo", "Stock", "Stock minimo", "Vendidos", "Fecha de elaboracion", "Fecha de caducidad"],
    ...state.products.map((p) => [p.name, p.category || "", p.description || "", p.price || 0, p.cost || 0, p.stock || 0, p.minStock || 0, p.sold || 0, p.productionDate || "", p.expirationDate || ""])
  ]);
}

function exportSales() {
  exportTable("ventas-mia-mor-cafe.xls", [
    ["Folio", "Fecha", "Cliente", "Pago", "Estado", "Subtotal", "Descuento", "Total"],
    ...state.sales.map((sale) => [sale.folio, sale.createdAt ? new Date(sale.createdAt).toLocaleString("es-MX") : "", clientName(sale.clientId), sale.method || "", sale.status || "", sale.subtotal || 0, sale.discount || 0, sale.total || 0])
  ]);
}

function getPaymentData(total) {
  if (state.saleMethod !== "Mixto") return { method: state.saleMethod, paymentBreakdown: [] };
  const selected = PAYMENT_METHODS
    .filter((method) => document.querySelector(`[data-mixed-check="${method}"]`)?.checked)
    .map((method) => ({ method, amount: Number(document.querySelector(`[data-mixed-amount="${method}"]`)?.value || 0) }))
    .filter((item) => item.amount > 0);
  const amount = selected.reduce((sum, item) => sum + item.amount, 0);
  if (selected.length < 2) throw new Error("Selecciona al menos dos formas para pago mixto.");
  if (Math.abs(amount - total) > 0.01) throw new Error("El pago mixto debe sumar el total exacto.");
  return { method: `Mixto: ${selected.map((item) => item.method).join(" + ")}`, paymentBreakdown: selected };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function ticketHtml(sale) {
  const rows = (sale.items || []).map((item) => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    return `
      <tr>
        <td>${escapeHtml(productName(item.productId))}<br><small>${qty} x ${money.format(price)}</small></td>
        <td>${money.format(qty * price)}</td>
      </tr>
    `;
  }).join("");
  return `<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Ticket ${escapeHtml(sale.folio || "")}</title>
        <style>
          @page { size: 80mm auto; margin: 6mm; }
          * { box-sizing: border-box; }
          body { width: 68mm; margin: 0 auto; color: #241b16; font-family: Arial, sans-serif; font-size: 12px; }
          .center { text-align: center; }
          h1 { margin: 0 0 4px; font-size: 18px; }
          p { margin: 3px 0; }
          .line { border-top: 1px dashed #8b7869; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 5px 0; vertical-align: top; border-bottom: 1px dotted #d8c7b8; }
          td:last-child { text-align: right; white-space: nowrap; }
          small { color: #766960; }
          .total { display: flex; justify-content: space-between; margin-top: 10px; font-size: 16px; font-weight: 800; }
          .meta { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; }
        </style>
      </head>
      <body>
        <div class="center">
          <h1>Mía Mor Café</h1>
          <p>Punto de venta</p>
        </div>
        <div class="line"></div>
        <div class="meta">
          <span>Folio</span><strong>${escapeHtml(sale.folio || "")}</strong>
          <span>Fecha</span><strong>${escapeHtml(new Date(sale.createdAt || Date.now()).toLocaleString("es-MX"))}</strong>
          <span>Cliente</span><strong>${escapeHtml(clientName(sale.clientId))}</strong>
          <span>Pago</span><strong>${escapeHtml(sale.method || "Efectivo")}</strong>
        </div>
        <div class="line"></div>
        <table><tbody>${rows}</tbody></table>
        <div class="total"><span>Total</span><span>${money.format(Number(sale.total || 0))}</span></div>
        <div class="line"></div>
        <p class="center">Gracias por su compra.</p>
      </body>
    </html>`;
}

function printTicket(sale) {
  if (!sale) return;
  const frame = document.createElement("iframe");
  frame.className = "ticket-frame";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(ticketHtml(sale));
  doc.close();
  frame.onload = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1200);
  };
}

function collectClientAttributes(form) {
  const values = new FormData(form).getAll("attributes");
  return values.length ? values : ["active"];
}

function attributeBadges(attributes = []) {
  const selected = Array.isArray(attributes) && attributes.length ? attributes : ["active"];
  return `<div class="badges">${selected.map((value) => {
    const label = CLIENT_ATTRIBUTES.find(([key]) => key === value)?.[1] || value;
    return `<span class="badge">${label}</span>`;
  }).join("")}</div>`;
}

async function loadAll() {
  if (isPlatform()) return loadPlatform();
  const endpoints = [
    can("clients") ? api("/clients") : Promise.resolve([]),
    can("users") ? api("/users") : Promise.resolve([]),
    can("products") || can("pos") ? api("/products") : Promise.resolve([]),
    can("sales") || can("pos") ? api("/sales") : Promise.resolve([]),
    can("audit") ? api("/audit").catch(() => []) : Promise.resolve([]),
    can("sync") ? api(`/sync/pull?since=${state.sequence}`).catch(() => ({ sequence: state.sequence })) : Promise.resolve({ sequence: state.sequence })
  ];
  const [clients, companyUsers, products, sales, audit, sync] = await Promise.all(endpoints);
  state.clients = clients;
  state.companyUsers = companyUsers;
  state.products = products;
  state.sales = sales;
  state.audit = audit;
  state.sequence = sync.sequence || state.sequence;
  saveSession();
  render();
}

async function loadPlatform() {
  const [summary, customers, licenses, users, plans, audit, sync] = await Promise.all([
    api("/platform/summary"),
    api("/platform/customers"),
    api("/platform/licenses"),
    api("/platform/users"),
    api("/platform/plans"),
    api("/platform/audit"),
    api("/platform/sync")
  ]);
  state.platform = { summary, customers, licenses, users, plans, audit, sync };
  state.sequence = summary.sequence || state.sequence;
  saveSession();
  render();
}

async function syncPending() {
  if (isPlatform()) {
    await loadPlatform();
    toast("Panel matriz sincronizado.");
    return;
  }
  if (state.pending.length) {
    const result = await api("/sync/push", { method: "POST", body: JSON.stringify({ changes: state.pending }) });
    state.pending = [];
    state.sequence = result.sequence || state.sequence;
  }
  await loadAll();
  toast("Sincronizacion completa.");
}

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (event.target.id === "loginForm") {
      const data = Object.fromEntries(new FormData(event.target));
      const session = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: data.email, password: data.password }) });
      state.token = session.accessToken;
      state.user = session.user;
      state.view = session.user.role === "SUPER_ADMIN" ? "platformDashboard" : "dashboard";
      saveSession();
      await loadAll();
      toast("Sesion iniciada.");
    }
    if (event.target.id === "platformCustomerForm") {
      const form = new FormData(event.target);
      const body = Object.fromEntries(form);
      body.modules = form.getAll("modules");
      const created = await api("/platform/customers", { method: "POST", body: JSON.stringify(body) });
      state.lastCredentials = {
        company: created.company?.name,
        name: created.user?.name,
        email: created.user?.email,
        password: created.temporaryPassword || body.adminPassword,
        license: created.license?.key
      };
      event.target.reset();
      await loadPlatform();
      toast("Negocio, licencia y usuario creados.");
    }
    if (event.target.id === "platformUserForm") {
      const form = new FormData(event.target);
      const body = Object.fromEntries(form);
      body.permissions = form.getAll("permissions");
      const created = await api("/platform/users", { method: "POST", body: JSON.stringify(body) });
      state.lastCredentials = {
        company: created.company,
        name: created.name,
        email: created.email,
        password: created.temporaryPassword || body.password,
        license: created.license
      };
      event.target.reset();
      await loadPlatform();
      toast("Usuario creado con acceso asignado.");
    }
    if (event.target.id === "companyUserForm") {
      const form = new FormData(event.target);
      const body = Object.fromEntries(form);
      body.permissions = form.getAll("permissions");
      const created = await api("/users", { method: "POST", body: JSON.stringify(body) });
      state.lastCredentials = {
        company: created.company,
        name: created.name,
        email: created.email,
        password: created.temporaryPassword || body.password,
        license: created.license
      };
      event.target.reset();
      await loadAll();
      toast("Usuario de punto de venta creado.");
    }
    if (event.target.id === "clientForm") {
      const body = Object.fromEntries(new FormData(event.target));
      body.attributes = collectClientAttributes(event.target);
      if (!navigator.onLine) {
        const offlineClient = { id: crypto.randomUUID(), ...body, points: 0, createdAt: new Date().toISOString() };
        state.clients.unshift(offlineClient);
        state.pending.push({ entity: "clients", action: "UPSERT", payload: offlineClient });
        saveSession();
        render();
        toast("Cliente guardado offline. Se sincronizara despues.");
        return;
      }
      await api("/clients", { method: "POST", body: JSON.stringify(body) });
      event.target.reset();
      await loadAll();
      toast("Cliente sincronizado.");
    }
    if (event.target.id === "productForm") {
      await saveProductForm(event.target, event.target.querySelector("[data-save-product]"));
    }
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "saleMethod") {
    state.saleMethod = event.target.value;
    render();
  }
});

document.addEventListener("click", async (event) => {
  try {
    const saveProductButton = event.target.closest("[data-save-product]");
    if (saveProductButton) {
      const form = saveProductButton.closest("#productForm");
      if (!form) return;
      await saveProductForm(form, saveProductButton);
      return;
    }
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      state.view = viewButton.dataset.view;
      render();
    }
    if (event.target.closest("[data-logout]")) {
      state.token = "";
      state.user = null;
      state.view = "dashboard";
      saveSession();
      render();
    }
    if (event.target.closest("[data-refresh]")) await loadAll();
    if (event.target.closest("[data-sync]")) await syncPending();
    if (event.target.closest("[data-export-products]")) exportInventory();
    if (event.target.closest("[data-export-sales]")) exportSales();
    if (event.target.closest("[data-cancel-product-edit]")) {
      state.productEditingId = "";
      render();
    }
    const page = event.target.closest("[data-page]");
    if (page) {
      state.posPage += page.dataset.page === "next" ? 1 : -1;
      render();
    }
    const editCustomer = event.target.closest("[data-edit-customer]");
    if (editCustomer) {
      const customer = state.platform.customers.find((item) => item.id === editCustomer.dataset.editCustomer);
      if (!customer) return;
      const companyName = prompt("Nombre del negocio", customer.name);
      if (companyName === null) return;
      const ownerName = prompt("Nombre del propietario", customer.ownerName || "");
      if (ownerName === null) return;
      const phone = prompt("Telefono", customer.phone || "");
      if (phone === null) return;
      await api(`/platform/customers/${customer.id}`, {
        method: "PATCH",
        body: JSON.stringify({ companyName, ownerName, phone })
      });
      await loadPlatform();
      toast("Cliente/licencia actualizado.");
    }
    const deleteCustomer = event.target.closest("[data-delete-customer]");
    if (deleteCustomer) {
      const customer = state.platform.customers.find((item) => item.id === deleteCustomer.dataset.deleteCustomer);
      if (!confirm(`Cancelar/dar de baja el cliente y licencia de ${customer?.name || "este cliente"}?`)) return;
      await api(`/platform/customers/${deleteCustomer.dataset.deleteCustomer}`, { method: "DELETE" });
      await loadPlatform();
      toast("Cliente y licencia cancelados.");
    }
    const editClient = event.target.closest("[data-edit-client]");
    if (editClient) {
      const client = state.clients.find((item) => item.id === editClient.dataset.editClient);
      if (!client) return;
      const name = prompt("Nombre del cliente", client.name);
      if (name === null) return;
      const phone = prompt("Telefono", client.phone || "");
      if (phone === null) return;
      const email = prompt("Correo", client.email || "");
      if (email === null) return;
      const current = new Set(Array.isArray(client.attributes) && client.attributes.length ? client.attributes : ["active"]);
      const attributes = CLIENT_ATTRIBUTES.filter(([, label]) => confirm(`Mantener atributo "${label}" para ${name}?`)).map(([value]) => value);
      await api(`/clients/${client.id}`, { method: "PATCH", body: JSON.stringify({ name, phone, email, attributes: attributes.length ? attributes : Array.from(current) }) });
      await loadAll();
      toast("Cliente actualizado.");
    }
    const deleteClient = event.target.closest("[data-delete-client]");
    if (deleteClient) {
      const client = state.clients.find((item) => item.id === deleteClient.dataset.deleteClient);
      if (!confirm(`Eliminar cliente ${client?.name || ""}?`)) return;
      await api(`/clients/${deleteClient.dataset.deleteClient}`, { method: "DELETE" });
      await loadAll();
      toast("Cliente eliminado.");
    }
    const editUser = event.target.closest("[data-edit-user]");
    if (editUser) {
      const targetUser = state.platform.users.find((item) => item.id === editUser.dataset.editUser);
      if (!targetUser) return;
      const name = prompt("Nombre del usuario", targetUser.name);
      if (name === null) return;
      const role = prompt("Rol del usuario", targetUser.role);
      if (role === null) return;
      const permissions = POS_MODULES.filter(([, label]) => confirm(`Permitir modulo "${label}" para ${name}?`)).map(([value]) => value);
      const resetPassword = confirm("Generar nueva contrasena temporal para este usuario?");
      const updated = await api(`/platform/users/${targetUser.id}`, { method: "PATCH", body: JSON.stringify({ name, role, permissions, resetPassword }) });
      if (updated.temporaryPassword) {
        state.lastCredentials = {
          company: updated.company,
          name: updated.name,
          email: updated.email,
          password: updated.temporaryPassword,
          license: updated.license
        };
      }
      await loadPlatform();
      toast("Usuario actualizado.");
    }
    const deleteUser = event.target.closest("[data-delete-user]");
    if (deleteUser) {
      const targetUser = state.platform.users.find((item) => item.id === deleteUser.dataset.deleteUser);
      if (!confirm(`Desactivar acceso de ${targetUser?.name || "este usuario"}?`)) return;
      await api(`/platform/users/${deleteUser.dataset.deleteUser}`, { method: "DELETE" });
      await loadPlatform();
      toast("Usuario desactivado.");
    }
    const editCompanyUser = event.target.closest("[data-edit-company-user]");
    if (editCompanyUser) {
      const targetUser = state.companyUsers.find((item) => item.id === editCompanyUser.dataset.editCompanyUser);
      if (!targetUser) return;
      const name = prompt("Nombre del usuario", targetUser.name);
      if (name === null) return;
      const role = prompt("Rol del usuario", targetUser.role);
      if (role === null) return;
      const permissions = POS_MODULES
        .filter(([value]) => value !== "users")
        .filter(([, label]) => confirm(`Permitir modulo "${label}" para ${name}?`))
        .map(([value]) => value);
      const resetPassword = confirm("Generar nueva contrasena temporal para este usuario?");
      const updated = await api(`/users/${targetUser.id}`, { method: "PATCH", body: JSON.stringify({ name, role, permissions, resetPassword }) });
      if (updated.temporaryPassword) {
        state.lastCredentials = {
          company: updated.company,
          name: updated.name,
          email: updated.email,
          password: updated.temporaryPassword,
          license: updated.license
        };
      }
      await loadAll();
      toast("Usuario actualizado.");
    }
    const deleteCompanyUser = event.target.closest("[data-delete-company-user]");
    if (deleteCompanyUser) {
      const targetUser = state.companyUsers.find((item) => item.id === deleteCompanyUser.dataset.deleteCompanyUser);
      if (!confirm(`Desactivar acceso de ${targetUser?.name || "este usuario"}?`)) return;
      await api(`/users/${deleteCompanyUser.dataset.deleteCompanyUser}`, { method: "DELETE" });
      await loadAll();
      toast("Usuario desactivado.");
    }
    const editProduct = event.target.closest("[data-edit-product]");
    if (editProduct) {
      state.productEditingId = editProduct.dataset.editProduct;
      render();
    }
    const deleteProduct = event.target.closest("[data-delete-product]");
    if (deleteProduct) {
      const product = state.products.find((item) => item.id === deleteProduct.dataset.deleteProduct);
      if (!confirm(`Eliminar producto ${product?.name || ""}?`)) return;
      await api(`/products/${deleteProduct.dataset.deleteProduct}`, { method: "DELETE" });
      await loadAll();
      toast("Producto eliminado.");
    }
    const add = event.target.closest("[data-add]");
    if (add) {
      const product = state.products.find((p) => p.id === add.dataset.add);
      if (!product) return;
      const existing = state.cart.find((i) => i.id === product.id);
      if (existing) existing.qty += 1;
      else state.cart.push({ id: product.id, productId: product.id, name: product.name, price: product.price, qty: 1 });
      render();
    }
    const inc = event.target.closest("[data-inc]");
    if (inc) {
      state.cart.find((i) => i.id === inc.dataset.inc).qty += 1;
      render();
    }
    const dec = event.target.closest("[data-dec]");
    if (dec) {
      const item = state.cart.find((i) => i.id === dec.dataset.dec);
      item.qty -= 1;
      state.cart = state.cart.filter((i) => i.qty > 0);
      render();
    }
    if (event.target.closest("[data-clear]")) {
      state.cart = [];
      render();
    }
    if (event.target.closest("[data-checkout]")) {
      const clientId = document.querySelector("#saleClient").value;
      const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
      const payment = getPaymentData(subtotal);
      const sale = await api("/sales", { method: "POST", body: JSON.stringify({ clientId, items: state.cart.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })), subtotal, total: subtotal, ...payment }) });
      printTicket(sale);
      state.cart = [];
      await loadAll();
      toast("Venta registrada. Ticket listo para imprimir.");
    }
    const printSale = event.target.closest("[data-print-sale]");
    if (printSale) {
      const sale = state.sales.find((item) => item.id === printSale.dataset.printSale);
      printTicket(sale);
    }
    const cancel = event.target.closest("[data-cancel]");
    if (cancel) {
      const reason = prompt("Motivo de cancelacion", "Devolucion de producto");
      if (reason === null) return;
      await api(`/sales/${cancel.dataset.cancel}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
      await loadAll();
      toast("Venta cancelada. Inventario sincronizado.");
    }
    if (event.target.closest("[data-export]")) {
      const blob = new Blob([JSON.stringify({ clients: state.clients, products: state.products, sales: state.sales, sequence: state.sequence }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: "mia-mor-cafe-snapshot.json" });
      link.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    toast(error.message);
  }
});

if (state.token) loadAll().catch(() => renderLogin());
else renderLogin();
