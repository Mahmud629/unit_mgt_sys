"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Send, UserPlus } from "lucide-react";
import { ProfileFields, RecordsEditor, cleanRecords, requiredKeys, setProfileValue, type DraftRecord, type ProfileOptions, type ProfileValues } from "@/components/profile-form";
import { ThemeToggle } from "@/components/topbar-extras";
import { Alert, Card, Field, Loading } from "@/components/ui";
import { registrationOptions, submitIdApplication } from "@/lib/api";
import { DEFAULT_SETTINGS, SOLDIER_FIELDS } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { cls, errorMessage, heightLabel } from "@/lib/utils";

const STEPS: Array<{ title: string; keys: string[] }> = [
  { title: "Identity & posting", keys: ["snk_no", "category", "rank", "name", "name_bn", "trade", "company_id", "platoon", "appointment", "date_joined_unit", "previous_unit"] },
  { title: "Service & physical", keys: ["date_of_birth", "date_of_enrolment", "date_of_rank", "retirement_date", "height_in", "weight_lbs", "blood_group", "medical_category"] },
  { title: "Personal & home", keys: ["religion", "marital_status", "date_of_marriage", "spouse_name", "education", "nid_no", "home_district", "home_upazila", "distance_from_ib_km", "mobile", "alt_mobile", "email", "permanent_address", "present_address"] },
  { title: "Emergency contact & family", keys: ["emergency_name", "emergency_relation", "emergency_mobile"] },
  { title: "Password & submit", keys: [] },
];
const ALWAYS = ["snk_no", "category", "rank", "name", "company_id"];

