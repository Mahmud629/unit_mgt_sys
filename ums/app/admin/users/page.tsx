"use client";

import { useMemo, useState } from "react";
import { Briefcase, KeyRound, Repeat, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Alert, Badge, Card, CompanySelect, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, SoldierPicker, Stat, Tabs, useAction, useAsync, useConfirm } from "@/components/ui";
import { listAppointmentHolders, listUsers, manageUsers } from "@/lib/api";
import { isDemo } from "@/lib/db";
import { ALL_ROLES, ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { ManagedUser, Role } from "@/lib/types";
import { fmtDateTime, soldierLabel } from "@/lib/utils";

const COY_ROLES: Role[] = ["coy_comd", "coy_rep"];

const APPOINTMENT_PRESETS: Array<{ title: string; role: Role; login: string }> = [
  { title: "Training Clerk", role: "clk", login: "trg-clk" },
  { title: "ORS Clerk", role: "clk", login: "ors-clk" },
  { title: "Orderly Room Clerk", role: "clk", login: "or-clk" },
  { title: "Bn Rep (BSM)", role: "bn_rep", login: "bn-rep" },
  { title: "Coy Rep", role: "coy_rep", login: "coy-rep" },
  { title: "Coy Comd", role: "coy_comd", login: "coy-comd" },
  { title: "Adjutant", role: "adjt", login: "adjt" },
  { title: "2IC", role: "2ic", login: "2ic" },
  { title: "CO", role: "co", login: "co" },
];

type Kind = "staff" | "soldier";

export default function UsersPage() {
  const { perms, profile, companyById, directory, directoryById } = useSession();
  const { t } = useI18n();
  const { data, error, loading, reload } = useAsync(listUsers, []);
  const [kind, setKind] = useState<Kind>(perms.isAdmin ? "staff" : "soldier");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [coy, setCoy] = useState("");
  const [create, setCreate] = useState<Kind | null>(null);
  const [bulk, setBulk] = useState(false);
  const [edit, setEdit] = useState<ManagedUser | null>(null);
  const [reset, setReset] = useState<ManagedUser | null>(null);
  const [handover, setHandover] = useState<ManagedUser | null>(null);
  const { run } = useAction();
  const confirm = useConfirm();

  const linked = useMemo(() => new Set((data ?? []).map((u) => u.soldierId).filter(Boolean)), [data]);
  const staff = (data ?? []).filter((u) => u.role !== "soldier");
  const soldiers = (data ?? []).filter((u) => u.role === "soldier");
  const rows = useMemo(() => (kind === "staff" ? staff : soldiers).filter((u) => (!role || u.role === role) && (!coy || u.companyId === coy) &&
    (!q || `${u.fullName} ${u.loginId} ${u.appointment ?? ""} ${u.heldBy ?? ""}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => ALL_ROLES.indexOf(a.role) - ALL_ROLES.indexOf(b.role) || String(a.fullName).localeCompare(String(b.fullName))), [kind, staff, soldiers, role, coy, q]);
  const without = directory.filter((s) => s.status === "Serving" && !linked.has(s.id) && perms.canCommandCompany(s.company_id));
  const holderLabel = (u: ManagedUser) => (u.heldBySoldier ? soldierLabel(directoryById.get(u.heldBySoldier)) : u.heldBy) || null;
  const coyCell = (u: ManagedUser) => (u.companyId ? companyById.get(u.companyId)?.short_name : ["soldier", "coy_comd", "coy_rep"].includes(u.role) ? "—" : "Unit");
  const status = (u: ManagedUser) => (!u.active ? <Badge tone="red">Disabled</Badge> : u.mustChangePassword ? <Badge tone="amber">Temp password</Badge> : <Badge tone="green">Active</Badge>);

  return (
    <div className="page">
      <PageHeader eyebrow="Administration" title="User Accounts"
        actions={<>
          <button className="btn" onClick={() => setBulk(true)}><Users size={15} /> Create soldier logins in bulk</button>
          {perms.isAdmin && <button className="btn" onClick={() => setCreate("staff")}><Briefcase size={15} /> New appointment login</button>}
          <button className="btn btn-primary" onClick={() => setCreate("soldier")}><UserPlus size={15} /> New individual login</button>
        </>} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="stats">
            <Stat label="Appointment logins" value={staff.length} tone="blue" onClick={() => setKind("staff")} />
            <Stat label="Individual logins" value={soldiers.length} tone="green" onClick={() => setKind("soldier")} />
            <Stat label="Serving without login" value={without.length} tone="amber" onClick={() => setBulk(true)} />
            <Stat label="Appointments without holder" value={staff.filter((u) => !holderLabel(u)).length} />
            <Stat label="Pending first login" value={data.filter((u) => u.mustChangePassword).length} />
          </div>
          <Alert tone="blue">
            <strong>{t("One soldier — one individual ID")}</strong>{" "}
            <span>{t("Each soldier signs in with his own Personal No and sees his own file. Staff duties (Training Clerk, ORS, Coy Rep, Bn Rep, Coy Comd …) use an appointment login that stays with the appointment — it has no personal file, only the name of the person now doing the duty. When the duty changes hands, press Hand over.")}</span>
          </Alert>
          <Tabs tabs={[{ key: "staff" as Kind, label: "Appointment logins", count: staff.length }, { key: "soldier" as Kind, label: "Individual logins", count: soldiers.length }]} value={kind} onChange={(k) => { setKind(k); setRole(""); }} />
          <div className="toolbar">
            <div className="search"><Search size={15} /><input className="input" placeholder={kind === "staff" ? "Search appointment, login or holder…" : "Search name or Personal No…"} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {kind === "staff" && <Select value={role} onChange={setRole} placeholder="All roles" options={ALL_ROLES.filter((r) => r !== "soldier").map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />}
            {perms.isSuper && <CompanySelect value={coy} onChange={setCoy} />}
          </div>
          <Card pad={false}>
            {rows.length === 0 ? <Empty>No accounts.</Empty> : kind === "staff" ? (
              <div className="table-wrap tall"><table className="table">
                <thead><tr><th>Appointment</th><th>Login ID</th><th>Role</th><th>Coy</th><th>Held by (now)</th><th>Status</th><th className="right">Actions</th></tr></thead>
                <tbody>{rows.map((u) => (
                  <tr key={u.id} className={!u.active ? "row-muted" : undefined}>
                    <td className="strong">{u.appointment ?? u.fullName}</td><td className="mono">{u.loginId}</td>
                    <td><Badge tone={u.role === "admin" ? "navy" : "blue"}>{ROLE_LABEL[u.role]}</Badge></td>
                    <td>{coyCell(u)}</td>
                    <td className="small">{holderLabel(u) ?? <span className="text-amber">no holder</span>}</td>
                    <td>{status(u)}</td>
                    <td className="right nowrap">
                      {perms.isAdmin && <button className="btn btn-xs btn-primary" onClick={() => setHandover(u)}><Repeat size={12} /> Hand over</button>}
                      {perms.isAdmin && u.id !== profile.id && <button className="btn btn-xs" onClick={() => setReset(u)}><KeyRound size={12} /> Reset</button>}
                      {perms.isAdmin && <button className="btn btn-xs btn-ghost" onClick={() => setEdit(u)}>Edit</button>}
                      {perms.isAdmin && u.id !== profile.id && <button className="btn btn-xs btn-ghost" title="Delete login" onClick={() => confirm(`Delete the login "${u.appointment ?? u.fullName}"? This cannot be undone.`) && run(async () => { await manageUsers({ action: "delete", userId: u.id }); reload(); }, "Account deleted")}><Trash2 size={12} /></button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            ) : (
              <div className="table-wrap tall"><table className="table">
                <thead><tr><th>Rank & Name</th><th>Login (Personal No)</th><th>Coy</th><th>Status</th><th className="right">Actions</th></tr></thead>
                <tbody>{rows.map((u) => {
                  const canReset = perms.isAdmin || perms.canCommandCompany(u.companyId);
                  return (
                    <tr key={u.id} className={!u.active ? "row-muted" : undefined}>
                      <td className="strong">{u.soldierId ? soldierLabel(directoryById.get(u.soldierId)) : u.fullName}</td><td className="mono">{u.loginId}</td>
                      <td>{coyCell(u)}</td><td>{status(u)}</td>
                      <td className="right nowrap">
                        {canReset && u.id !== profile.id && <button className="btn btn-xs" onClick={() => setReset(u)}><KeyRound size={12} /> Reset</button>}
                        {perms.isAdmin && <button className="btn btn-xs btn-ghost" onClick={() => setEdit(u)}>Edit</button>}
                        {perms.isAdmin && u.id !== profile.id && <button className="btn btn-xs btn-ghost" title="Delete login" onClick={() => confirm(`Delete the login of ${u.fullName}? The soldier record is kept.`) && run(async () => { await manageUsers({ action: "delete", userId: u.id }); reload(); }, "Account deleted")}><Trash2 size={12} /></button>}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}

      {create && <CreateModal kind={create} linked={linked} onClose={() => setCreate(null)} onDone={() => { setCreate(null); reload(); }} />}
      {bulk && <BulkModal without={without} onClose={() => setBulk(false)} onDone={() => reload()} />}
      {reset && <ResetModal user={reset} onClose={() => setReset(null)} />}
      {edit && <RoleModal user={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
      {handover && <HandoverModal user={handover} onClose={() => setHandover(null)} onDone={() => { setHandover(null); reload(); }} />}
    </div>
  );
}

/** Who holds the duty: pick a soldier (recommended) or type a name. */
function HolderField({ soldierId, name, onChange }: { soldierId: string | null; name: string; onChange: (soldierId: string | null, name: string) => void }) {
  return (
    <>
      <Field label="Held by (soldier)" wide hint="The person doing this duty now — only his name is kept with the appointment">
        <SoldierPicker value={soldierId} onChange={(id, s) => onChange(id, s ? `${s.rank} ${s.name}` : "")} />
      </Field>
      {!soldierId && <Field label="…or type a name" wide><input className="input" value={name} onChange={(e) => onChange(null, e.target.value)} placeholder="e.g. Cpl Rahim (attached)" /></Field>}
    </>
  );
}

function CreateModal({ kind, linked, onClose, onDone }: { kind: Kind; linked: Set<string | null>; onClose: () => void; onDone: () => void }) {
  const { perms, myCompanies, directoryById } = useSession();
  const [soldierId, setSoldierId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(kind === "staff" ? "clk" : "soldier");
  const [companyId, setCompanyId] = useState("");
  const [appointment, setAppointment] = useState("");
  const [loginId, setLoginId] = useState("");
  const [holder, setHolder] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const [password, setPassword] = useState("");
  const { busy, run } = useAction();
  const s = soldierId ? directoryById.get(soldierId) : null;
  const needsCoy = COY_ROLES.includes(role);
  const coyShort = myCompanies.find((c) => c.id === companyId)?.short_name;

  function preset(title: string) {
    const p = APPOINTMENT_PRESETS.find((x) => x.title === title);
    setAppointment(title);
    if (p) { setRole(p.role); setLoginId(p.login); }
  }
  async function submit() {
    await run(async () => {
      if (kind === "soldier") {
        await manageUsers({ action: "create", soldierId, role: "soldier", password });
      } else {
        const title = needsCoy && coyShort && !appointment.toLowerCase().includes(coyShort.toLowerCase()) ? `${coyShort} ${appointment}` : appointment;
        await manageUsers({ action: "create", role, companyId: needsCoy ? companyId : null, loginId, appointment: title, fullName: title, heldBy: holder.name || null, heldBySoldier: holder.id, password });
      }
      onDone();
    }, kind === "soldier" ? "Login created — give him his Personal No and the temporary password" : "Appointment login created");
  }
  const ok = password.length >= 8 && (kind === "soldier" ? !!soldierId : !!appointment.trim() && !!loginId.trim() && (!needsCoy || !!companyId));
  return (
    <Modal open onClose={onClose} title={kind === "soldier" ? "New individual login" : "New appointment login"}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !ok} onClick={submit}>Create</button></>}>
      {kind === "soldier" ? (
        <div className="form-grid">
          <Field label="Soldier" wide hint="His own Personal No becomes the login ID. One soldier — one individual ID.">
            <SoldierPicker value={soldierId} onChange={(id) => setSoldierId(id)} filter={(x) => !linked.has(x.id) && (perms.isAdmin || perms.canCommandCompany(x.company_id))} />
          </Field>
          <Field label="Temporary password" required hint="At least 8 characters. He must change it at first login."><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {s && <p className="small muted">He will sign in with Personal No <strong className="mono">{s.snk_no}</strong>.</p>}
        </div>
      ) : (
        <div className="form-grid">
          <Field label="Appointment" required wide hint="Pick one or type your own (e.g. MT Clerk, QM Clerk)">
            <input className="input" list="appt-presets" value={appointment} onChange={(e) => preset(e.target.value)} placeholder="e.g. Training Clerk" />
            <datalist id="appt-presets">{APPOINTMENT_PRESETS.map((p) => <option key={p.title} value={p.title} />)}</datalist>
          </Field>
          <Field label="Role (what it can do)" wide hint={ROLE_DESCRIPTION[role]}><Select value={role} onChange={(v) => setRole(v as Role)} options={ALL_ROLES.filter((r) => r !== "soldier").map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></Field>
          {needsCoy && <Field label="Company" required><Select value={companyId} onChange={(v) => { setCompanyId(v); const sh = myCompanies.find((c) => c.id === v)?.short_name?.toLowerCase().replace(/\s+/g, ""); if (sh && /^coy-/.test(loginId)) setLoginId(`${sh}-${loginId.slice(4)}`); }} placeholder="—" options={myCompanies.map((c) => ({ value: c.id, label: c.name }))} /></Field>}
          <Field label="Login ID" required hint="Short and fixed — it stays with the appointment"><input className="input mono" value={loginId} onChange={(e) => setLoginId(e.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="e.g. trg-clk" /></Field>
          <HolderField soldierId={holder.id} name={holder.name} onChange={(id, name) => setHolder({ id, name })} />
          <Field label="Temporary password" required hint="At least 8 characters. Must be changed at first login."><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}

function HandoverModal({ user, onClose, onDone }: { user: ManagedUser; onClose: () => void; onDone: () => void }) {
  const { directoryById } = useSession();
  const { data: history } = useAsync(() => listAppointmentHolders(user.id), [user.id]);
  const [holder, setHolder] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const [newPw, setNewPw] = useState("");
  const { busy, run } = useAction();
  const who = (h: { held_by: string | null; held_by_soldier: string | null }) => (h.held_by_soldier ? soldierLabel(directoryById.get(h.held_by_soldier)) : h.held_by) || "—";
  return (
    <Modal open onClose={onClose} title={`Hand over — ${user.appointment ?? user.fullName}`}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || (!holder.id && !holder.name.trim()) || (!!newPw && newPw.length < 8)}
        onClick={() => run(async () => {
          await manageUsers({ action: "update", userId: user.id, role: user.role, companyId: user.companyId, active: user.active, heldBy: holder.name || null, heldBySoldier: holder.id });
          if (newPw) await manageUsers({ action: "reset_password", userId: user.id, password: newPw });
          onDone();
        }, "Handed over")}><Repeat size={14} /> Hand over</button></>}>
      <p className="small">Now held by: <strong>{(user.heldBySoldier ? soldierLabel(directoryById.get(user.heldBySoldier)) : user.heldBy) || "nobody"}</strong></p>
      <div className="form-grid">
        <HolderField soldierId={holder.id} name={holder.name} onChange={(id, name) => setHolder({ id, name })} />
        <Field label="New temporary password" hint="Recommended — so the previous holder can no longer sign in. Leave empty to keep it.">
          <input className="input" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="min 8 characters" />
        </Field>
      </div>
      <h4 className="mt">Previous holders</h4>
      {!history ? <Loading /> : history.length === 0 ? <Empty>No record yet.</Empty> : (
        <div className="table-wrap" style={{ maxHeight: 220 }}><table className="table compact">
          <thead><tr><th>Held by</th><th>From</th><th>To</th></tr></thead>
          <tbody>{[...history].sort((a, b) => b.from_at.localeCompare(a.from_at)).map((h) => <tr key={h.id}><td>{who(h)}</td><td>{fmtDateTime(h.from_at)}</td><td>{h.to_at ? fmtDateTime(h.to_at) : <Badge tone="green">Now</Badge>}</td></tr>)}</tbody>
        </table></div>
      )}
    </Modal>
  );
}

function BulkModal({ without, onClose, onDone }: { without: Array<{ id: string; company_id: string; snk_no: string; rank: string; name: string }>; onClose: () => void; onDone: () => void }) {
  const { perms, myCompanies } = useSession();
  const [coy, setCoy] = useState(perms.isSuper ? "" : myCompanies[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [results, setResults] = useState<Array<{ loginId?: string; ok: boolean; error?: string }> | null>(null);
  const { busy, run } = useAction();
  const targets = without.filter((s) => !coy || s.company_id === coy);
  return (
    <Modal open onClose={onClose} title="Create logins for soldiers without an account"
      footer={results ? <button className="btn btn-primary" onClick={onClose}>Done</button> : <><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || password.length < 8 || !targets.length} onClick={() => run(async () => { const r = await manageUsers<{ results: Array<{ loginId?: string; ok: boolean; error?: string }> }>({ action: "bulk_create", soldierIds: targets.map((t) => t.id), password }); setResults(r.results); onDone(); }, "Accounts created")}>Create {targets.length} login(s)</button></>}>
      {!results ? <>
        <div className="form-grid">
          <Field label="Company"><Select value={coy} onChange={setCoy} placeholder={perms.isSuper ? "All companies" : undefined} options={myCompanies.filter((c) => perms.canCommandCompany(c.id)).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Common temporary password" hint="Everyone must change it at first login"><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters" /></Field>
        </div>
        <p className="small"><strong>{targets.length}</strong> serving soldier(s) have no login. Each will sign in with his own Personal No.</p>
        <div className="table-wrap" style={{ maxHeight: 220 }}><table className="table compact"><tbody>{targets.slice(0, 200).map((s) => <tr key={s.id}><td className="mono">{s.snk_no}</td><td>{s.rank} {s.name}</td></tr>)}</tbody></table></div>
      </> : <>
        <Alert tone="green">{results.filter((r) => r.ok).length} created, {results.filter((r) => !r.ok).length} failed.</Alert>
        <div className="table-wrap" style={{ maxHeight: 300 }}><table className="table compact"><tbody>{results.filter((r) => !r.ok).map((r, i) => <tr key={i}><td className="mono">{r.loginId}</td><td><Badge tone="red">{r.error}</Badge></td></tr>)}</tbody></table></div>
      </>}
    </Modal>
  );
}

function ResetModal({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.fullName}`}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || password.length < 8} onClick={() => run(async () => { await manageUsers({ action: "reset_password", userId: user.id, password }); onClose(); }, "Password reset — he must change it at next login")}>Reset</button></>}>
      <Field label="New temporary password" hint="At least 8 characters"><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></Field>
      <p className="small muted">Login ID: <span className="mono">{user.loginId}</span></p>
    </Modal>
  );
}

