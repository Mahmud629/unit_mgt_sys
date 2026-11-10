import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppShell, Splash } from "@/components/app-shell";
import { THEME_BOOT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "5 SIG BN — Unit Management System",
  description: "Personnel, leave, parade state, training and daily administration for 5 Signal Battalion",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d2233" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <Suspense fallback={<Splash />}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
