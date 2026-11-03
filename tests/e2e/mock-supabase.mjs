// Tiny in-memory stand-in for Supabase (auth, REST, storage) + the Claude Messages API,
// used only for the browser smoke test. Real permission rules are tested in supabase/tests.
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_PORT || 54329);
const now = () => new Date().toISOString();
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated" })}.sig`;
const subOf = (req) => {
  const t = (req.headers.authorization || "").replace(/^Bearer /, "");
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).sub; } catch { return null; }
};

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const USER = "00000000-0000-0000-0000-0000000000b2";
const db = {
  users: [
    { id: ADMIN, email: "admin@test.com", password: "password123", user_metadata: { name: "Asha Admin" }, app_metadata: {} },
    { id: USER, email: "user@test.com", password: "password123", user_metadata: { name: "Ravi User" }, app_metadata: { provisioned: true } },
  ],
  profiles: [
    { id: ADMIN, name: "Asha Admin", email: "admin@test.com", role: "admin", created_at: now() },
    { id: USER, name: "Ravi User", email: "user@test.com", role: "user", created_at: now() },
  ],
  app_settings: [{ id: 1, users_view_all: true, allow_public_signup: false, updated_at: now() }],
  bills: [],
  bill_items: [],
  audit_log: [],
  objects: new Map(),
};
export const calls = []; // everything interesting the app sent us

// seed one bill from the regular user
{
  const id = randomUUID();
  db.bills.push({ id, bill_date: "2026-10-28", image_url: null, logged_by: USER, logged_at: "2026-10-28T10:15:00Z", updated_at: "2026-10-28T10:15:00Z" });
  db.bill_items.push(
    { id: randomUUID(), bill_id: id, serial_no: 1, item_name: "Azithromycin 500", qty: 1, rate: 120, total_amount: 120 },
    { id: randomUUID(), bill_id: id, serial_no: 2, item_name: "ORS sachet", qty: 5, rate: 22, total_amount: 110 },
  );
}

function userJson(u) {
  return { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, user_metadata: u.user_metadata, app_metadata: u.app_metadata, created_at: now(), last_sign_in_at: u.last_sign_in_at ?? null, banned_until: u.banned_until ?? null, email_confirmed_at: now() };
}
function session(u) {
  u.last_sign_in_at = now();
  return { access_token: jwt(u.id), refresh_token: `rt-${u.id}`, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: userJson(u) };
}
const profileOf = (id) => db.profiles.find((p) => p.id === id);
const shapeBill = (b) => ({ ...b, profiles: { name: profileOf(b.logged_by)?.name ?? null }, bill_items: db.bill_items.filter((i) => i.bill_id === b.id) });
function entries() {
  return db.bill_items.map((i) => {
    const b = db.bills.find((x) => x.id === i.bill_id);
    const p = profileOf(b.logged_by);
    return { item_id: i.id, bill_id: i.bill_id, serial_no: i.serial_no, item_name: i.item_name, qty: i.qty, rate: i.rate, total_amount: i.total_amount, bill_date: b.bill_date, logged_at: b.logged_at, logged_by: b.logged_by, logged_by_name: p?.name, logged_by_email: p?.email };
  });
}
function snapshot(id) {
  const b = db.bills.find((x) => x.id === id);
  return b && { ...b, items: db.bill_items.filter((i) => i.bill_id === id) };
}

function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    const [op, ...rest] = v.split(".");
    const val = rest.join(".");
    out = out.filter((r) => {
      const x = r[k];
      switch (op) {
        case "eq": return String(x) === val;
        case "gte": return String(x) >= val;
        case "lte": return String(x) <= val;
        case "lt": return String(x) < val;
        case "like": return String(x).startsWith(val.replace(/\*$/, "").replace(/%$/, ""));
        case "ilike": return String(x).toLowerCase().includes(val.replace(/[*%]/g, "").replace(/\\/g, "").toLowerCase());
        default: return true;
      }
    });
  }
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((s) => s.split("."));
    out = [...out].sort((a, b) => {
      for (const [k, dir] of keys) {
        const c = String(a[k] ?? "").localeCompare(String(b[k] ?? ""), "en", { numeric: true });
        if (c) return dir === "desc" ? -c : c;
      }
      return 0;
    });
  }
  const offset = Number(params.get("offset") || 0);
  const limit = params.get("limit") ? Number(params.get("limit")) : undefined;
  return out.slice(offset, limit !== undefined ? offset + limit : undefined);
}

