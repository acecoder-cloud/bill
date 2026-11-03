import { NextResponse } from "next/server";
import { getAdminCaller } from "@/lib/auth";
import { createAdminClient, createEmailClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

const FOREVER = "876000h"; // ~100 years
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

async function audit(userId: string, action: string, entityId: string | null, oldValue: unknown, newValue: unknown) {
  const { error } = await createAdminClient()
    .from("audit_log")
    .insert({ user_id: userId, action, entity_id: entityId, old_value: oldValue ?? null, new_value: newValue ?? null });
  if (error) console.error("audit insert failed", error.message);
}

async function sendSetPasswordEmail(request: Request, email: string) {
  const { error } = await createEmailClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl(request)}/auth/complete?next=/set-password`,
  });
  return error;
}

/** List all users with their sign-in status. */
export async function GET() {
  const caller = await getAdminCaller();
  if (!caller) return fail(403, "Admins only.");
  const admin = createAdminClient();

  const { data: profiles, error } = await admin.from("profiles").select("id, name, email, role, created_at").order("created_at");
  if (error) return fail(500, error.message);

  const authUsers = new Map<string, { last_sign_in_at?: string; banned_until?: string; email_confirmed_at?: string }>();
  for (let page = 1; page < 50; page++) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) return fail(500, listErr.message);
    data.users.forEach((u) =>
      authUsers.set(u.id, {
        last_sign_in_at: u.last_sign_in_at ?? undefined,
        banned_until: (u as { banned_until?: string }).banned_until ?? undefined,
        email_confirmed_at: u.email_confirmed_at ?? undefined,
      }),
    );
    if (data.users.length < 200) break;
  }

  const { data: counts } = await admin.from("bills").select("logged_by");
  const billCount = new Map<string, number>();
  (counts ?? []).forEach((b: { logged_by: string }) => billCount.set(b.logged_by, (billCount.get(b.logged_by) ?? 0) + 1));

  const now = Date.now();
  return NextResponse.json({
    users: (profiles ?? []).map((p) => {
      const a = authUsers.get(p.id) ?? {};
      return {
        ...p,
        last_sign_in_at: a.last_sign_in_at ?? null,
        disabled: !!a.banned_until && new Date(a.banned_until).getTime() > now,
        bill_count: billCount.get(p.id) ?? 0,
      };
    }),
  });
}

/** Add a user. mode "invite": they get an email to set their password. mode "password": admin sets it now. */
export async function POST(request: Request) {
  const caller = await getAdminCaller();
  if (!caller) return fail(403, "Admins only.");
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  const role = body?.role === "admin" ? "admin" : "user";
  const mode = body?.mode === "password" ? "password" : "invite";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email)) return fail(400, "Enter a valid email address.");
  if (mode === "password" && password.length < 8) return fail(400, "Password must be at least 8 characters.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: mode === "password" ? password : undefined,
    email_confirm: true,
    user_metadata: { name },
    app_metadata: { provisioned: true }, // lets the database trigger accept this account
  });
  if (error || !data.user) {
    const exists = /already (been )?registered|already exists/i.test(error?.message ?? "");
    return fail(exists ? 409 : 400, exists ? "A user with this email already exists." : error?.message ?? "Could not create user.");
  }

  if (role === "admin") {
    // Done as the calling admin so the role change is checked by RLS and recorded in the audit log.
    const { error: roleErr } = await caller.supabase.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
    if (roleErr) console.error("role update failed", roleErr.message);
  }
  await audit(caller.userId, "user.create", data.user.id, null, { email, name, role, mode });

  if (mode === "invite") {
    const mailErr = await sendSetPasswordEmail(request, email);
    if (mailErr) {
      return NextResponse.json({
        ok: true,
        warning: `User created, but the email could not be sent (${mailErr.message}). Use "Send password link" later, or set a password for them.`,
      });
    }
  }
  return NextResponse.json({ ok: true });
}

/** Change role, disable/enable, rename, resend link, or set a new password. */
export async function PATCH(request: Request) {
  const caller = await getAdminCaller();
  if (!caller) return fail(403, "Admins only.");
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const action = body?.action as string;
  if (!userId) return fail(400, "Missing user.");
  const admin = createAdminClient();

  const { data: target } = await admin.from("profiles").select("id, email, name, role").eq("id", userId).single();
  if (!target) return fail(404, "User not found.");

  switch (action) {
    case "role": {
      const role = body.role === "admin" ? "admin" : "user";
      const { error } = await caller.supabase.from("profiles").update({ role }).eq("id", userId);
      if (error) return fail(400, error.message);
      return NextResponse.json({ ok: true });
    }
    case "rename": {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
      if (!name) return fail(400, "Enter a name.");
      const { error } = await caller.supabase.from("profiles").update({ name }).eq("id", userId);
      if (error) return fail(400, error.message);
      return NextResponse.json({ ok: true });
    }
    case "disable":
    case "enable": {
      if (userId === caller.userId) return fail(400, "You can't disable your own account.");
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: action === "disable" ? FOREVER : "none" });
      if (error) return fail(400, error.message);
      await audit(caller.userId, `user.${action}`, userId, null, { email: target.email });
      return NextResponse.json({ ok: true });
    }
    case "password": {
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 8) return fail(400, "Password must be at least 8 characters.");
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return fail(400, error.message);
      await audit(caller.userId, "user.password_set", userId, null, { email: target.email });
      return NextResponse.json({ ok: true });
    }
    case "resend": {
      const mailErr = await sendSetPasswordEmail(request, target.email);
      if (mailErr) return fail(400, `Email could not be sent: ${mailErr.message}`);
      return NextResponse.json({ ok: true });
    }
    default:
      return fail(400, "Unknown action.");
  }
}

/** Permanently delete a user who has never logged a bill. */
export async function DELETE(request: Request) {
  const caller = await getAdminCaller();
  if (!caller) return fail(403, "Admins only.");
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) return fail(400, "Missing user.");
  if (userId === caller.userId) return fail(400, "You can't delete your own account.");

  const admin = createAdminClient();
  const { count } = await admin.from("bills").select("id", { count: "exact", head: true }).eq("logged_by", userId);
  if ((count ?? 0) > 0) return fail(409, "This user has logged bills, so they can't be deleted. Disable the account instead.");

  const { data: target } = await admin.from("profiles").select("email, name, role").eq("id", userId).single();
  if (target?.role === "admin") {
    const { count: admins } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((admins ?? 0) <= 1) return fail(400, "At least one admin is required.");
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return fail(400, error.message);
  await audit(caller.userId, "user.delete", null, target ?? { id: userId }, null);
  return NextResponse.json({ ok: true });
}
