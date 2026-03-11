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
