const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4100);
const JWT_SECRET = process.env.JWT_SECRET || "MIA-MOR-CAFE-SAAS-DEV-SECRET";
const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, "data", "database.json");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const DATABASE_URL = process.env.DATABASE_URL || "";
let pgPool = null;

const seedProducts = [
  ["Iced Coffee", "Bebidas frias", 80, 34, 18, 5],
  ["Iced Caramel Macchiato", "Bebidas frias", 95, 39, 14, 5],
  ["Iced Mocha Latte", "Bebidas frias", 90, 37, 14, 5],
  ["Cafe Americano CH", "Cafe caliente", 35, 12, 30, 8],
  ["Tarta Vasca", "Postres", 90, 42, 8, 3],
  ["Cupcakes", "Postres", 35, 14, 18, 6],
  ["Tiramisu de Pistache", "Postres", 90, 40, 8, 3],
  ["Cafe en grano 500 g", "Cafe en grano", 375, 220, 10, 3]
];

const MODULES = ["dashboard", "pos", "clients", "users", "products", "sales", "sync", "audit"];
const OPERATIONAL_MODULES = MODULES.filter((module) => module !== "users");
const PLATFORM_MODULES = ["platformDashboard", "platformCustomers", "platformUsers", "platformPlans", "platformSync", "platformAudit"];
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: PLATFORM_MODULES,
  ADMINISTRADOR: ["dashboard", "pos", "clients", "products", "sales", "sync", "audit"],
  CAJERO: ["dashboard", "pos", "clients", "sales", "sync"],
  INVENTARIO: ["dashboard", "products", "sync"],
  REPORTES: ["dashboard", "sales", "sync", "audit"]
};

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function licenseCode() {
  return `MIA-${crypto.randomBytes(2).toString("hex").toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}-${Date.now().toString().slice(-4)}`;
}

function addDays(date, days) {
  if (!days) return null;
  const value = new Date(date);
  value.setDate(value.getDate() + Number(days));
  return value.toISOString();
}

function permissionsFor(role, permissions) {
  const base = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.CAJERO;
  const selected = Array.isArray(permissions) && permissions.length ? permissions : base;
  return selected.filter((permission) => base.includes(permission) || role === "SUPER_ADMIN");
}

function isPrincipalAdmin(db, user) {
  if (!user || user.role !== "ADMINISTRADOR" || !user.companyId) return false;
  const company = db.companies.find((item) => item.id === user.companyId && !item.deletedAt);
  return company && normalizeEmail(company.email) === normalizeEmail(user.email);
}

function effectivePermissions(db, user) {
  if (user.role === "SUPER_ADMIN") return ROLE_PERMISSIONS.SUPER_ADMIN;
  if (isPrincipalAdmin(db, user)) return MODULES;
  if (user.companyId) {
    const company = db.companies.find((item) => item.id === user.companyId && !item.deletedAt);
    const allowed = Array.isArray(company?.modules) && company.modules.length ? company.modules : MODULES;
    return OPERATIONAL_MODULES.filter((permission) => allowed.includes(permission));
  }
  return permissionsFor(user.role, user.permissions);
}

