"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import DriverAlertSound from "@/components/DriverAlertSound";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  role?: string | null;
};

type Job = {
  id: string;
  tracking_code: string | null;
  customer_name: string | null;
  address: string;
  problem_type: string | null;
  status: string;
  accepted_driver_id: string | null;
  accepted_at: string | null;
  created_at: string;
};

export default function DriverDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfileAndJobs = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      setError("Please login first.");
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profileData) {
      setError("Driver profile not found.");
      setLoading(false);
      return;
    }

    setProfile({ id: profileData.id, role: profileData.role });

    const { data: jobsData, error: jobsError } = await supabase
      .from("jobs")
      .select(
        "id, tracking_code, customer_name, address, problem_type, status, accepted_driver_id, accepted_at, created_at"
      )
      .order("created_at", { ascending: false });

    if (jobsError) {
      setError(jobsError.message);
      setLoading(false);
      return;
    }

    setJobs((jobsData || []) as Job[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchProfileAndJobs();

    const channel = supabase
      .channel("driver-jobs-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        () => void fetchProfileAndJobs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchProfileAndJobs]);

  const activeJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.accepted_driver_id === profile?.id &&
          ["accepted", "on_the_way", "in_progress"].includes(job.status)
      ),
    [jobs, profile?.id]
  );

  const completedJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.accepted_driver_id === profile?.id && job.status === "completed"
      ),
    [jobs, profile?.id]
  );

  const availableJobs = useMemo(
    () =>
      jobs.filter(
        (job) => job.status === "new" && !job.accepted_driver_id && job.tracking_code
      ),
    [jobs]
  );

  const alertKey = useMemo(
    () => availableJobs.map((job) => job.id).sort().join("|"),
    [availableJobs]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Loading driver dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <div className="max-w-lg rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          {error}
        </div>
      </div>
    );
  }

  if (!profile || !["technician", "admin", "dispatcher"].includes(profile.role || "")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Access denied.
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-red-300">Live Dispatch Driver Panel</p>
          <h1 className="mt-1 text-3xl font-bold">Emergency Queue</h1>
          <p className="mt-2 text-sm text-white/70">
            New calls stream in realtime. Driver can accept multiple jobs. Vapi will calculate realistic ETA based on current workload and location.
          </p>
        </div>

        <DriverAlertSound
          shouldAlert={availableJobs.length > 0}
          alertKey={alertKey}
        />

        {activeJobs.length > 0 && (
          <section className="rounded-3xl border border-yellow-500/30 bg-yellow-500/10 p-5">
            <h2 className="text-xl font-semibold">Current Workload</h2>
            <p className="mt-2 text-sm text-white/70">
              You already have active jobs. New jobs will still appear and alerts will continue.
            </p>
          </section>
        )}

        <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <h2 className="text-xl font-semibold">Available Jobs</h2>

          <div className="mt-4 space-y-3">
            {availableJobs.length === 0 && (
              <p className="text-sm text-white/60">No available jobs at the moment.</p>
            )}

            {availableJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="text-lg font-semibold">
                  {job.customer_name || "Unknown Customer"}
                </p>

                <p className="text-sm text-white/70">{job.address}</p>

                <p className="text-xs uppercase tracking-wide text-white/50">
                  {job.problem_type || "General service"}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/driver/jobs/${job.tracking_code}`}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black"
                  >
                    Open & Accept
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-blue-500/30 bg-blue-500/10 p-5">
          <h2 className="text-xl font-semibold">My Active Jobs</h2>

          <div className="mt-4 space-y-3">
            {activeJobs.length === 0 && (
              <p className="text-sm text-white/60">No active accepted jobs.</p>
            )}

            {activeJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="font-semibold">
                  {job.customer_name || "Unknown Customer"}
                </p>

                <p className="text-sm text-white/70">{job.address}</p>
                <p className="text-xs text-white/50">Status: {job.status}</p>

                <Link
                  href={`/driver/jobs/${job.tracking_code}`}
                  className="mt-3 inline-block rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold"
                >
                  Manage Job
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-semibold">Completed Jobs</h2>

          <div className="mt-4 space-y-3">
            {completedJobs.length === 0 && (
              <p className="text-sm text-white/60">No completed jobs yet.</p>
            )}

            {completedJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="font-semibold">
                  {job.customer_name || "Unknown Customer"}
                </p>

                <p className="text-sm text-white/70">{job.address}</p>

                <p className="text-xs text-white/50">
                  Completed from job code {job.tracking_code}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}