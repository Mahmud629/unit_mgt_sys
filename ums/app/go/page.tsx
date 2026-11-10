"use client";

// Entry point for the portal tiles: /go/?to=training opens the first page of that
// module that this login may use. (Not signed in → login first, then back here.)
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loading } from "@/components/ui";
import { ModuleDenied } from "@/components/module-bar";
import { moduleById, myModules } from "@/lib/modules";
import { useSession } from "@/lib/session";

export default function GoPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { perms, profile } = useSession();
  const to = params.get("to");
  const mods = myModules(perms, !!profile.soldier_id);
  const target = mods.find((m) => m.id === to);
  const wanted = moduleById(to);

  useEffect(() => {
    if (target) router.replace(target.items[0].href);
    else if (!wanted) router.replace("/dashboard");
  }, [target, wanted, router]);

  if (target || !wanted) return <Loading />;
  return <ModuleDenied moduleId={wanted.id} />;
}
