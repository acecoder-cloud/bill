# Pharmacy Bill Log

A phone-first web app (installable PWA) for logging pharmacy bills. Take a photo of a bill, let AI read the line items, check and fix them, and save. Everyone's entries go into one shared online database, with roles and permissions enforced by the database itself.

- **Scan:** opens the phone camera directly (or pick from the gallery). The photo is shrunk in the browser (max 1600 px wide) before upload.
- **AI reading:** Claude (vision) reads Serial no., Bill date, Item name, Qty., Rate and Tot. Amt. The API key never leaves the server. If reading fails, an empty table opens for manual entry.
- **Review & edit:** editable cards on phones, a table on wider screens. Rows where Qty × Rate ≠ Tot. Amt. are highlighted, with a one-tap fix. Pinch-to-zoom on the bill photo. One **Submit** saves the bill and all items in a single database transaction.
- **Bills, Summary, Reports:** sortable/searchable item table with grand total; custom reports exported as PDF, Excel or CSV, shared through WhatsApp/email from the phone's share sheet.
- **Admin:** add or invite users, change roles, disable accounts, choose whether users see everyone's bills or only their own, and view the audit log.

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) · Claude API · Vercel.

---

## Contents

1. [Create the Supabase project](#1-create-the-supabase-project)
2. [Run the database migrations](#2-run-the-database-migrations)
3. [Configure Supabase Auth](#3-configure-supabase-auth)
4. [Environment variables](#4-environment-variables)
5. [Run locally](#5-run-locally)
6. [Deploy to Vercel](#6-deploy-to-vercel)
7. [Create the first (admin) account](#7-create-the-first-admin-account)
8. [Install on Android and iPhone](#8-install-the-app-on-a-phone)
9. [Who can do what](#who-can-do-what)
10. [Testing](#testing)
11. [Project layout](#project-layout)
12. [Troubleshooting](#troubleshooting)

---

## 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) (the free plan is enough).
2. Click **New project**. Pick a name (e.g. `pharmacy-bill-log`), set a strong database password (save it somewhere safe), and choose the region closest to your users (e.g. *Mumbai* for India).
3. Wait about a minute for the project to start.

## 2. Run the database migrations

The SQL files in `supabase/migrations/` create the tables, security rules (row-level security), the photo storage bucket, and the audit log. Run them **in filename order**.

**Option A: SQL Editor (no tools needed)**

1. In Supabase, open **SQL Editor → New query**.
2. Open `supabase/migrations/20261103000001_schema.sql`, copy everything, paste it in, and click **Run**.
3. Repeat for `…0002_auth.sql`, `…0003_rls.sql`, `…0004_rpc_audit.sql` and `…0005_storage.sql`, in that order.

Each file can safely be run again.

**Option B: Supabase CLI**

```bash
npx supabase login
```

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

```bash
npx supabase db push
```

`YOUR_PROJECT_REF` is the code in your project URL: `https://YOUR_PROJECT_REF.supabase.co`.

**Check it worked:** **Table Editor** should list `profiles`, `app_settings`, `bills`, `bill_items` and `audit_log`, and **Storage** should show a private bucket called `bill-images`.

## 3. Configure Supabase Auth

In **Authentication → URL Configuration**:

| Setting | Value |
|---|---|
| **Site URL** | Your live app address, e.g. `https://pharmacy-bill-log.vercel.app` (use `http://localhost:3000` until you deploy) |
| **Redirect URLs** | Add `http://localhost:3000/**` and `https://YOUR-APP.vercel.app/**` |

Email links (sign-up confirmation, invites, password resets) land on `/auth/complete`, which must be allowed by these settings.

In **Authentication → Sign In / Providers → Email**:

- Keep **Email** enabled.
- **Confirm email:** on by default. The first admin must click the link in their inbox before signing in. You can turn it off if you prefer.
- Leaving **Allow new users to sign up** on is fine. The database only accepts self sign-up for the very first account (or when an admin turns on *Anyone can create an account* in the app). Everyone else must be added by an admin.

> **About emails on the free plan.** Supabase's built-in email service is meant for testing. It sends only a few emails per hour, and may send only to members of your Supabase organization. For reliable invites and password-reset emails, add your own SMTP provider under **Authentication → Emails → SMTP Settings** (Resend, Brevo, Amazon SES, Gmail SMTP, etc.).
> Without SMTP, use **Admin → Add user → Set password now** and give people their password in person. No email is needed for that.

## 4. Environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Then fill it in:

| Variable | Where to find it | Who sees it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings → API** → Project URL | Browser (safe) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → **Project Settings → API Keys** → *Publishable key* (`sb_publishable_…`). The legacy **anon** key also works. | Browser (safe; the database rules protect the data) |
| `SUPABASE_SECRET_KEY` | Same page → *Secret key* (`sb_secret_…`). The legacy **service_role** key also works. | **Server only.** Used for admin user management. Never put `NEXT_PUBLIC_` in front of it. |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → **API Keys** → Create key. Add credit under Billing. | **Server only.** Used by `/api/extract`. |
| `CLAUDE_MODEL` *(optional)* | Defaults to `claude-opus-5-5`. You can set e.g. `claude-sonnet-5-5` or `claude-haiku-5-5` to lower cost. | Server only |
| `CLAUDE_EFFORT` *(optional)* | `low`, `medium` (default) or `high`. Higher effort reads hard bills more carefully but is slower and costs more. | Server only |
| `NEXT_PUBLIC_SITE_URL` *(optional)* | Your public app URL, used to build email links. If unset, the app uses the address the request came in on. | Browser |

The bill-reading request opts into Claude's server-side fallback (`fallbacks: "default"`). If the main model declines a request, the API automatically retries it on a recommended fallback model.

## 5. Run locally

You need **Node.js 20.9 or newer**.

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000>. To try the camera on your own phone during development, deploy to Vercel (step 6). Phone browsers only allow camera access and app install on **https** pages.

Other useful commands:

```bash
npm run build
```

```bash
npm test
```

## 6. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. At [vercel.com](https://vercel.com) choose **Add New → Project** and import the repository. Vercel detects Next.js automatically.
3. Before deploying, open **Environment Variables** and add every variable from step 4.
4. Click **Deploy**. When it finishes you get a URL like `https://pharmacy-bill-log.vercel.app`.
5. Return to Supabase **Authentication → URL Configuration**. Set **Site URL** to that address and add `https://pharmacy-bill-log.vercel.app/**` to **Redirect URLs**.
6. If you added `NEXT_PUBLIC_SITE_URL`, set it to the same address and redeploy (**Deployments → … → Redeploy**).

The AI route is allowed to run for up to 60 seconds, which fits Vercel's free plan. A typical bill takes 10–30 seconds.

## 7. Create the first (admin) account

1. Open the app. The login screen says *"No accounts exist yet"*. Tap **Create the admin account**.
2. Enter your name, email and a password. If email confirmation is on, click the link in the email.
3. You are now the admin. Open the **Admin** tab to add staff:
   - **Invite by email:** they get an email to set their own password (needs working email, see step 3).
   - **Set password now:** you choose their password and tell them. No email is needed.
4. Under **Admin → Settings**, choose whether users can see everyone's bills or only their own.

## 8. Install the app on a phone

**Android (Chrome)**

1. Open the app's https address in Chrome and sign in.
2. Tap **Install app** on the Home screen card. If the card isn't there, open Chrome's **⋮ menu → Install app** (or **Add to Home screen**).
3. The app appears on your home screen and opens full-screen.

**iPhone (Safari)**

1. Open the app's address in **Safari**. Other iPhone browsers can't install web apps.
2. Tap the **Share** button (square with an up arrow) at the bottom of the screen.
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open **Bill Log** from your home screen.

When installed, the app loads quickly from the phone's cache. If the connection drops, it shows an offline notice instead of a blank screen. Scanning and saving still need internet.

---

## Who can do what

These rules are enforced by Postgres **row-level security** and database triggers, so they hold even if someone bypasses the app UI and calls the API directly.

| | Admin | User |
|---|---|---|
| Log new bills | ✅ | ✅ |
| See bills | All | All, or only their own (admin setting) |
| Edit / delete bills | All | Only their own |
| See bill photos | All | Same as bills |
| Manage users, roles, settings | ✅ | ❌ |
| View audit log | ✅ | ❌ |
| Change own role | Only another admin can demote; the last admin can't be removed | ❌ |

- **Sign-up:** only the very first account can sign itself up, and it becomes admin. After that, the database rejects self sign-ups unless an admin created the account or turned on public sign-up.
- **Audit log:** creating, editing and deleting bills (with full before/after values), role changes, renames, settings changes, and user add/disable/delete are recorded. Nobody can edit or delete audit rows from the app.
- **Saving:** `save_bill()` writes the bill and all its rows in one transaction. If any row is invalid, nothing is saved.
- **Photos:** stored privately in Supabase Storage under `<user id>/…`, and shown through short-lived signed links.

## Testing

| Command | What it checks |
|---|---|
| `npm test` | Unit tests: number parsing, the Qty × Rate check, cleaning AI output, row validation, CSV escaping |
| `npm run test:db` | Applies all migrations to a throwaway local PostgreSQL database and runs 48 checks: sign-up rules, first-admin, role protection, RLS for bills/items/photos, "own only" mode, transactional save, audit log. Needs `psql` and a local Postgres (`PGURL=postgres://user@localhost/postgres npm run test:db`). |
| `npm run test:e2e` | Builds the app and drives it in a phone-sized Chromium (Pixel 7 + iPhone 13) against a small mock of Supabase and the Claude API: login, scan → compress → upload → AI read → review → fix → submit, bills list, summary sorting/search/total, CSV/Excel/PDF reports, admin user management, audit log, delete, manual entry, role restrictions, PWA manifest, service worker, offline banner, iPhone install hint. Needs Playwright with Chromium. |

The end-to-end test uses a mock backend, so it checks the app's behavior and the exact requests it sends, but not Claude's real reading quality. Before going live, scan a few real bills with your own API key.

## Project layout

```
supabase/migrations/      SQL: tables, RLS, functions, storage bucket
src/proxy.ts              Session refresh + redirect signed-out visitors to /login
src/app/(auth)/           Login, first-admin sign-up, forgot/set password
src/app/auth/complete/    Landing page for email links
src/app/(app)/            Signed-in screens: home, bills, summary, reports, admin
src/app/api/extract/      Sends the bill photo to Claude (server only)
src/app/api/admin/users/  Admin user management (server only, uses the secret key)
src/components/           Bill editor, photo viewer, scan buttons, PWA bits, UI kit
src/lib/                  Pure helpers (bill.ts), image compression, reports, Supabase clients
public/sw.js              Service worker (cache static files, offline page)
tests/                    Unit, database and browser tests
```

## Troubleshooting

| Problem | Fix |
|---|---|
| "Sign-up is closed" | An account already exists. Ask the admin to add you, or the admin can turn on *Anyone can create an account*. |
| Email link says expired | Links are single-use and expire after about an hour. Request a new one. Also check the address is listed in Supabase **Redirect URLs**. |
| No invite/reset emails arrive | Set up custom SMTP (step 3), or use **Set password now** in Admin. |
| "The server is missing ANTHROPIC_API_KEY" | Add it in Vercel → Settings → Environment Variables and redeploy. |
| Bill reading is slow or times out | Retake the photo closer and flatter, or set `CLAUDE_EFFORT=low`. You can always enter items manually. The photo is still saved. |
| Camera doesn't open | The page must be on https (your Vercel URL), and the browser needs camera permission. |
| Install option missing on iPhone | Use Safari, not Chrome. |
| Changed the app but phones show the old version | Close and reopen the app. The service worker updates in the background. |
