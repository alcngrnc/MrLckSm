import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type Body = {
  tracking_code?: string;
  phone?: string;
};

function buildStatusMessage(job: {
  status: string;
  tracking_code: string;
  eta_minutes: number | null;
  accepted_driver_id: string | null;
}) {
  if (job.status === "pending_customer_confirmation") {
    return "Your request is created but still needs confirmation. Please confirm the link we sent before we dispatch a technician.";
  }

  if (job.status === "new") {
    return "Your request is confirmed and waiting for a technician to accept it.";
  }

  if (job.status === "accepted") {
    return `Your technician has accepted the job. Estimated arrival time is around ${job.eta_minutes || 25} minutes.`;
  }

  if (job.status === "on_the_way") {
    return `Your technician is on the way. Estimated arrival time is around ${job.eta_minutes || 20} minutes.`;
  }

  if (job.status === "completed") {
    return "Your service request has been completed.";
  }

  if (job.status === "cancelled") {
    return "Your service request has been cancelled.";
  }

  return `Your request status is ${job.status}.`;
}

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("x-ai-secret");

    if (secret !== process.env.AI_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;

    if (!body.tracking_code && !body.phone) {
      return NextResponse.json(
        { error: "tracking_code or phone is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    let query = supabase
      .from("jobs")
      .select(
        "id, tracking_code, customer_name, customer_phone, address, problem_type, description, status, accepted_driver_id, eta_minutes, price_quote_min, price_quote_max, confirmed_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(1);

    if (body.tracking_code) {
      query = query.eq("tracking_code", body.tracking_code);
    } else if (body.phone) {
      query = query.eq("customer_phone", body.phone);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const trackingLink = `${siteUrl}/track/${data.tracking_code}`;

    return NextResponse.json({
      success: true,
      job: {
        tracking_code: data.tracking_code,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        address: data.address,
        problem_type: data.problem_type,
        description: data.description,
        status: data.status,
        accepted_driver_id: data.accepted_driver_id,
        eta_minutes: data.eta_minutes,
        price_quote_min: data.price_quote_min,
        price_quote_max: data.price_quote_max,
        confirmed_at: data.confirmed_at,
        created_at: data.created_at,
      },
      tracking_link: trackingLink,
      vapi_response: buildStatusMessage(data),
    });
  } catch (error) {
    console.error("VAPI_JOB_STATUS_ERROR", error);

    return NextResponse.json(
      { error: "Failed to get job status" },
      { status: 500 }
    );
  }
}