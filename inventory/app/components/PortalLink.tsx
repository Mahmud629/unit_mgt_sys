"use client";

import { useEffect, useState } from "react";

/**
 * "All systems" link back to the 5 SIG BN Unit Systems Portal.
 * Shown only when the portal is running (http://<same host>:8080, or NEXT_PUBLIC_PORTAL_URL).
 */
export default function PortalLink({ label, className = "portal-link" }: { label: string; className?: string }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_PORTAL_URL || `${window.location.protocol}//${window.location.hostname}:8080/`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    fetch(url, { mode: "no-cors", cache: "no-store", signal: ctl.signal })
      .then(() => setHref(url))
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, []);

  if (!href) return null;
  return (
    <a className={className} href={href} title={label}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
      <span>{label}</span>
    </a>
  );
}
