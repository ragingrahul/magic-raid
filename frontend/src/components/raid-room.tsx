"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhaserArena } from "@/components/phaser-arena";
import { BOSS_TIER_BY_PHASE, CLASS_PORTRAIT, orcSheetPath } from "@/game/sprites";
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
  type BossPhase,
  type BossStrategyDecision,
  type BossStrategy,
  type PlayerAttackKind,
  type PlayerClass,
  type Position,
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

class RoomRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "RoomRequestError";
  }
}

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
const STRATEGY_REFRESH_MS = 5_000;
const STRATEGY_TELLS = {
  area_denial: {
    label: "Area Denial",
    tell: "Warning rings cover the team cluster.",
    className:
      "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-400/45 dark:bg-orange-950/25 dark:text-orange-100"
  },
  leap_to_ranged: {
    label: "Leap To Ranged",
    tell: "A teal line locks onto the farthest raider.",
    className:
      "border-teal-300 bg-teal-50 text-teal-950 dark:border-teal-400/45 dark:bg-teal-950/25 dark:text-teal-100"
  },
  magic_resistance: {
    label: "Magic Resistance",
    tell: "A violet ward forms around the boss.",
    className:
      "border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-400/45 dark:bg-violet-950/25 dark:text-violet-100"
  },
  focus_healer: {
    label: "Focus Healer",
    tell: "A red reticle marks the weakest raider.",
    className:
      "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-400/45 dark:bg-rose-950/25 dark:text-rose-100"
  },
  melee_retaliation: {
    label: "Melee Retaliation",
    tell: "Gold spikes flare near the boss.",
    className:
      "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-400/45 dark:bg-amber-950/25 dark:text-amber-100"
  }
} as const satisfies Record<
  BossStrategy,
  {
    label: string;
    tell: string;
    className: string;
  }
