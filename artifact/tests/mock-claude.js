// Stand-in for window.claude used only to exercise the page locally.
(() => {
  const PERSIST = new URLSearchParams(location.search).get("persist") === "1";
  // Chromium can drop localStorage writes on file:// pages across a reload, so the store is also kept in this tab's
  // window.name (which survives reloads). The newer of the two copies wins, so another tab's later writes still count.
  const WN = "mock-store:";
  const _clear = Storage.prototype.clear; Storage.prototype.clear = function () { if (this === window.localStorage) window.name = ""; return _clear.call(this); };
  let saved = null;
  try {
    if (PERSIST) {
      const ls = { t: Number(localStorage.getItem("mock-store-t") || 0), j: localStorage.getItem("mock-store") };
      const m = window.name.startsWith(WN) ? /^(\d+)\|([\s\S]*)$/.exec(window.name.slice(WN.length)) : null; const wn = m ? { t: Number(m[1]), j: m[2] } : { t: -1, j: null };
      saved = JSON.parse((wn.t > ls.t ? wn.j : ls.j) || "null");
    }
  } catch {}
  const store = new Map(saved || []); const subs = new Set(); const log = (window.__log = []);
  let persistN = 0;
  const persist = () => { if (!PERSIST) return; const j = JSON.stringify([...store]); const t = Date.now() * 1000 + (persistN++ % 1000); localStorage.setItem("mock-store", j); localStorage.setItem("mock-store-t", String(t)); window.name = WN + t + "|" + j; };
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const merge = (t, src) => { for (const [k, v] of Object.entries(src)) { if (isObj(v) && isObj(t[k])) merge(t[k], v); else t[k] = JSON.parse(JSON.stringify(v)); } return t; };
  const ROLE = (window.__ROLE = new URLSearchParams(location.search).get("role") || "admin");
  const QP = new URLSearchParams(location.search);
  const UID = ROLE === "none" ? null : new URLSearchParams(location.search).get("uid") || (ROLE === "admin" ? "u_admin" : "u_staff");
  const OWNER = ROLE === "admin" && QP.get("owner") !== "0";
  // the page's published access rules, as the real store applies them (owner/editors = "admin" here)
  function canRead(path) {
    if (ROLE === "admin") return true; const seg = path.split("/");
    if (["wallets", "walletin", "walletclaims"].includes(seg[0])) return seg[1] === UID;   // {self} subtrees
    if (seg[0] === "walletreg") return false;
    if (seg[0] === "accounts") return seg[1] === "items" || seg[1] === "settings";
    return true;
  }
  const snapDoc = (path) => ({ id: path.split("/").pop(), exists: store.has(path) && canRead(path), data: () => store.get(path), metadata: { fromCache: false, hasPendingWrites: false } });
  const childrenOf = (col) => [...store.keys()].filter((p) => p.startsWith(col + "/") && p.split("/").length === col.split("/").length + 1).sort();
  const visibleDocs = (col) => childrenOf(col).filter((p) => !(p.startsWith("audit") && ROLE !== "admin") && canRead(p)).map(snapDoc);
  const notify = () => subs.forEach((f) => f());
  function query(col, filters = { order: null, lim: null }) {
    if (col.split("/").length % 2 === 0) throw { code: "invalid_argument", message: "A collection path needs an odd number of segments: " + col };
    const run = () => { let d = visibleDocs(col); if (filters.order) { const [f, dir] = filters.order; d.sort((a, b) => String(a.data()[f]).localeCompare(String(b.data()[f])) * (dir === "desc" ? -1 : 1)); } if (filters.lim) d = d.slice(0, filters.lim); return { docs: d, size: d.length, empty: !d.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; };
    return {
      path: col,
      orderBy: (f, dir = "asc") => query(col, { ...filters, order: [f, dir] }),
      limit: (n) => query(col, { ...filters, lim: n }),
      where: () => query(col, filters),
      get: async () => run(),
      onSnapshot(next) { const f = () => next(run()); subs.add(f); setTimeout(f, 30); return () => subs.delete(f); },
      doc: (id) => docRef(col + "/" + (id || "x" + Math.random().toString(36).slice(2))),
      add: async (data) => { const r = docRef(col + "/x" + Math.random().toString(36).slice(2)); await r.set(data); return r; },
    };
  }
  function canWrite(path) { if (ROLE === "admin") return true; const seg = path.split("/"); if (seg[0] === "inventory") return seg[1] === "months" || seg[1] === "scans"; if (seg[0] === "accounts" || seg[0] === "walletreg" || seg[0] === "walletin") return false; if (seg[0] === "wallets" || seg[0] === "walletclaims") return seg[1] === UID; if (seg[0] === "routine") return seg[1] !== "settings"; return (seg[0] === "bills" || seg[0] === "audit" || seg[0] === "people") && seg[1] === UID; }
  function docRef(path) {
    if (path.split("/").length % 2) throw { code: "invalid_argument", message: "A document path needs an even number of segments: " + path };   // like the real store
    return {
      id: path.split("/").pop(), path,
      get: async () => snapDoc(path),
      set: async (data) => { if (!canWrite(path)) throw { code: "invalid_argument", message: "no" }; store.set(path, JSON.parse(JSON.stringify(data))); log.push(["set", path, data]); persist(); notify(); },
      update: async (data) => { if (!canWrite(path) || !store.has(path)) throw { code: "invalid_argument", message: "no" }; store.set(path, merge(JSON.parse(JSON.stringify(store.get(path))), data)); log.push(["update", path, data]); persist(); notify(); },
      delete: async () => { if (!canWrite(path)) throw { code: "invalid_argument", message: "no" }; store.delete(path); log.push(["delete", path]); persist(); notify(); },
      acquire: async () => ({ acquired: true }),
      onSnapshot(next) { const f = () => next(snapDoc(path)); subs.add(f); setTimeout(f, 30); return () => subs.delete(f); },
      collection: (c) => query(path + "/" + c),
    };
  }
  // seed one bill from the other person
  if (saved) { /* keep the persisted store as-is */ }
  const other = ROLE === "admin" ? "u_staff" : "u_admin";
  store.set(`bills/${other}`, { updated_at: "2026-10-28T10:15:00Z" });
  store.set(`bills/${other}/list/bseed`, { bill_no: "4471", bill_date: "2026-10-28", logged_by: other, logged_at: "2026-10-28T10:15:00Z", updated_at: "2026-10-28T10:15:00Z", image_id: null,
    items: [{ serial_no: 1, item_name: "Azithromycin 500", qty: 1, rate: 120, total_amount: 120 }, { serial_no: 2, item_name: "ORS sachet", qty: 5, rate: 22, total_amount: 110 }] });
  const names = { u_admin: "Asha Admin", u_staff: "Ravi Staff", u_meena: "Meena Joshi" };
  const teamParam = new URLSearchParams(location.search).get("team");
  if (QP.get("perms")) store.set("settings/roles", { perms: JSON.parse(QP.get("perms")) });
  store.set("people/u_guest", { last_seen: "2026-11-04T12:47:43Z" }); // invited from outside: no name shared
  if (teamParam) { store.set("team/u_admin", { role: QP.get("adminrole") || "admin", added_at: "2026-11-01T00:00:00Z" }); if (teamParam !== "none") store.set("team/u_staff", { role: teamParam, added_at: "2026-11-01T00:00:00Z" }); }
  const avatar = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#c7a"/></svg>');
  const caps = {
    db: { doc: docRef, collection: (c) => query(c) },
    user: {
      me: async () => ({ id: UID, name: names[UID] || "", avatarUrl: avatar, color: "#c7a", email: null, isOwner: OWNER, canEdit: ROLE === "admin" }),
      search: async (q) => Object.entries(names).filter(([id, n]) => n.toLowerCase().includes(q.toLowerCase())).map(([id, name]) => ({ id, name, avatarUrl: avatar, color: "#c7a", email: null, isMe: id === UID, guest: false })),
      can: async () => true, isOwner: async () => ROLE === "admin", canEdit: async () => ROLE === "admin", id: async () => UID,
      profiles: async (ids) => Object.fromEntries([].concat(ids).map((id) => [id, { id, name: names[id] || "", avatarUrl: avatar, color: "#c7a", email: null, isMe: id === UID, guest: false }])),
    },
    sample: Object.assign(async () => ({ text: "x", truncated: false }), {
      limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 20e6, mediaTypes: ["image/jpeg", "image/png"] } }),
      json: async (prompt, opts) => { log.push(["sample", prompt.length, opts.images.length, opts.images[0].type, opts.images[0].size]); await new Promise((r) => setTimeout(r, 300));
        if (window.__sampleJson) return window.__sampleJson(prompt, opts);   // tests can supply their own reading
        if (window.__failSample) throw { code: "refused", message: "x" };
        return { is_bill: true, bill_no: " 4471 ", bill_date: "2026-11-02", items: [{ serial_no: 1, item_name: "Dolo 650 Tab 15's", qty: 2, rate: 30.5, total_amount: 61 }, { serial_no: 2, item_name: "Benadryl Syrup 100ml", qty: 1, rate: 118, total_amount: 118 }, { serial_no: 3, item_name: "Volini Gel 30g", qty: 2, rate: 145, total_amount: 300 }] }; },
    }),
    assets: { upload: async (blob, o) => { log.push(["upload", blob.type, blob.size, o]); return { id: "a".repeat(32), url: "/_blob/aaa", sizeBytes: blob.size, contentType: "image/jpeg" }; }, delete: async (id) => { log.push(["assetDelete", id]); return { deleted: true }; }, list: async () => ({ assets: [], usage: {} }) },
    downloads: { save: async (f) => { const size = typeof f.data === "string" ? f.data.length : f.data.size; let head = typeof f.data === "string" ? f.data.slice(0, 200) : new TextDecoder().decode(new Uint8Array(await f.data.slice(0, 8).arrayBuffer())); log.push(["save", f.filename, size, head]); window.__lastSave = typeof f.data === "string" ? f.data : null; return { status: "saved" }; } },
  };
  window.claude = { use: async (n) => caps[n] ?? null };
})();