function RoleModal({ user, onClose, onDone }: { user: ManagedUser; onClose: () => void; onDone: () => void }) {
  const { companies } = useSession();
  const isStaff = user.role !== "soldier";
  const [role, setRole] = useState<Role>(user.role);
  const [companyId, setCompanyId] = useState(user.companyId ?? "");
  const [active, setActive] = useState(user.active);
  const [appointment, setAppointment] = useState(user.appointment ?? user.fullName ?? "");
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`Edit — ${user.appointment ?? user.fullName}`}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || (COY_ROLES.includes(role) && !companyId) || (isStaff && !appointment.trim())}
        onClick={() => run(async () => { await manageUsers({ action: "update", userId: user.id, role, companyId: companyId || null, active, ...(isStaff ? { appointment } : {}) }); onDone(); }, "Saved")}>Save</button></>}>
      <div className="form-grid">
        {isStaff && <Field label="Appointment" wide><input className="input" value={appointment} onChange={(e) => setAppointment(e.target.value)} /></Field>}
        {isStaff && <Field label="Role" wide hint={ROLE_DESCRIPTION[role]}><Select value={role} onChange={(v) => setRole(v as Role)} options={ALL_ROLES.filter((r) => r !== "soldier").map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></Field>}
        {(COY_ROLES.includes(role) || role === "soldier") && <Field label="Company"><Select value={companyId} onChange={setCompanyId} placeholder="—" options={companies.map((c) => ({ value: c.id, label: c.name }))} /></Field>}
        <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Account active</label>
      </div>
      {!isStaff && <p className="small muted mt">An individual login always stays with the soldier. To give him a staff duty, hand over an appointment login to him instead.</p>}
    </Modal>
  );
}
