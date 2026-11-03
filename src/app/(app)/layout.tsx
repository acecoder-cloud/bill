import type { ReactNode } from "react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProfileProvider } from "@/components/profile-context";
import { BottomNav } from "@/components/nav";
import type { AppSettings } from "@/lib/types";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("users_view_all, allow_public_signup").eq("id", 1).single();
  const settings: AppSettings = data ?? { users_view_all: true, allow_public_signup: false };

  return (
    <ProfileProvider profile={profile} settings={settings}>
      <header className="pt-safe sticky top-0 z-30 bg-brand-700 text-white shadow print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-lg ring-1 ring-white/30" />
          <span className="flex-1 truncate text-lg font-bold">Pharmacy Bill Log</span>
          <span className="hidden max-w-32 truncate text-sm text-brand-100 min-[380px]:inline">{profile.name}</span>
          <form action="/auth/signout" method="post">
            <button className="min-h-10 rounded-lg px-3 text-sm font-semibold text-white active:bg-brand-800" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4">{children}</main>
      <BottomNav />
    </ProfileProvider>
  );
}
