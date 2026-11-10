"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SoldierProfile } from "@/components/soldier-profile";
import { Empty } from "@/components/ui";

export default function SoldierViewPage() {
  const id = useSearchParams().get("id");
  return (
    <div className="page">
      <div className="no-print" style={{ marginBottom: 12 }}>
        <Link href="/soldiers" className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> Soldiers database</Link>
      </div>
      {id ? <SoldierProfile soldierId={id} /> : <Empty>No soldier selected.</Empty>}
    </div>
  );
}