export default function RegisterPage() {
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const [opts, setOpts] = useState<ProfileOptions | null>(null);
  const [unitName, setUnitName] = useState(DEFAULT_SETTINGS.unit.name);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [v, setV] = useState<ProfileValues>({ category: "OR", medical_category: "A" });
  const [records, setRecords] = useState<DraftRecord[]>([{ kind: "family", data: { relation: "Father" } }, { kind: "education", data: {} }]);
  const [pw, setPw] = useState({ a: "", b: "", show: false });
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    registrationOptions()
      .then((o) => {
        setOpts({ companies: o.companies, ranks: o.ranks ?? DEFAULT_SETTINGS.ranks, trades: o.trades ?? DEFAULT_SETTINGS.trades });
        if (o.unit?.name) setUnitName(o.unit.name);
      })
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  const required = useMemo(() => requiredKeys(v, ALWAYS), [v]);
  const missingIn = (i: number) => STEPS[i].keys.filter((k) => required.includes(k) && !String(v[k] ?? "").trim() && !((k === "spouse_name" || k === "date_of_marriage") && v.marital_status !== "Married"));
  const pwProblem = pw.a.length < 8 ? "Password must be at least 8 characters" : pw.a !== pw.b ? "The two passwords do not match" : null;
  const label = (k: string) => t(SOLDIER_FIELDS.find((f) => f.key === k)?.label ?? k);

  function next() {
    const miss = missingIn(step);
    if (miss.length) { setShowErrors(true); setError(`${t("Please fill in")}: ${miss.map(label).join(", ")}`); return; }
    setError(null);
    setShowErrors(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function submit() {
    const allMissing = STEPS.flatMap((_, i) => missingIn(i));
    if (allMissing.length) { setError(`${t("Please fill in")}: ${allMissing.map(label).join(", ")}`); return; }
    if (pwProblem) { setError(t(pwProblem)); return; }
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...Object.fromEntries(Object.entries(v).filter(([, x]) => String(x).trim() !== "")), records: cleanRecords(records) };
      payload.snk_no = String(v.snk_no).trim();
      await submitIdApplication(payload, pw.a);
      router.replace("/login?applied=1");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reg-page">
      <div className="reg-wrap">
        <div className="row-between">
          <Link href="/login" className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> {t("Back to login")}</Link>
          <div className="row">
            <div className="lang-switch">
              <button type="button" className={lang === "en" ? "on" : ""} onClick={() => lang !== "en" && setLang("en")}>EN</button>
              <button type="button" className={lang === "bn" ? "on" : ""} onClick={() => lang !== "bn" && setLang("bn")}>বাংলা</button>
            </div>
            <ThemeToggle />
          </div>
        </div>
        <div className="reg-head">
          <img src="/brand/logo-160.webp" alt="" />
          <div>
            <h1><UserPlus size={20} style={{ verticalAlign: -3 }} /> {t("Apply for new ID")}</h1>
            <p>{unitName} · {t("Fill in your personal information. The Adjt will verify it and open your login.")}</p>
          </div>
        </div>
        <div className="steps">
          {STEPS.map((s, i) => (
            <button key={s.title} type="button" className={cls("step", i === step && "on", i < step && "done")} onClick={() => i < step && setStep(i)}>
              <b>{i < step ? <Check size={12} /> : i + 1}</b>{t(s.title)}
            </button>
          ))}
        </div>
        {loadError && <Alert tone="red">{loadError}</Alert>}
        {!opts && !loadError ? <Loading /> : opts && (
          <Card>
            {error && <Alert tone="amber">{error}</Alert>}
            {step < 4 && (
              <ProfileFields keys={STEPS[step].keys} values={v} options={opts} required={required} showErrors={showErrors}
                onChange={(k, x) => setV((cur) => setProfileValue(cur, k, x))} />
            )}
            {step === 1 && v.height_in && <p className="muted small">{t("Height")}: {heightLabel(Number(v.height_in))}</p>}
            {step === 0 && <p className="muted small mt">{t("Your Personal No becomes your login ID. It must be unique — one application per Personal No.")}</p>}
            {step === 3 && (
              <div className="grid grid-2 mt">
                <RecordsEditor kind="family" records={records} onChange={setRecords} />
                <RecordsEditor kind="education" records={records} onChange={setRecords} />
              </div>
            )}
            {step === 4 && (
              <div className="stack">
                <div className="approval-grid">
                  <div><span className="muted small">{t("Personal No")}</span><strong className="mono">{v.snk_no}</strong></div>
                  <div><span className="muted small">{t("Rank & Name")}</span><strong>{v.rank} {v.name}</strong></div>
                  <div><span className="muted small">{t("Company")}</span><strong>{opts.companies.find((c) => c.id === v.company_id)?.name}</strong></div>
                  <div><span className="muted small">{t("Home District")}</span><strong>{v.home_district}</strong></div>
                  <div><span className="muted small">{t("Mobile")}</span><strong>{v.mobile}</strong></div>
                  <div><span className="muted small">{t("Family / education")}</span><strong>{cleanRecords(records).length}</strong></div>
                </div>
                <div className="form-grid">
                  <Field label="Choose a password" required hint="At least 8 characters. You will sign in with your Personal No and this password.">
                    <div style={{ position: "relative" }}>
                      <input className="input" type={pw.show ? "text" : "password"} value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoComplete="new-password" />
                      <button type="button" className="btn btn-xs btn-ghost" style={{ position: "absolute", right: 4, top: 5 }} onClick={() => setPw({ ...pw, show: !pw.show })}>{pw.show ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                    </div>
                  </Field>
                  <Field label="Confirm password" required>
                    <input className="input" type={pw.show ? "text" : "password"} value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} autoComplete="new-password" />
                  </Field>
                </div>
                <Alert tone="blue">{t("I certify that the information given is correct. False information is a disciplinary offence.")}</Alert>
              </div>
            )}
            <div className="row-between mt">
              <button type="button" className="btn" disabled={step === 0} onClick={() => { setStep(step - 1); setError(null); }}><ArrowLeft size={15} /> {t("Back")}</button>
              <span className="muted small">{t("Step")} {step + 1} / {STEPS.length}</span>
              {step < 4
                ? <button type="button" className="btn btn-primary" onClick={next}>{t("Next")} <ArrowRight size={15} /></button>
                : <button type="button" className="btn btn-green" disabled={busy || !!pwProblem} onClick={submit}><Send size={15} /> {t("Submit application")}</button>}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
