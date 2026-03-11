"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Machine } from "@/lib/types";

const DEFAULT_MACHINES: Omit<Machine, "id" | "user_id" | "created_at">[] = [
  { name: "Arpel", color: "#6AA84F", color_light: "#CFE8CF", sort_order: 0 },
  { name: "Classica", color: "#3D85C6", color_light: "#D9E8FB", sort_order: 1 },
  { name: "CNC nož", color: "#E69138", color_light: "#F6D5C3", sort_order: 2 },
];

export function useMachines() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const seedingRef = useRef(false);
  const supabase = createClient();

  const fetchMachines = useCallback(async () => {
    const { data, error } = await supabase
      .from("excel_machines")
      .select("*")
      .order("sort_order");

    if (error) {
      console.error("Greška pri dohvaćanju strojeva:", error);
      return;
    }

    // Seed default strojeva ako ih nema (s guardom protiv duplikata)
    if (data.length === 0) {
      if (seedingRef.current) return;
      seedingRef.current = true;

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        seedingRef.current = false;
        return;
      }

      const toInsert = DEFAULT_MACHINES.map((m) => ({
        ...m,
        user_id: userData.user!.id,
      }));

      const { data: inserted, error: insertErr } = await supabase
        .from("excel_machines")
        .upsert(toInsert, { onConflict: "user_id,name", ignoreDuplicates: true })
        .select();

      seedingRef.current = false;

      if (insertErr) {
        console.error("Greška pri seedanju strojeva:", insertErr);
        return;
      }
      setMachines(inserted);
    } else {
      // Deduplikacija: ako postoje duplikati, uzmi samo unikatne po imenu
      const unique = new Map<string, typeof data[0]>();
      for (const m of data) {
        if (!unique.has(m.name)) unique.set(m.name, m);
      }
      setMachines([...unique.values()]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  const addMachine = async (
    machine: Pick<Machine, "name" | "color" | "color_light">
  ) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const maxOrder = Math.max(0, ...machines.map((m) => m.sort_order));
    const { data, error } = await supabase
      .from("excel_machines")
      .insert({
        ...machine,
        user_id: userData.user.id,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();

    if (error) {
      console.error("Greška pri dodavanju stroja:", error);
      return;
    }
    setMachines((prev) => [...prev, data]);
    return data;
  };

  const updateMachine = async (id: string, updates: Partial<Machine>) => {
    const { error } = await supabase
      .from("excel_machines")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.error("Greška pri ažuriranju stroja:", error);
      return;
    }
    setMachines((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  const deleteMachine = async (id: string) => {
    const { error } = await supabase
      .from("excel_machines")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Greška pri brisanju stroja:", error);
      return;
    }
    setMachines((prev) => prev.filter((m) => m.id !== id));
  };

  return { machines, loading, addMachine, updateMachine, deleteMachine, refetch: fetchMachines };
}
