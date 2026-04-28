import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type LocationBody = {
  tracking_code?: string;
  lat?: number;
  lng?: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
};

function isValidCoordinate(lat: unknown, lng: unknown) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("x-ai-secret");

    if (!process.env.AI_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: "Server secret is not configured" },
        { status: 500 }
      );
    }

    if (secret !== process.env.AI_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as LocationBody;

    if (!body.tracking_code) {
      return NextResponse.json(
        { error: "tracking_code is required" },
        { status: 400 }
      );
    }

    if (!isValidCoordinate(body.lat, body.lng)) {
      return NextResponse.json(
        { error: "Valid lat/lng are required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("tracking_code", body.tracking_code)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status === "completed") {
      return NextResponse.json(
        { error: "Completed job cannot receive location updates" },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("technician_locations").insert({
      job_id: job.id,
      lat: body.lat,
      lng: body.lng,
      heading: typeof body.heading === "number" ? body.heading : null,
      speed: typeof body.speed === "number" ? body.speed : null,
      accuracy: typeof body.accuracy === "number" ? body.accuracy : null,
      recorded_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      job_id: job.id,
    });
  } catch (error) {
    console.error("TRACKING_LOCATION_ERROR", error);

    return NextResponse.json(
      { error: "Invalid tracking location request" },
      { status: 400 }
    );
  }
}