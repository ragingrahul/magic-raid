import { PhaserArena } from "@/components/phaser-arena";
import {
  deriveRaidStatePda,
  MAGICBLOCK_DEVNET
} from "@/lib/magicblock";

const pillars = [
  { label: "Authority", value: "MagicBlock ER", detail: "Asia devnet" },
  { label: "Strategy", value: "AI enum only", detail: "Zod validated" },
  { label: "Settlement", value: "Solana devnet", detail: "Final result" }
];

export default function Home() {
  const [raidStatePda] = deriveRaidStatePda();

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex min-h-130 flex-col rounded-lg border border-border bg-card p-4 text-card-foreground md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                MagicBlock Blitz
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal md:text-4xl">
                Adaptive AI Raid Boss
              </h1>
            </div>
            <div className="rounded-md border border-border px-3 py-2 text-sm">
              <span className="font-mono tabular-nums">MB-002</span>
              <span className="ml-2 text-muted-foreground">spike</span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {pillars.map((pillar) => (
              <div key={pillar.label} className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                  {pillar.label}
                </p>
                <p className="mt-2 text-base font-semibold">{pillar.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{pillar.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex-1">
            <div className="min-h-80 rounded-lg border border-border bg-muted/40 p-3">
              <PhaserArena />
            </div>
          </div>
        </section>

        <section className="grid gap-6">
          <div className="rounded-lg border border-border bg-card p-4 text-card-foreground md:p-6">
            <h2 className="text-xl font-semibold">Verified MagicBlock Path</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Router RPC</dt>
                <dd className="mt-1 break-all font-mono">{MAGICBLOCK_DEVNET.routerRpc}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ER Asia RPC</dt>
                <dd className="mt-1 break-all font-mono">{MAGICBLOCK_DEVNET.erAsiaRpc}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Asia Validator</dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {MAGICBLOCK_DEVNET.asiaValidator}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">RaidState PDA</dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {raidStatePda.toBase58()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 text-card-foreground md:p-6">
            <h2 className="text-xl font-semibold">Next Work</h2>
            <div className="mt-4 space-y-3">
              {["NET-001 room sync", "AI-001 analytics summary", "SOL-002 settlement instruction"].map(
                (item) => (
                  <div
                    key={item}
                    className="flex min-h-10 items-center rounded-md border border-border px-3 text-sm"
                  >
                    {item}
                  </div>
                )
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