>;

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
  const [lastDecision, setLastDecision] = useState<BossStrategyDecision | null>(null);
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
      setLastDecision(null);
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
    let refreshing = false;

    async function refreshSnapshot() {
      if (refreshing) {
        return;
      }

      refreshing = true;
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
          const message =
            error instanceof Error ? error.message : "Snapshot recovery failed.";

          if (shouldDiscardStoredSession(error)) {
            saveRoomSession(null);
            setSnapshot(null);
            setAuthorityStatus(null);
            setRoomStatus("idle");
            setSyncError(null);
            setFormError(message);
            return;
          }

          setRoomStatus("reconnecting");
          setSyncError(message);
        }
      } finally {
        refreshing = false;
      }
    }

    void refreshSnapshot();
    const interval = window.setInterval(refreshSnapshot, 300);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchRoomSession, saveRoomSession, session]);

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
        setLastDecision(parsed.lastDecision ?? null);
      } catch {
        // Background strategy telemetry isn't player-facing; ignore transient failures.
      }
    }

    void requestStrategyUpdate();
    const interval = window.setInterval(requestStrategyUpdate, STRATEGY_REFRESH_MS);

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
    setLastDecision(null);
    setAuthorityStatus(null);
    setSettlementStatus(null);
    setSettlementBusy(false);
  }

  // Keep the prerendered client component deterministic until browser storage is read.
  if (!walletLoaded) {
    return <RaidRoomShell />;
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
  const settlementDisabledReason = !terminalRaid
    ? null
    : !walletsReady
      ? "Wallets missing"
      : snapshot?.status === "settled"
        ? "Settled"
        : null;
  const resultLabel = formatLabel(settlementStatus?.summary?.result ?? snapshot?.status);
  const bossStrategy = snapshot?.boss.strategy ?? "area_denial";
  const strategyTell = STRATEGY_TELLS[bossStrategy];
  const strategyJustChanged = Boolean(
    snapshot &&
      lastDecision &&
      snapshot.boss.strategy === lastDecision.strategy &&
      Math.abs(snapshot.serverTimeMs - lastDecision.createdAtMs) <= 5_000
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <PhaserArena
        snapshot={snapshot}
        localPlayerId={session?.playerId ?? null}
        interactive={canAct}
        onMove={sendMove}
        onAttack={sendAttack}
      />

      {session ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-4">
            <div className="panel pointer-events-auto w-full max-w-md py-2! px-4!">
              <HudBar label="Boss" value={bossHp} max={bossMaxHp} />
              <div className={`mt-2 flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs ${strategyTell.className}`}>
                <span className="font-semibold uppercase">
                  {strategyJustChanged ? "Adapting" : strategyTell.label}
                </span>
                <span className="truncate text-right">{strategyTell.tell}</span>
              </div>
            </div>

            {syncError ? (
              <div className="panel pointer-events-auto flex items-center gap-2 border-destructive/50 py-1.5! px-3! text-xs text-destructive">
                <span>{syncError}</span>
                <button
                  type="button"
                  onClick={() => setRoomStatus("reconnecting")}
                  className="font-semibold underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : null}
          </div>

          <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-1.5">
            {snapshot?.players.map((player) => (
              <div
                key={player.id}
                className="panel pointer-events-auto flex w-40 items-center gap-2 py-1.5! px-2.5!"
              >
                <span
                  className={`pixel-art h-6 w-6 shrink-0 rounded-full bg-contain bg-center bg-no-repeat ${
                    player.status === "alive" ? "" : "opacity-35 grayscale"
                  }`}
                  style={{ backgroundImage: `url(${CLASS_PORTRAIT[player.class]})` }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {player.displayName}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {player.hp}
                </span>
              </div>
            ))}
          </div>

          <div className="pointer-events-none absolute right-4 top-4 z-10">
            <div className="panel pointer-events-auto flex items-center gap-2 py-1.5! px-3!">
              <span className="font-mono text-xs tracking-widest">{session.roomCode}</span>
              <button
                type="button"
                onClick={copyRoomCode}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {copiedRoom ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={leaveRoom}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Leave
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute left-4 bottom-4 z-10 w-56">
            <div className="panel pointer-events-auto py-2! px-3!">
              <HudBar label="You" value={localHp} max={localMaxHp} />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => sendAttack("normal")}
              disabled={!canAct}
              className="pointer-events-auto min-h-12 min-w-24 rounded-md border border-border bg-card px-4 text-sm font-medium text-card-foreground shadow-[var(--panel-shadow)] transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
            >
              Strike
            </button>
            <button
              type="button"
              onClick={() => sendAttack("special")}
              disabled={!canAct}
              className="pointer-events-auto min-h-12 min-w-24 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-[var(--panel-shadow)] transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
            >
              Special
            </button>
          </div>
        </>
      ) : null}

      {!session ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="panel w-full max-w-sm">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              MagicBlock Blitz
            </p>
            <h1 className="font-display mt-1 text-2xl font-semibold text-primary">
              Join The Raid
            </h1>

            {!wallet ? (
              <div className="mt-4 grid gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={connectInjectedWallet}
                    disabled={walletStatus === "connecting"}
                    aria-busy={walletStatus === "connecting"}
                    className="min-h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {walletStatus === "connecting" ? "Connecting..." : "Connect Wallet"}
                  </button>
                  <button
                    type="button"
                    onClick={connectDemoWallet}
                    className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Demo Wallet
                  </button>
                </div>
                {walletError ? (
                  <p className="text-xs font-medium text-destructive">{walletError}</p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span className="truncate font-mono text-xs">
                    {truncateAddress(wallet.address)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={disconnectWallet}
                  className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Disconnect
                </button>
              </div>
            )}

            <label className="mt-4 grid gap-1.5 text-sm font-medium">
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

            <fieldset className="mt-3 grid gap-2">
              <legend className="text-sm font-medium">Class</legend>
              <div className="grid grid-cols-3 gap-2">
                {PLAYER_CLASSES.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    aria-pressed={playerClass === candidate}
                    onClick={() => setPlayerClass(candidate)}
                    className={`grid min-h-10 justify-items-center gap-1 rounded-md border px-2 py-2 text-xs font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      playerClass === candidate
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    <span
                      className="pixel-art h-10 w-10 bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${CLASS_PORTRAIT[candidate]})` }}
                      aria-hidden
                    />
                    {candidate}
                  </button>
                ))}
              </div>
            </fieldset>

            <form onSubmit={createRoom} className="mt-4">
              <button
                type="submit"
                disabled={roomStatus === "creating" || roomFormDisabled}
                aria-busy={roomStatus === "creating"}
                className="min-h-10 w-full rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {roomStatus === "creating" ? "Creating..." : "Create Room"}
              </button>
            </form>

            <div className="mt-3 flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={joinRoom} className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <input
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                spellCheck={false}
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="Room code"
                aria-invalid={formError ? "true" : undefined}
                aria-describedby={formError ? "room-error" : undefined}
                maxLength={8}
                className="min-h-10 min-w-0 rounded-md border border-border bg-background px-3 font-mono text-sm uppercase tracking-normal focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
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
                {roomStatus === "joining" ? "Joining..." : "Join"}
              </button>
            </form>

            {formError ? (
              <p id="room-error" className="mt-3 text-xs font-medium text-destructive">
                {formError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {session && terminalRaid ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="panel w-full max-w-sm text-center">
            <div className="flex items-center justify-center gap-3">
              <BossPortrait phase={snapshot?.boss.phase ?? "phase_1"} />
              <div className="text-left">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Raid Over
                </p>
                <h2 className="font-display text-2xl font-semibold text-primary">
                  {resultLabel}
                </h2>
              </div>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              You dealt <span className="font-semibold text-foreground">{localDamage}</span>{" "}
              damage.
            </p>

            <button
              type="button"
              onClick={submitSettlement}
              disabled={!canSubmitSettlement}
              aria-busy={settlementBusy}
              className="mt-4 min-h-10 w-full rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {settlementBusy ? "Submitting..." : settlementDisabledReason ?? "Submit Settlement"}
            </button>

            {settlementStatus?.transactionSignature ? (
              <a
                href={settlementStatus.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 grid min-h-10 place-items-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                View On Explorer
              </a>
            ) : null}

            {settlementStatus?.message ? (
              <p
                className={`mt-3 break-words text-xs font-medium ${
                  settlementStatus.status === "failed" ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {settlementStatus.message}
              </p>
            ) : null}

            <button
              type="button"
              onClick={leaveRoom}
              className="mt-3 min-h-10 w-full rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Leave
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RaidRoomShell() {
  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-background"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="absolute inset-0 grid place-items-center">
        <div className="panel px-4 py-3 text-sm font-medium text-muted-foreground">
          Loading raid room.
        </div>
      </div>
    </div>
  );
}

function HudBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);
  const barColor =
    percent <= 25 ? "bg-destructive" : percent <= 55 ? "bg-primary" : "bg-emerald-500";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {value}/{max}
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-sm border border-border/60 bg-muted">
        <div
          className={`h-full transition-[width] duration-500 ease-out ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

const BOSS_PORTRAIT_SIZE = 48;

function BossPortrait({ phase }: { phase: BossPhase }) {
  const tier = BOSS_TIER_BY_PHASE[phase];
  // Idle sheets are a 4x4 grid (4 directions x 4 frames); scale the whole sheet
  // so one native 64px frame maps exactly to BOSS_PORTRAIT_SIZE, then crop to
  // the top-left (front-facing, frame 0) cell via background-position.
  const sheetSize = BOSS_PORTRAIT_SIZE * 4;

  return (
    <span
      className="pixel-art shrink-0 overflow-hidden rounded-md border border-border bg-background/60"
      style={{
        width: BOSS_PORTRAIT_SIZE,
        height: BOSS_PORTRAIT_SIZE,
        backgroundImage: `url(${orcSheetPath(tier, "idle")})`,
        backgroundPosition: "0 0",
        backgroundSize: `${sheetSize}px ${sheetSize}px`
      }}
      aria-hidden
    />
  );
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const parsed = RaidErrorMessageSchema.safeParse(payload);
    throw new RoomRequestError(
      parsed.success ? parsed.data.message : "Room request failed.",
      parsed.success ? parsed.data.code : undefined,
      response.status
    );
  }

  return payload;
}

function shouldDiscardStoredSession(error: unknown) {
  return (
    error instanceof RoomRequestError &&
    (error.status === 404 ||
      error.code === "room_not_found" ||
      error.code === "player_not_found")
  );
}

function truncateAddress(address: string, chars = 4) {
  if (address.length <= chars * 2 + 3) {
    return address;
  }

  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function formatLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "--";
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
