"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MachineOverride } from "@/lib/types";

export function useOverrides() {
  const [overrides, setOverrides] = useState<MachineOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchOverrides = useCallback(async () => {
    const { data, error } = await supabase
      .from("machine_day_overrides")
      .select("*")
      .order("date");

    if (error) {
      console.error("Greška pri dohvaćanju overridea:", error);
      return;
    }
    setOverrides(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const addOverride = async (
    machineId: string,
    date: string,
    workStart: string,
    workEnd: string
  ) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;

    const { data, error } = await supabase
      .from("machine_day_overrides")
      .insert({
        user_id: userData.user.id,
        machine_id: machineId,
        date,
        work_start: workStart,
        work_end: workEnd,
      })
      .select()
      .single();

    if (error) {
      console.error("Greška pri dodavanju overridea:", error);
      return null;
    }
    setOverrides((prev) => [...prev, data]);
    return data;
  };

  const deleteOverride = async (id: string) => {
    const { error } = await supabase
      .from("machine_day_overrides")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Greška pri brisanju overridea:", error);
      return;
    }
    setOverrides((prev) => prev.filter((o) => o.id !== id));
  };

  return { overrides, loading, addOverride, deleteOverride, refetch: fetchOverrides };
}
