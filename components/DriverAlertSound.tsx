"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  shouldAlert: boolean;
  alertKey: string;
};

export default function DriverAlertSound({ shouldAlert, alertKey }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const canPlay = useMemo(
    () => enabled && !muted && shouldAlert,
    [enabled, muted, shouldAlert]
  );

  useEffect(() => {
    setEnabled(localStorage.getItem("driver_sound_enabled") === "true");
    setMuted(localStorage.getItem("driver_sound_muted") === "true");
  }, []);

  const stopFallbackBeep = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const playBeep = useCallback(() => {
    const Ctor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!Ctor) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctor();
    }

    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.2;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }, []);

  const startFallbackLoop = useCallback(() => {
    stopFallbackBeep();
    playBeep();

    intervalRef.current = window.setInterval(() => {
      playBeep();
    }, 850);
  }, [playBeep, stopFallbackBeep]);

  const stopAllSounds = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    stopFallbackBeep();
  }, [stopFallbackBeep]);

  useEffect(() => {
    return () => {
      stopAllSounds();

      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, [stopAllSounds]);

  useEffect(() => {
    if (!canPlay) {
      stopAllSounds();
      return;
    }

    const audio = audioRef.current;

    if (!audio) {
      startFallbackLoop();
      return;
    }

    audio.loop = true;
    audio.volume = 1;
    audio.currentTime = 0;

    audio
      .play()
      .then(() => {
        setAutoplayBlocked(false);
        stopFallbackBeep();
      })
      .catch(() => {
        setAutoplayBlocked(true);
        startFallbackLoop();
      });
  }, [canPlay, alertKey, startFallbackLoop, stopAllSounds, stopFallbackBeep]);

  const enableAlerts = async () => {
    localStorage.setItem("driver_sound_enabled", "true");
    localStorage.setItem("driver_sound_muted", "false");

    setEnabled(true);
    setMuted(false);

    if (audioCtxRef.current?.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    if (shouldAlert) {
      const audio = audioRef.current;

      if (audio) {
        audio.loop = true;
        audio.volume = 1;

        try {
          await audio.play();
          setAutoplayBlocked(false);
          stopFallbackBeep();
        } catch {
          setAutoplayBlocked(true);
          startFallbackLoop();
        }
      } else {
        startFallbackLoop();
      }
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;

    localStorage.setItem("driver_sound_muted", String(nextMuted));
    setMuted(nextMuted);

    if (nextMuted) {
      stopAllSounds();
    }
  };

  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
      <audio ref={audioRef} src="/sounds/new-job-alert.mp3" preload="auto" />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={enableAlerts}
          className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
        >
          {enabled ? "Sound Alerts Enabled" : "Enable Sound Alerts"}
        </button>

        <button
          onClick={toggleMute}
          className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white"
        >
          {muted ? "Unmute Alert" : "Mute Alert"}
        </button>
      </div>

      <p className="mt-2 text-sm text-white/80">
        {autoplayBlocked
          ? "Browser blocked autoplay. Click Enable Sound Alerts once."
          : "Loud looping alert runs while available jobs exist."}
      </p>
    </div>
  );
}