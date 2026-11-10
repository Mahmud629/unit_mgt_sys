"use client";

/* eslint-disable @next/next/no-img-element -- uploaded files are served by
   our own route and already compressed on upload. */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useDeferredValue, useMemo, useState } from "react";
import { useI18n } from "@/app/components/I18nProvider";
import ItemDetail from "@/app/components/ItemDetail";
import ItemForm from "@/app/components/ItemForm";
import MovementForm from "@/app/components/MovementForm";
import { ConfirmDialog, Modal, Toast } from "@/app/components/ui";
import { api, errorText, useToast } from "@/lib/client";
import type { MsgKey } from "@/lib/i18n";
import {
  badgeClass,
  getBreakdown,
  getIssuedHolders,
  isImageFile,
  localDate,
  searchText,
} from "@/lib/inventory";
import { useItems } from "@/lib/useItems";
import { CATEGORIES, STATUSES, type MovementType, type Status } from "@/lib/types";

type Preview = { title: string; url: string };

const statusKey = (s: string) => s.replace(/\s+/g, "");

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function InventoryRegister() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { t, n, status: statusText, condition: conditionText, category: categoryText, locale } = useI18n();
  const { items, loading, error, upsert, remove } = useItems();
  const [toast, showToast] = useToast();

  const [search, setSearch] = useState(() => params.get("q") || "");
  const [category, setCategory] = useState(() => params.get("category") || "");
  const [status, setStatus] = useState(() => params.get("status") || "");
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("item"));
  const [editing, setEditing] = useState(false);
  const [movement, setMovement] = useState<MovementType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  // "Add Item" links (header, dashboard) open the form with ?new=1.
  const adding = params.has("new");

  const updateUrl = useCallback(
    (change: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      change(next);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  // Typing stays smooth; filtering catches up a moment later.
  const deferredSearch = useDeferredValue(search);

  // Search also matches the translated labels (e.g. "আসবাবপত্র" finds Furniture).
  const rows = useMemo(
    () =>
      items.map((item) => ({
        item,
        b: getBreakdown(item.allocations),
        text: `${searchText(item)} ${categoryText(item.category)} ${statusText(item.status)} ${conditionText(
          item.condition
        )}`.toLowerCase(),
      })),
    [items, categoryText, statusText, conditionText]
  );

  const filtered = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    return rows.filter(
      (r) =>
        (!category || r.item.category === category) &&
        (!status || r.b[status as Status] > 0) &&
        (!q || r.text.includes(q))
    );
  }, [rows, deferredSearch, category, status]);

  const categories = useMemo(() => {
    const extra = items.map((i) => i.category).filter((c) => !CATEGORIES.includes(c as never));
    return [...CATEGORIES, ...new Set(extra)];
  }, [items]);

  // Names used before, offered as suggestions when issuing.
  const holders = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      for (const h of getIssuedHolders(item.allocations)) names.add(h.holder);
      for (const tx of item.transactions) if (tx.type === "Issue" && tx.issuedTo) names.add(tx.issuedTo);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const selected = items.find((i) => i.id === selectedId) || null;
  const filtersOn = Boolean(search || category || status);

  function movementMessage(type: MovementType, qty: number, holder: string) {
    if (type === "Return") return holder ? t("msg_ReturnFrom", { qty, holder }) : t("msg_Return", { qty });
    return t(`msg_${type}` as MsgKey, { qty, holder });
  }

  function openItem(id: string) {
    setSelectedId(id);
  }

  function closeItem() {
    setSelectedId(null);
    if (params.has("item")) updateUrl((p) => p.delete("item"));
  }

  function closeAdd() {
    updateUrl((p) => p.delete("new"));
  }

  function clearFilters() {
    setSearch("");
    setCategory("");
    setStatus("");
  }

  async function deleteSelected() {
    if (!selected) return;
    try {
      await api(`/api/items/${selected.id}`, { method: "DELETE" });
      remove(selected.id);
      setConfirmDelete(false);
      closeItem();
      showToast(t("deleted", { no: selected.inventoryNo }));
    } catch (err) {
      showToast(errorText(err), { kind: "error" });
    }
  }

  function openPreview(title: string, url: string) {
    if (url) setPreview({ title, url });
  }

  function exportCSV() {
    const header = (
      [
        "colInvNo", "colItem", "colCategory", "colTotal", "colInStore", "colIssued", "colRepair",
        "colDamaged", "colHeldBy", "colVoucherNo", "colBuyDate", "colCost", "colLocation",
        "colCondition", "colStatus", "colRemarks",
      ] as MsgKey[]
    ).map((k) => t(k));

    // Numbers stay as plain digits so Excel can add them up.
    const lines = filtered.map(({ item: x, b }) => [
      x.inventoryNo, x.itemName, categoryText(x.category), x.quantity, b["In Store"], b.Issued, b.Repair,
      b.Damaged, getIssuedHolders(x.allocations).map((h) => `${h.holder} (${h.qty})`).join("; "),
      x.voucherNo, x.buyDate, x.cost, x.location, conditionText(x.condition), statusText(x.status), x.remarks,
    ]);

    // The BOM makes Excel read Bangla text and ৳ correctly.
    const csv = "﻿" + [header, ...lines].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("csvFile")}-${localDate()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const filterSummary = [
    category && t("filterCategory", { v: categoryText(category) }),
    status && t("filterStatus", { v: statusText(status) }),
    search && t("filterSearch", { v: search }),
  ]
    .filter(Boolean)
    .join(" · ");

  const pieces = filtered.reduce((s, r) => s + r.item.quantity, 0);

  return (
    <div className="page">
      <div className="page-head no-print">
        <div>
          <div className="eyebrow">{t("eyebrowInv")}</div>
          <h2>{t("regTitle")}</h2>
          <p>{t("regSub")}</p>
        </div>
        <Link className="btn btn-primary" href="/inventory?new=1" replace scroll={false}>
          {t("addItem")}
        </Link>
      </div>

      <div className="print-only print-title">
        <img src="/logo-mark.png" alt="" className="print-logo" />
        <h1>{t("printTitle")}</h1>
        <p suppressHydrationWarning>
          {t("printed", { date: new Date().toLocaleString(locale), n: filtered.length })}
          {filterSummary ? ` · ${filterSummary}` : ""}
        </p>
      </div>

      <section className="card">
        <div className="toolbar">
          <input
            className="search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPh")}
            aria-label={t("search")}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("colCategory")}>
            <option value="">{t("allCategories")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryText(c)}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("colStatus")}>
            <option value="">{t("anyStatus")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`has_${statusKey(s)}` as MsgKey)}
              </option>
            ))}
          </select>
          {filtersOn && (
            <button type="button" className="btn btn-ghost" onClick={clearFilters}>
              {t("clear")}
            </button>
          )}
          <div className="toolbar-end">
            <button type="button" className="btn btn-ghost" onClick={() => window.print()} disabled={!filtered.length}>
              {t("print")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={exportCSV} disabled={!filtered.length}>
              {t("exportCsv")}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table-register">
            <thead>
              <tr>
                <th className="num">{t("colSer")}</th>
                <th>{t("colItem")}</th>
                <th>{t("colCategory")}</th>
                <th className="num">{t("colTotal")}</th>
                <th className="num">{t("colInStore")}</th>
                <th className="num">{t("colIssued")}</th>
                <th className="num">{t("colRepair")}</th>
                <th className="num">{t("colDamaged")}</th>
                <th>{t("colStatus")}</th>
                <th>{t("colHeldBy")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ item, b }, index) => (
                <tr key={item.id} className="clickable" onClick={() => openItem(item.id)}>
                  <td className="num hide-sm">{n(index + 1)}</td>
                  <td className="cell-main">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {item.productPhotoUrl ? (
                        <img
                          src={item.productPhotoUrl}
                          alt=""
                          className="thumb no-print"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="thumb thumb-empty no-print">—</span>
                      )}
                      <div>
                        <div style={{ fontWeight: 800 }}>{item.itemName}</div>
                        <a
                          href={`?item=${item.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openItem(item.id);
                          }}
                          className="nowrap"
                        >
                          {item.inventoryNo}
                        </a>
                      </div>
                    </div>
                  </td>
                  <td data-label={t("colCategory")}>{categoryText(item.category)}</td>
                  <td data-label={t("colTotal")} className="num">{n(item.quantity)}</td>
                  {[b["In Store"], b.Issued, b.Repair, b.Damaged].map((v, i) => (
                    <td
                      key={i}
                      data-label={t((["colInStore", "colIssued", "colRepair", "colDamaged"] as MsgKey[])[i])}
                      className={`num ${v ? "" : "zero"}`}
                    >
                      {n(v)}
                    </td>
                  ))}
                  <td data-label={t("colStatus")}>
                    <span className={badgeClass(item.status)}>{statusText(item.status)}</span>
                  </td>
                  <td data-label={t("colHeldBy")} className="wrap">
                    {item.issuedTo || <span className="muted">—</span>}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty">
                    {loading ? (
                      t("loading")
                    ) : error ? (
                      error
                    ) : items.length === 0 ? (
                      <>
                        {t("noItems")}{" "}
                        <Link href="/inventory?new=1" replace scroll={false}>
                          {t("addFirst")}
                        </Link>
                      </>
                    ) : (
                      <>
                        {t("noFilterMatch")}{" "}
                        <button type="button" className="btn btn-sm btn-ghost" onClick={clearFilters}>
                          {t("clearFilters")}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && items.length > 0 && (
          <div className="table-foot no-print">
            {t("showing", { shown: filtered.length, total: items.length, pieces })}
          </div>
        )}
      </section>

      <div className="print-only signatures">
        <div>{t("sigPrepared")}</div>
        <div>{t("sigChecked")}</div>
        <div>{t("sigCounter")}</div>
      </div>

      {selected && (
        <ItemDetail
          item={selected}
          onClose={closeItem}
          onMove={setMovement}
          onEdit={() => setEditing(true)}
          onDelete={() => setConfirmDelete(true)}
          onPreview={openPreview}
        />
      )}

      {selected && movement && (
        <MovementForm
          item={selected}
          type={movement}
          holders={holders}
          onClose={() => setMovement(null)}
          onDone={(updated) => {
            upsert(updated);
            setMovement(null);
            const txn = updated.transactions[0];
            showToast(movementMessage(movement, txn?.qty || 0, txn?.issuedTo || ""), {
              action: txn ? { label: t("printVoucher"), href: `/print/voucher/${updated.id}/${txn.id}` } : undefined,
            });
          }}
        />
      )}

      {(adding || (selected && editing)) && (
        <ItemForm
          item={adding ? null : selected}
          items={items}
          onClose={() => (adding ? closeAdd() : setEditing(false))}
          onSaved={(saved, created) => {
            upsert(saved);
            if (created) {
              closeAdd();
              showToast(t("added", { no: saved.inventoryNo }));
            } else {
              setEditing(false);
              showToast(t("changesSaved"));
            }
          }}
        />
      )}

      {selected && confirmDelete && (
        <ConfirmDialog
          title={t("deleteTitle")}
          danger
          confirmLabel={t("deletePermanently")}
          message={
            <p>
              <b>
                {selected.inventoryNo} — {selected.itemName}
              </b>{" "}
              {t("deleteMsg")}
            </p>
          }
          onConfirm={deleteSelected}
          onClose={() => setConfirmDelete(false)}
        />
      )}

      {preview && (
        <Modal
          size="lg"
          title={preview.title}
          onClose={() => setPreview(null)}
          footer={
            <>
              <a className="btn btn-ghost" href={preview.url} target="_blank" rel="noopener noreferrer">
                {t("openNewTab")}
              </a>
              <button type="button" className="btn btn-dark" onClick={() => setPreview(null)}>
                {t("close")}
              </button>
            </>
          }
        >
          {isImageFile(preview.url) ? (
            <img src={preview.url} alt={preview.title} className="preview-image" />
          ) : (
            <iframe src={preview.url} title={preview.title} className="preview-frame" />
          )}
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}

function Fallback() {
  const { t } = useI18n();
  return <div className="page">{t("loading")}</div>;
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <InventoryRegister />
    </Suspense>
  );
}
