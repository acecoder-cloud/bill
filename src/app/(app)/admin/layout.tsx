import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/");
  return <>{children}</>;
}
