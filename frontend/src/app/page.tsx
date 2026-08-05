import { RaidRoom } from "@/components/raid-room";
import {
  deriveRaidStatePda,
  MAGICBLOCK_DEVNET,
  roomCodeToRaidId
} from "@/lib/magicblock";

const pillars = [
  { label: "Room Sync", value: "Snapshot API", detail: "Day 4" },
  { label: "Authority", value: "MagicBlock ER", detail: "Verified path" },
  { label: "Settlement", value: "Solana devnet", detail: "Final result" }
];

export default function Home() {
  const [sampleRoomRaidStatePda] = deriveRaidStatePda(roomCodeToRaidId("DEMO00"));

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-7xl gap-6">
        <section className="rounded-md border border-border bg-card p-4 text-card-foreground md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                MagicBlock Blitz
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal md:text-4xl">
                Multiplayer Raid Room
              </h1>
            </div>
            <div className="rounded-md border border-border px-3 py-2 text-sm">
              <span className="font-mono tabular-nums">DAY-006</span>
              <span className="ml-2 text-muted-foreground">settlement</span>
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

          <div className="mt-6">
            <RaidRoom />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-border bg-card p-4 text-card-foreground md:p-6">
            <h2 className="text-xl font-semibold">Verified Path</h2>
            <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
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
                <dt className="text-muted-foreground">Sample Room PDA</dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {sampleRoomRaidStatePda.toBase58()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-md border border-border bg-card p-4 text-card-foreground md:p-6">
            <h2 className="text-xl font-semibold">Day 6 Checks</h2>
            <div className="mt-4 grid gap-3">
              {["Per-room devnet PDA", "Settlement instruction wired", "Critical constraints tested"].map(
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
