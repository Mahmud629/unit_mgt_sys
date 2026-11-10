"use client";

import { SoldierProfile } from "@/components/soldier-profile";
import { Empty, PageHeader } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function MyProfilePage() {
  const { profile } = useSession();
  return (
    <div className="page">
      <div className="no-print"><PageHeader eyebrow="My file" title="My Profile" /></div>
      {profile.soldier_id ? <SoldierProfile soldierId={profile.soldier_id} self /> : <Empty>Your login is not linked to a soldier record yet. Ask the Orderly Room or Admin to link it.</Empty>}
    </div>
  );
}
