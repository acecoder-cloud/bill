"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import type { Role } from "@/lib/types";
import { useProfile } from "@/components/profile-context";
import { PageHeader } from "@/components/nav";
import { Button, Card, ErrorBox, Field, InfoBox, LoadingBlock, friendlyError } from "@/components/ui";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
  last_sign_in_at: string | null;
  disabled: boolean;
  bill_count: number;
}

async function api(method: string, body?: unknown) {
  const res = await fetch("/api/admin/users", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed.");
  return json;
}

export default function AdminPage() {
  const { profile, settings: initialSettings } = useProfile();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "warn"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [savingSetting, setSavingSetting] = useState<string | null>(null);

  // add-user form
  const [showAdd, setShowAdd] = useState(false);
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const { users } = await api("GET");
      setUsers(users);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    try {
      const res = await api("POST", { name, email, role, mode, password });
      setMessage(
        res.warning
          ? { tone: "warn", text: res.warning }
          : { tone: "success", text: mode === "invite" ? `Invite sent to ${email}.` : `${email} can now sign in with the password you set.` },
      );
      setName("");
      setEmail("");
      setPassword("");
      setRole("user");
      setShowAdd(false);
      load();
    } catch (err) {
      setAddError(friendlyError(err));
    } finally {
      setAdding(false);
    }
  }

  async function act(user: AdminUser, body: Record<string, unknown>, success: string, method = "PATCH") {
    setBusyId(user.id);
    setMessage(null);
    try {
      await api(method, { userId: user.id, ...body });
      setMessage({ tone: "success", text: success });
      await load();
      if (user.id === profile.id) router.refresh();
    } catch (e) {
      setMessage({ tone: "warn", text: friendlyError(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function saveSetting(key: "users_view_all" | "allow_public_signup", value: boolean) {
    setSavingSetting(key);
    setSettings((s) => ({ ...s, [key]: value })); // update the switch right away
    const { error } = await createClient().from("app_settings").update({ [key]: value, updated_at: new Date().toISOString() }).eq("id", 1);
    setSavingSetting(null);
    if (error) {
      setSettings((s) => ({ ...s, [key]: !value })); // put it back
      return setMessage({ tone: "warn", text: friendlyError(error) });
    }
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="Admin"
        actions={
          <Link href="/admin/audit" className="flex min-h-11 items-center rounded-xl bg-white px-3 font-semibold text-brand-700 ring-1 ring-slate-200">
            Audit log
          </Link>
        }
      />
      <div className="space-y-4">
        {message && <InfoBox tone={message.tone}>{message.text}</InfoBox>}

        <Card className="space-y-3">
          <h2 className="font-semibold">Settings</h2>
          <Toggle
            label="Users can see everyone's bills"
            hint={settings.users_view_all ? "Users see all bills (but can only edit their own)." : "Users only see bills they logged."}
            checked={settings.users_view_all}
            busy={savingSetting === "users_view_all"}
            onChange={(v) => saveSetting("users_view_all", v)}
          />
          <Toggle
            label="Anyone can create an account"
            hint={settings.allow_public_signup ? "Anyone with the link can sign up as a user." : "Only admins can add users (recommended)."}
            checked={settings.allow_public_signup}
            busy={savingSetting === "allow_public_signup"}
            onChange={(v) => saveSetting("allow_public_signup", v)}
          />
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Users {users ? `(${users.length})` : ""}</h2>
            {!showAdd && <Button onClick={() => setShowAdd(true)}>+ Add user</Button>}
          </div>

          {showAdd && (
            <form onSubmit={addUser} className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1">
                {(["invite", "password"] as const).map((m) => (
                  <button type="button" key={m} onClick={() => setMode(m)} className={`min-h-10 rounded-lg text-sm font-semibold ${mode === m ? "bg-white text-brand-800 shadow-sm" : "text-slate-600"}`}>
                    {m === "invite" ? "Invite by email" : "Set password now"}
                  </button>
                ))}
              </div>
              <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Field label="Email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {mode === "password" && (
                <Field label="Password" type="text" autoComplete="off" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters. Share it with them privately." required />
              )}
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Role</span>
                <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">
                  <option value="user">User — logs bills, edits own</option>
                  <option value="admin">Admin — full access</option>
                </select>
              </label>
              {mode === "invite" && <p className="text-xs text-slate-500">They&apos;ll get an email with a link to set their password.</p>}
              <ErrorBox>{addError}</ErrorBox>
              <div className="flex gap-2">
                <Button type="submit" loading={adding} className="flex-1">
                  {mode === "invite" ? "Send invite" : "Create user"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {error && <ErrorBox onRetry={load}>{error}</ErrorBox>}
          {!error && users === null && <LoadingBlock />}
          <ul className="divide-y divide-slate-100">
            {users?.map((u) => (
              <li key={u.id} className={`py-3 ${u.disabled ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {u.name || "(no name)"} {u.id === profile.id && <span className="text-xs font-normal text-slate-500">(you)</span>}
                    </div>
                    <div className="truncate text-sm text-slate-500">{u.email}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {u.bill_count} bill{u.bill_count === 1 ? "" : "s"} · {u.last_sign_in_at ? `last sign-in ${formatDateTime(u.last_sign_in_at)}` : "never signed in"}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.role === "admin" ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-700"}`}>{u.role}</span>
                    {u.disabled && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">disabled</span>}
                  </div>
                </div>
                <UserActions user={u} self={u.id === profile.id} busy={busyId === u.id} act={act} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function UserActions({
  user,
  self,
  busy,
  act,
}: {
  user: AdminUser;
  self: boolean;
  busy: boolean;
  act: (u: AdminUser, body: Record<string, unknown>, success: string, method?: string) => Promise<void>;
}) {
  const btn = "min-h-10 rounded-lg px-3 text-sm font-semibold ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-50";
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <select
        aria-label={`Role for ${user.email}`}
        value={user.role}
        disabled={busy}
        onChange={(e) => {
          const role = e.target.value;
          if (self && role !== "admin" && !window.confirm("Remove your own admin access?")) return;
          act(user, { action: "role", role }, `${user.email} is now ${role === "admin" ? "an admin" : "a user"}.`);
        }}
        className={`${btn} bg-white`}
      >
        <option value="user">Role: user</option>
        <option value="admin">Role: admin</option>
      </select>
      <button
        className={btn}
        disabled={busy}
        onClick={() => {
          const name = window.prompt("New name", user.name);
          if (name && name.trim()) act(user, { action: "rename", name }, "Name updated.");
        }}
      >
        Rename
      </button>
      <button className={btn} disabled={busy} onClick={() => act(user, { action: "resend" }, `Password link sent to ${user.email}.`)}>
        Send password link
      </button>
      <button
        className={btn}
        disabled={busy}
        onClick={() => {
          const pw = window.prompt(`Set a new password for ${user.email} (at least 8 characters)`);
          if (pw) act(user, { action: "password", password: pw }, "Password updated.");
        }}
      >
        Set password
      </button>
      {!self && (
        <button
          className={`${btn} ${user.disabled ? "text-emerald-700" : "text-amber-700"}`}
          disabled={busy}
          onClick={() => {
            if (!user.disabled && !window.confirm(`Disable ${user.email}? They won't be able to sign in. Their bills stay.`)) return;
            act(user, { action: user.disabled ? "enable" : "disable" }, user.disabled ? "Account enabled." : "Account disabled.");
          }}
        >
          {user.disabled ? "Enable" : "Disable"}
        </button>
      )}
      {!self && user.bill_count === 0 && (
        <button
          className={`${btn} text-red-700`}
          disabled={busy}
          onClick={() => window.confirm(`Permanently delete ${user.email}?`) && act(user, {}, "User deleted.", "DELETE")}
        >
          Delete
        </button>
      )}
    </div>
  );
}

function Toggle({ label, hint, checked, busy, onChange }: { label: string; hint: string; checked: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-14 items-center gap-3">
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-slate-500">{hint}</span>
      </span>
      <span className="relative inline-flex">
        <input type="checkbox" role="switch" checked={checked} disabled={busy} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-8 w-14 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-600 peer-disabled:opacity-50" />
        <span className="absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-6" />
      </span>
    </label>
  );
}
