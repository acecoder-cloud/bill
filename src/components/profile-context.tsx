"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { AppSettings, Profile } from "@/lib/types";

const ProfileContext = createContext<{ profile: Profile; settings: AppSettings } | null>(null);

export function ProfileProvider({ profile, settings, children }: { profile: Profile; settings: AppSettings; children: ReactNode }) {
  return <ProfileContext.Provider value={{ profile, settings }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
