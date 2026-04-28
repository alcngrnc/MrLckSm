import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type AcceptPayload = {
  tracking_code?: string;
  eta_minutes?: number;
};

const allowedRoles = new Set(["technician", "admin", "dispatcher"]);

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tracking_code, eta_minutes }: AcceptPayload = await req.json();

    if (!tracking_code || typeof tracking_code !== "string") {
      return NextResponse.json(
        { error: "tracking_code is required" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json(
        { error: "Server config missing Supabase keys" },
        { status: 500 }
      );
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { data: authData, error: authError } = await authClient.auth.getUser(
      token
    );

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    if (!allowedRoles.has(String(profile.role || "").toLowerCase())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const safeEta =
      typeof eta_minutes === "number" && Number.isFinite(eta_minutes)
        ? Math.max(1, Math.floor(eta_minutes))
        : null;

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status: "accepted",
      accepted_driver_id: userId,
      accepted_at: nowIso,
    };

    if (safeEta !== null) {
      updatePayload.eta_minutes = safeEta;
      updatePayload.driver_eta_minutes = safeEta;
    }

    const { data: updatedRows, error: updateError } = await serviceClient
      .from("jobs")
      .update(updatePayload)
      .eq("tracking_code", tracking_code)
      .eq("status", "new")
      .is("accepted_driver_id", null)
      .select("id, tracking_code, status, accepted_driver_id, accepted_at, eta_minutes")
      .limit(1);

    if (updateError) {
      return NextResponse.json(
        { error: "Could not accept job", details: updateError.message },
        { status: 500 }
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "Job already accepted or unavailable" },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, job: updatedRows[0] });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to accept job",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
