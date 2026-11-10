"use client";

/* eslint-disable @next/next/no-img-element -- uploaded files and local previews */

import { useEffect, useMemo, useState } from "react";
import { errorText, sendJson, uploadFile } from "@/lib/client";
import { localDate, nextInventoryNo } from "@/lib/inventory";
import {
  CATEGORIES,
  CONDITIONS,
  STATUSES,
  emptyForm,
  type FormState,
  type Item,
} from "@/lib/types";
import { useI18n } from "./I18nProvider";
import { Field, Modal } from "./ui";

type FileKey = "voucher" | "notesheet" | "photo";
type Errors = Partial<Record<keyof FormState | FileKey, string>>;

type Props = {
  item?: Item | null; // editing when set
  items: Item[];
  onSaved: (item: Item, created: boolean) => void;
  onClose: () => void;
};

function toForm(item: Item): FormState {
  return {
    inventoryNo: item.inventoryNo,
    itemName: item.itemName,
    category: item.category,
    quantity: item.quantity,
    buyDate: item.buyDate,
    voucherNo: item.voucherNo,
    voucherUrl: item.voucherUrl,
    notesheetUrl: item.notesheetUrl,
    productPhotoUrl: item.productPhotoUrl,
    location: item.location,
    cost: item.cost,
    condition: item.condition,
    status: item.status,
    issuedTo: item.issuedTo,
    issueDate: item.issueDate,
    remarks: item.remarks,
  };
}

// Shows the chosen image (or the current one) next to a file input.
function FilePicker({
  file,
  currentUrl,
  accept,
  onChange,
}: {
  file: File | null;
  currentUrl: string;
  accept: string;
  onChange: (file: File | null) => void;
}) {
  const { t, n } = useI18n();
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    // Revoked below when the file changes or the form closes.
    queueMicrotask(() => setPreview(url));
    return () => {
      URL.revokeObjectURL(url);
      setPreview("");
    };
  }, [file]);

  const isImage = /\.(jpe?g|png|webp)$/i.test(currentUrl);

  return (
    <>
      <input type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0] || null)} />
      {file ? (
        <div className="file-field">
          {preview && <img src={preview} alt="" />}
          <span>
            {t("newFile")} <b>{file.name}</b> ({n(Math.ceil(file.size / 1024))} KB)
          </span>
        </div>
      ) : currentUrl ? (
        <div className="file-field">
          {isImage && <img src={currentUrl} alt="" />}
          <span>
            {t("currentKept")}{" "}
            <a href={currentUrl} target="_blank" rel="noopener noreferrer">
              {t("open")}
            </a>
          </span>
        </div>
      ) : null}
    </>
  );
}

