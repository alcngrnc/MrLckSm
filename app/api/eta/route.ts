import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { job_id } = await req.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 🔹 Job al
    const { data: job } = await supabase
      .from("jobs")
      .select("lat, lng")
      .eq("id", job_id)
      .single();

    if (!job?.lat || !job?.lng) {
      return NextResponse.json({ eta_minutes: null });
    }

    // 🔥 SADECE EN SON DRIVER KONUMUNU AL
    const { data: driver } = await supabase
      .from("technician_locations")
      .select("lat, lng")
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();

    if (!driver?.lat || !driver?.lng) {
      return NextResponse.json({ eta_minutes: null });
    }

    const url = `http://router.project-osrm.org/route/v1/driving/${driver.lng},${driver.lat};${job.lng},${job.lat}?overview=false`;

    console.log("OSRM URL:", url);

    const res = await fetch(url);
    const data = await res.json();

    console.log("OSRM RESPONSE:", data);

    const route = data?.routes?.[0];

    if (!route || !route.duration) {
      console.log("OSRM FAILED");
      return NextResponse.json({ eta_minutes: null });
    }

    const minutes = Math.round(route.duration / 60);

    return NextResponse.json({ eta_minutes: minutes });

  } catch (err) {
    console.error("ETA ERROR:", err);
    return NextResponse.json({ eta_minutes: null });
  }
}