const EXTRACTED = {
  is_bill: true,
  bill_date: "2026-11-02",
  items: [
    { serial_no: 1, item_name: "Dolo 650 Tab 15's", qty: 2, rate: 30.5, total_amount: 61 },
    { serial_no: 2, item_name: "Benadryl Syrup 100ml", qty: 1, rate: 118, total_amount: 118 },
    { serial_no: 3, item_name: "Volini Gel 30g", qty: 2, rate: 145, total_amount: 300 }, // mismatch on purpose
  ],
};

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const send = (status, data, headers = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "Content-Range", ...headers });
    res.end(data === undefined ? "" : typeof data === "string" ? data : JSON.stringify(data));
  };
  if (req.method === "OPTIONS") return send(204);
  const raw = await body(req);
  const json = () => { try { return JSON.parse(raw.toString() || "null"); } catch { return null; } };
  const me = subOf(req);

  // ---------- Claude ----------
  if (p === "/v1/messages") {
    const b = json();
    calls.push({ type: "claude", headers: { beta: req.headers["anthropic-beta"], key: req.headers["x-api-key"], auth: req.headers.authorization, version: req.headers["anthropic-version"] }, body: { ...b, messages: b.messages.map((m) => ({ ...m, content: m.content.map((c) => (c.type === "image" ? { type: "image", media_type: c.source.media_type, bytes: c.source.data.length } : c)) })) } });
    await new Promise((r) => setTimeout(r, 400));
    return send(200, { id: "msg_mock", type: "message", role: "assistant", model: b.model, content: [{ type: "text", text: JSON.stringify(EXTRACTED) }], stop_reason: "end_turn", stop_details: null, usage: { input_tokens: 1000, output_tokens: 200 } });
  }

  // ---------- Auth ----------
  if (p === "/auth/v1/token") {
    const b = json();
    if (url.searchParams.get("grant_type") === "password") {
      const u = db.users.find((x) => x.email === b.email && x.password === b.password);
      if (!u) return send(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      calls.push({ type: "login", email: u.email });
      return send(200, session(u));
    }
    const u = db.users.find((x) => `rt-${x.id}` === b.refresh_token);
    return u ? send(200, session(u)) : send(400, { msg: "Invalid Refresh Token" });
  }
  if (p === "/auth/v1/user") {
    const u = db.users.find((x) => x.id === me);
    return u ? send(200, userJson(u)) : send(401, { msg: "invalid JWT" });
  }
  if (p === "/auth/v1/logout") return send(204);
  if (p === "/auth/v1/recover") { calls.push({ type: "recover", body: json(), redirect: url.searchParams.get("redirect_to") }); return send(200, {}); }
  if (p === "/auth/v1/admin/users" && req.method === "GET") return send(200, { users: db.users.map(userJson), aud: "authenticated" });
  if (p === "/auth/v1/admin/users" && req.method === "POST") {
    const b = json();
    calls.push({ type: "createUser", body: b });
    if (db.users.some((u) => u.email === b.email)) return send(422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
    const u = { id: randomUUID(), email: b.email, password: b.password, user_metadata: b.user_metadata ?? {}, app_metadata: b.app_metadata ?? {} };
    db.users.push(u);
    db.profiles.push({ id: u.id, name: u.user_metadata.name || u.email.split("@")[0], email: u.email, role: "user", created_at: now() });
    return send(200, userJson(u));
  }
  const adminUser = p.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
  if (adminUser) {
    const u = db.users.find((x) => x.id === adminUser[1]);
    if (!u) return send(404, { msg: "User not found" });
    if (req.method === "PUT") {
      const b = json();
      calls.push({ type: "updateUser", id: u.id, body: b });
      if (b.ban_duration) u.banned_until = b.ban_duration === "none" ? null : "2126-01-01T00:00:00Z";
      if (b.password) u.password = b.password;
      return send(200, userJson(u));
    }
    if (req.method === "DELETE") {
      db.users = db.users.filter((x) => x !== u);
      db.profiles = db.profiles.filter((x) => x.id !== u.id);
      return send(200, {});
    }
  }

  // ---------- Storage ----------
  const st = p.match(/^\/storage\/v1\/object\/(sign\/|authenticated\/)?(.+)$/);
  if (st) {
    const [, kind, path] = st;
    if (req.method === "POST" && kind === "sign/") return send(200, { signedURL: `/object/sign/${path}?token=t` });
    if (req.method === "POST" && !kind) {
      let bytes = raw;
      let type = req.headers["content-type"];
      const boundary = /boundary=(.+)$/.exec(type || "")?.[1];
      if (boundary) {
        // pull the file part out of multipart/form-data
        const parts = raw.toString("latin1").split(`--${boundary}`);
        const filePart = parts.find((x) => /content-type:\s*image\//i.test(x)) ?? "";
        const headerEnd = filePart.indexOf("\r\n\r\n");
        type = /content-type:\s*([^\r\n]+)/i.exec(filePart)?.[1] ?? "application/octet-stream";
        bytes = Buffer.from(filePart.slice(headerEnd + 4, filePart.length - 2), "latin1");
      }
      db.objects.set(path.replace(/^bill-images\//, ""), { bytes, type });
      db.objects.set(path, { bytes, type });
      calls.push({ type: "upload", path, bytes: bytes.length, contentType: type, multipart: !!boundary, jpeg: bytes[0] === 0xff && bytes[1] === 0xd8, owner: me });
      return send(200, { Key: path, Id: randomUUID() });
    }
    if (req.method === "GET") {
      const obj = db.objects.get(path);
      if (!obj) return send(404, { message: "Object not found" });
      res.writeHead(200, { "Content-Type": obj.type || "image/jpeg", "Access-Control-Allow-Origin": "*" });
      return res.end(obj.bytes);
    }
    if (req.method === "DELETE") {
      const b = json();
      (b?.prefixes ?? []).forEach((k) => db.objects.delete(k.replace(/^bill-images\//, "")));
      calls.push({ type: "removeObject", prefixes: b?.prefixes });
      return send(200, []);
    }
  }

  // ---------- REST ----------
  const rpc = p.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (rpc) {
    const b = json() ?? {};
    calls.push({ type: "rpc", name: rpc[1], body: b, as: me });
    if (rpc[1] === "signup_open") return send(200, "false");
    if (rpc[1] === "save_bill") {
      let id = b.p_bill_id;
      const old = id ? snapshot(id) : null;
      if (!id) {
        id = randomUUID();
        db.bills.push({ id, bill_date: b.p_bill_date, image_url: b.p_image_url, logged_by: me, logged_at: now(), updated_at: now() });
      } else {
        Object.assign(db.bills.find((x) => x.id === id), { bill_date: b.p_bill_date, updated_at: now() });
        db.bill_items = db.bill_items.filter((i) => i.bill_id !== id);
      }
      b.p_items.forEach((it) => db.bill_items.push({ id: randomUUID(), bill_id: id, ...it }));
      db.audit_log.push({ id: db.audit_log.length + 1, user_id: me, action: old ? "bill.update" : "bill.create", entity_id: id, old_value: old, new_value: snapshot(id), created_at: now() });
      return send(200, JSON.stringify(id));
    }
    if (rpc[1] === "delete_bill") {
      const bill = db.bills.find((x) => x.id === b.p_bill_id);
      db.audit_log.push({ id: db.audit_log.length + 1, user_id: me, action: "bill.delete", entity_id: bill.id, old_value: snapshot(bill.id), new_value: null, created_at: now() });
      db.bills = db.bills.filter((x) => x !== bill);
      db.bill_items = db.bill_items.filter((i) => i.bill_id !== bill.id);
      return send(200, JSON.stringify(bill.image_url));
    }
    return send(404, { message: "no such rpc" });
  }
  const rest = p.match(/^\/rest\/v1\/(\w+)$/);
  if (rest) {
    const table = rest[1];
    const params = url.searchParams;
    if (req.method === "GET" || req.method === "HEAD") {
      const source =
        table === "bills" ? db.bills.map(shapeBill)
        : table === "entries" ? entries()
        : table === "audit_log" ? db.audit_log.map((a) => ({ ...a, profiles: profileOf(a.user_id) ?? null }))
        : db[table] ?? [];
      // emulate "own only" visibility for regular users
      const visible = profileOf(me)?.role === "admin" || db.app_settings[0].users_view_all || !["bills", "entries"].includes(table)
        ? source : source.filter((r) => r.logged_by === me);
      const all = applyFilters(visible, new URLSearchParams([...params].filter(([k]) => !["limit", "offset"].includes(k))));
      const rows = applyFilters(all, params);
      const headers = { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${all.length}` };
      if (req.method === "HEAD") return send(200, undefined, headers);
      if ((req.headers.accept || "").includes("vnd.pgrst.object")) {
        return rows.length === 1 ? send(200, rows[0], headers) : send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      }
      return send(200, rows, headers);
    }
    if (req.method === "PATCH") {
      const b = json();
      calls.push({ type: "update", table, filter: Object.fromEntries(params), body: b, as: me });
      applyFilters(db[table], params).forEach((r) => Object.assign(r, b));
      return send(204);
    }
    if (req.method === "POST") {
      const b = json();
      calls.push({ type: "insert", table, body: b });
      (Array.isArray(b) ? b : [b]).forEach((r) => db[table].push({ id: db[table].length + 1, created_at: now(), ...r }));
      return send(201);
    }
  }

  // test hook
  if (p === "/__calls") return send(200, calls);
  send(404, { message: `mock: no route for ${req.method} ${p}` });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock supabase+claude on http://127.0.0.1:${PORT}`));
