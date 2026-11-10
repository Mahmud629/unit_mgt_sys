"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/client";
import type { Item } from "@/lib/types";

// Loads the register once, then lets pages patch single items in place
// instead of re-downloading everything after each change.
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    return api<Item[]>("/api/items")
      .then((data) => {
        setItems(data);
        setError("");
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const upsert = useCallback((item: Item) => {
    setItems((current) => {
      const index = current.findIndex((x) => x.id === item.id);
      if (index === -1) return [item, ...current];

      const next = current.slice();
      next[index] = item;
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((x) => x.id !== id));
  }, []);

  return { items, loading, error, reload, upsert, remove };
}
