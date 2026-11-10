"use client";

import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { ProfileFields, RecordsEditor, cleanRecords, requiredKeys, setProfileValue, type DraftRecord, type ProfileValues } from "@/components/profile-form";
import { Alert, Card, Empty, ErrorBox, Loading, PageHeader, useAction, useAsync } from "@/components/ui";
import { completeMyProfile, getSoldier, listRecords } from "@/lib/api";
import { SOLDIER_FIELD_GROUPS, missingProfileFields } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

/** First login: the soldier must fill every empty personal-info field before using the system. */
export default function CompleteProfilePage() {
  const { profile, myCompanies, settings } = useSession();
  const { t } = useI18n();
  const { busy, run } = useAction();
  const sid = profile.soldier_id;
  const { data, error, loading } = useAsync(async () => (sid ? { s: await getSoldier(sid), recs: await listRecords(sid) } : null), [sid]);
  const [v, setV] = useState<ProfileValues>({});
  const [records, setRecords] = useState<DraftRecord[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const missing = useMemo(() => missingProfileFields(data?.s as unknown as Record<string, unknown>), [data]);
  const hasFamily = !!data?.recs.some((r) => r.kind === "family");
  const hasEducation = !!data?.recs.some((r) => r.kind === "education");

  useEffect(() => {
    if (!data?.s) return;
    setV({ marital_status: data.s.marital_status ?? "", category: data.s.category });
    setRecords([...(hasFamily ? [] : [{ kind: "family" as const, data: { relation: "Father" } }]), ...(hasEducation ? [] : [{ kind: "education" as const, data: {} }])]);
  }, [data, hasFamily, hasEducation]);

  if (!sid) return <div className="page"><Empty>{t("Your login is not yet linked to a soldier record. Please contact the Orderly Room.")}</Empty></div>;
  if (loading || !data) return <div className="page"><Loading /><ErrorBox error={error} /></div>;

  // Spouse details become required as soon as he selects "Married" here.
  const keys = [...new Set([...missing, ...(v.marital_status === "Married" ? missingProfileFields({ ...(data.s as unknown as Record<string, unknown>), ...v }).filter((k) => k === "spouse_name" || k === "date_of_marriage") : [])])];
  const groups = SOLDIER_FIELD_GROUPS.map((g) => ({ title: g.title, keys: g.fields.map((f) => f.key).filter((k) => keys.includes(k)) })).filter((g) => g.keys.length);
  const required = requiredKeys(v);
  const stillEmpty = keys.filter((k) => !String(v[k] ?? "").trim());

  async function save() {
    if (stillEmpty.length) { setShowErrors(true); return; }
    const ok = await run(async () => {
      await completeMyProfile(Object.fromEntries(keys.map((k) => [k, v[k]]).concat(v.home_division ? [["home_division", v.home_division]] : [])), cleanRecords(records));
      return true;
    }, "Profile completed — thank you");
    if (ok) window.location.replace("/dashboard");
  }

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <PageHeader eyebrow="First login" title="Complete your personal information" subtitle={`${data.s?.rank} ${data.s?.name} · ${data.s?.snk_no} · ${myCompanies.find((c) => c.id === data.s?.company_id)?.name ?? settings.unit.short}`} />
      {keys.length === 0 ? (
        <Alert tone="green">{t("Your personal information is complete.")} <a className="btn btn-sm" href="/dashboard">{t("Continue")}</a></Alert>
      ) : (
        <>
          <Alert tone="amber">{t("Fill in the missing information to continue.")} ({keys.length})</Alert>
          <Card>
            {groups.map((g) => (
              <div className="form-section" key={g.title}>
                <h3>{t(g.title)}</h3>
                <ProfileFields keys={g.keys} values={v} options={{ companies: myCompanies, ranks: settings.ranks, trades: settings.trades, appointments: settings.officer_appointments }} required={required} showErrors={showErrors}
                  onChange={(k, x) => setV((cur) => setProfileValue(cur, k, x))} />
              </div>
            ))}
            {(!hasFamily || !hasEducation) && (
              <div className="form-section">
                <h3>{t("Family & education")}</h3>
                <div className="grid grid-2">
                  {!hasFamily && <RecordsEditor kind="family" records={records} onChange={setRecords} />}
                  {!hasEducation && <RecordsEditor kind="education" records={records} onChange={setRecords} />}
                </div>
              </div>
            )}
            {showErrors && stillEmpty.length > 0 && <Alert tone="amber">{t("Please fill in every field marked Required.")} ({stillEmpty.length})</Alert>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-primary" style={{ height: 42 }} disabled={busy} onClick={save}><Save size={15} /> {t("Save and continue")}</button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
