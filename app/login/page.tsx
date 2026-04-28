"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Admin123!2026");
  const [message, setMessage] = useState("Ready");

  const login = async () => {
    setMessage("Clicked");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }

    setMessage("Success");
    window.location.href = "/LckPnl";
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="w-full max-w-md border border-white/10 rounded-2xl p-8">
        <h1 className="text-3xl font-bold mb-4">MrLckSm Login</h1>

        <div className="mb-4 bg-yellow-500/20 border border-yellow-500/40 rounded-xl p-3">
          {message}
        </div>

        <input
          className="w-full mb-4 bg-black border border-white/10 rounded-xl px-4 py-3"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full mb-6 bg-black border border-white/10 rounded-xl px-4 py-3"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="button"
          onClick={login}
          className="w-full bg-white text-black rounded-xl py-3 font-semibold"
        >
          Login
        </button>
      </div>
    </div>
  );
}