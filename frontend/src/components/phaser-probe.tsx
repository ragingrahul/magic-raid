"use client";

import { useEffect, useState } from "react";

type PhaserStatus = "loading" | "ready" | "error";

export function PhaserProbe() {
  const [status, setStatus] = useState<PhaserStatus>("loading");
  const [version, setVersion] = useState<string>("unknown");

  useEffect(() => {
    let active = true;

    async function loadPhaser() {
      try {
        const phaser = await import("phaser");
        if (!active) return;
        setVersion(phaser.VERSION);
        setStatus("ready");
      } catch {
        if (!active) return;
        setStatus("error");
      }
    }

    void loadPhaser();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex h-full min-h-[296px] flex-col justify-between rounded-md border border-border bg-background p-4">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Arena Runtime</p>
        <h2 className="mt-2 text-xl font-semibold">Phaser 3 probe</h2>
      </div>

      <div className="grid place-items-center py-8">
        <div className="relative size-40 rounded-full border border-border bg-card">
          <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-md bg-primary" />
          <div className="absolute left-5 top-6 size-5 rounded-full bg-accent" />
          <div className="absolute bottom-7 right-6 size-5 rounded-full bg-accent" />
        </div>
      </div>

      <div
        aria-live="polite"
        className="flex min-h-10 items-center justify-between gap-3 rounded-md bg-muted px-3 text-sm"
      >
        <span className="text-muted-foreground">Runtime status</span>
        <span className="font-mono tabular-nums">
          {status === "ready" ? `ready ${version}` : status}
        </span>
      </div>
    </div>
  );
}
