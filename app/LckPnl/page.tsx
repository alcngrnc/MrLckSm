"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import dynamic from "next/dynamic";

const AdminDispatchMap = dynamic(
  () => import("@/components/AdminDispatchMap"),
  { ssr: false }
);

type Job = {
  id: string;
  tracking_code: string | null;
  customer_name: string | null;
  customer_phone?: string | null;
  address: string;
  problem_type: string | null;
  status: string;
  lat?: number | null;
  lng?: number | null;
};

type DriverLocation = {
  job_id?: string | null;
  lat: number;
  lng: number;
  recorded_at?: string | null;
};

export default function AdminPanel() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);

  const fetchEverything = useCallback(async () => {
    const { data: jobsData, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (jobsError) {
      console.error("ADMIN_JOBS_ERROR", jobsError);
      return;
    }

    const allJobs = (jobsData || []) as Job[];

    const activeJobs = allJobs.filter((job) =>
      ["accepted", "on_the_way", "in_progress"].includes(job.status)
    );

    const activeJobIds = activeJobs.map((job) => job.id);

    let latestLocations: DriverLocation[] = [];

    if (activeJobIds.length > 0) {
      const { data: locs, error: locsError } = await supabase
        .from("technician_locations")
        .select("job_id, lat, lng, recorded_at")
        .in("job_id", activeJobIds)
        .order("recorded_at", { ascending: false });

      if (locsError) {
        console.error("ADMIN_LOCATIONS_ERROR", locsError);
      }

      const latestByJob = new Map<string, DriverLocation>();

      for (const loc of (locs || []) as DriverLocation[]) {
        if (!loc.job_id) continue;

        if (!latestByJob.has(loc.job_id)) {
          latestByJob.set(loc.job_id, loc);
        }
      }

      latestLocations = Array.from(latestByJob.values());
    }

    setJobs(allJobs);
    setDriverLocations(latestLocations);
  }, []);

  useEffect(() => {
    void fetchEverything();

    const channel = supabase
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        () => void fetchEverything()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "technician_locations" },
        () => void fetchEverything()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEverything]);

  const mapJobs = jobs.filter((job) =>
    ["new", "accepted", "on_the_way", "in_progress"].includes(job.status)
  );

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dispatch Control Center</h1>

          <Link href="/driver" className="rounded-xl border px-4 py-2">
            Driver Panel
          </Link>
        </div>

        <AdminDispatchMap jobs={mapJobs} driverLocations={driverLocations} />

        <div className="space-y-4">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold">
                    {job.customer_name || "Unknown"}
                  </p>

                  <p className="text-sm text-white/60">{job.address}</p>

                  <p className="text-xs text-white/40">{job.problem_type}</p>

                  <p className="text-xs text-white/40">{job.tracking_code}</p>

                  <p className="mt-1 text-xs text-white/30">
                    Status: {job.status}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Link
                    href={`/LckPnl/jobs/${job.tracking_code}`}
                    className="rounded-lg bg-white px-3 py-2 text-sm text-black"
                  >
                    Details
                  </Link>

                  {job.tracking_code && (
                    <Link
                      href={`/track/${job.tracking_code}`}
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      Track
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}