"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, Search, X } from "lucide-react";
import type { DirectoryEntry } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { cls, errorMessage } from "@/lib/utils";

// ------------------------------------------------------------ layout
const tr = (t: (s: string) => string, v: ReactNode) => (typeof v === "string" ? t(v) : v);

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{t(eyebrow)}</div>}
        <h1>{t(title)}</h1>
        {subtitle && <p>{tr(t, subtitle)}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  const { t } = useI18n();
  title = tr(t, title);
  return (
    <section className={cls("card", className)}>
      {(title || actions) && (
        <div className="card-head">
          <h2>{title}</h2>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className={pad ? "card-body" : undefined}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string; onClick?: () => void }) {
  const { t } = useI18n();
  label = t(label);
  sub = tr(t, sub);
  return (
    <button type="button" className={cls("stat", tone && `tone-${tone}`, onClick && "clickable")} onClick={onClick} disabled={!onClick}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </button>
  );
}

export function Badge({ tone = "grey", children }: { tone?: string; children: ReactNode }) {
  const { t } = useI18n();
  return <span className={`badge badge-${tone}`}>{tr(t, children)}</span>;
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  const { t } = useI18n();
  children = tr(t, children);
  return (
    <div className="empty">
      {icon}
      <span>{children}</span>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  const { t } = useI18n();
  label = t(label);
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading-head"><span className="loading-ring" /><span>{label}</span></div>
      <div className="skeleton"><i /><i /><i /></div>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="alert alert-red">
      <AlertTriangle size={16} />
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Alert({ tone = "blue", children }: { tone?: "blue" | "amber" | "red" | "green"; children: ReactNode }) {
  const Icon = tone === "green" ? CheckCircle2 : tone === "blue" ? Info : AlertTriangle;
  return (
    <div className={`alert alert-${tone}`}>
      <Icon size={16} />
      <div>{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ key: T; label: ReactNode; count?: number }>; value: T; onChange: (k: T) => void }) {
  const { t } = useI18n();
  tabs = tabs.map((x) => ({ ...x, label: tr(t, x.label) }));
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={cls("tab", value === t.key && "active")} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- modal
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  title = tr(t, title);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cls("modal", wide && "modal-wide")} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- forms
export function Field({ label, hint, children, wide, required }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean; required?: boolean }) {
  const { t } = useI18n();
  label = t(label);
  hint = tr(t, hint);
  return (
    <label className={cls("field", wide && "field-wide")}>
      <span className="field-label">
        {label}
        {required && <em> *</em>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Select({ value, onChange, options, placeholder, disabled, className }: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: ReadonlyArray<string | { value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <select className={cls("input", className)} value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {placeholder !== undefined && <option value="">{t(placeholder)}</option>}
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = t(typeof o === "string" ? o : o.label);
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

export function CompanySelect({ value, onChange, placeholder = "All companies", onlyEditable, disabled }: { value: string | null | undefined; onChange: (v: string) => void; placeholder?: string | undefined; onlyEditable?: boolean; disabled?: boolean }) {
  const { myCompanies, perms } = useSession();
  const list = onlyEditable ? myCompanies.filter((c) => perms.canEditCompany(c.id)) : myCompanies;
  return <Select value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} options={list.map((c) => ({ value: c.id, label: c.name }))} />;
}

// --------------------------------------------------- soldier picker
export function SoldierPicker({ value, onChange, companyId, placeholder = "Search by No, rank or name…", filter, autoFocus }: {
  value: string | null;
  onChange: (id: string | null, s: DirectoryEntry | null) => void;
  companyId?: string | null;
  placeholder?: string;
  filter?: (s: DirectoryEntry) => boolean;
  autoFocus?: boolean;
}) {
  const { directory, directoryById, companyById, perms } = useSession();
  const { t, nameOf } = useI18n();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const selected = value ? directoryById.get(value) ?? null : null;

  useEffect(() => {
    const h = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return directory
      .filter((s) => s.status === "Serving")
      .filter((s) => (companyId ? s.company_id === companyId : perms.isSoldier || perms.canViewCompany(s.company_id)))
      .filter((s) => (filter ? filter(s) : true))
      .filter((s) => !term || `${s.snk_no} ${s.rank} ${s.name} ${s.name_bn ?? ""} ${s.trade ?? ""}`.toLowerCase().includes(term))
      .slice(0, 40);
  }, [q, directory, companyId, filter, perms]);

  return (
    <div className="picker" ref={wrap}>
      {selected && !open ? (
        <button type="button" className="input picker-selected" onClick={() => { setOpen(true); setQ(""); }}>
          <span>
            <strong>{selected.snk_no}</strong> {selected.rank} {nameOf(selected)}
          </span>
          <small>{companyById.get(selected.company_id)?.short_name}</small>
        </button>
      ) : (
        <div className="picker-input">
          <Search size={15} />
          <input className="input" autoFocus={autoFocus || open} value={q} placeholder={t(placeholder)} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
        </div>
      )}
      {open && (
        <div className="picker-menu">
          {results.length === 0 && <div className="picker-empty">No match</div>}
          {results.map((s) => (
            <button type="button" key={s.id} className="picker-item" onClick={() => { onChange(s.id, s); setOpen(false); setQ(""); }}>
              <span>
                <strong>{s.snk_no}</strong> {s.rank} {nameOf(s)}
              </span>
              <small>
                {companyById.get(s.company_id)?.short_name} · {s.trade ?? s.category}
              </small>
            </button>
          ))}
          {value && (
            <button type="button" className="picker-item picker-clear" onClick={() => { onChange(null, null); setOpen(false); }}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- toast
type ToastAction = { label: string; run: () => void | Promise<void> };
type Toast = { id: number; tone: "green" | "red" | "blue"; text: string; action?: ToastAction; ms?: number };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"], action?: ToastAction, ms?: number) => void>(() => undefined);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { t } = useI18n();
  const drop = useCallback((id: number) => setToasts((x) => x.filter((y) => y.id !== id)), []);
  const push = useCallback((text: string, tone: Toast["tone"] = "green", action?: ToastAction, ms?: number) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-3), { id, tone, text, action, ms }]);
    setTimeout(() => drop(id), ms ?? (tone === "red" ? 6000 : 3200));
  }, [drop]);
  useEffect(() => {
    const onFail = () => push(t("This browser could not save the demo data. Use Chrome / Edge / Firefox in a normal (not private) window."), "red", undefined, 10000);
    window.addEventListener("ums-demo-save-failed", onFail);
    return () => window.removeEventListener("ums-demo-save-failed", onFail);
  }, [push, t]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((x) => (
          <div key={x.id} className={`toast toast-${x.tone}${x.action ? " has-action" : ""}`}>
            {x.tone === "red" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span className="toast-text">{x.text}</span>
            {x.action && <button className="toast-action" onClick={() => { drop(x.id); void x.action!.run(); }}>{t(x.action.label)}</button>}
            {x.action && <i className="toast-timer" style={{ animationDuration: `${x.ms ?? 8000}ms` }} />}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/**
 * Do it now, offer Undo for a few seconds — instead of asking "Are you sure?".
 *   undoable({ text: "Duty removed", act: () => deleteDuty(id), undo: () => restoreRow("duty_roster", row), after: reload })
 */
export function useUndo() {
  const push = useContext(ToastCtx);
  const { t } = useI18n();
  return useCallback(async (o: { text: string; act: () => Promise<unknown>; undo: () => Promise<unknown>; after?: () => unknown }) => {
    try {
      await o.act();
      await o.after?.();
      push(t(o.text), "green", {
        label: "Undo",
        run: async () => {
          try { await o.undo(); await o.after?.(); push(t("Undone"), "blue"); } catch (e) { push(errorMessage(e), "red"); }
        },
      }, 8000);
    } catch (e) {
      push(errorMessage(e), "red");
    }
  }, [push, t]);
}

export function useToast() {
  const push = useContext(ToastCtx);
  return useMemo(
    () => ({
      ok: (t: string) => push(t, "green"),
      info: (t: string) => push(t, "blue"),
      error: (e: unknown) => push(errorMessage(e), "red"),
    }),
    [push],
  );
}

// ------------------------------------------------------------- hooks
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fnRef.current()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Wraps an async action with busy state + toast on error. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await fn();
        if (success) toast.ok(success);
        return r;
      } catch (e) {
        toast.error(e);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, run };
}

export function useConfirm() {
  return useCallback((message: string) => (typeof window === "undefined" ? false : window.confirm(message)), []);
}
