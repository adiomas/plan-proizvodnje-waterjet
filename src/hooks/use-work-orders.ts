"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WorkOrder, NewWorkOrder } from "@/lib/types";

export function useWorkOrders() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("excel_work_orders")
      .select("*")
      .order("sort_order");

    if (error) {
      console.error("Greška pri dohvaćanju naloga:", error);
      return;
    }
    setOrders(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const addOrder = async (order: NewWorkOrder) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const maxOrder = orders.length > 0
      ? Math.max(...orders.map((o) => o.sort_order))
      : -1;

    const { data, error } = await supabase
      .from("excel_work_orders")
      .insert({ ...order, user_id: userData.user.id, sort_order: maxOrder + 1 })
      .select()
      .single();

    if (error) {
      console.error("Greška pri dodavanju naloga:", error);
      return null;
    }
    setOrders((prev) => [...prev, data]);
    return data;
  };

  const updateOrder = async (id: string, updates: Partial<WorkOrder>) => {
    // Auto-shift: kad se mijenja zeljeni_redoslijed, pomakni kolidirajuće naloge na istom stroju
    if (
      "zeljeni_redoslijed" in updates &&
      updates.zeljeni_redoslijed !== null &&
      updates.zeljeni_redoslijed !== undefined
    ) {
      const order = orders.find((o) => o.id === id);
      const machineId = ("machine_id" in updates ? updates.machine_id : order?.machine_id) as string | undefined;

      if (machineId) {
        const newRedoslijed = updates.zeljeni_redoslijed;
        const toShift = orders.filter(
          (o) =>
            o.id !== id &&
            o.machine_id === machineId &&
            o.zeljeni_redoslijed !== null &&
            o.zeljeni_redoslijed! >= newRedoslijed
        );

        for (const o of toShift) {
          await supabase
            .from("excel_work_orders")
            .update({ zeljeni_redoslijed: o.zeljeni_redoslijed! + 1 })
            .eq("id", o.id);
        }

        if (toShift.length > 0) {
          setOrders((prev) =>
            prev.map((o) => {
              if (toShift.some((s) => s.id === o.id)) {
                return { ...o, zeljeni_redoslijed: o.zeljeni_redoslijed! + 1 };
              }
              return o;
            })
          );
        }
      }
    }

    const { error } = await supabase
      .from("excel_work_orders")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Greška pri ažuriranju naloga:", error);
      return;
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
    );
  };

  const deleteOrder = async (id: string) => {
    const { error } = await supabase
      .from("excel_work_orders")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Greška pri brisanju naloga:", error);
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const reorderOrders = async (reordered: WorkOrder[]) => {
    setOrders(reordered);

    const updates = reordered.map((o, i) => ({
      id: o.id,
      sort_order: i,
    }));

    for (const u of updates) {
      await supabase
        .from("excel_work_orders")
        .update({ sort_order: u.sort_order })
        .eq("id", u.id);
    }
  };

  return {
    orders,
    loading,
    addOrder,
    updateOrder,
    deleteOrder,
    reorderOrders,
    refetch: fetchOrders,
  };
}
