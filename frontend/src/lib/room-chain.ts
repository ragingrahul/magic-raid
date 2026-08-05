import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import { ConnectionMagicRouter } from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  GAME_LIMITS,
  RoomAuthorityStatusSchema,
  type PlayerClass,
  type RoomAuthorityStatus
} from "@/game/schemas";
import {
  deriveRaidStatePda,
  deriveSettlementRecordPda,
  MAGICBLOCK_DEVNET,
  raidIdBytesToHex,
  roomCodeToRaidId,
  RAID_SETTLEMENT_PROGRAM_ID
} from "@/lib/magicblock";

const RAID_STATE_DISCRIMINATOR = Buffer.from([165, 3, 135, 214, 253, 242, 9, 61]);
const INITIALIZE_RAID_DISCRIMINATOR = Buffer.from([65, 9, 122, 58, 90, 95, 56, 90]);
const JOIN_RAID_DISCRIMINATOR = Buffer.from([254, 133, 239, 75, 116, 28, 122, 208]);
const RAID_STATE_MIN_BYTES =
  8 + 16 + 32 + 1 + 2 + 2 + 1 + 2 + 1 + GAME_LIMITS.players.max * 2 +
  GAME_LIMITS.players.max * 32 + GAME_LIMITS.players.max + 1;

const PLAYER_CLASS_INDEX: Record<PlayerClass, number> = {
  warrior: 0,
  ranger: 1,
  mage: 2
};

const PLAYER_CLASS_BY_INDEX = ["warrior", "ranger", "mage"] as const;

export type OnChainRoomPlayer = {
  wallet: string;
  class: PlayerClass;
  contributionDamage: number;
};

export type OnChainRoomState = {
  roomCode: string;
  raidIdHex: string;
  raidStatePda: string;
  settlementRecordPda: string;
  authority: string;
  lifecycle: "active" | "victory" | "timeout" | "defeat";
  bossHp: number;
  bossMaxHp: number;
  playerCount: number;
  elapsedSeconds: number;
  strategy:
    | "area_denial"
    | "leap_to_ranged"
    | "magic_resistance"
    | "focus_healer"
    | "melee_retaliation";
  players: OnChainRoomPlayer[];
  bump: number;
  delegated: boolean;
};

export function onChainRoomStateEnabled() {
  return (
    process.env.MAGICRAID_ROOM_STATE === "onchain" ||
    process.env.MAGICRAID_MAGICBLOCK_AUTHORITY === "live"
  );
}

export async function createOnChainRoom(
  roomCode: string,
  firstPlayerWallet: string,
  firstPlayerClass: PlayerClass
) {
  const authority = loadRoomAuthority();
  const connection = new Connection(MAGICBLOCK_DEVNET.solanaDevnetRpc, "confirmed");
  const raidId = roomCodeToRaidId(roomCode);
  const [raidStatePda] = deriveRaidStatePda(raidId);
  const signature = await sendBaseInstruction(
    connection,
    authority,
    buildInitializeRaidInstruction(
      authority.publicKey,
      raidStatePda,
      raidId,
      new PublicKey(firstPlayerWallet),
      firstPlayerClass
    )
  );
  const state = await readOnChainRoom(roomCode);
  const authorityStatus = createOnChainAuthorityStatus(roomCode, state, signature);

  return { signature, state, authorityStatus };
}

export async function joinOnChainRoom(
  roomCode: string,
  playerWallet: string,
  playerClass: PlayerClass
) {
  const authority = loadRoomAuthority();
  const connection = new Connection(MAGICBLOCK_DEVNET.solanaDevnetRpc, "confirmed");
  const raidId = roomCodeToRaidId(roomCode);
  const [raidStatePda] = deriveRaidStatePda(raidId);
  const signature = await sendBaseInstruction(
    connection,
    authority,
    buildJoinRaidInstruction(
      authority.publicKey,
      raidStatePda,
      new PublicKey(playerWallet),
      playerClass
    )
  );
  const state = await readOnChainRoom(roomCode);
  const authorityStatus = createOnChainAuthorityStatus(roomCode, state, signature);

  return { signature, state, authorityStatus };
}

export async function readOnChainRoom(roomCode: string): Promise<OnChainRoomState | undefined> {
  const raidId = roomCodeToRaidId(roomCode);
  const [raidStatePda] = deriveRaidStatePda(raidId);
  const [settlementRecordPda] = deriveSettlementRecordPda(raidStatePda);
  const baseConnection = new Connection(MAGICBLOCK_DEVNET.solanaDevnetRpc, "confirmed");
  const routerConnection = new ConnectionMagicRouter(MAGICBLOCK_DEVNET.routerRpc, "confirmed");
  const delegationStatus = await routerConnection.getDelegationStatus(raidStatePda);
  const accountInfo = delegationStatus?.isDelegated
    ? await routerConnection.getAccountInfo(raidStatePda)
    : await baseConnection.getAccountInfo(raidStatePda);

  const decoded = decodeRaidStateAccount(accountInfo);
  if (!decoded) {
    return undefined;
  }

  return {
    ...decoded,
    roomCode,
    raidStatePda: raidStatePda.toBase58(),
    settlementRecordPda: settlementRecordPda.toBase58(),
    delegated: Boolean(delegationStatus?.isDelegated)
  };
}

