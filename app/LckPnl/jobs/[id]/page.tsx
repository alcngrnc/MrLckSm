"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";

type Job = {
  id: string;
  tracking_code: string | null;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  address: string;
  problem_type: string | null;
  description: string | null;
  status: string;
  eta_minutes: number | null;
  accepted_driver_id: string | null;
  accepted_at: string | null;
};

type DriverProfile = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobCode = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [acceptedDriver, setAcceptedDriver] = useState<DriverProfile | null>(null);
  const [eta, setEta] = useState("20");
  const [trackingStarted, setTrackingStarted] = useState(false);

  const fetchJob = useCallback(async () => {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("tracking_code", jobCode)
      .single();

    if (!error) {
      setJob(data);
      if (data?.accepted_driver_id) {
        const { data: driverData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.accepted_driver_id)
          .maybeSingle();

        setAcceptedDriver((driverData as DriverProfile | null) || null);
      } else {
        setAcceptedDriver(null);
      }
    }
  }, [jobCode]);

  const updateStatus = async (status: string) => {
  if (status === "accepted") {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      alert("Missing auth session, please log in again.");
      return;
    }

    const acceptRes = await fetch("/api/jobs/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tracking_code: jobCode,
        eta_minutes: Number(eta),
      }),
    });

    if (!acceptRes.ok) {
      const payload = await acceptRes.json();
      alert(payload.error || "Failed to accept job");
      fetchJob();
      return;
    }
  } else {
    await supabase
      .from("jobs")
      .update({
        status,
        eta_minutes: Number(eta),
      })
      .eq("tracking_code", jobCode);
  }

  if (status === "accepted" && job?.customer_phone) {
    const trackingLink = `${window.location.origin}/track/${job.tracking_code}`;

    const smsRes = await fetch("/api/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: job.customer_phone,
        message: `MrLckSm Update: Your technician is on the way. ETA: ${eta} minutes. Track here: ${trackingLink}`,
      }),
    });

    const smsData = await smsRes.json();

    if (!smsData.success) {
      alert(`Job accepted, but SMS was not sent yet: ${smsData.error}`);
    } else {
      alert("Job accepted and SMS sent.");
    }
  }

  fetchJob();
};

  const startTracking = () => {
  if (!job?.tracking_code) {
    alert("Tracking code not found");
    return;
  }

  if (!navigator.geolocation) {
    alert("Geolocation is not supported on this device");
    return;
  }

  setTrackingStarted(true);

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      await fetch("/api/tracking/location", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-secret": "super-secret-test-123",
        },
        body: JSON.stringify({
          tracking_code: job.tracking_code,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
        }),
      });

      alert("Location sent successfully");
    },
    (error) => {
      alert(`Location error: ${error.code} - ${error.message}`);
      setTrackingStarted(false);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
};

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      void fetchJob();
    }, 0);
    return () => window.clearTimeout(initTimer);
  }, [fetchJob]);

  if (!job) return null;

  const trackingLink = `${window.location.origin}/track/${job.tracking_code}`;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <button
        onClick={() => router.push("/LckPnl")}
        className="mb-6 rounded-xl border border-white/10 px-4 py-2"
      >
        ← Back
      </button>

      <h1 className="text-3xl font-bold">
        {job.customer_name || "Unknown Customer"}
      </h1>

      <div className="mt-4 space-y-2 text-white/70">
        <p>Phone: {job.customer_phone}</p>
        <p>Email: {job.customer_email || "-"}</p>
        <p>Address: {job.address}</p>
        <p>Problem: {job.problem_type}</p>
        <p>Description: {job.description}</p>
        <p>Status: {job.status}</p>
        <p>
          Accepted Time:{" "}
          {job.accepted_at ? new Date(job.accepted_at).toLocaleString() : "Not accepted"}
        </p>
        <p>Accepted Driver: {acceptedDriver?.full_name || acceptedDriver?.email || "-"}</p>
        <p>Accepted Driver Phone: {acceptedDriver?.phone || "-"}</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <input
          value={eta}
          onChange={(e) => setEta(e.target.value)}
          className="rounded-xl border border-white/10 bg-black px-3 py-2"
          placeholder="ETA minutes"
        />

        <button
          onClick={() => updateStatus("accepted")}
          className="rounded-xl bg-green-500 px-4 py-2 text-black"
        >
          Accept
        </button>

        <button
          onClick={() => updateStatus("on_the_way")}
          className="rounded-xl bg-blue-500 px-4 py-2"
        >
          On The Way
        </button>

        <button
          onClick={() => updateStatus("completed")}
          className="rounded-xl bg-white px-4 py-2 text-black"
        >
          Complete
        </button>

        <button
          onClick={startTracking}
          className="rounded-xl bg-purple-500 px-4 py-2 font-semibold text-white"
        >
          {trackingStarted ? "Live Tracking Active" : "Start Live Tracking"}
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-white/50">Tracking Link</p>
        <p className="mt-2 break-all">{trackingLink}</p>
      </div>
    </div>
  );
}