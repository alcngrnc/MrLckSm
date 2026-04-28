import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const envCheck = {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasWebhookSecret: !!process.env.AI_WEBHOOK_SECRET,
    };

    const secret = req.headers.get("x-ai-secret");

    if (!envCheck.hasWebhookSecret) {
      return NextResponse.json({ error: "Missing AI_WEBHOOK_SECRET", envCheck }, { status: 500 });
    }

    if (secret !== process.env.AI_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized", envCheck }, { status: 401 });
    }

    if (!envCheck.hasUrl) {
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL", envCheck }, { status: 500 });
    }

    if (!envCheck.hasServiceKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY", envCheck }, { status: 500 });
    }

    const body = await req.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("jobs")
      .insert({
        customer_name: body.customer_name,
  customer_phone: body.customer_phone,
  customer_email: body.customer_email || null,
  address: body.address,
  lat: body.lat || null,
  lng: body.lng || null,
  problem_type: body.problem_type,
  description: body.description,
  status: "new",
  tracking_code: `LK-${Math.floor(10000 + Math.random() * 90000)}`
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Supabase insert failed", supabaseError: error, envCheck },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, job: data, envCheck });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Server crashed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}