function operationalPermissions(company) {
  const allowed = Array.isArray(company?.modules) && company.modules.length ? company.modules : MODULES;
  return OPERATIONAL_MODULES.filter((permission) => allowed.includes(permission));
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function temporaryPassword() {
  return `MiaMor#${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function isCounterClientName(name) {
  const value = normalizeEmail(name);
  return value === "publico en general" || value === "cliente mostrador";
}

function verifyPassword(password, stored) {
  const [salt, original] = String(stored || "").split(":");
  if (!salt || !original) return false;
  return hashPassword(password, salt).split(":")[1] === original;
}

function sign(payload, expiresInSeconds = 86400) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verify(token) {
  const [encoded, sig] = String(token || "").split(".");
  if (!encoded || !sig) throw httpError(401, "Token invalido");
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(encoded).digest("base64url");
  if (sig !== expected) throw httpError(401, "Token invalido");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw httpError(401, "Token expirado");
  return payload;
}

function initialDb() {
  const companyId = id("emp");
  const adminId = id("usr");
  const ownerId = id("usr");
  const licenseKey = "MAZE-FINAL-MIAM-2026";
  return {
    meta: { version: APP_VERSION, updatedAt: now(), sequence: 1 },
    plans: [
      { id: id("plan"), name: "1 Mes", durationDays: 30, price: 399, active: true, maxUsers: 3, maxBranches: 1, permanent: false },
      { id: id("plan"), name: "3 Meses", durationDays: 90, price: 999, active: true, maxUsers: 5, maxBranches: 1, permanent: false },
      { id: id("plan"), name: "6 Meses", durationDays: 180, price: 1799, active: true, maxUsers: 8, maxBranches: 2, permanent: false },
      { id: id("plan"), name: "12 Meses", durationDays: 365, price: 2999, active: true, maxUsers: 12, maxBranches: 3, permanent: false },
      { id: id("plan"), name: "Licencia Permanente", durationDays: null, price: 7999, active: true, maxUsers: 20, maxBranches: 5, permanent: true }
    ],
    companies: [{
      id: companyId,
      name: "Mía Mor Café",
      rfc: "",
      phone: "",
      email: "admin@miamorcafe.local",
      address: "",
      businessType: "Cafeteria",
      status: "ACTIVE",
      plan: "Version final",
      license: licenseKey,
      ownerName: "Mía Mor Café",
      contactName: "Administrador del negocio",
      modules: MODULES,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    }],
    licenses: [{
      id: id("lic"),
      companyId,
      planId: null,
      planName: "Version final",
      type: "COMERCIAL_FINAL",
      key: licenseKey,
      status: "ACTIVE",
      startsAt: now(),
      expiresAt: null,
      durationDays: null,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    }],
    users: [{
      id: ownerId,
      companyId: null,
      name: "Maze Integral Services",
      email: "molan831001@outlook.com",
      passwordHash: hashPassword("Passcode@180"),
      role: "SUPER_ADMIN",
      permissions: ROLE_PERMISSIONS.SUPER_ADMIN,
      active: true,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    }, {
      id: adminId,
      companyId,
      name: "Administrador principal",
      email: "admin@miamorcafe.local",
      passwordHash: hashPassword("Admin#2026"),
      role: "ADMINISTRADOR",
      permissions: MODULES,
      active: true,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    }],
    clients: [{
      id: id("cli"),
      companyId,
      name: "Publico en General",
      phone: "",
      email: "",
      address: "",
      points: 0,
      attributes: ["active"],
      syncedAt: now(),
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    }],
    products: seedProducts.map(([name, category, price, cost, stock, minStock]) => ({
      id: id("prd"),
      companyId,
      name,
      category,
      price,
      cost,
      stock,
      minStock,
      sold: 0,
      active: true,
      syncedAt: now(),
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    })),
    sales: [],
    purchases: [],
    suppliers: [],
    syncEvents: [],
    auditLogs: []
  };
}

function getPgPool() {
  if (!DATABASE_URL) return null;
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false }
    });
  }
  return pgPool;
}

async function loadDb() {
  const pool = getPgPool();
  if (pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      "INSERT INTO app_state (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING",
      ["main", JSON.stringify(initialDb())]
    );
    const result = await pool.query("SELECT data FROM app_state WHERE id = $1", ["main"]);
    const original = JSON.stringify(result.rows[0].data);
    const db = migrateDb(result.rows[0].data);
    if (JSON.stringify(db) !== original) await writeDb(db);
    return db;
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialDb(), null, 2));
  }
  const original = fs.readFileSync(DATA_FILE, "utf8");
  const db = migrateDb(JSON.parse(original));
  const migrated = JSON.stringify(db, null, 2);
  if (migrated !== original) fs.writeFileSync(DATA_FILE, migrated);
  return db;
}

function migrateDb(db) {
  const legacyLicenseKey = ["MAZE", "UNIV", "DE" + "MO", "MIAM", "2026"].join("-");
  const legacyPlanName = "De" + "mo";
  db.plans ||= [];
  db.companies ||= [];
  db.licenses ||= [];
  db.users ||= [];
  db.clients ||= [];
  db.products ||= [];
  db.sales ||= [];
  db.syncEvents ||= [];
  db.auditLogs ||= [];

  if (!db.users.some((user) => user.role === "SUPER_ADMIN" && !user.deletedAt)) {
    db.users.unshift({
      id: id("usr"),
      companyId: null,
      name: "Maze Integral Services",
      email: "molan831001@outlook.com",
      passwordHash: hashPassword("Passcode@180"),
      role: "SUPER_ADMIN",
      permissions: ROLE_PERMISSIONS.SUPER_ADMIN,
      active: true,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    });
  }

  db.users.forEach((user) => {
    user.email = normalizeEmail(user.email);
  });

  db.clients.forEach((client) => {
    if (isCounterClientName(client.name)) client.name = "Publico en General";
    client.attributes = Array.isArray(client.attributes) && client.attributes.length ? client.attributes : ["active"];
  });

  db.companies.forEach((company) => {
    company.modules = Array.isArray(company.modules) && company.modules.length ? company.modules : MODULES;
    if (!company.modules.includes("users")) company.modules.push("users");
    company.plan = company.plan === legacyPlanName ? "Version final" : (company.plan || "Version final");
    if (company.license === legacyLicenseKey) company.license = "MAZE-FINAL-MIAM-2026";
    company.ownerName ||= company.name;
    company.contactName ||= "Administrador del negocio";
  });

  db.users.forEach((user) => {
    user.permissions = effectivePermissions(db, user);
  });

  db.licenses.forEach((license) => {
    license.planName = license.planName || (license.type === "UNIVERSAL_MAZE" ? "Version final" : license.type || "Version final");
    license.type = license.type === "UNIVERSAL_MAZE" ? "COMERCIAL_FINAL" : (license.type || "COMERCIAL_FINAL");
    if (license.key === legacyLicenseKey) license.key = "MAZE-FINAL-MIAM-2026";
  });

  return db;
}

async function writeDb(db) {
  const pool = getPgPool();
  if (pool) {
    await pool.query(
      "UPDATE app_state SET data = $2::jsonb, updated_at = now() WHERE id = $1",
      ["main", JSON.stringify(db)]
    );
    return;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

async function saveDb(db) {
  db.meta.updatedAt = now();
  db.meta.sequence += 1;
  await writeDb(db);
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Company-Id, X-License-Key",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
  });
  res.end(JSON.stringify(data));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8"
  }[ext] || "application/octet-stream";
}

function serveFrontend(req, res, pathname) {
  const cleanPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(FRONTEND_DIR, cleanPath));
  if (!filePath.startsWith(FRONTEND_DIR)) throw httpError(403, "Ruta no permitida");
  const target = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(FRONTEND_DIR, "index.html");
  res.writeHead(200, {
    "Content-Type": contentType(target),
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  });
  fs.createReadStream(target).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(httpError(400, "JSON invalido")); }
    });
  });
}

function routeKey(req, pathname) {
  return `${req.method} ${pathname}`;
}

function auth(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = verify(token);
  const user = db.users.find((item) => item.id === payload.userId && item.active && !item.deletedAt);
  if (!user) throw httpError(401, "Usuario no autorizado");
  return user;
}

function assertActiveCompanyLicense(db, user) {
  if (user.role === "SUPER_ADMIN") return;
  const company = db.companies.find((item) => item.id === user.companyId && item.status === "ACTIVE" && !item.deletedAt);
  if (!company) throw httpError(403, "Empresa no activa");
  const license = db.licenses.find((item) => item.companyId === company.id && item.status === "ACTIVE" && !item.deletedAt);
  if (!license) throw httpError(403, "Licencia no activa");
  if (license.expiresAt && new Date(license.expiresAt) < new Date()) throw httpError(403, "Licencia expirada");
}

function assertCompany(user, companyId) {
  if (user.role === "SUPER_ADMIN") return;
  if (user.companyId !== companyId) throw httpError(403, "Acceso fuera de empresa");
}

function assertPermission(db, user, module) {
  if (user.role === "SUPER_ADMIN") return;
  if (!effectivePermissions(db, user).includes(module)) throw httpError(403, "Modulo no permitido para este usuario");
}

function assertAnyPermission(db, user, modules) {
  if (user.role === "SUPER_ADMIN") return;
  const allowed = effectivePermissions(db, user);
  if (!modules.some((module) => allowed.includes(module))) throw httpError(403, "Modulo no permitido para este usuario");
}

function audit(db, companyId, userId, action, metadata = {}) {
  db.auditLogs.unshift({ id: id("aud"), companyId, userId, action, metadata, createdAt: now(), updatedAt: now(), deletedAt: null });
}

function touchSync(db, companyId, entity, entityId, action, payload) {
  db.syncEvents.push({ id: id("sync"), companyId, entity, entityId, action, payload, sequence: db.meta.sequence + 1, createdAt: now() });
}

async function handle(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = await loadDb();

  try {
    if (!url.pathname.startsWith("/api")) {
      return serveFrontend(req, res, url.pathname);
    }

    if (routeKey(req, url.pathname) === "GET /api/health") {
      return send(res, 200, { ok: true, app: "Mía Mor Café SaaS", version: APP_VERSION, sequence: db.meta.sequence });
    }

    if (routeKey(req, url.pathname) === "POST /api/auth/login") {
      const body = await readBody(req);
      const user = db.users.find((item) => item.email === normalizeEmail(body.email) && item.active && !item.deletedAt);
      if (!user || !verifyPassword(body.password || "", user.passwordHash)) throw httpError(401, "Credenciales invalidas");
      assertActiveCompanyLicense(db, user);
      audit(db, user.companyId, user.id, "LOGIN");
      await saveDb(db);
      return send(res, 200, {
        accessToken: sign({ userId: user.id, companyId: user.companyId, role: user.role, permissions: user.permissions }),
        refreshToken: sign({ userId: user.id, companyId: user.companyId, role: user.role, permissions: user.permissions, refresh: true }, 604800),
        user: publicUser(user)
      });
    }

    if (routeKey(req, url.pathname) === "POST /api/licenses/validate") {
      const body = await readBody(req);
      const license = db.licenses.find((item) => item.key === String(body.key || "").trim().toUpperCase() && !item.deletedAt);
      if (!license || license.status !== "ACTIVE") throw httpError(400, "Licencia no valida");
      if (license.expiresAt && new Date(license.expiresAt) < new Date()) throw httpError(400, "Licencia expirada");
      return send(res, 200, { valid: true, license, company: db.companies.find((item) => item.id === license.companyId) });
    }

    const user = auth(req, db);

    if (url.pathname.startsWith("/api/platform")) {
      if (user.role !== "SUPER_ADMIN") throw httpError(403, "Solo administrador principal");

      if (routeKey(req, url.pathname) === "GET /api/platform/summary") {
        const activeLicenses = db.licenses.filter((item) => item.status === "ACTIVE" && !item.deletedAt);
        const validSales = db.sales.filter((item) => item.status !== "CANCELLED" && !item.deletedAt);
        return send(res, 200, {
          companies: db.companies.filter((item) => !item.deletedAt).length,
          activeLicenses: activeLicenses.length,
          users: db.users.filter((item) => item.active && !item.deletedAt).length,
          income: validSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
          sequence: db.meta.sequence
        });
      }

      if (routeKey(req, url.pathname) === "GET /api/platform/customers") {
        return send(res, 200, db.companies.filter((company) => !company.deletedAt).map((company) => ({
          ...company,
          users: db.users.filter((item) => item.companyId === company.id && !item.deletedAt).map(publicUser),
          license: db.licenses.find((item) => item.companyId === company.id && !item.deletedAt) || null,
          totals: {
            clients: db.clients.filter((item) => item.companyId === company.id && !item.deletedAt).length,
            products: db.products.filter((item) => item.companyId === company.id && !item.deletedAt).length,
            sales: db.sales.filter((item) => item.companyId === company.id && item.status !== "CANCELLED" && !item.deletedAt).length
          }
        })));
      }

      if (routeKey(req, url.pathname) === "POST /api/platform/customers") {
        const body = await readBody(req);
        const companyId = id("emp");
        const plan = db.plans.find((item) => item.id === body.planId) || db.plans[0] || { name: "Version final", durationDays: null, maxUsers: 3, maxBranches: 1 };
        const key = String(body.licenseKey || licenseCode()).trim().toUpperCase();
        if (db.licenses.some((item) => item.key === key && !item.deletedAt)) throw httpError(400, "La licencia ya existe");
        if (db.users.some((item) => item.email === normalizeEmail(body.adminEmail) && !item.deletedAt)) throw httpError(400, "El correo de usuario ya existe");
        const modules = Array.isArray(body.modules) && body.modules.length ? body.modules.filter((module) => MODULES.includes(module)) : MODULES;
        if (!modules.includes("users")) modules.push("users");
        const adminPassword = body.adminPassword || temporaryPassword();
        const company = {
          id: companyId,
          name: body.companyName || "Nuevo cliente POS",
          rfc: body.rfc || "",
          phone: body.phone || "",
          email: normalizeEmail(body.adminEmail),
          address: body.address || "",
          businessType: body.businessType || "Cafeteria",
          status: "ACTIVE",
          plan: plan.name,
          license: key,
          ownerName: body.ownerName || body.companyName || "Cliente POS",
          contactName: body.adminName || "Administrador del negocio",
          modules,
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null
        };
        const license = {
          id: id("lic"),
          companyId,
          planId: plan.id || null,
          planName: plan.name,
          type: "COMERCIAL_FINAL",
          key,
          status: "ACTIVE",
          startsAt: now(),
          expiresAt: addDays(now(), plan.durationDays),
          durationDays: plan.durationDays,
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null
        };
        const admin = {
          id: id("usr"),
          companyId,
          name: body.adminName || "Administrador principal",
          email: normalizeEmail(body.adminEmail),
          passwordHash: hashPassword(adminPassword),
          role: "ADMINISTRADOR",
          permissions: modules,
          active: true,
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null
        };
        db.companies.unshift(company);
        db.licenses.unshift(license);
        db.users.unshift(admin);
        db.clients.unshift({ id: id("cli"), companyId, name: "Publico en General", phone: "", email: "", address: "", points: 0, attributes: ["active"], syncedAt: now(), createdAt: now(), updatedAt: now(), deletedAt: null });
        db.products.unshift(...seedProducts.map(([name, category, price, cost, stock, minStock]) => ({
          id: id("prd"), companyId, name, category, price, cost, stock, minStock, sold: 0, active: true, syncedAt: now(), createdAt: now(), updatedAt: now(), deletedAt: null
        })));
        touchSync(db, companyId, "companies", companyId, "CREATE", company);
        audit(db, null, user.id, "PLATFORM_CUSTOMER_CREATE", { companyId, licenseKey: key });
        await saveDb(db);
        return send(res, 201, { company, license, user: publicUser(admin), temporaryPassword: adminPassword });
      }

      const platformCustomerMatch = url.pathname.match(/^\/api\/platform\/customers\/([^/]+)$/);
      if (req.method === "PATCH" && platformCustomerMatch) {
        const body = await readBody(req);
        const company = db.companies.find((item) => item.id === platformCustomerMatch[1] && !item.deletedAt);
        if (!company) throw httpError(404, "Cliente no encontrado");
        const license = db.licenses.find((item) => item.companyId === company.id && !item.deletedAt);
        const modules = Array.isArray(body.modules) && body.modules.length ? body.modules.filter((module) => MODULES.includes(module)) : company.modules;
        if (!modules.includes("users")) modules.push("users");
        company.name = body.companyName || body.name || company.name;
        company.ownerName = body.ownerName || company.ownerName;
        company.contactName = body.contactName || body.adminName || company.contactName;
        company.phone = body.phone ?? company.phone;
        company.email = body.email ? normalizeEmail(body.email) : company.email;
        company.address = body.address ?? company.address;
        company.businessType = body.businessType || company.businessType;
        company.modules = modules;
        company.updatedAt = now();
        if (license) {
          license.status = body.licenseStatus || license.status;
          license.updatedAt = now();
        }
        db.users.forEach((entry) => {
          if (entry.companyId === company.id && entry.role === "ADMINISTRADOR" && !entry.deletedAt) {
            entry.permissions = isPrincipalAdmin(db, entry)
              ? modules
              : operationalPermissions(company);
            entry.updatedAt = now();
          }
        });
        touchSync(db, company.id, "companies", company.id, "UPDATE", company);
        audit(db, null, user.id, "PLATFORM_CUSTOMER_UPDATE", { companyId: company.id, companyName: company.name });
        await saveDb(db);
        return send(res, 200, { company, license });
      }

      if (req.method === "DELETE" && platformCustomerMatch) {
        const company = db.companies.find((item) => item.id === platformCustomerMatch[1] && !item.deletedAt);
        if (!company) throw httpError(404, "Cliente no encontrado");
        company.status = "INACTIVE";
        company.deletedAt = now();
        company.updatedAt = now();
        db.licenses.forEach((license) => {
          if (license.companyId === company.id && !license.deletedAt) {
            license.status = "CANCELLED";
            license.deletedAt = now();
            license.updatedAt = now();
          }
        });
        db.users.forEach((entry) => {
          if (entry.companyId === company.id && !entry.deletedAt) {
            entry.active = false;
            entry.deletedAt = now();
            entry.updatedAt = now();
          }
        });
        touchSync(db, company.id, "companies", company.id, "DELETE", company);
        audit(db, null, user.id, "PLATFORM_CUSTOMER_DELETE", { companyId: company.id, companyName: company.name });
        await saveDb(db);
        return send(res, 200, { ok: true, companyId: company.id });
      }

      if (routeKey(req, url.pathname) === "GET /api/platform/licenses") {
        return send(res, 200, db.licenses.filter((item) => !item.deletedAt).map((license) => ({
          ...license,
          company: db.companies.find((company) => company.id === license.companyId) || null
        })));
      }

      if (routeKey(req, url.pathname) === "GET /api/platform/users") {
        return send(res, 200, db.users.filter((item) => !item.deletedAt).map((item) => ({
          ...publicUser(item),
          company: item.companyId ? db.companies.find((company) => company.id === item.companyId)?.name : "Maze Integral Services"
        })));
      }

      if (routeKey(req, url.pathname) === "POST /api/platform/users") {
        const body = await readBody(req);
        const company = db.companies.find((item) => item.id === body.companyId && !item.deletedAt);
        if (!company) throw httpError(404, "Cliente no encontrado");
        if (db.users.some((item) => item.email === normalizeEmail(body.email) && !item.deletedAt)) throw httpError(400, "El correo de usuario ya existe");
        const role = body.role || "CAJERO";
        const password = body.password || temporaryPassword();
        const userToCreate = {
          id: id("usr"),
          companyId: company.id,
          name: body.name || "Usuario POS",
          email: normalizeEmail(body.email),
          passwordHash: hashPassword(password),
          role,
          permissions: operationalPermissions(company),
          active: true,
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null
        };
        db.users.unshift(userToCreate);
        audit(db, null, user.id, "PLATFORM_USER_CREATE", { companyId: company.id, createdUserId: userToCreate.id });
        await saveDb(db);
        return send(res, 201, {
          ...publicUser(userToCreate),
          company: company.name,
          license: db.licenses.find((item) => item.companyId === company.id && !item.deletedAt)?.key || "",
          temporaryPassword: password
        });
      }

      const platformUserMatch = url.pathname.match(/^\/api\/platform\/users\/([^/]+)$/);
      if (req.method === "PATCH" && platformUserMatch) {
        const body = await readBody(req);
        const targetUser = db.users.find((item) => item.id === platformUserMatch[1] && item.role !== "SUPER_ADMIN" && !item.deletedAt);
        if (!targetUser) throw httpError(404, "Usuario no encontrado");
        const company = db.companies.find((item) => item.id === targetUser.companyId && !item.deletedAt);
        if (!company) throw httpError(404, "Negocio no encontrado");
        const role = body.role || targetUser.role;
        targetUser.name = body.name || targetUser.name;
        targetUser.role = role;
        targetUser.permissions = operationalPermissions(company);
        targetUser.active = body.active !== undefined ? Boolean(body.active) : targetUser.active;
        targetUser.updatedAt = now();
        let password = "";
        if (body.resetPassword) {
          password = temporaryPassword();
          targetUser.passwordHash = hashPassword(password);
        }
        audit(db, null, user.id, "PLATFORM_USER_UPDATE", { companyId: company.id, targetUserId: targetUser.id });
        await saveDb(db);
        return send(res, 200, {
          ...publicUser(targetUser),
          company: company.name,
          license: db.licenses.find((item) => item.companyId === company.id && !item.deletedAt)?.key || "",
          temporaryPassword: password
        });
      }

      if (req.method === "DELETE" && platformUserMatch) {
        const targetUser = db.users.find((item) => item.id === platformUserMatch[1] && item.role !== "SUPER_ADMIN" && !item.deletedAt);
        if (!targetUser) throw httpError(404, "Usuario no encontrado");
        targetUser.active = false;
        targetUser.deletedAt = now();
        targetUser.updatedAt = now();
        audit(db, null, user.id, "PLATFORM_USER_DELETE", { companyId: targetUser.companyId, targetUserId: targetUser.id });
        await saveDb(db);
        return send(res, 200, { ok: true, userId: targetUser.id });
      }

      if (routeKey(req, url.pathname) === "GET /api/platform/plans") {
        return send(res, 200, db.plans);
      }

      if (routeKey(req, url.pathname) === "GET /api/platform/audit") {
        return send(res, 200, db.auditLogs);
      }

      if (routeKey(req, url.pathname) === "GET /api/platform/sync") {
        return send(res, 200, { sequence: db.meta.sequence, events: db.syncEvents.slice(-250), companies: db.companies.length, users: db.users.length });
      }

      throw httpError(404, "Ruta de plataforma no encontrada");
    }

    const companyId = req.headers["x-company-id"] || user.companyId;
    assertCompany(user, companyId);

    if (routeKey(req, url.pathname) === "GET /api/dashboard") {
      assertPermission(db, user, "dashboard");
      const sales = db.sales.filter((item) => item.companyId === companyId && item.status !== "CANCELLED");
      return send(res, 200, {
        clients: db.clients.filter((item) => item.companyId === companyId && !item.deletedAt).length,
        products: db.products.filter((item) => item.companyId === companyId && !item.deletedAt).length,
        sales: sales.length,
        income: sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
        cancelledSales: db.sales.filter((item) => item.companyId === companyId && item.status === "CANCELLED").length,
        lowStock: db.products.filter((item) => item.companyId === companyId && item.stock <= item.minStock).length,
        sequence: db.meta.sequence
      });
    }

    if (routeKey(req, url.pathname) === "GET /api/users") {
      assertPermission(db, user, "users");
      return send(res, 200, db.users.filter((item) => item.companyId === companyId && !item.deletedAt).map(publicUser));
    }

    if (routeKey(req, url.pathname) === "POST /api/users") {
      assertPermission(db, user, "users");
      const body = await readBody(req);
      if (db.users.some((item) => item.email === normalizeEmail(body.email) && !item.deletedAt)) throw httpError(400, "El correo de usuario ya existe");
      const company = db.companies.find((item) => item.id === companyId && !item.deletedAt);
      if (!company) throw httpError(404, "Negocio no encontrado");
      const role = body.role || "CAJERO";
      const password = body.password || temporaryPassword();
      const userToCreate = {
        id: id("usr"),
        companyId,
        name: body.name || "Usuario POS",
        email: normalizeEmail(body.email),
        passwordHash: hashPassword(password),
        role,
        permissions: operationalPermissions(company),
        active: true,
        createdAt: now(),
        updatedAt: now(),
        deletedAt: null
      };
      db.users.unshift(userToCreate);
      audit(db, companyId, user.id, "COMPANY_USER_CREATE", { createdUserId: userToCreate.id });
      await saveDb(db);
      return send(res, 201, {
        ...publicUser(userToCreate),
        company: company.name,
        license: db.licenses.find((item) => item.companyId === companyId && !item.deletedAt)?.key || "",
        temporaryPassword: password
      });
    }

    const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (req.method === "PATCH" && userMatch) {
      assertPermission(db, user, "users");
      const body = await readBody(req);
      const targetUser = db.users.find((item) => item.id === userMatch[1] && item.companyId === companyId && !item.deletedAt);
      if (!targetUser) throw httpError(404, "Usuario no encontrado");
      if (targetUser.id === user.id && body.active === false) throw httpError(400, "No puedes desactivar tu propio usuario");
      const company = db.companies.find((item) => item.id === companyId && !item.deletedAt);
      const role = body.role || targetUser.role;
      targetUser.name = body.name || targetUser.name;
      targetUser.role = role;
      targetUser.permissions = operationalPermissions(company);
      targetUser.active = body.active !== undefined ? Boolean(body.active) : targetUser.active;
      targetUser.updatedAt = now();
      let password = "";
      if (body.resetPassword) {
        password = temporaryPassword();
        targetUser.passwordHash = hashPassword(password);
      }
      audit(db, companyId, user.id, "COMPANY_USER_UPDATE", { targetUserId: targetUser.id });
      await saveDb(db);
      return send(res, 200, {
        ...publicUser(targetUser),
        company: company.name,
        license: db.licenses.find((item) => item.companyId === companyId && !item.deletedAt)?.key || "",
        temporaryPassword: password
      });
    }

    if (req.method === "DELETE" && userMatch) {
      assertPermission(db, user, "users");
      const targetUser = db.users.find((item) => item.id === userMatch[1] && item.companyId === companyId && !item.deletedAt);
      if (!targetUser) throw httpError(404, "Usuario no encontrado");
      if (targetUser.id === user.id) throw httpError(400, "No puedes desactivar tu propio usuario");
      targetUser.active = false;
      targetUser.deletedAt = now();
      targetUser.updatedAt = now();
      audit(db, companyId, user.id, "COMPANY_USER_DELETE", { targetUserId: targetUser.id });
      await saveDb(db);
      return send(res, 200, { ok: true, userId: targetUser.id });
    }

    if (routeKey(req, url.pathname) === "GET /api/clients") {
      assertAnyPermission(db, user, ["clients", "pos"]);
      return send(res, 200, db.clients.filter((item) => item.companyId === companyId && !item.deletedAt));
    }

    if (routeKey(req, url.pathname) === "POST /api/clients") {
      assertPermission(db, user, "clients");
      const body = await readBody(req);
      const client = { id: body.id || id("cli"), companyId, name: body.name, phone: body.phone || "", email: body.email || "", address: body.address || "", points: Number(body.points || 0), attributes: Array.isArray(body.attributes) && body.attributes.length ? body.attributes : ["active"], syncedAt: now(), createdAt: body.createdAt || now(), updatedAt: now(), deletedAt: null };
      db.clients = db.clients.filter((item) => item.id !== client.id);
      db.clients.unshift(client);
      touchSync(db, companyId, "clients", client.id, "UPSERT", client);
      audit(db, companyId, user.id, "CLIENT_UPSERT", { clientId: client.id });
      await saveDb(db);
      return send(res, 201, client);
    }

    const clientMatch = url.pathname.match(/^\/api\/clients\/([^/]+)$/);
    if (req.method === "PATCH" && clientMatch) {
      assertPermission(db, user, "clients");
      const body = await readBody(req);
      const client = db.clients.find((item) => item.id === clientMatch[1] && item.companyId === companyId && !item.deletedAt);
      if (!client) throw httpError(404, "Cliente no encontrado");
      client.name = body.name || client.name;
      client.phone = body.phone ?? client.phone;
      client.email = body.email ?? client.email;
      client.address = body.address ?? client.address;
      client.points = body.points !== undefined ? Number(body.points || 0) : client.points;
      client.attributes = Array.isArray(body.attributes) && body.attributes.length ? body.attributes : client.attributes;
      client.syncedAt = now();
      client.updatedAt = now();
      touchSync(db, companyId, "clients", client.id, "UPDATE", client);
      audit(db, companyId, user.id, "CLIENT_UPDATE", { clientId: client.id });
      await saveDb(db);
      return send(res, 200, client);
    }

    if (req.method === "DELETE" && clientMatch) {
      assertPermission(db, user, "clients");
      const client = db.clients.find((item) => item.id === clientMatch[1] && item.companyId === companyId && !item.deletedAt);
      if (!client) throw httpError(404, "Cliente no encontrado");
      if (isCounterClientName(client.name)) throw httpError(400, "Publico en General es el cliente base para ventas generales y no se elimina.");
      const hasSales = db.sales.some((sale) => sale.companyId === companyId && sale.clientId === client.id && !sale.deletedAt);
      if (hasSales) throw httpError(400, "No se puede eliminar un cliente con ventas registradas; conserva el historial.");
      client.deletedAt = now();
      client.updatedAt = now();
      touchSync(db, companyId, "clients", client.id, "DELETE", client);
      audit(db, companyId, user.id, "CLIENT_DELETE", { clientId: client.id });
      await saveDb(db);
      return send(res, 200, { ok: true, clientId: client.id });
    }

    if (routeKey(req, url.pathname) === "GET /api/products") {
      assertAnyPermission(db, user, ["products", "pos"]);
      return send(res, 200, db.products.filter((item) => item.companyId === companyId && !item.deletedAt));
    }

    if (routeKey(req, url.pathname) === "POST /api/products") {
      assertPermission(db, user, "products");
      const body = await readBody(req);
      const product = { id: body.id || id("prd"), companyId, name: body.name, category: body.category || "", price: Number(body.price || 0), cost: Number(body.cost || 0), stock: Number(body.stock || 0), minStock: Number(body.minStock || 0), sold: Number(body.sold || 0), active: body.active !== false, syncedAt: now(), createdAt: body.createdAt || now(), updatedAt: now(), deletedAt: null };
      db.products = db.products.filter((item) => item.id !== product.id);
      db.products.unshift(product);
      touchSync(db, companyId, "products", product.id, "UPSERT", product);
      audit(db, companyId, user.id, "PRODUCT_UPSERT", { productId: product.id });
      await saveDb(db);
      return send(res, 201, product);
    }

    if (routeKey(req, url.pathname) === "GET /api/sales") {
      assertAnyPermission(db, user, ["sales", "pos"]);
      return send(res, 200, db.sales.filter((item) => item.companyId === companyId && !item.deletedAt));
    }

    if (routeKey(req, url.pathname) === "POST /api/sales") {
      assertPermission(db, user, "pos");
      const body = await readBody(req);
      const sale = { id: body.id || id("sale"), companyId, clientId: body.clientId || null, folio: `WEB-${Date.now().toString().slice(-6)}`, items: body.items || [], subtotal: Number(body.subtotal || 0), discount: Number(body.discount || 0), total: Number(body.total || 0), method: body.method || "Efectivo", status: "COMPLETED", createdAt: now(), updatedAt: now(), deletedAt: null };
      sale.items.forEach((item) => {
        const product = db.products.find((entry) => entry.id === item.productId && entry.companyId === companyId);
        if (product) {
          product.stock = Math.max(0, Number(product.stock || 0) - Number(item.qty || 0));
          product.sold = Number(product.sold || 0) + Number(item.qty || 0);
          product.updatedAt = now();
        }
      });
      db.sales.unshift(sale);
      touchSync(db, companyId, "sales", sale.id, "CREATE", sale);
      audit(db, companyId, user.id, "SALE_CREATE", { saleId: sale.id, total: sale.total });
      await saveDb(db);
      return send(res, 201, sale);
    }

    const cancelMatch = url.pathname.match(/^\/api\/sales\/([^/]+)\/cancel$/);
    if (req.method === "POST" && cancelMatch) {
      assertPermission(db, user, "sales");
      const body = await readBody(req);
      const sale = db.sales.find((item) => item.id === cancelMatch[1] && item.companyId === companyId);
      if (!sale) throw httpError(404, "Venta no encontrada");
      if (sale.status === "CANCELLED") throw httpError(400, "Venta ya cancelada");
      sale.status = "CANCELLED";
      sale.cancelReason = body.reason || "Cancelacion sin motivo";
      sale.cancelledAt = now();
      sale.updatedAt = now();
      sale.items.forEach((item) => {
        const product = db.products.find((entry) => entry.id === item.productId && entry.companyId === companyId);
        if (product) {
          product.stock = Number(product.stock || 0) + Number(item.qty || 0);
          product.sold = Math.max(0, Number(product.sold || 0) - Number(item.qty || 0));
          product.updatedAt = now();
        }
      });
      touchSync(db, companyId, "sales", sale.id, "CANCEL", sale);
      audit(db, companyId, user.id, "SALE_CANCEL", { saleId: sale.id, reason: sale.cancelReason });
      await saveDb(db);
      return send(res, 200, sale);
    }

    if (routeKey(req, url.pathname) === "GET /api/sync/pull") {
      assertPermission(db, user, "sync");
      const since = Number(url.searchParams.get("since") || 0);
      return send(res, 200, {
        sequence: db.meta.sequence,
        events: db.syncEvents.filter((event) => event.companyId === companyId && event.sequence > since),
        clients: db.clients.filter((item) => item.companyId === companyId && !item.deletedAt),
        products: db.products.filter((item) => item.companyId === companyId && !item.deletedAt),
        sales: db.sales.filter((item) => item.companyId === companyId && !item.deletedAt)
      });
    }

    if (routeKey(req, url.pathname) === "POST /api/sync/push") {
      assertPermission(db, user, "sync");
      const body = await readBody(req);
      const results = [];
      for (const change of body.changes || []) {
        if (change.entity === "clients") {
          const client = { ...change.payload, companyId, syncedAt: now(), updatedAt: now(), deletedAt: null };
          client.attributes = Array.isArray(client.attributes) && client.attributes.length ? client.attributes : ["active"];
          db.clients = db.clients.filter((item) => item.id !== client.id);
          db.clients.unshift(client);
          touchSync(db, companyId, "clients", client.id, "UPSERT", client);
          results.push({ id: client.id, ok: true });
        }
      }
      audit(db, companyId, user.id, "SYNC_PUSH", { count: results.length });
      await saveDb(db);
      return send(res, 200, { sequence: db.meta.sequence, results });
    }

    if (routeKey(req, url.pathname) === "GET /api/audit") {
      assertPermission(db, user, "audit");
      return send(res, 200, db.auditLogs.filter((item) => item.companyId === companyId));
    }

    if (routeKey(req, url.pathname) === "GET /api/version") {
      return send(res, 200, { serverVersion: APP_VERSION, minClientVersion: "1.0.0", updateRequired: false });
    }

    throw httpError(404, "Ruta no encontrada");
  } catch (error) {
    send(res, error.status || 500, { error: error.message || "Error interno" });
  }
}

http.createServer(handle).listen(PORT, () => {
  console.log(`Mía Mor Café SaaS API lista en http://localhost:${PORT}/api/health`);
});

