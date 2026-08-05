"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhaserArena } from "@/components/phaser-arena";
import {
  GAME_LIMITS,
  PLAYER_CLASSES,
  RaidClientMessageSchema,
  RaidErrorMessageSchema,
  RaidSnapshotMessageSchema,
  RoomSettlementStatusSchema,
  RoomStrategyUpdateSchema,
  RoomSessionSchema,
  SolanaAddressSchema,
  type BossStrategyDecision,
  type PlayerAttackKind,
  type PlayerClass,
  type Position,
  type RaidAnalyticsSummary,
  type RoomAuthorityStatus,
  type RoomSettlementStatus,
  type RaidSnapshot,
  type RoomSession
} from "@/game/schemas";

type StoredRoomSession = {
  roomCode: string;
  playerId: string;
};

type WalletState = {
  address: string;
  source: "injected" | "demo";
};

type WalletStatus = "idle" | "connecting" | "connected";
type RoomStatus = "idle" | "creating" | "joining" | "connected" | "reconnecting";

type SolanaProvider = {
  publicKey?: {
    toBase58: () => string;
  };
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey?: {
      toBase58: () => string;
    };
  }>;
  disconnect?: () => Promise<void>;
};

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: {
      solana?: SolanaProvider;
    };
  }
}

const ROOM_STORAGE_KEY = "magicraid.roomSession.v1";
const WALLET_STORAGE_KEY = "magicraid.wallet.v1";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function RaidRoom() {
  const [displayName, setDisplayName] = useState("Raider");
  const [playerClass, setPlayerClass] = useState<PlayerClass>("warrior");
  const [joinCode, setJoinCode] = useState("");
  const [session, setSession] = useState<StoredRoomSession | null>(null);
  const [snapshot, setSnapshot] = useState<RaidSnapshot | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>("idle");
  const [walletError, setWalletError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<RaidAnalyticsSummary | null>(null);
  const [lastDecision, setLastDecision] = useState<BossStrategyDecision | null>(null);
  const [adaptationCount, setAdaptationCount] = useState(0);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [authorityStatus, setAuthorityStatus] = useState<RoomAuthorityStatus | null>(null);
  const [settlementStatus, setSettlementStatus] = useState<RoomSettlementStatus | null>(null);
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const clientSequenceRef = useRef(0);
  const inputQueueRef = useRef<Promise<void>>(Promise.resolve());
  const inputBusyRef = useRef(false);

  const currentPlayer = useMemo(
    () => snapshot?.players.find((player) => player.id === session?.playerId),
    [session?.playerId, snapshot?.players]
  );
  const roomFormDisabled = !wallet;

  const profilePayload = useMemo(
    () => ({
      displayName: displayName.trim() || "Raider",
      playerClass,
      ...(wallet ? { wallet: wallet.address } : {})
    }),
    [displayName, playerClass, wallet]
  );

  const saveRoomSession = useCallback((nextSession: StoredRoomSession | null) => {
    setSession(nextSession);
    if (!nextSession) {
      window.localStorage.removeItem(ROOM_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(nextSession));
  }, []);

  const applyRoomSession = useCallback(
    (roomSession: RoomSession) => {
      const nextSession = {
        roomCode: roomSession.roomCode,
        playerId: roomSession.playerId
      };
      saveRoomSession(nextSession);
      setSnapshot(roomSession.snapshot);
      setAuthorityStatus(roomSession.authority ?? null);
      setRoomStatus("connected");
      setFormError(null);
      setSyncError(null);
      setAnalytics(null);
      setLastDecision(null);
      setAdaptationCount(0);
      setStrategyError(null);
      setSettlementStatus(null);
      setSettlementBusy(false);
    },
    [saveRoomSession]
  );

  const fetchRoomSession = useCallback(async (targetSession: StoredRoomSession) => {
    const response = await fetch(
      `/api/rooms/${targetSession.roomCode}?playerId=${encodeURIComponent(targetSession.playerId)}`,
      {
        cache: "no-store"
      }
    );
    const payload = await parseJsonResponse(response);
    return RoomSessionSchema.parse(payload);
  }, []);

  useEffect(() => {
    try {
      const storedRoom = window.localStorage.getItem(ROOM_STORAGE_KEY);
      if (storedRoom) {
        const parsed = JSON.parse(storedRoom) as StoredRoomSession;
        if (parsed.roomCode && parsed.playerId) {
          setSession(parsed);
          setRoomStatus("reconnecting");
        }
      }

      const storedWallet = window.localStorage.getItem(WALLET_STORAGE_KEY);
      if (storedWallet) {
        const parsedWallet = JSON.parse(storedWallet) as WalletState;
        if (SolanaAddressSchema.safeParse(parsedWallet.address).success) {
          setWallet(parsedWallet);
          setWalletStatus("connected");
        }
      }
    } finally {
      setWalletLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    const activeSession = session;
    let cancelled = false;

    async function refreshSnapshot() {
      try {
        const recovered = await fetchRoomSession(activeSession);
        if (cancelled) {
          return;
        }

        setSnapshot((current) =>
          current && current.tick > recovered.snapshot.tick ? current : recovered.snapshot
        );
        setAuthorityStatus(recovered.authority ?? null);
        setRoomStatus("connected");
        setSyncError(null);
      } catch (error) {
        if (!cancelled) {
          setRoomStatus("reconnecting");
          setSyncError(error instanceof Error ? error.message : "Snapshot recovery failed.");
        }
      }
    }

    void refreshSnapshot();
    const interval = window.setInterval(refreshSnapshot, 300);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchRoomSession, session]);

  useEffect(() => {
    if (!session || snapshot?.status !== "active") {
      return;
    }

    const activeSession = session;
    let cancelled = false;

    async function requestStrategyUpdate() {
      try {
        const response = await fetch(`/api/rooms/${activeSession.roomCode}/strategy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            playerId: activeSession.playerId
          })
        });
        const payload = await parseJsonResponse(response);
        const parsed = RoomStrategyUpdateSchema.parse(payload);

        if (cancelled) {
          return;
        }

        setSnapshot((current) =>
          current && current.tick > parsed.snapshot.tick ? current : parsed.snapshot
        );
        setAuthorityStatus(parsed.authority ?? null);
        setAnalytics(parsed.analytics);
        setLastDecision(parsed.lastDecision ?? null);
        setAdaptationCount(parsed.adaptationCount);
        setStrategyError(null);
      } catch (error) {
        if (!cancelled) {
          setStrategyError(
            error instanceof Error ? error.message : "Strategy update failed."
          );
        }
      }
    }

    void requestStrategyUpdate();
    const interval = window.setInterval(requestStrategyUpdate, 6_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session, snapshot?.status]);

  useEffect(() => {
    if (!session || !walletLoaded || !wallet?.address) {
      return;
    }

    const activeSession = session;
    const walletAddress = wallet.address;
    const controller = new AbortController();

    async function updateWalletProfile() {
      try {
        const response = await fetch(`/api/rooms/${activeSession.roomCode}/profile`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            playerId: activeSession.playerId,
            wallet: walletAddress
          }),
          signal: controller.signal
        });
        const payload = await parseJsonResponse(response);
        const parsed = RoomSessionSchema.parse(payload);
        setSnapshot(parsed.snapshot);
        setAuthorityStatus(parsed.authority ?? null);
        setSyncError(null);
      } catch (error) {
        if (!controller.signal.aborted) {
          setSyncError(error instanceof Error ? error.message : "Wallet update failed.");
        }
      }
    }

    void updateWalletProfile();

    return () => controller.abort();
  }, [session, wallet?.address, walletLoaded]);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoomStatus("creating");
    setFormError(null);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(profilePayload)
      });
      const payload = await parseJsonResponse(response);
      applyRoomSession(RoomSessionSchema.parse(payload));
    } catch (error) {
      setRoomStatus("idle");
      setFormError(error instanceof Error ? error.message : "Could not create room.");
    }
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = joinCode.trim().toUpperCase();
    setJoinCode(normalizedCode);
    setRoomStatus("joining");
    setFormError(null);

    try {
      const response = await fetch(`/api/rooms/${normalizedCode}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(profilePayload)
      });
      const payload = await parseJsonResponse(response);
      applyRoomSession(RoomSessionSchema.parse(payload));
    } catch (error) {
      setRoomStatus(session ? "connected" : "idle");
      setFormError(error instanceof Error ? error.message : "Could not join room.");
    }
  }

  const sendInput = useCallback(
    (message: unknown) => {
      if (!session) {
        return;
      }

      try {
        const validated = RaidClientMessageSchema.parse(message);
        if (validated.type === "player_move" && inputBusyRef.current) {
          return;
        }

        inputQueueRef.current = inputQueueRef.current
          .catch(() => undefined)
          .then(async () => {
            inputBusyRef.current = true;
            try {
              const response = await fetch(`/api/rooms/${session.roomCode}/input`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify(validated)
              });
              const payload = await parseJsonResponse(response);
              const parsed = RaidSnapshotMessageSchema.parse(payload);
              setSnapshot((current) =>
                current && current.tick > parsed.snapshot.tick ? current : parsed.snapshot
              );
              setAuthorityStatus(parsed.authority ?? null);
              setSyncError(null);
            } catch (error) {
              setSyncError(error instanceof Error ? error.message : "Input was rejected.");
            } finally {
              inputBusyRef.current = false;
            }
          });
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Input was rejected.");
      }
    },
    [session]
  );

  const sendMove = useCallback(
    (direction: Position) => {
      if (!session || !snapshot) {
        return;
      }

      clientSequenceRef.current += 1;
      void sendInput({
        type: "player_move",
        raidId: snapshot.raidId,
        playerId: session.playerId,
        direction,
        clientSequence: clientSequenceRef.current,
        clientTimeMs: Math.floor(performance.now())
      });
    },
    [sendInput, session, snapshot]
  );

  const sendAttack = useCallback(
    (attack: PlayerAttackKind) => {
      if (!session || !snapshot || snapshot.status !== "active") {
        return;
      }

      clientSequenceRef.current += 1;
      void sendInput({
        type: "player_attack",
        raidId: snapshot.raidId,
        playerId: session.playerId,
        attack,
        target: {
          targetType: "boss"
        },
        clientSequence: clientSequenceRef.current,
        clientTimeMs: Math.floor(performance.now())
      });
    },
    [sendInput, session, snapshot]
  );

  async function connectInjectedWallet() {
    setWalletError(null);
    setWalletStatus("connecting");

    try {
      const provider = window.solana ?? window.phantom?.solana;
      if (!provider?.connect) {
        throw new Error("No injected Solana wallet detected.");
      }

      const result = await provider.connect();
      const address = result.publicKey?.toBase58() ?? provider.publicKey?.toBase58();
      const parsedAddress = SolanaAddressSchema.parse(address);
      const nextWallet = {
        address: parsedAddress,
        source: "injected" as const
      };

      setWallet(nextWallet);
      setWalletStatus("connected");
      window.localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(nextWallet));
    } catch (error) {
      setWalletStatus(wallet ? "connected" : "idle");
      setWalletError(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  function connectDemoWallet() {
    const nextWallet = {
      address: generateDemoSolanaAddress(),
      source: "demo" as const
    };

    setWallet(nextWallet);
    setWalletStatus("connected");
    setWalletError(null);
    window.localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(nextWallet));
  }

  async function disconnectWallet() {
    const provider = window.solana ?? window.phantom?.solana;
    if (wallet?.source === "injected") {
      await provider?.disconnect?.();
    }

    setWallet(null);
    setWalletStatus("idle");
    setWalletError(null);
    window.localStorage.removeItem(WALLET_STORAGE_KEY);
  }

  async function copyRoomCode() {
    if (!session) {
      return;
    }

    await navigator.clipboard.writeText(session.roomCode);
    setCopiedRoom(true);
    window.setTimeout(() => setCopiedRoom(false), 1_200);
  }

  async function submitSettlement() {
    if (!session) {
      return;
    }

    setSettlementBusy(true);
    setSettlementStatus(
      RoomSettlementStatusSchema.parse({
        status: "pending",
        authority: authorityStatus ?? undefined,
        message: "Submitting settlement."
      })
    );

    try {
      const response = await fetch(`/api/rooms/${session.roomCode}/settlement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          playerId: session.playerId
        })
      });
      const payload = await parseJsonResponse(response);
      const parsed = RoomSettlementStatusSchema.parse(payload);
      setSettlementStatus(parsed);
      setAuthorityStatus(parsed.authority ?? authorityStatus);
      if (parsed.summary?.transactionSignature || parsed.status === "local_verified") {
        setSnapshot((current) =>
          current && current.status !== "settled"
            ? {
                ...current,
                status: "settled",
                tick: Math.min(GAME_LIMITS.networking.maxSnapshotTick, current.tick + 1)
              }
            : current
        );
      }
    } catch (error) {
      setSettlementStatus(
        RoomSettlementStatusSchema.parse({
          status: "failed",
          authority: authorityStatus ?? undefined,
          message: truncateMessage(error instanceof Error ? error.message : "Settlement failed.")
        })
      );
    } finally {
      setSettlementBusy(false);
    }
  }

  function leaveRoom() {
    saveRoomSession(null);
    setSnapshot(null);
    setRoomStatus("idle");
    setSyncError(null);
    setFormError(null);
    setAnalytics(null);
    setLastDecision(null);
    setAdaptationCount(0);
    setStrategyError(null);
    setAuthorityStatus(null);
    setSettlementStatus(null);
    setSettlementBusy(false);
  }

  const canAct = Boolean(session && snapshot?.status === "active" && roomStatus === "connected");
  const bossHp = snapshot?.boss.hp ?? GAME_LIMITS.boss.maxHp;
  const bossMaxHp = snapshot?.boss.maxHp ?? GAME_LIMITS.boss.maxHp;
  const localHp = currentPlayer?.hp ?? GAME_LIMITS.player.maxHp;
  const localMaxHp = currentPlayer?.maxHp ?? GAME_LIMITS.player.maxHp;
  const localDamage = currentPlayer?.contribution.damage ?? 0;
  const terminalRaid =
    snapshot?.status === "victory" ||
    snapshot?.status === "defeat" ||
    snapshot?.status === "timeout" ||
    snapshot?.status === "settled";
  const walletsReady = Boolean(
    snapshot?.players.length && snapshot.players.every((player) => player.wallet)
  );
  const canSubmitSettlement =
    Boolean(session && terminalRaid && walletsReady) &&
    snapshot?.status !== "settled" &&
    !settlementBusy;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="grid gap-3">
        <PhaserArena
          snapshot={snapshot}
          localPlayerId={session?.playerId ?? null}
          interactive={canAct}
          onMove={sendMove}
          onAttack={sendAttack}
        />

        <div className="rounded-md border border-border bg-card p-3 text-card-foreground">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr]">
            <HudBar label="Boss" value={bossHp} max={bossMaxHp} />
            <HudBar label="Raider" value={localHp} max={localMaxHp} />

            <div className="grid grid-cols-2 gap-2 text-sm">
              <HudStat label="Phase" value={snapshot?.boss.phase.replace("_", " ") ?? "phase 1"} />
              <HudStat label="Status" value={snapshot?.status ?? "idle"} />
              <HudStat label="Damage" value={localDamage.toString()} />
              <HudStat label="Tick" value={(snapshot?.tick ?? 0).toString()} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => sendAttack("normal")}
              disabled={!canAct}
              className="min-h-10 rounded-md border border-border bg-card px-3 text-sm font-medium text-card-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
            >
              Strike
            </button>
            <button
              type="button"
              onClick={() => sendAttack("special")}
              disabled={!canAct}
              className="min-h-10 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
            >
              Special
            </button>
          </div>
        </div>
      </section>

      <aside className="grid content-start gap-3">
        <section className="rounded-md border border-border bg-card p-4 text-card-foreground">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Wallet</h2>
            <span className="rounded-sm bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              Devnet
            </span>
          </div>
          <WalletControls
            wallet={wallet}
            walletStatus={walletStatus}
            walletError={walletError}
            onConnectInjected={connectInjectedWallet}
            onConnectDemo={connectDemoWallet}
            onDisconnect={disconnectWallet}
          />
        </section>

        <AnalyticsPanel
          snapshot={snapshot}
          analytics={analytics}
          lastDecision={lastDecision}
          adaptationCount={adaptationCount}
          strategyError={strategyError}
        />

        <AuthorityPanel authority={authorityStatus} />

        <SettlementPanel
          snapshot={snapshot}
          settlement={settlementStatus}
          busy={settlementBusy}
          walletsReady={walletsReady}
          canSubmit={canSubmitSettlement}
          onSubmit={submitSettlement}
        />

        <section className="rounded-md border border-border bg-card p-4 text-card-foreground">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Room</h2>
            {roomStatus !== "idle" ? (
              <span className="rounded-sm bg-muted px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
                {roomStatus}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              <span>Display Name</span>
              <input
                type="text"
                autoComplete="nickname"
                spellCheck={false}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={32}
                className="min-h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Class</legend>
              <div className="grid grid-cols-3 gap-2">
                {PLAYER_CLASSES.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    aria-pressed={playerClass === candidate}
                    onClick={() => setPlayerClass(candidate)}
                    className={`min-h-10 rounded-md border px-2 text-sm font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      playerClass === candidate
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            </fieldset>

            <form onSubmit={createRoom}>
              <button
                type="submit"
                disabled={roomStatus === "creating" || roomFormDisabled}
                aria-busy={roomStatus === "creating"}
                className="min-h-10 w-full rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {roomStatus === "creating" ? "Creating..." : "Create Room"}
              </button>
            </form>

            <form onSubmit={joinRoom} className="grid gap-2">
              <label className="grid gap-1.5 text-sm font-medium">
                <span>Room Code</span>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  aria-invalid={formError ? "true" : undefined}
                  aria-describedby={formError ? "room-error" : undefined}
                  maxLength={8}
                  className="min-h-10 rounded-md border border-border bg-background px-3 font-mono text-sm uppercase tracking-normal focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </label>
              <button
                type="submit"
                disabled={
                  roomStatus === "joining" ||
                  joinCode.trim().length < 4 ||
                  roomFormDisabled
                }
                aria-busy={roomStatus === "joining"}
                className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {roomStatus === "joining" ? "Joining..." : "Join Room"}
              </button>
            </form>

            {formError ? (
              <p id="room-error" className="text-sm font-medium text-destructive">
                {formError}
              </p>
            ) : null}
          </div>
        </section>

        {session ? (
          <section className="rounded-md border border-border bg-card p-4 text-card-foreground">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Raid {session.roomCode}</h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {session.playerId}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyRoomCode}
                  className="min-h-10 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {copiedRoom ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={leaveRoom}
                  className="min-h-10 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Leave
                </button>
              </div>
            </div>

            {syncError ? (
              <div className="mt-3 rounded-md border border-border bg-background p-3">
                <p className="text-sm font-medium text-destructive">
                  {syncError}
                </p>
                <button
                  type="button"
                  onClick={() => setRoomStatus("reconnecting")}
                  className="mt-2 min-h-10 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : null}

            <div className="mt-4 grid gap-2">
              {snapshot?.players.map((player) => (
                <div
                  key={player.id}
                  className="grid min-h-12 grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{player.displayName}</p>
                    <p className="text-xs capitalize text-muted-foreground">{player.class}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs tabular-nums">{player.hp} HP</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {player.wallet ? truncateAddress(player.wallet) : "No wallet"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function AnalyticsPanel({
  snapshot,
  analytics,
  lastDecision,
  adaptationCount,
  strategyError
}: {
  snapshot: RaidSnapshot | null;
  analytics: RaidAnalyticsSummary | null;
  lastDecision: BossStrategyDecision | null;
  adaptationCount: number;
  strategyError: string | null;
}) {
  const clusterScore = analytics ? `${Math.round(analytics.clusterScore * 100)}%` : "--";
  const healingFrequency = analytics
    ? analytics.signals.frequentHealing
      ? "frequent"
      : `${analytics.healingEvents}/${analytics.windowSeconds}s`
    : "--";
  const decisionLabel = lastDecision
    ? `${formatLabel(lastDecision.strategy)} (${formatDecisionSource(lastDecision.source)})`
    : "--";

  return (
    <section className="rounded-md border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">AI Strategy</h2>
        <span className="rounded-sm bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {adaptationCount}/{GAME_LIMITS.ai.maxStrategyAdaptations}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <HudStat label="Cluster" value={clusterScore} />
        <HudStat label="Damage Type" value={formatNullableLabel(analytics?.dominantDamageType)} />
        <HudStat label="Class" value={formatNullableLabel(analytics?.dominantClass)} />
        <HudStat label="Healing" value={healingFrequency} />
        <HudStat label="Phase" value={formatLabel(snapshot?.boss.phase ?? analytics?.bossPhase)} />
        <HudStat
          label="Strategy"
          value={formatLabel(snapshot?.boss.strategy ?? analytics?.currentStrategy)}
        />
      </div>

      <div className="mt-3 rounded-md border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">Last Decision</p>
        <p className="mt-1 break-words text-sm font-semibold">{decisionLabel}</p>
        {lastDecision ? (
          <p className="mt-2 break-words text-xs text-muted-foreground">
            {lastDecision.reason}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Waiting for raid telemetry.</p>
        )}
      </div>

      {strategyError ? (
        <p className="mt-3 text-sm font-medium text-destructive">{strategyError}</p>
      ) : null}
    </section>
  );
}

function AuthorityPanel({ authority }: { authority: RoomAuthorityStatus | null }) {
  const mode = authority?.mode === "magicblock_live" ? "MagicBlock live" : "Local fallback";
  const combat = authority?.combatAuthority === "magicblock_router" ? "Router" : "Room server";

  return (
    <section className="rounded-md border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Authority</h2>
        <span
          className={`rounded-sm px-2 py-1 text-xs font-medium ${
            authority?.mode === "magicblock_live"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {mode}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <HudStat label="Movement" value="Room server" />
        <HudStat label="Combat" value={combat} />
      </div>

      <div className="mt-3 rounded-md border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">RaidState</p>
        <p className="mt-1 break-all font-mono text-xs">
          {authority?.raidStatePda ?? "--"}
        </p>
        {authority?.lastSignature ? (
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
            {truncateAddress(authority.lastSignature, 6)}
          </p>
        ) : null}
      </div>

      {authority?.lastError ? (
        <p className="mt-3 break-words text-sm font-medium text-destructive">
          {authority.lastError}
        </p>
      ) : null}
    </section>
  );
}

function SettlementPanel({
  snapshot,
  settlement,
  busy,
  walletsReady,
  canSubmit,
  onSubmit
}: {
  snapshot: RaidSnapshot | null;
  settlement: RoomSettlementStatus | null;
  busy: boolean;
  walletsReady: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  const terminal =
    snapshot?.status === "victory" ||
    snapshot?.status === "defeat" ||
    snapshot?.status === "timeout" ||
    snapshot?.status === "settled";
  const status = settlement?.status ?? (snapshot?.status === "settled" ? "success" : "idle");
  const statusLabel = formatLabel(status);
  const disabledReason = !terminal
    ? "Raid active"
    : !walletsReady
      ? "Wallets missing"
      : snapshot?.status === "settled"
        ? "Settled"
        : null;

  return (
    <section className="rounded-md border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Settlement</h2>
        <span className="rounded-sm bg-muted px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <HudStat label="Result" value={formatLabel(settlement?.summary?.result ?? snapshot?.status)} />
        <HudStat
          label="Duration"
          value={`${settlement?.summary?.durationSeconds ?? snapshot?.elapsedSeconds ?? 0}s`}
        />
        <HudStat
          label="Boss HP"
          value={(settlement?.summary?.bossFinalHp ?? snapshot?.boss.hp ?? 0).toString()}
        />
        <HudStat
          label="Players"
          value={(settlement?.summary?.contributions.length ?? snapshot?.players.length ?? 0).toString()}
        />
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        aria-busy={busy}
        className="mt-3 min-h-10 w-full rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {busy ? "Submitting..." : disabledReason ?? "Submit Settlement"}
      </button>

      {settlement?.transactionSignature ? (
        <a
          href={settlement.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 grid min-h-10 place-items-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Explorer
        </a>
      ) : null}

      {settlement?.settlementRecordPda ? (
        <div className="mt-3 rounded-md border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">Record</p>
          <p className="mt-1 break-all font-mono text-xs">{settlement.settlementRecordPda}</p>
        </div>
      ) : null}

      {settlement?.message ? (
        <p
          className={`mt-3 break-words text-sm font-medium ${
            settlement.status === "failed" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {settlement.message}
        </p>
      ) : null}
    </section>
  );
}

function WalletControls({
  wallet,
  walletStatus,
  walletError,
  onConnectInjected,
  onConnectDemo,
  onDisconnect
}: {
  wallet: WalletState | null;
  walletStatus: WalletStatus;
  walletError: string | null;
  onConnectInjected: () => void;
  onConnectDemo: () => void;
  onDisconnect: () => void;
}) {
  if (wallet) {
    const explorerUrl = `https://explorer.solana.com/address/${wallet.address}?cluster=devnet`;

    return (
      <div className="mt-4 grid gap-3">
        <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border px-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
            <span className="truncate font-mono text-sm">{truncateAddress(wallet.address)}</span>
          </span>
          <span className="text-xs capitalize text-muted-foreground">{wallet.source}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(wallet.address)}
            className="min-h-10 rounded-md border border-border px-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Copy
          </button>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="grid min-h-10 place-items-center rounded-md border border-border px-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Explorer
          </a>
          <button
            type="button"
            onClick={onDisconnect}
            className="min-h-10 rounded-md border border-border px-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onConnectInjected}
          disabled={walletStatus === "connecting"}
          aria-busy={walletStatus === "connecting"}
          className="min-h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {walletStatus === "connecting" ? "Connecting..." : "Connect"}
        </button>
        <button
          type="button"
          onClick={onConnectDemo}
          className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Demo Wallet
        </button>
      </div>
      {walletError ? (
        <p className="text-sm font-medium text-destructive">{walletError}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Wallet anchors the live devnet roster.</p>
      )}
    </div>
  );
}

function HudBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {value}/{max}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-sm bg-muted">
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function HudStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const parsed = RaidErrorMessageSchema.safeParse(payload);
    throw new Error(parsed.success ? parsed.data.message : "Room request failed.");
  }

  return payload;
}

function truncateAddress(address: string, chars = 4) {
  if (address.length <= chars * 2 + 3) {
    return address;
  }

  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function formatNullableLabel(value: string | null | undefined) {
  return value ? formatLabel(value) : "mixed";
}

function formatLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "--";
}

function formatDecisionSource(source: BossStrategyDecision["source"]) {
  return source === "llm" ? "OpenAI" : "fallback";
}

function truncateMessage(message: string, maxLength = 180) {
  return message.length <= maxLength ? message : `${message.slice(0, maxLength - 3)}...`;
}

function generateDemoSolanaAddress() {
  const randomValues = new Uint8Array(44);
  window.crypto.getRandomValues(randomValues);

  return SolanaAddressSchema.parse(
    Array.from(randomValues, (value) => BASE58_ALPHABET[value % BASE58_ALPHABET.length]).join(
      ""
    )
  );
}
