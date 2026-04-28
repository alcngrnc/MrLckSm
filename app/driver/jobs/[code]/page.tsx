"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";

const DriverJobRouteMap = dynamic(
  () => import("@/components/DriverJobRouteMap"),
  { ssr: false }
);

type Job = {
  id: string;
  tracking_code: string;
  customer_name: string | null;
  customer_phone: string | null;
  address: string;
  problem_type: string | null;
  description: string | null;
  status: string;
  accepted_driver_id: string | null;
  accepted_at: string | null;
  eta_minutes: number | null;
  lat: number | null;
  lng: number | null;
};

type Profile = {
  id: string;
  role?: string | null;
};

type DriverLocation = {
  lat: number;
  lng: number;
};

export default function DriverJobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobCode = String(params.code || "");

  const [job, setJob] = useState<Job | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [driverLoc, setDriverLoc] = useState<DriverLocation | null>(null);
  const [eta, setEta] = useState("20");
  const [trackingStarted, setTrackingStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);

  const fetchEverything = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      setMessage("Please login to continue.");
      router.push("/login");
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileData) {
      setProfile({
        id: profileData.id,
        role: profileData.role,
      });
    }

    const { data: jobData, error: jobError } = await supabase
      .from("jobs")
      .select(
        "id, tracking_code, customer_name, customer_phone, address, problem_type, description, status, accepted_driver_id, accepted_at, eta_minutes, lat, lng"
      )
      .eq("tracking_code", jobCode)
      .maybeSingle();

    if (jobError || !jobData) {
      setMessage("Job not found.");
      return;
    }

    setJob(jobData as Job);

    if (typeof jobData.eta_minutes === "number") {
      setEta(String(jobData.eta_minutes));
    }

    const { data: latestLocation } = await supabase
      .from("technician_locations")
      .select("lat, lng")
      .eq("job_id", jobData.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestLocation) {
      setDriverLoc({
        lat: latestLocation.lat,
        lng: latestLocation.lng,
      });
    }
  }, [jobCode, router]);

  useEffect(() => {
    void fetchEverything();
  }, [fetchEverything]);

  useEffect(() => {
    if (!jobCode) return;

    const channel = supabase
      .channel(`driver-job-${jobCode}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `tracking_code=eq.${jobCode}`,
        },
        (payload) => {
          const updatedJob = payload.new as Job;
          setJob(updatedJob);

          if (
            profile?.id &&
            updatedJob.status === "accepted" &&
            updatedJob.accepted_driver_id &&
            updatedJob.accepted_driver_id !== profile.id
          ) {
            alert("This job was already taken by another driver.");
            router.push("/driver");
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "technician_locations",
        },
        (payload) => {
          const loc = payload.new as {
            job_id?: string;
            lat?: number;
            lng?: number;
          };

          if (
            job?.id &&
            loc.job_id === job.id &&
            typeof loc.lat === "number" &&
            typeof loc.lng === "number"
          ) {
            setDriverLoc({
              lat: loc.lat,
              lng: loc.lng,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobCode, profile?.id, router, job?.id]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const isMine = useMemo(() => {
    return !!job && !!profile && job.accepted_driver_id === profile.id;
  }, [job, profile]);

  const isAdminOrDispatcher = useMemo(() => {
    return profile?.role === "admin" || profile?.role === "dispatcher";
  }, [profile]);

  const canAccept = useMemo(() => {
    return !!job && job.status === "new" && !job.accepted_driver_id;
  }, [job]);

  const canManageJob = useMemo(() => {
    return isMine || isAdminOrDispatcher;
  }, [isMine, isAdminOrDispatcher]);

  const acceptJob = async () => {
    if (!job) return;

    setBusy(true);
    setMessage(null);

    const { data, error } = await supabase.rpc("accept_job", {
      job_id: job.id,
      eta_minutes_input: Number(eta),
    });

    if (error) {
      if (
        error.message.includes("JOB_ALREADY_ACCEPTED") ||
        error.message.includes("already")
      ) {
        alert("This job was already taken by another driver.");
        router.push("/driver");
        return;
      }

      console.error(error);
      setMessage(error.message || "Could not accept job.");
      setBusy(false);
      await fetchEverything();
      return;
    }

    const acceptedJob = data as Job;
    setJob(acceptedJob);

    const siteUrl = window.location.origin;
    const trackingLink = `${siteUrl}/track/${acceptedJob.tracking_code}`;

    try {
      await fetch("/api/sms/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-secret": "super-secret-test-123",
        },
        body: JSON.stringify({
          to: acceptedJob.customer_phone,
          message: `MrLckSm: Your technician accepted the job. ETA: ${
            acceptedJob.eta_minutes || eta
          } minutes. Track here: ${trackingLink}`,
        }),
      });
    } catch (smsError) {
      console.error("ACCEPT_SMS_ERROR", smsError);
    }

    setMessage("Job accepted. Customer notification prepared.");
    setBusy(false);
    await fetchEverything();
  };

  const updateStatus = async (status: "on_the_way" | "completed") => {
    if (!job) return;

    if (!canManageJob) {
      setMessage("Only the assigned driver can update this job.");
      return;
    }

    setBusy(true);
    setMessage(null);

    const { error } = await supabase
      .from("jobs")
      .update({
        status,
        eta_minutes: Number(eta),
      })
      .eq("id", job.id);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(
        status === "completed"
          ? "Job marked completed."
          : "Driver is now on the way."
      );
    }

    setBusy(false);
    await fetchEverything();
  };

  const sendDriverLocation = async (position: GeolocationPosition) => {
    if (!job?.tracking_code) return;

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    setDriverLoc({ lat, lng });

    const response = await fetch("/api/tracking/location", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-secret": "super-secret-test-123",
      },
      body: JSON.stringify({
        tracking_code: job.tracking_code,
        lat,
        lng,
        speed: position.coords.speed,
        heading: position.coords.heading,
        accuracy: position.coords.accuracy,
      }),
    });

    if (!response.ok) {
      throw new Error("Could not send location.");
    }
  };

  const startTracking = () => {
    if (!job?.tracking_code) return;

    if (!canManageJob) {
      setMessage("Only the assigned driver can start tracking.");
      return;
    }

    if (!navigator.geolocation) {
      setMessage("Geolocation not available.");
      return;
    }

    if (watchIdRef.current !== null) {
      setMessage("Live tracking is already active.");
      return;
    }

    setTrackingStarted(true);
    setMessage("Live tracking started.");

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          await sendDriverLocation(position);
          setMessage("Live tracking active.");
        } catch (error) {
          console.error(error);
          setMessage("Could not send live location.");
        }
      },
      (error) => {
        console.error(error);
        setTrackingStarted(false);
        setMessage("Could not access driver location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setTrackingStarted(false);
    setMessage("Live tracking stopped.");
  };

  if (!job) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        {message || "Loading..."}
      </div>
    );
  }

  const trackingLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/track/${job.tracking_code}`
      : `/track/${job.tracking_code}`;

  const googleMapsLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    job.address
  )}`;

  return (
    <main className="min-h-screen bg-neutral-950 p-4 text-white sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <button
          onClick={() => router.push("/driver")}
          className="rounded-xl border border-white/20 px-4 py-2 font-semibold"
        >
          Back to Driver Panel
        </button>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-white/60">Job Code: {job.tracking_code}</p>

          <h1 className="mt-2 text-3xl font-bold">
            {job.customer_name || "Unknown Customer"}
          </h1>

          <div className="mt-4 space-y-1 text-white/80">
            <p>Phone: {job.customer_phone || "-"}</p>
            <p>Address: {job.address}</p>
            <p>Problem: {job.problem_type || "-"}</p>
            <p>Description: {job.description || "-"}</p>
            <p>Status: {job.status}</p>
            <p>Accepted Driver: {job.accepted_driver_id || "-"}</p>
            <p>ETA: {job.eta_minutes || eta} minutes</p>
          </div>

          <div className="mt-5">
            <label className="text-sm text-white/60">ETA Minutes</label>
            <input
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none"
              type="number"
              min="1"
            />
          </div>

          <div className="mt-5">
            <DriverJobRouteMap
              jobLat={job.lat || null}
              jobLng={job.lng || null}
              driverLat={driverLoc?.lat || null}
              driverLng={driverLoc?.lng || null}
              customerName={job.customer_name}
              address={job.address}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              disabled={!canAccept || busy}
              onClick={() => void acceptJob()}
              className="rounded-xl bg-green-500 px-5 py-3 text-base font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Processing..." : "Accept Job"}
            </button>

            <button
              disabled={busy || !canManageJob}
              onClick={() => void updateStatus("on_the_way")}
              className="rounded-xl bg-blue-500 px-5 py-3 text-base font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              On The Way
            </button>

            <a
              href={googleMapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-yellow-400 px-5 py-3 text-base font-bold text-black"
            >
              Open Google Maps
            </a>

            <button
              disabled={busy || !canManageJob}
              onClick={() => void updateStatus("completed")}
              className="rounded-xl bg-white px-5 py-3 text-base font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Complete
            </button>

            {trackingStarted ? (
              <button
                disabled={busy || !canManageJob}
                onClick={stopTracking}
                className="rounded-xl bg-red-500 px-5 py-3 text-base font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Stop Live Tracking
              </button>
            ) : (
              <button
                disabled={busy || !canManageJob}
                onClick={startTracking}
                className="rounded-xl bg-purple-500 px-5 py-3 text-base font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start Live Tracking
              </button>
            )}
          </div>

          {message && (
            <p className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">
              {message}
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-white/60">Tracking Link</p>
          <p className="mt-1 break-all text-white">{trackingLink}</p>

          <Link
            href={`/track/${job.tracking_code}`}
            className="mt-3 inline-block rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold"
          >
            Open Customer Tracking
          </Link>
        </section>
      </div>
    </main>
  );
}