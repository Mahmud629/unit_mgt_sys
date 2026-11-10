"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/app/components/I18nProvider";
import { api, errorText } from "@/lib/client";
import type { MsgKey } from "@/lib/i18n";
import { badgeClass } from "@/lib/inventory";
import type { DashboardData } from "@/lib/types";

const CARDS: {
  key: keyof DashboardData["stats"];
  label: MsgKey;
  href: string;
  className: string;
}[] = [
  { key: "total", label: "cardTotal", href: "/inventory", className: "" },
  { key: "store", label: "cardStore", href: "/inventory?status=In+Store", className: "stat-store" },
  { key: "issued", label: "cardIssued", href: "/inventory?status=Issued", className: "stat-issued" },
  { key: "repair", label: "cardRepair", href: "/inventory?status=Repair", className: "stat-repair" },
  { key: "damaged", label: "cardDamaged", href: "/inventory?status=Damaged", className: "stat-damaged" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { t, n, txn } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [holderSearch, setHolderSearch] = useState("");

  useEffect(() => {
    api<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((err) => setError(errorText(err)));
  }, []);

  const issued = useMemo(() => {
    const q = holderSearch.toLowerCase().trim();
    const rows = data?.issued || [];
    if (!q) return rows;
    return rows.filter((r) => `${r.holder} ${r.itemName} ${r.inventoryNo}`.toLowerCase().includes(q));
  }, [data, holderSearch]);

  const holderCount = new Set((data?.issued || []).map((r) => r.holder)).size;
  const openItem = (id: string) => router.push(`/inventory?item=${id}`);
  const placeholder = error || (data ? null : t("loading"));

  return (
    <div className="page">
      <div className="page-head hero-head">
        <div>
          <span className="hero-chip">{t("storeBanner")}</span>
          <h2>{t("dashTitle")}</h2>
          <p>
            {t("dashSub")}
            {data ? ` — ${t("dashLines", { n: data.stats.lines })}` : ""}
          </p>
        </div>
        <div className="btn-group">
          <Link className="btn btn-hero-ghost" href="/inventory">
            {t("openRegister")}
          </Link>
          <Link className="btn btn-hero" href="/inventory?new=1">
            {t("addItem")}
          </Link>
        </div>
      </div>

      <div className="stats">
        {CARDS.map((card) => (
          <Link key={card.key} href={card.href} className={`stat ${card.className}`}>
            <span>{t(card.label)}</span>
            <b>{data ? n(data.stats[card.key]) : "–"}</b>
            <small>{t("viewItems")}</small>
          </Link>
        ))}
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h3>{t("whoHolds")}</h3>
              <p>{data ? t("holdersCount", { n: holderCount }) : t("holdersHint")}</p>
            </div>
            <input
              className="input"
              style={{ maxWidth: 220 }}
              type="search"
              placeholder={t("findHolder")}
              value={holderSearch}
              onChange={(e) => setHolderSearch(e.target.value)}
              aria-label={t("findHolder")}
            />
          </div>
          <div className="table-wrap" style={{ maxHeight: 440, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("colHolder")}</th>
                  <th>{t("colItem")}</th>
                  <th className="num">{t("colQty")}</th>
                  <th>{t("colSince")}</th>
                </tr>
              </thead>
              <tbody>
                {issued.map((r) => (
                  <tr key={`${r.holder}-${r.itemId}`} className="clickable" onClick={() => openItem(r.itemId)}>
                    <td style={{ fontWeight: 700 }}>{r.holder}</td>
                    <td>
                      {r.itemName} <span className="muted nowrap">({r.inventoryNo})</span>
                    </td>
                    <td className="num">{n(r.qty)}</td>
                    <td className="nowrap">{n(r.since)}</td>
                  </tr>
                ))}
                {issued.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      {placeholder || (holderSearch ? t("noMatch") : t("nothingIssued"))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h3>{t("recentTitle")}</h3>
              <p>{t("recentSub")}</p>
            </div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 440, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("colDate")}</th>
                  <th>{t("colType")}</th>
                  <th>{t("colItem")}</th>
                  <th className="num">{t("colQty")}</th>
                  <th>{t("colHolder")}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent || []).map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => openItem(r.itemId)}>
                    <td className="nowrap">{r.date ? n(r.date) : "—"}</td>
                    <td>
                      <span className={badgeClass(r.type)}>{txn(r.type)}</span>
                    </td>
                    <td>
                      {r.itemName} <span className="muted nowrap">({r.inventoryNo})</span>
                    </td>
                    <td className="num">{n(r.qty)}</td>
                    <td>{r.issuedTo || <span className="muted">—</span>}</td>
                  </tr>
                ))}
                {data?.recent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      {t("noActivity")}
                    </td>
                  </tr>
                )}
                {!data && (
                  <tr>
                    <td colSpan={5} className="empty">
                      {placeholder}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
