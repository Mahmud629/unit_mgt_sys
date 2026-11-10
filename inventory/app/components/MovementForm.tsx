"use client";

import { useState } from "react";
import { errorText, sendJson } from "@/lib/client";
import type { MsgKey } from "@/lib/i18n";
import { getBreakdown, getIssuedHolders, localDate, MOVE_FROM } from "@/lib/inventory";
import { STATUSES, type Item, type MovementType } from "@/lib/types";
import { useI18n } from "./I18nProvider";
import { Field, Modal } from "./ui";

type Props = {
  item: Item;
  type: MovementType;
  holders: string[]; // known holder names, for suggestions
  onDone: (item: Item) => void;
  onClose: () => void;
};

export default function MovementForm({ item, type, holders, onDone, onClose }: Props) {
  const { t, n, status } = useI18n();
  const from = MOVE_FROM[type];
  const label = (part: "button" | "title" | "note") => t(`mv_${type}_${part}` as MsgKey);
  const breakdown = getBreakdown(item.allocations);
  const issuedHolders = getIssuedHolders(item.allocations);

  const [qty, setQty] = useState(1);
  const [holder, setHolder] = useState("");
  const [date, setDate] = useState(localDate());
  const [voucherNo, setVoucherNo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const available =
    type === "Return" && holder
      ? issuedHolders.find((h) => h.holder === holder)?.qty || 0
      : breakdown[from];

  async function submit() {
    if (busy) return;

    if (!Number.isInteger(qty) || qty < 1) return setError(t("errQty"));
    if (qty > available) return setError(t("errOnly", { n: available }));
    if (type === "Issue" && !holder.trim()) return setError(t("errHolder"));

    setBusy(true);
    setError("");

    try {
      const updated = await sendJson<Item>(`/api/items/${item.id}/transaction`, "POST", {
        type,
        qty,
        issuedTo: holder.trim(),
        date,
        voucherNo,
        remarks,
      });
      onDone(updated);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      size="md"
      title={label("title")}
      subtitle={`${item.inventoryNo} — ${item.itemName}`}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          {error && <span className="form-error">{error}</span>}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className="btn" onClick={submit} disabled={busy || available === 0}>
            {busy ? t("saving") : t("confirmMove", { action: label("button") })}
          </button>
        </>
      }
    >
      <div className="chips chips-4">
        {STATUSES.map((s) => (
          <div className="chip" key={s} style={s === from ? { borderColor: "var(--sky)" } : undefined}>
            <span>{status(s)}</span>
            <b>{n(breakdown[s])}</b>
          </div>
        ))}
      </div>

      <p className="note" style={{ margin: "14px 0" }}>
        {label("note")}
      </p>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        {type === "Issue" && (
          <Field label={t("issuedTo")} required className="full" hint={t("issuedToHint")}>
            <input
              value={holder}
              onChange={(e) => {
                setHolder(e.target.value);
                setError("");
              }}
              list="holder-options"
              placeholder={t("issuedToPh")}
              autoFocus
            />
            <datalist id="holder-options">
              {holders.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </Field>
        )}

        {type === "Return" && (
          <Field label={t("returnedFrom")} className="full">
            <select
              value={holder}
              onChange={(e) => {
                setHolder(e.target.value);
                setError("");
              }}
              autoFocus
            >
              <option value="">{t("anyHolder", { n: breakdown.Issued })}</option>
              {issuedHolders.map((h) => (
                <option key={h.holder} value={h.holder}>
                  {t("holdsN", { holder: h.holder, n: h.qty })}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t("qtyMax", { n: available })} required>
          <div className="input-row">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={available}
              value={Number.isNaN(qty) ? "" : qty}
              onChange={(e) => {
                setQty(e.target.value === "" ? NaN : Number(e.target.value));
                setError("");
              }}
              autoFocus={type !== "Issue" && type !== "Return"}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQty(available);
                setError("");
              }}
              disabled={available === 0}
            >
              {t("all")}
            </button>
          </div>
        </Field>

        <Field label={t("date")}>
          <input type="date" value={date} max={localDate()} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label={t("voucherNoteNo")} className="full">
          <input
            value={voucherNo}
            onChange={(e) => setVoucherNo(e.target.value)}
            placeholder={t("voucherNotePh")}
          />
        </Field>

        <Field label={t("remarks")} className="full">
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={t("optional")} />
        </Field>

        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
