import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PwaSetup } from "@/components/pwa";
import { SetupNeeded } from "@/components/setup-needed";
import { missingSettings } from "@/lib/setup";

export const metadata: Metadata = {
  title: { default: "Pharmacy Bill Log", template: "%s · Pharmacy Bill Log" },
  description: "Scan, check and log pharmacy bills from your phone.",
  applicationName: "Pharmacy Bill Log",
  appleWebApp: { capable: true, title: "Bill Log", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const missing = missingSettings();
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {missing.length > 0 ? <SetupNeeded missing={missing} /> : children}
        <PwaSetup />
      </body>
    </html>
  );
}
