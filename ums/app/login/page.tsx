"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ClipboardList, KeyRound, Loader2, LogIn, RotateCcw, UserPlus } from "lucide-react";
import { ThemeToggle, PortalLink } from "@/components/topbar-extras";
import { currentUserId, idApplicationStatus, signIn } from "@/lib/api";
import { isDemo, resetDemoData } from "@/lib/db";
import { getMockDb } from "@/lib/demo/mock";
import { demoAccounts } from "@/lib/demo/seed";
import { ROLE_LABEL } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";
import { fmtDateTime, loginEmail } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [personalNo, setPersonalNo] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("inactive") ? "Your account is not active. Contact the Orderly Room / Admin." : null);
  const [demo, setDemo] = useState<ReturnType<typeof demoAccounts>>([]);
  const [appInfo, setAppInfo] = useState<{ tone: "amber" | "red" | "green"; text: string } | null>(params.get("applied") ? { tone: "green", text: "Application submitted. The Adjt will verify your details; after approval sign in here with your Personal No and the password you chose." } : null);
  const { lang, setLang, t } = useI18n();
  // where to go after sign-in (only pages of this system)
  const raw = params.get("next") ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") && !raw.startsWith("/login") ? raw : "/dashboard";

  useEffect(() => {
    currentUserId().then((id) => id && router.replace(next));
    if (isDemo) void getMockDb().ready.then(() => setDemo(demoAccounts(getMockDb().store)));
  }, [router, next]);

  async function submit(id = personalNo, pw = password) {
    setBusy(true);
    setError(null);
    setAppInfo(null);
    try {
      await signIn(loginEmail(id), pw || "demo");
      router.replace(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A new soldier whose ID is not approved yet: tell him where his application stands.
      const app = id.trim() ? await idApplicationStatus(id).catch(() => null) : null;
      if (app?.status === "Pending") setAppInfo({ tone: "amber", text: `Your application for a new ID (${fmtDateTime(app.submitted_at)}) is waiting for the Adjt's approval.` });
      else if (app?.status === "Rejected") setAppInfo({ tone: "red", text: `Your application for a new ID was not approved${app.review_remarks ? `: ${app.review_remarks}` : "."} You may apply again with corrected details.` });
      else setError(/invalid login/i.test(msg) ? "Wrong Personal No or password." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-side">
        <div className="login-crest">
          <div className="crest-wrap">
            <span className="crest-halo" />
            <img src="/brand/logo-512.webp" alt="5 Signal Battalion crest" />
          </div>
          <h1>5 Signal Battalion</h1>
          <div className="crest-rule"><i /><span>Unit Management System</span><i /></div>
        </div>
        <small className="login-credit">© BA 11108 Capt Asif Mahmud, Sigs · Authorized use only</small>
      </div>

      <div className="login-form-wrap" style={{ position: "relative" }}>
        <div className="row login-top">
          <PortalLink />
          <div className="lang-switch">
            <button type="button" className={lang === "en" ? "on" : ""} onClick={() => lang !== "en" && setLang("en")}>EN</button>
            <button type="button" className={lang === "bn" ? "on" : ""} onClick={() => lang !== "bn" && setLang("bn")}>বাংলা</button>
          </div>
          <ThemeToggle />
        </div>
        <form className="login-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div>
            <div className="eyebrow">Secure sign in</div>
            <h2>Welcome</h2>
            <p className="muted small" style={{ marginTop: 4 }}>Sign in with your Personal No (e.g. <span className="mono">4012345</span> or <span className="mono">BA 11108</span>).</p>
          </div>
          {error && <div className="alert alert-red">{error}</div>}
          {appInfo && <div className={`alert alert-${appInfo.tone}`}><ClipboardList size={16} /><span>{appInfo.text}</span></div>}
          <label className="field">
            <span className="field-label">Personal No</span>
            <input className="input" value={personalNo} onChange={(e) => setPersonalNo(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required={!isDemo} />
          </label>
          <button className="btn btn-primary" style={{ height: 42, justifyContent: "center" }} disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />} Sign in
          </button>
          <p className="muted small"><KeyRound size={12} style={{ verticalAlign: -1 }} /> Forgot your password? Ask your Coy Comd or the Orderly Room to reset it.</p>
          <div className="login-alt">
            <span className="muted small">New to the unit and no login yet?</span>
            <Link href="/register" className="btn btn-green"><UserPlus size={16} /> Apply for new ID</Link>
          </div>

          {isDemo && (
            <div className="card" style={{ marginTop: 6 }}>
              <div className="card-head">
                <h2>Demo — pick a role</h2>
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => { resetDemoData(); setDemo(demoAccounts(getMockDb().store)); }} title="Restore the original demo data">
                  <RotateCcw size={12} /> Reset data
                </button>
              </div>
              <div className="card-body">
                <div className="demo-list">
                  {demo.map((d) => (
                    <button type="button" key={d.role} className="demo-btn" onClick={() => submit(d.loginId, "demo")} disabled={busy}>
                      <div>
                        <strong>{t(ROLE_LABEL[d.role as Role])}</strong>
                        <span>{d.name} · {d.detail}</span>
                      </div>
                      <span className="mono">{d.loginId}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
