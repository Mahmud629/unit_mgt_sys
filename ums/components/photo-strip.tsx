"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { TrainingPhoto } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

/** Auto-scrolling strip of the latest training photos. Pauses on hover / touch. */
export function PhotoStrip({ photos }: { photos: TrainingPhoto[] }) {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const list = photos.filter((p) => p.url);

  useEffect(() => {
    if (paused || list.length < 2) return;
    const id = setInterval(() => {
      const el = track.current;
      if (!el) return;
      const step = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 300;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step + 12, behavior: "smooth" });
    }, 3500);
    return () => clearInterval(id);
  }, [paused, list.length]);

  const nudge = (dir: number) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: "smooth" });
  };

  if (!list.length)
    return (
      <div className="photo-empty">
        <Camera size={20} /> {t("No training photos yet.")} <Link className="link" href="/training/gallery">{t("Upload photos")}</Link>
      </div>
    );
  return (
    <div className="photo-strip" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)}>
      <button className="strip-nav left" onClick={() => nudge(-1)} aria-label="Previous"><ChevronLeft size={18} /></button>
      <div className="strip-track" ref={track}>
        {list.map((p) => (
          <Link key={p.id} href="/training/gallery" className="strip-item">
            <img src={p.url!} alt={p.caption ?? ""} />
            <span><strong>{p.caption ?? t("Training")}</strong><small>{fmtDate(p.taken_on)}</small></span>
          </Link>
        ))}
      </div>
      <button className="strip-nav right" onClick={() => nudge(1)} aria-label="Next"><ChevronRight size={18} /></button>
    </div>
  );
}
