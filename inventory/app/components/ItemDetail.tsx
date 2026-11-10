"use client";

/* eslint-disable @next/next/no-img-element -- uploaded files */

import type { MsgKey } from "@/lib/i18n";
import { badgeClass, getBreakdown, isImageFile, MOVE_FROM, MOVE_ORDER } from "@/lib/inventory";
import { STATUSES, type Item, type MovementType } from "@/lib/types";
import { useI18n } from "./I18nProvider";
import { Modal } from "./ui";

type Props = {
  item: Item;
  onClose: () => void;
  onMove: (type: MovementType) => void;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: (title: string, url: string) => void;
};

const key = (s: string) => s.replace(/\s+/g, "");

export default function ItemDetail({ item, onClose, onMove, onEdit, onDelete, onPreview }: Props) {
  const { t, n, money, status, condition, category, txn } = useI18n();
  const b = getBreakdown(item.allocations);

  const files = [
    { title: t("fileProductPhoto"), url: item.productPhotoUrl },
    { title: t("fileVoucher"), url: item.voucherUrl },
    { title: t("fileNotesheet"), url: item.notesheetUrl },
  ];

  return (
    <Modal
      size="lg"
      title={item.itemName}
      subtitle={
        <>
          {item.inventoryNo} · {category(item.category)} ·{" "}
          <span className={badgeClass(item.status)}>{status(item.status)}</span>
        </>
      }
      onClose={onClose}
      toolbar={
        <>
          {MOVE_ORDER.map((type) => {
            const from = MOVE_FROM[type];
            const none = b[from] === 0;
            return (
              <button
                key={type}
                type="button"
                className={`btn btn-sm ${type === "Issue" ? "" : "btn-dark"}`}
                onClick={() => onMove(type)}
                disabled={none}
                title={none ? t(`nothing_${key(from)}` as MsgKey) : t(`mv_${type}_title` as MsgKey)}
              >
                {t(`mv_${type}_button` as MsgKey)}
              </button>
            );
          })}
          <span className="spacer" />
          <button type="button" className="btn btn-sm btn-ghost" onClick={onEdit}>
            {t("edit")}
          </button>
          <button type="button" className="btn btn-sm btn-danger-ghost" onClick={onDelete}>
            {t("delete")}
          </button>
        </>
      }
    >
      <div className="chips">
        <div className="chip">
          <span>{t("colTotal")}</span>
          <b>{n(item.quantity)}</b>
        </div>
        {STATUSES.map((s) => (
          <div className="chip" key={s}>
            <span>{status(s)}</span>
            <b>{n(b[s])}</b>
          </div>
        ))}
      </div>

      <div className="detail-layout">
        <dl className="kv">
          <dt>{t("dInvNo")}</dt>
          <dd>{item.inventoryNo}</dd>
          <dt>{t("dBuyDate")}</dt>
          <dd>{item.buyDate ? n(item.buyDate) : "—"}</dd>
          <dt>{t("dCost")}</dt>
          <dd>{money(item.cost)}</dd>
          <dt>{t("dVoucherNo")}</dt>
          <dd>{item.voucherNo || "—"}</dd>
          <dt>{t("dLocation")}</dt>
          <dd>{item.location || "—"}</dd>
          <dt>{t("dCondition")}</dt>
          <dd>{condition(item.condition)}</dd>
          <dt>{t("dHeldBy")}</dt>
          <dd>{item.issuedTo || t("dNobody")}</dd>
          <dt>{t("dRemarks")}</dt>
          <dd>{item.remarks || "—"}</dd>
        </dl>

        <div className="files">
          {files.map((f) => (
            <button
              key={f.title}
              type="button"
              className="file-card"
              onClick={() => onPreview(f.title, f.url)}
              disabled={!f.url}
            >
              <span className="file-thumb">
                {f.url && isImageFile(f.url) ? (
                  <img src={f.url} alt={f.title} loading="lazy" />
                ) : (
                  <span>{f.url ? "📄" : "—"}</span>
                )}
              </span>
              {f.title}
            </button>
          ))}
        </div>
      </div>

      <section className="modal-section">
        <h3>{t("whereNow")}</h3>
        <div className="table-wrap">
          <table className="table-compact">
            <thead>
              <tr>
                <th>{t("colStatus")}</th>
                <th className="num">{t("colQty")}</th>
                <th>{t("colHolder")}</th>
                <th>{t("colLocation")}</th>
                <th>{t("colSince")}</th>
                <th>{t("colVoucherNote")}</th>
                <th>{t("colRemarks")}</th>
              </tr>
            </thead>
            <tbody>
              {item.allocations.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className={badgeClass(a.type)}>{status(a.type)}</span>
                  </td>
                  <td className="num">{n(a.qty)}</td>
                  <td>{a.holder || "—"}</td>
                  <td>{a.location || "—"}</td>
                  <td className="nowrap">{a.date ? n(a.date) : "—"}</td>
                  <td>{a.voucherNo || "—"}</td>
                  <td>{a.remarks || "—"}</td>
                </tr>
              ))}
              {item.allocations.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    {t("noStock")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="modal-section">
        <h3>{t("history")}</h3>
        {item.transactions.length === 0 ? (
          <p className="muted">{t("noTxns")}</p>
        ) : (
          <ul className="history">
            {item.transactions.map((tx) => (
              <li key={tx.id}>
                <span className={badgeClass(tx.type)}>{txn(tx.type)}</span>
                <span className="meta">
                  <b>{t("hQty", { n: tx.qty })}</b> · {n(tx.date)}
                  {tx.issuedTo ? ` · ${tx.issuedTo}` : ""}
                  {tx.voucherNo ? ` · ${t("hVoucher", { v: tx.voucherNo })}` : ""}
                  {tx.remarks ? ` · ${tx.remarks}` : ""}
                </span>
                <a
                  className="btn btn-sm btn-ghost"
                  href={`/print/voucher/${item.id}/${tx.id}`}
                  target="_blank"
                  rel="noopener"
                >
                  {t("printVoucher")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
