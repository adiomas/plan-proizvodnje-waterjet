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
    setOrders(
      (data ?? []).map((o) => ({
        ...o,
        trajanje_h: Number(o.trajanje_h) || 0,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const addOrder = async (order: NewWorkOrder, splitPartner?: NewWorkOrder) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const maxOrder = orders.length > 0
      ? Math.max(...orders.map((o) => o.sort_order))
      : -1;

    if (splitPartner) {
      const groupId = crypto.randomUUID();

      const { data: dataA, error: errorA } = await supabase
        .from("excel_work_orders")
        .insert({
          ...order,
          user_id: userData.user.id,
          sort_order: maxOrder + 1,
          split_group_id: groupId,
          split_label: "A",
        })
        .select()
        .single();

      if (errorA) {
        console.error("Greška pri dodavanju dijela A:", errorA);
        return null;
      }

      const { data: dataB, error: errorB } = await supabase
        .from("excel_work_orders")
        .insert({
          ...splitPartner,
          user_id: userData.user.id,
          sort_order: maxOrder + 2,
          split_group_id: groupId,
          split_label: "B",
        })
        .select()
        .single();

      if (errorB) {
        console.error("Greška pri dodavanju dijela B:", errorB);
        // Rollback: obriši dio A
        await supabase.from("excel_work_orders").delete().eq("id", dataA.id);
        return null;
      }

      setOrders((prev) => [
        ...prev,
        { ...dataA, trajanje_h: Number(dataA.trajanje_h) || 0 },
        { ...dataB, trajanje_h: Number(dataB.trajanje_h) || 0 },
      ]);
      return dataA;
    }

    const { data, error } = await supabase
      .from("excel_work_orders")
      .insert({ ...order, user_id: userData.user.id, sort_order: maxOrder + 1 })
      .select()
      .single();

    if (error) {
      console.error("Greška pri dodavanju naloga:", error);
      return null;
    }
    setOrders((prev) => [...prev, { ...data, trajanje_h: Number(data.trajanje_h) || 0 }]);
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

    // Sync dijeljenih polja na parnjaka (rok_isporuke, hitno, rn_id)
    const SHARED_FIELDS = ["rok_isporuke", "hitno", "rn_id"] as const;
    const order = orders.find((o) => o.id === id);
    if (order?.split_group_id) {
      const sharedUpdates: Partial<WorkOrder> = {};
      for (const f of SHARED_FIELDS) {
        if (f in updates) {
          (sharedUpdates as Record<string, unknown>)[f] = (updates as Record<string, unknown>)[f];
        }
      }
      if (Object.keys(sharedUpdates).length > 0) {
        const sibling = orders.find(
          (o) => o.split_group_id === order.split_group_id && o.id !== id
        );
        if (sibling) {
          await supabase
            .from("excel_work_orders")
            .update({ ...sharedUpdates, updated_at: new Date().toISOString() })
            .eq("id", sibling.id);

          setOrders((prev) =>
            prev.map((o) =>
              o.id === id
                ? { ...o, ...updates }
                : o.id === sibling.id
                ? { ...o, ...sharedUpdates }
                : o
            )
          );
          return;
        }
      }
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...updates } : o))
    );
  };

  const deleteOrder = async (id: string) => {
    const order = orders.find((o) => o.id === id);

    if (order?.split_group_id) {
      // Obriši oba dijela split naloga
      const { error } = await supabase
        .from("excel_work_orders")
        .delete()
        .eq("split_group_id", order.split_group_id);

      if (error) {
        console.error("Greška pri brisanju split naloga:", error);
        return;
      }
      setOrders((prev) => prev.filter((o) => o.split_group_id !== order.split_group_id));
    } else {
      const { error } = await supabase
        .from("excel_work_orders")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Greška pri brisanju naloga:", error);
        return;
      }
      setOrders((prev) => prev.filter((o) => o.id !== id));
    }
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

  const updateSirovine = async (id: string, newStatus: "IMA" | "NEMA" | null) => {
    const { error } = await supabase.rpc("update_status_sirovine", {
      order_id: id,
      new_status: newStatus,
    });

    if (error) {
      console.error("Greška pri ažuriranju sirovine:", error);
      return;
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status_sirovine: newStatus } : o))
    );
  };

  return {
    orders,
    loading,
    addOrder,
    updateOrder,
    deleteOrder,
    reorderOrders,
    updateSirovine,
    refetch: fetchOrders,
  };
}
