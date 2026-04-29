import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { geocodeAddress } from "@/lib/geocode";

type Body = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  problem_type?: string;
  description?: string;
};

function generateTrackingCode() {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `LK-${num}`;
}

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

function getPricing(problem?: string) {
  switch (problem) {
    case "car_lockout":
      return { min: 95, max: 180 };
    case "house_lockout":
      return { min: 85, max: 160 };
    case "lock_change":
      return { min: 120, max: 250 };
    case "car_key_programming":
      return { min: 180, max: 450 };
    case "key_duplication":
      return { min: 80, max: 180 };
    default:
      return { min: 100, max: 200 };
  }
}

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("x-ai-secret");

    if (secret !== process.env.AI_WEBHOOK_SECRET) {
      return NextResponse.json(
        {
          success: false,
          supabase_inserted: false,
          supabase_error: null,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Body;

    if (!body.first_name || !body.phone || !body.address) {
      return NextResponse.json(
        {
          success: false,
          supabase_inserted: false,
          supabase_error: null,
          error: "first_name, phone and address are required",
        },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const tracking_code = generateTrackingCode();
    const confirmation_token = generateToken();
    const pricing = getPricing(body.problem_type);

    let lat: number | null = null;
    let lng: number | null = null;

    try {
      const coords = await geocodeAddress(body.address);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    } catch (geoErr) {
      console.error("GEOCODE_ERROR", geoErr);
    }

    const { data, error } = await supabase
      .from("jobs")
      .insert({
        tracking_code,
        first_name: body.first_name,
        last_name: body.last_name || null,
        customer_name: `${body.first_name} ${body.last_name || ""}`.trim(),
        customer_phone: body.phone,
        address: body.address,
        problem_type: body.problem_type || null,
        description: body.description || null,
        status: "new",
        confirmation_token,
        price_quote_min: pricing.min,
        price_quote_max: pricing.max,
        price_quote_note:
          "Final price depends on lock type, vehicle model, key type, location, time, and job complexity. Technician confirms final price before starting.",
        source: "vapi",
        lat,
        lng,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          supabase_inserted: false,
          supabase_error: error.message,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const confirmLink = `${siteUrl}/confirm/${confirmation_token}`;
    const trackingLink = `${siteUrl}/track/${tracking_code}`;

    const smsMessage = `MrLckSm: Please confirm your locksmith request. Address: ${body.address}. Price estimate: $${pricing.min}-$${pricing.max}. Confirm here: ${confirmLink}`;

    let smsResult: unknown = null;

    try {
      const smsResponse = await fetch(`${siteUrl}/api/sms/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-secret": process.env.AI_WEBHOOK_SECRET!,
        },
        body: JSON.stringify({
          to: body.phone,
          message: smsMessage,
        }),
      });

      smsResult = await smsResponse.json();
    } catch (smsError) {
      console.error("CONFIRMATION_SMS_ERROR", smsError);
      smsResult = {
        success: false,
        notification_status: "sms_failed",
        error: "SMS failed but job was created.",
      };
    }

    return NextResponse.json({
      success: true,
      supabase_inserted: Boolean(data?.id),
      supabase_error: null,
      job_id: data.id,
      tracking_code,
      confirm_link: confirmLink,
      tracking_link: trackingLink,
      price_min: pricing.min,
      price_max: pricing.max,
      lat,
      lng,
      sms: smsResult,
      vapi_response: `Thank you ${body.first_name}. I created your request and sent a confirmation link to your phone. The estimated price range is ${pricing.min} to ${pricing.max} dollars. Please confirm the request using the link.`,
    });
  } catch (err) {
    console.error("CREATE_JOB_ERROR", err);

    return NextResponse.json(
      {
        success: false,
        supabase_inserted: false,
        supabase_error: null,
        error: "Failed to create job",
      },
      { status: 500 }
    );
  }
}