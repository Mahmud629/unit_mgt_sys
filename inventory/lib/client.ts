"use client";

// Browser helpers: API calls with consistent error handling, uploads with
// image compression, and the toast message hook.
import { useCallback, useEffect, useRef, useState } from "react";
import { isLang, localizeMessage } from "@/lib/i18n";

// Server messages are English; show them in the language the page is in.
function localize(text: string) {
  const lang = typeof document === "undefined" ? "en" : document.documentElement.lang;
  return localizeMessage(text, isLang(lang) ? lang : "en");
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });

  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error(localize("Session expired. Please log in again."));
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(localize((data as { message?: string }).message || "Request failed."));
  }

  return data as T;
}

export function sendJson<T>(url: string, method: string, body: unknown) {
  return api<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Phone photos are often 1–5 MB. Shrink large JPG/PNG images to at most
// 1600px before upload; PDFs and small images are sent as they are.
const MAX_SIDE = 1600;

async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 300 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.fillStyle = "#fff"; // transparent PNG areas become white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );

    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadFile(file: File | null, existingUrl: string) {
  if (!file) return existingUrl;

  const fd = new FormData();
  fd.append("file", await compressImage(file));

  const data = await api<{ url: string }>("/api/upload", { method: "POST", body: fd });
  return data.url;
}

export function errorText(err: unknown) {
  return err instanceof Error ? err.message : localize("Something went wrong.");
}

export type ToastState = {
  text: string;
  kind: "success" | "error";
  action?: { label: string; href: string };
};

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(
    (text: string, options: Partial<Omit<ToastState, "text">> = {}) => {
      clearTimeout(timer.current);
      setToast({ text, kind: options.kind || "success", action: options.action });
      // Leave time to click the action link (e.g. "Print voucher").
      timer.current = setTimeout(() => setToast(null), options.action ? 7000 : 3500);
    },
    []
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return [toast, show] as const;
}
