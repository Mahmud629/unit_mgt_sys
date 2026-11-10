"use client";

import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { Card } from "./ui";
import { moduleById } from "@/lib/modules";
import { useI18n } from "@/lib/i18n";
import { myModules } from "@/lib/modules";
import { useSession } from "@/lib/session";

/** Home page: one card per module this login can use. */
export function ModuleBar() {
  const { perms, profile } = useSession();
  const { t } = useI18n();
  const mods = myModules(perms, !!profile.soldier_id);
  return (
    <nav className="module-bar" aria-label={t("Modules")}>
      {mods.map((m) => (
        <Link key={m.id} href={m.items[0].href} className="module-card" style={{ ["--mod-c" as string]: m.color }}>
          <span className="module-ico"><m.icon size={18} /></span>
          <span className="module-card-name">{t(m.label)}</span>
          <ArrowRight size={15} className="module-card-go" />
        </Link>
      ))}
    </nav>
  );
}

/** Shown instead of a page whose module is not part of this login. */
export function ModuleDenied({ moduleId }: { moduleId: string }) {
  const { perms, profile } = useSession();
  const { t } = useI18n();
  const wanted = moduleById(moduleId);
  const mods = myModules(perms, !!profile.soldier_id);
  return (
    <div className="page">
      <Card className="go-denied">
        <div className="go-denied-head">
          <span className="module-ico big" style={{ ["--mod-c" as string]: wanted?.color ?? "#56636e" }}><Lock size={20} /></span>
          <div>
            <h2>{t(wanted?.label ?? "Module")}</h2>
            <p className="muted">{t("This module is not part of your login.")}</p>
          </div>
        </div>
        <div className="go-modules">
          {mods.map((m) => (
            <Link key={m.id} href={m.items[0].href} className="go-module" style={{ ["--mod-c" as string]: m.color }}>
              <span className="module-ico"><m.icon size={16} /></span>{t(m.label)}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
