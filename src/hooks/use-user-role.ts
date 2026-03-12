"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";

export function useUserRole() {
  const [role, setRole] = useState<UserRole>("viewer");
  const [sirovineEnabled, setSirovineEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoading(false);
        return;
      }

      // Dohvati profil
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();

      if (profile?.role) {
        setRole(profile.role as UserRole);
      }

      // Dohvati sirovine toggle
      const { data: setting } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_name", "sirovine_enabled")
        .single();

      if (setting) {
        setSirovineEnabled(setting.setting_value === "true");
      }

      setLoading(false);
    }

    load();
  }, [supabase]);

  const toggleSirovine = useCallback(async () => {
    const newValue = !sirovineEnabled;
    const { error } = await supabase
      .from("app_settings")
      .update({ setting_value: String(newValue), updated_at: new Date().toISOString() })
      .eq("setting_name", "sirovine_enabled");

    if (!error) {
      setSirovineEnabled(newValue);
    }
  }, [supabase, sirovineEnabled]);

  const canEdit = useCallback(
    (field?: string): boolean => {
      if (role === "admin") return true;
      if (role === "material" && field === "status_sirovine" && sirovineEnabled) return true;
      return false;
    },
    [role, sirovineEnabled]
  );

  const canDelete = useCallback((): boolean => role === "admin", [role]);
  const canAdd = useCallback((): boolean => role === "admin", [role]);
  const canReorder = useCallback((): boolean => role === "admin", [role]);

  return {
    role,
    sirovineEnabled,
    loading: loading,
    canEdit,
    canDelete,
    canAdd,
    canReorder,
    toggleSirovine,
  };
}
