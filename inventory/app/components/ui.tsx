"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ToastState } from "@/lib/client";
import { useI18n } from "./I18nProvider";

/* ---------- Modal ---------- */

// Open modals, newest last. Escape closes only the top one.
const openModals: string[] = [];

type ModalProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
};

export function Modal({ title, subtitle, onClose, size = "md", footer, toolbar, children }: ModalProps) {
  const { t } = useI18n();
  const id = useId();
  const closeRef = useRef(onClose);
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    openModals.push(id);
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openModals[openModals.length - 1] === id) {
        e.preventDefault();
        closeRef.current();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      openModals.splice(openModals.indexOf(id), 1);
      if (openModals.length === 0) document.body.style.overflow = "";
    };
  }, [id]);

  if (typeof document === "undefined") return null;

  // Rendered at the end of <body> so no page layout can clip or cover it.
  return createPortal(
    <div
      className="modal-backdrop"
      // Close only when the click starts and ends on the backdrop, so
      // selecting text inside the dialog never closes it.
      onMouseDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="modal-header">
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>

        {toolbar && <div className="action-bar">{toolbar}</div>}

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ---------- Confirm ---------- */

type ConfirmProps = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : ""}`}
            onClick={confirm}
            disabled={busy}
            autoFocus
          >
            {busy ? t("pleaseWait") : confirmLabel}
          </button>
        </>
      }
    >
      <div>{message}</div>
    </Modal>
  );
}

/* ---------- Toast ---------- */

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast || typeof document === "undefined") return null;

  return createPortal(
    <div className={`toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
      <span>{toast.text}</span>
      {toast.action && (
        <Link href={toast.action.href} target="_blank" rel="noopener">
          {toast.action.label} →
        </Link>
      )}
    </div>,
    document.body
  );
}

/* ---------- Form field ---------- */

type FieldProps = {
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Field({ label, required, error, hint, className = "", children }: FieldProps) {
  return (
    <label className={`field ${error ? "invalid" : ""} ${className}`}>
      <span>
        {label} {required && <i className="req">*</i>}
      </span>
      {children}
      {error ? <small className="field-error">{error}</small> : hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}
