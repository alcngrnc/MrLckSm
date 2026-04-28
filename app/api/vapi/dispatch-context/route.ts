import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type DispatchContextBody = {
  customer_address?: string;
  problem_type?: string;
  tracking_code?: string;
};

function estimateServiceMinutes(problemType?: string) {
  switch (problemType) {
    case "car_lockout":
      return 15;
    case "house_lockout":
      return 20;
    case "car_key_programming":
      return 45;
    case "key_duplication":
      return 20;
    case "lock_change":
      return 35;
    default:
      return 25;
  }
}

function buildCustomerMessage(params: {
  hasDriver: boolean;
  activeJobCount: number;
  etaMinutes: number | null;
}) {
  if (!params.hasDriver) {
    return "At the moment, I do not have an available technician confirmed. I can create your request and notify you as soon as a technician is assigned.";
  }

  if (params.etaMinutes === null) {
    return "I can create your request now. A technician will review it and you will receive an updated ETA shortly.";
  }

  if (params.activeJobCount > 0) {
    return `Our technician is currently finishing another job. The realistic estimated arrival time is around ${params.etaMinutes} minutes.`;
  }

  return `A technician is available. The estimated arrival time is around ${params.etaMinutes} minutes.`;
}

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("x-ai-secret");

    if (!process.env.AI_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "AI_WEBHOOK_SECRET is not configured" },
        { status: 500 }
      );
    }

    if (secret !== process.env.AI_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as DispatchContextBody;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // 🔹 Driverları çek
    const { data: drivers, error: driversError } = await supabase
      .from("profiles")
      .select("id, role")
      .in("role", ["technician", "admin", "dispatcher"]);

    if (driversError) {
      return NextResponse.json({ error: driversError.message }, { status: 500 });
    }

    const driverIds = (drivers || []).map((d) => d.id);

    if (driverIds.length === 0) {
      return NextResponse.json({
        success: true,
        has_driver: false,
        eta_minutes: null,
        active_job_count: 0,
        driver_count: 0,
        customer_message: buildCustomerMessage({
          hasDriver: false,
          activeJobCount: 0,
          etaMinutes: null,
        }),
      });
    }

    // 🔹 Aktif işler
    const { data: activeJobs, error: activeJobsError } = await supabase
      .from("jobs")
      .select(
        "id, tracking_code, problem_type, status, accepted_driver_id, eta_minutes, created_at"
      )
      .in("accepted_driver_id", driverIds)
      .in("status", ["accepted", "on_the_way", "in_progress"])
      .order("created_at", { ascending: true });

    if (activeJobsError) {
      return NextResponse.json(
        { error: activeJobsError.message },
        { status: 500 }
      );
    }

    const activeJobCount = activeJobs?.length || 0;
    const baseServiceMinutes = estimateServiceMinutes(body.problem_type);

    let etaMinutes: number | null = null;

    // 🔥 GERÇEK ETA (OSRM üzerinden)
    if (body.tracking_code) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id")
        .eq("tracking_code", body.tracking_code)
        .single();

      if (job) {
        try {
          const etaRes = await fetch(
            `${process.env.NEXT_PUBLIC_SITE_URL}/api/eta`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ job_id: job.id }),
            }
          );

          const etaData = await etaRes.json();
          etaMinutes = etaData.eta_minutes;
        } catch (err) {
          console.error("ETA_FETCH_ERROR", err);
        }
      }
    }

    // 🔹 fallback (eski hesaplama)
    if (etaMinutes === null) {
      if (activeJobCount === 0) {
        etaMinutes = 20;
      } else {
        const remaining = activeJobs!.reduce((total, job) => {
          return (
            total +
            (job.eta_minutes ||
              estimateServiceMinutes(job.problem_type))
          );
        }, 0);

        etaMinutes = remaining + baseServiceMinutes;
      }
    }

    return NextResponse.json({
      success: true,
      has_driver: true,
      active_job_count: activeJobCount,
      eta_minutes: etaMinutes,
      suggested_service_minutes: baseServiceMinutes,
      driver_count: driverIds.length,
      customer_message: buildCustomerMessage({
        hasDriver: true,
        activeJobCount,
        etaMinutes,
      }),
      active_jobs: activeJobs || [],
    });
  } catch (error) {
    console.error("VAPI_DISPATCH_CONTEXT_ERROR", error);

    return NextResponse.json(
      { error: "Invalid dispatch context request" },
      { status: 400 }
    );
  }
}