import type { Metadata } from "next";
import { cookies } from "next/headers";
// Fonts (Inter, Plus Jakarta Sans, Hind Siliguri) are bundled in /public/fonts, the same as the
// Unit Management System, so the pages need no internet on the unit LAN (see globals.css).
import "./globals.css";
import AppShell from "./components/AppShell";
import { I18nProvider } from "./components/I18nProvider";
import { LANG_COOKIE, isLang } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "UIMS · 5 Signal Battalion",
  description: "Unit Inventory Management System — 5 Signal Battalion",
};

// Applies the saved theme before the page paints (no light-mode flash).
const themeScript = `try{var t=localStorage.getItem("inventory_theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);if(localStorage.getItem("inventory_sidebar")==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isLang(saved) ? saved : "en";

  return (
    <html lang={lang} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <I18nProvider initialLang={lang}>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
