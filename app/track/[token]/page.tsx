"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";

const TrackingMap = dynamic(() => import("@/components/TrackingMap"), {
  ssr: false,
});

type Job = {
  id: string;
  tracking_code: string;
  status: string;
  eta_minutes: number | null;
  address: string;
  problem_type: string | null;
  accepted_driver_id: string | null;
};

type DriverSafe = {
  full_name?: string | null;
};

type TechnicianLocation = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  updated_at: string;
};

export default function TrackingPage() {
  const params = useParams();
  const token = params.token as string;

  const [job, setJob] = useState<Job | null>(null);
  const [location, setLocation] = useState<TechnicianLocation | null>(null);
  const [driver, setDriver] = useState<DriverSafe | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTracking = useCallback(async () => {
    const { data: jobData } = await supabase
      .from("jobs")
      .select("id, tracking_code, status, eta_minutes, address, problem_type, accepted_driver_id")
      .eq("tracking_code", token)
      .single();

    if (!jobData) {
      setLoading(false);
      return;
    }

    setJob(jobData);

    if (jobData.accepted_driver_id) {
      const { data: driverData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", jobData.accepted_driver_id)
        .maybeSingle();

      setDriver((driverData as DriverSafe | null) || null);
    } else {
      setDriver(null);
    }

    const { data: locationData } = await supabase
      .from("technician_locations")
      .select("lat, lng, heading, speed, updated_at")
      .eq("job_id", jobData.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setLocation(locationData || null);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      void fetchTracking();
    }, 0);

    const channel = supabase
      .channel(`tracking-${token}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        fetchTracking
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "technician_locations" },
        fetchTracking
      )
      .subscribe();

    return () => {
      window.clearTimeout(initTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchTracking, token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Loading tracking...
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Tracking not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-white/50">MrLckSm Locksmith Dispatch</p>
          <h1 className="mt-3 text-3xl font-bold">Technician Tracking</h1>

          <div className="mt-6 rounded-2xl bg-black p-5">
            <p className="text-sm text-white/50">Job Code</p>
            <p className="mt-1 text-2xl font-bold">{job.tracking_code}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-black p-5">
              <p className="text-sm text-white/50">Status</p>
              <p className="mt-1 text-xl font-bold">{job.status}</p>
            </div>

            <div className="rounded-2xl bg-black p-5">
              <p className="text-sm text-white/50">ETA</p>
              <p className="mt-1 text-xl font-bold">
                {job.eta_minutes ? `${job.eta_minutes} min` : "Pending"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-black p-5">
            <p className="text-sm text-white/50">Technician</p>
            <p className="mt-1 text-lg font-semibold">
              {driver?.full_name || "Assigning technician..."}
            </p>
          </div>

          <div className="mt-4 rounded-2xl bg-black p-5">
            <p className="text-sm text-white/50">Service Address</p>
            <p className="mt-1">{job.address}</p>
            <p className="mt-1 text-sm text-white/40">{job.problem_type}</p>
          </div>

          <div className="mt-4 rounded-2xl bg-black p-5">
            <p className="text-sm text-white/50">Technician Location</p>

            {location ? (
              <div className="mt-4 space-y-4">
                <TrackingMap lat={location.lat} lng={location.lng} />

                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  <p>Lat: {location.lat}</p>
                  <p>Lng: {location.lng}</p>
                  <p>Speed: {location.speed ?? "-"} mph</p>
                  <p className="mt-2 text-xs text-white/40">
                    Updated: {new Date(location.updated_at).toLocaleString()}
                  </p>
                </div>

                <a
                  href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                  target="_blank"
                  className="inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
                >
                  Open in Google Maps
                </a>
              </div>
            ) : (
              <p className="mt-2 text-white/40">Location not available yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}