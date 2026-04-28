"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  role: string | null;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
};

export default function AdminDriversPage() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("role", { ascending: true });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setRows((data || []) as ProfileRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      void fetchRows();
    }, 0);

    const channel = supabase
      .channel("profiles-admin-drivers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => void fetchRows()
      )
      .subscribe();

    return () => {
      window.clearTimeout(initTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchRows]);

  const setRole = async (id: string, role: "technician" | "dispatcher") => {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`Updated role to ${role}.`);
    await fetchRows();
  };

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <Link
            href="/LckPnl"
            className="mb-4 inline-block rounded-xl border border-white/20 px-4 py-2 text-sm"
          >
            Back to Admin Panel
          </Link>
          <h1 className="text-3xl font-bold">Driver Management</h1>
          <p className="mt-2 text-sm text-white/60">
            Manage profile roles for dispatch technicians.
          </p>
        </div>

        {message && (
          <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm">{message}</div>
        )}

        <div className="space-y-3">
          {loading && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              Loading profiles...
            </div>
          )}

          {!loading &&
            rows.map((profile) => (
              <div
                key={profile.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <p className="font-semibold">
                  {profile.full_name || profile.email || profile.id}
                </p>
                <p className="text-sm text-white/70">{profile.phone || "-"}</p>
                <p className="text-xs uppercase tracking-wide text-white/50">
                  Current Role: {profile.role || "unknown"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => void setRole(profile.id, "technician")}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black"
                  >
                    Set Technician
                  </button>
                  <button
                    onClick={() => void setRole(profile.id, "dispatcher")}
                    className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold"
                  >
                    Set Dispatcher
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </main>
  );
}
