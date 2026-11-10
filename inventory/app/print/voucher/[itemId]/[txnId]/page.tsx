"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/app/components/I18nProvider";
import { api, errorText } from "@/lib/client";
import { numberInWords, type MsgKey } from "@/lib/i18n";
import type { Item, Transaction } from "@/lib/types";

const SIGNATURES: Record<Transaction["type"], [MsgKey, MsgKey, MsgKey]> = {
  Purchase: ["sig_receivedQm", "sig_checked", "sig_counter"],
  Issue: ["sig_issuedQm", "sig_receivedHolder", "sig_counter"],
  Return: ["sig_returnedHolder", "sig_receivedQm", "sig_counter"],
  Repair: ["sig_sentQm", "sig_receivedRepair", "sig_counter"],
  Repaired: ["sig_returnedRepair", "sig_receivedQm", "sig_counter"],
  Damaged: ["sig_reportedQm", "sig_board", "sig_counter"],
};

function Voucher({ item, txn, copy }: { item: Item; txn: Transaction; copy: string }) {
  const { t, n, lang, category } = useI18n();

  const voucherNo = txn.voucherNo || (txn.type === "Purchase" ? item.voucherNo : "");
  const rows: [string, string][] = [
    [t("vVoucherNo"), voucherNo || "—"],
    [t("vDate"), txn.date ? n(txn.date) : "—"],
    [t("vInvNo"), item.inventoryNo],
    [t("vItem"), item.itemName],
    [t("vCategory"), category(item.category)],
    [t("vQty"), `${n(txn.qty)} (${numberInWords(txn.qty, lang)})`],
    [t(`vh_${txn.type}` as MsgKey), txn.issuedTo || "—"],
    [t("vRemarks"), txn.remarks || "—"],
  ];

  return (
    <div className="voucher">
      <div className="voucher-head">
        <Image src="/logo-mark.png" alt="5 Sig Bn UIMS" width={64} height={64} />
        <div>
          <h1>{t("appName")}</h1>
          <p>{t("systemName")}</p>
        </div>
        <span className="copy">{copy}</span>
      </div>

      <h2 className="voucher-title">{t(`vt_${txn.type}` as MsgKey)}</h2>

      <table>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="signatures">
        {SIGNATURES[txn.type].map((s) => (
          <div key={s}>{t(s)}</div>
        ))}
      </div>
    </div>
  );
}

export default function VoucherPage() {
  const { t } = useI18n();
  const { itemId, txnId } = useParams<{ itemId: string; txnId: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Item>(`/api/items/${itemId}`)
      .then(setItem)
      .catch((err) => setError(errorText(err)));
  }, [itemId]);

  const txn = item?.transactions.find((x) => x.id === txnId);

  // Open the print dialog once the voucher is on screen.
  useEffect(() => {
    if (!txn) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [txn]);

  if (error || (item && !txn)) {
    return <div className="print-page">{error || t("txnGone")}</div>;
  }

  if (!item || !txn) return <div className="print-page">{t("voucherLoading")}</div>;

  return (
    <div className="print-page">
      <div className="print-actions no-print">
        <button type="button" className="btn" onClick={() => window.print()}>
          {t("print")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.close()}>
          {t("close")}
        </button>
      </div>

      <Voucher item={item} txn={txn} copy={t("officeCopy")} />
      <div className="cut-line">{t("cutHere")}</div>
      <Voucher item={item} txn={txn} copy={t("holderCopy")} />
    </div>
  );
}
