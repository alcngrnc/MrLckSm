"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ConfirmResponse = {
  success?: boolean;
  tracking_code?: string;
  tracking_link?: string;
  message?: string;
  error?: string;
};

export default function ConfirmJobPage() {
  const params = useParams();
  const token = String(params.token || "");

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ConfirmResponse | null>(null);

  useEffect(() => {
    const confirmJob = async () => {
      const response = await fetch("/api/vapi/jobs/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-secret": "super-secret-test-123",
        },
        body: JSON.stringify({ confirmation_token: token }),
      });

      const data = (await response.json()) as ConfirmResponse;
      setResult(data);
      setLoading(false);
    };

    if (token) {
      void confirmJob();
    }
  }, [token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        Confirming your request...
      </main>
    );
  }

  if (!result?.success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <div className="max-w-lg rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-2xl font-bold">Confirmation Failed</h1>
          <p className="mt-3 text-white/70">
            {result?.error || "This confirmation link is invalid or expired."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
      <div className="max-w-lg rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
        <h1 className="text-2xl font-bold">Request Confirmed</h1>

        <p className="mt-3 text-white/80">
          Your locksmith request has been confirmed. A technician will be assigned shortly.
        </p>

        <p className="mt-4 text-sm text-white/60">
          Tracking Code
        </p>

        <p className="text-xl font-bold">
          {result.tracking_code}
        </p>

        {result.tracking_link && (
          <a
            href={result.tracking_link}
            className="mt-5 inline-block rounded-xl bg-emerald-500 px-5 py-3 font-bold text-black"
          >
            Open Tracking Page
          </a>
        )}
      </div>
    </main>
  );
}