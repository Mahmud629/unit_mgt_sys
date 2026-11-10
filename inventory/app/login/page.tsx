"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/app/components/I18nProvider";
import { Field } from "@/app/components/ui";
import { localizeMessage } from "@/lib/i18n";
import PortalLink from "@/app/components/PortalLink";

// Only allow redirects back into this app.
function safeNext() {
  const next = new URLSearchParams(window.location.search).get("next") || "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function LoginPage() {
  const router = useRouter();
  const { t, lang, setLang } = useI18n();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data.message ? localizeMessage(data.message, lang) : t("loginFailed"));
        setLoading(false);
        return;
      }

      router.replace(safeNext());
      router.refresh();
    } catch {
      setMessage(t("cannotReach"));
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-side">
        <div className="login-crest">
          <div className="crest-wrap">
            <span className="crest-halo" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-512.webp" alt="5 Signal Battalion crest" />
          </div>
          <h1>{t("appName")}</h1>
          <div className="crest-rule"><i /><span>{t("brandSub")}</span><i /></div>
        </div>
        <small className="login-credit">© BA 11108 Capt Asif Mahmud, Sigs · {t("lanOnly")}</small>
      </div>

      <div className="login-form-wrap">
        <div className="login-top">
          <PortalLink label={t("allSystems")} className="btn btn-ghost btn-sm portal-link-plain" />
          <div className="lang-switch" role="group" aria-label="Language">
            <button type="button" className={lang === "en" ? "on" : ""} onClick={() => lang !== "en" && setLang("en")}>EN</button>
            <button type="button" className={lang === "bn" ? "on" : ""} onClick={() => lang !== "bn" && setLang("bn")}>বাংলা</button>
          </div>
        </div>

        <form onSubmit={handleLogin} className="login-form form form-single">
          <div className="login-head">
            <Image src="/logo-mark.png" alt="UIMS" width={56} height={56} className="login-mark" priority />
            <div>
              <div className="eyebrow">{t("loginEyebrow")}</div>
              <h2>{t("loginWelcome")}</h2>
              <p className="muted">{t("loginPrompt")}</p>
            </div>
          </div>
          <Field label={t("username")}>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </Field>

          <Field label={t("password")}>
            <div className="input-row">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus required />
              <button type="button" className="btn btn-ghost" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? t("hidePassword") : t("showPassword")}>
                {showPassword ? t("hide") : t("show")}
              </button>
            </div>
          </Field>

          {message && (
            <div className="login-error" role="alert">
              {message}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? t("loggingIn") : t("login")}
          </button>
        </form>
      </div>
    </main>
  );
}
