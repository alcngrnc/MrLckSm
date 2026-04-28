"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  useEffect(() => {
    const test = async () => {
      const { data, error } = await supabase.auth.getSession();
      console.log("Supabase connection:", data, error);
    };

    test();
  }, []);

  return (
    <div className="flex h-screen items-center justify-center text-white bg-black">
      <h1 className="text-3xl">MrLckSm System Ready 🚀</h1>
    </div>
  );
}