export function createOnChainAuthorityStatus(
  roomCode: string,
  state: OnChainRoomState | undefined,
  signature?: string
): RoomAuthorityStatus {
  const raidId = roomCodeToRaidId(roomCode);
  const [raidStatePda] = deriveRaidStatePda(raidId);
  const [settlementRecordPda] = deriveSettlementRecordPda(raidStatePda);

  return RoomAuthorityStatusSchema.parse({
    mode: "magicblock_live",
    movementAuthority: "room_server",
    combatAuthority: "magicblock_router",
    raidIdHex: state?.raidIdHex ?? raidIdBytesToHex(raidId),
    raidStatePda: state?.raidStatePda ?? raidStatePda.toBase58(),
    settlementRecordPda: state?.settlementRecordPda ?? settlementRecordPda.toBase58(),
    playerCount: state?.playerCount,
    ...(signature ? { lastSignature: signature } : {})
  });
}

export function buildInitializeRaidInstruction(
  authority: PublicKey,
  raidStatePda: PublicKey,
  raidId: Uint8Array,
  firstPlayerWallet: PublicKey,
  firstPlayerClass: PlayerClass
) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([
      INITIALIZE_RAID_DISCRIMINATOR,
      Buffer.from(raidId),
      firstPlayerWallet.toBuffer(),
      Buffer.from([playerClassToProgramIndex(firstPlayerClass)])
    ])
  });
}

export function buildJoinRaidInstruction(
  authority: PublicKey,
  raidStatePda: PublicKey,
  playerWallet: PublicKey,
  playerClass: PlayerClass
) {
  return new TransactionInstruction({
    programId: RAID_SETTLEMENT_PROGRAM_ID,
    keys: [
      { pubkey: raidStatePda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true }
    ],
    data: Buffer.concat([
      JOIN_RAID_DISCRIMINATOR,
      playerWallet.toBuffer(),
      Buffer.from([playerClassToProgramIndex(playerClass)])
    ])
  });
}

export function decodeRaidStateAccount(
  accountInfo:
    | Awaited<ReturnType<Connection["getAccountInfo"]>>
    | Awaited<ReturnType<ConnectionMagicRouter["getAccountInfo"]>>
): Omit<OnChainRoomState, "roomCode" | "raidStatePda" | "settlementRecordPda" | "delegated"> | undefined {
  if (!accountInfo) {
    return undefined;
  }

  const data = accountInfo.data;
  if (
    data.length < RAID_STATE_MIN_BYTES ||
    !data.subarray(0, 8).equals(RAID_STATE_DISCRIMINATOR)
  ) {
    return undefined;
  }

  let offset = 8;
  const raidId = data.subarray(offset, offset + 16);
  offset += 16;
  const authority = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const lifecycle = ["active", "victory", "timeout", "defeat"][data[offset++]] as
    | OnChainRoomState["lifecycle"]
    | undefined;
  const bossHp = data.readUInt16LE(offset);
  offset += 2;
  const bossMaxHp = data.readUInt16LE(offset);
  offset += 2;
  const playerCount = data[offset++];
  const elapsedSeconds = data.readUInt16LE(offset);
  offset += 2;
  const strategy = [
    "area_denial",
    "leap_to_ranged",
    "magic_resistance",
    "focus_healer",
    "melee_retaliation"
  ][data[offset++]] as OnChainRoomState["strategy"] | undefined;
  const contributionDamage: number[] = [];
  for (let index = 0; index < GAME_LIMITS.players.max; index += 1) {
    contributionDamage.push(data.readUInt16LE(offset));
    offset += 2;
  }

  const playerWallets: string[] = [];
  for (let index = 0; index < GAME_LIMITS.players.max; index += 1) {
    playerWallets.push(new PublicKey(data.subarray(offset, offset + 32)).toBase58());
    offset += 32;
  }

  const playerClasses: PlayerClass[] = [];
  for (let index = 0; index < GAME_LIMITS.players.max; index += 1) {
    playerClasses.push(programIndexToPlayerClass(data[offset++]));
  }
  const bump = data[offset];

  if (!lifecycle || !strategy) {
    return undefined;
  }

  return {
    raidIdHex: raidIdBytesToHex(raidId),
    authority,
    lifecycle,
    bossHp,
    bossMaxHp,
    playerCount,
    elapsedSeconds,
    strategy,
    players: playerWallets.slice(0, playerCount).map((wallet, index) => ({
      wallet,
      class: playerClasses[index],
      contributionDamage: contributionDamage[index]
    })),
    bump
  };
}

function playerClassToProgramIndex(playerClass: PlayerClass) {
  return PLAYER_CLASS_INDEX[playerClass];
}

function programIndexToPlayerClass(index: number): PlayerClass {
  return PLAYER_CLASS_BY_INDEX[index] ?? "warrior";
}

async function sendBaseInstruction(
  connection: Connection,
  authority: Keypair,
  instruction: TransactionInstruction
) {
  const transaction = new Transaction().add(instruction);
  transaction.feePayer = authority.publicKey;
  return sendAndConfirmTransaction(connection, transaction, [authority], {
    commitment: "confirmed",
    skipPreflight: false
  });
}

function loadRoomAuthority(): Keypair {
  const configured =
    process.env.MAGICRAID_ROOM_KEYPAIR ??
    process.env.MAGICRAID_MAGICBLOCK_KEYPAIR ??
    process.env.MAGICRAID_SETTLEMENT_KEYPAIR ??
    process.env.SOLANA_KEYPAIR ??
    "~/.config/solana/id.json";

  const trimmed = configured.trim();
  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed) as number[]));
  }

  const path = expandHomePath(trimmed);
  if (!existsSync(path)) {
    throw new Error(
      "Room authority keypair is missing. Set MAGICRAID_ROOM_KEYPAIR or MAGICRAID_MAGICBLOCK_KEYPAIR."
    );
  }

  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[])
  );
}

function expandHomePath(path: string) {
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }

  return resolve(path);
}
