"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Alert, Card, Field, PageHeader, useAction } from "@/components/ui";
import { changePassword } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { profile, reload } = useSession();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const { busy, run } = useAction();
  const weak = pw.length > 0 && (pw.length < 8 || !/\d/.test(pw) || !/[a-zA-Z]/.test(pw));

  async function submit() {
    if (pw !== pw2) return;
    const ok = await run(async () => {
      await changePassword(pw);
      await reload(["profile"]);
      return true;
    }, "Password changed");
    if (ok) router.replace("/dashboard");
  }

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <PageHeader eyebrow="Account" title="Change password" />
      {profile.must_change_password && <Alert tone="amber">This is your first sign-in (or your password was reset). Please set your own password to continue.</Alert>}
      <Card>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label="New password" hint="At least 8 characters, with letters and numbers.">
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Confirm new password">
            <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
          </Field>
          {weak && <span className="small" style={{ color: "var(--red)" }}>Use at least 8 characters including letters and numbers.</span>}
          {pw2 && pw !== pw2 && <span className="small" style={{ color: "var(--red)" }}>Passwords do not match.</span>}
          <div className="row">
            <button className="btn btn-primary" disabled={busy || weak || !pw || pw !== pw2}>
              <KeyRound size={15} /> Save password
            </button>
            {!profile.must_change_password && (
              <button type="button" className="btn" onClick={() => router.back()}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
