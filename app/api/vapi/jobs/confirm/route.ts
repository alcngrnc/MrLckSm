import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type Body = {
  confirmation_token?: string;
};

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("x-ai-secret");

    if (secret !== process.env.AI_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;

    if (!body.confirmation_token) {
      return NextResponse.json(
        { error: "confirmation_token is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: existingJob, error: findError } = await supabase
      .from("jobs")
      .select("id, tracking_code, status, confirmation_token")
      .eq("confirmation_token", body.confirmation_token)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }

    if (!existingJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (existingJob.status !== "pending_customer_confirmation") {
      const trackingLink = `${process.env.NEXT_PUBLIC_SITE_URL}/track/${existingJob.tracking_code}`;

      return NextResponse.json({
        success: true,
        tracking_code: existingJob.tracking_code,
        tracking_link: trackingLink,
        message: "This request was already confirmed.",
      });
    }

    const { data: updatedJob, error: updateError } = await supabase
      .from("jobs")
      .update({
        status: "new",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", existingJob.id)
      .select("id, tracking_code, status")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const trackingLink = `${process.env.NEXT_PUBLIC_SITE_URL}/track/${updatedJob.tracking_code}`;

    return NextResponse.json({
      success: true,
      tracking_code: updatedJob.tracking_code,
      tracking_link: trackingLink,
      message: "Request confirmed and sent to dispatch.",
    });
  } catch (error) {
    console.error("CONFIRM_JOB_ERROR", error);

    return NextResponse.json(
      { error: "Failed to confirm job" },
      { status: 500 }
    );
  }
}