export default function ItemForm({ item, items, onSaved, onClose }: Props) {
  const { t, status: statusText, condition: conditionText, category: categoryText } = useI18n();
  const editing = Boolean(item);
  const [form, setForm] = useState<FormState>(() =>
    item ? toForm(item) : { ...emptyForm, buyDate: localDate() }
  );
  const [files, setFiles] = useState<Record<FileKey, File | null>>({
    voucher: null,
    notesheet: null,
    photo: null,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  const nextNo = useMemo(() => nextInventoryNo(items.map((i) => i.inventoryNo)), [items]);

  const locations = useMemo(
    () => [...new Set(items.map((i) => i.location).filter(Boolean))].sort(),
    [items]
  );

  const categories = useMemo(() => {
    const extra = items.map((i) => i.category).filter((c) => !CATEGORIES.includes(c as never));
    return [...CATEGORIES, ...new Set(extra)];
  }, [items]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function setFile(key: FileKey, file: File | null) {
    setFiles((f) => ({ ...f, [key]: file }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!form.itemName.trim()) e.itemName = t("errItemName");
    if (!Number.isInteger(form.quantity) || form.quantity < 1) e.quantity = t("errQtyWhole");
    if (!form.buyDate) e.buyDate = t("errBuyDate");
    if (Number.isNaN(form.cost) || form.cost < 0) e.cost = t("errCost");
    if (!form.voucherNo.trim()) e.voucherNo = t("errVoucherNo");
    if (!form.voucherUrl && !files.voucher) e.voucher = t("errVoucherFile");
    if (!editing && form.status === "Issued" && !form.issuedTo.trim()) {
      e.issuedTo = t("errIssuedTo");
    }
    return e;
  }

  async function save() {
    if (busy) return;

    const found = validate();
    setErrors(found);
    setServerError("");

    if (Object.keys(found).length > 0) {
      // Bring the first problem into view.
      requestAnimationFrame(() =>
        document.querySelector(".modal .field.invalid")?.scrollIntoView({ block: "center", behavior: "smooth" })
      );
      return;
    }

    setBusy(true);

    try {
      const [voucherUrl, notesheetUrl, productPhotoUrl] = await Promise.all([
        uploadFile(files.voucher, form.voucherUrl),
        uploadFile(files.notesheet, form.notesheetUrl),
        uploadFile(files.photo, form.productPhotoUrl),
      ]);

      const payload = { ...form, voucherUrl, notesheetUrl, productPhotoUrl };
      const saved = item
        ? await sendJson<Item>(`/api/items/${item.id}`, "PUT", payload)
        : await sendJson<Item>("/api/items", "POST", payload);

      onSaved(saved, !item);
    } catch (err) {
      setServerError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      size="lg"
      title={editing ? t("editItem") : t("addNewItem")}
      subtitle={
        editing ? (
          <>
            {item!.inventoryNo} — {item!.itemName}
          </>
        ) : (
          <>
            {t("willBeSaved")} <b>{nextNo}</b>
          </>
        )
      }
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          {serverError && <span className="form-error">{serverError}</span>}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? t("saving") : editing ? t("saveChanges") : t("saveItem")}
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <div className="form-section">{t("secItem")}</div>

        <Field label={t("itemName")} required error={errors.itemName}>
          <input
            value={form.itemName}
            onChange={(e) => set("itemName", e.target.value)}
            placeholder={t("itemNamePh")}
            maxLength={200}
            autoFocus
          />
        </Field>

        <Field label={t("category")} required>
          <select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryText(c)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t("quantity")}
          required
          error={errors.quantity}
          hint={editing ? t("qtyEditHint") : undefined}
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={Number.isNaN(form.quantity) ? "" : form.quantity}
            onChange={(e) => set("quantity", e.target.value === "" ? NaN : Number(e.target.value))}
          />
        </Field>

        <Field label={t("condition")} required>
          <select
            value={form.condition}
            onChange={(e) => set("condition", e.target.value as FormState["condition"])}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {conditionText(c)}
              </option>
            ))}
          </select>
        </Field>

        <div className="form-section">{t("secPurchase")}</div>

        <Field label={t("buyDate")} required error={errors.buyDate}>
          <input
            type="date"
            value={form.buyDate}
            max={localDate()}
            onChange={(e) => set("buyDate", e.target.value)}
          />
        </Field>

        <Field label={t("cost")} required error={errors.cost}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={Number.isNaN(form.cost) ? "" : form.cost}
            onChange={(e) => set("cost", e.target.value === "" ? NaN : Number(e.target.value))}
          />
        </Field>

        <Field label={t("voucherNo")} required error={errors.voucherNo}>
          <input
            value={form.voucherNo}
            onChange={(e) => set("voucherNo", e.target.value)}
            placeholder={t("voucherNoPh")}
          />
        </Field>

        <Field label={t("location")}>
          <input
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder={t("locationPh")}
            list="location-options"
          />
          <datalist id="location-options">
            {locations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>

        {!editing && (
          <>
            <div className="form-section">{t("secInitial")}</div>

            <Field label={t("status")} required>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as FormState["status"])}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusText(s)}
                  </option>
                ))}
              </select>
            </Field>

            {form.status === "Issued" ? (
              <>
                <Field label={t("issuedTo")} required error={errors.issuedTo}>
                  <input
                    value={form.issuedTo}
                    onChange={(e) => set("issuedTo", e.target.value)}
                    placeholder={t("issuedToHint")}
                  />
                </Field>
                <Field label={t("issueDate")}>
                  <input
                    type="date"
                    value={form.issueDate}
                    max={localDate()}
                    onChange={(e) => set("issueDate", e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <p className="field-hint" style={{ alignSelf: "center" }}>
                {t("initialHint")}
              </p>
            )}
          </>
        )}

        <div className="form-section">{t("secDocs")}</div>

        <Field label={t("voucherFile")} required error={errors.voucher} className="full">
          <FilePicker
            file={files.voucher}
            currentUrl={form.voucherUrl}
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(f) => setFile("voucher", f)}
          />
        </Field>

        <Field label={t("notesheet")} className="full">
          <FilePicker
            file={files.notesheet}
            currentUrl={form.notesheetUrl}
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(f) => setFile("notesheet", f)}
          />
        </Field>

        <Field label={t("productPhoto")} className="full" hint={t("photoHint")}>
          <FilePicker
            file={files.photo}
            currentUrl={form.productPhotoUrl}
            accept=".jpg,.jpeg,.png,.webp"
            onChange={(f) => setFile("photo", f)}
          />
        </Field>

        <Field label={t("remarks")} className="full">
          <textarea
            value={form.remarks}
            onChange={(e) => set("remarks", e.target.value)}
            placeholder={t("remarksPh")}
          />
        </Field>

        {/* Lets Enter submit from single-line inputs. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
