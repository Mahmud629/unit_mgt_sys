"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  useEffect(() => router.replace("/dashboard"), [router]);
  return <Loading />;
}
