import { describe, expect, it } from "vitest";
import {
  GAME_LIMITS,
  RaidClientMessageSchema,
  RaidSnapshotMessageSchema
} from "@/game/schemas";
import {
  applyRoomInput,
  createRoomAuthority,
  joinRoomAuthority,
  recoverRoomAuthority,
  RoomAuthorityError,
  updateRoomProfile
} from "@/game/room-authority";

const hostProfile = {
  displayName: "Host",
  playerClass: "warrior" as const
};

const guestProfile = {
  displayName: "Guest",
  playerClass: "ranger" as const
};

describe("NET-001 room snapshots", () => {
  it("creates a room code and lets another player join the same raid", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "SYNC42",
      nowUnixMs: 10_000
    });
    const host = recoverRoomAuthority(room, room.snapshot.players[0].id, 10_000);
    const guest = joinRoomAuthority(room, guestProfile, 10_100);

    expect(host.roomCode).toBe("SYNC42");
    expect(guest.roomCode).toBe(host.roomCode);
    expect(guest.snapshot.raidId).toBe(host.snapshot.raidId);
    expect(guest.snapshot.players).toHaveLength(2);
    expect(guest.snapshot.boss.hp).toBe(host.snapshot.boss.hp);
  });

  it("validates client input before authoritative processing", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "INPUT7",
      nowUnixMs: 20_000
    });
    const playerId = room.snapshot.players[0].id;

    expect(() =>
      RaidClientMessageSchema.parse({
        type: "player_move",
        raidId: room.snapshot.raidId,
        playerId,
        direction: {
          x: 0.9,
          y: 0.9
        },
        clientSequence: 1,
        clientTimeMs: 0
      })
    ).toThrow();

    const snapshot = applyRoomInput(
      room,
      {
        type: "player_move",
        raidId: room.snapshot.raidId,
        playerId,
        direction: {
          x: 1,
          y: 0
        },
        clientSequence: 1,
        clientTimeMs: 0
      },
      20_120
    );

    expect(RaidSnapshotMessageSchema.parse({ type: "raid_snapshot", snapshot })).toBeTruthy();
    expect(snapshot.players[0].position.x).toBeGreaterThan(250);
    expect(snapshot.tick).toBeGreaterThan(0);
  });

  it("rejects stale input sequences", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "STALE7",
      nowUnixMs: 30_000
    });
    const playerId = room.snapshot.players[0].id;
    const input = {
      type: "player_attack",
      raidId: room.snapshot.raidId,
      playerId,
      attack: "normal",
      target: {
        targetType: "boss"
      },
      clientSequence: 2,
      clientTimeMs: 0
    } as const;

    room.snapshot.players[0].position = {
      x: room.snapshot.boss.position.x - 80,
      y: room.snapshot.boss.position.y
    };

    applyRoomInput(room, input, 30_100);

    expect(() => applyRoomInput(room, input, 30_200)).toThrow(RoomAuthorityError);
  });
});

describe("NET-002 reconnect recovery", () => {
  it("recovers the latest snapshot by room code and player id", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "BACK88",
      nowUnixMs: 40_000
    });
    const playerId = room.snapshot.players[0].id;

    room.snapshot.players[0].position = {
      x: room.snapshot.boss.position.x - 80,
      y: room.snapshot.boss.position.y
    };
    const afterHit = applyRoomInput(
      room,
      {
        type: "player_attack",
        raidId: room.snapshot.raidId,
        playerId,
        attack: "normal",
        target: {
          targetType: "boss"
        },
        clientSequence: 1,
        clientTimeMs: 0
      },
      40_100
    );

    const recovered = recoverRoomAuthority(room, playerId, 40_200);

    expect(recovered.snapshot.tick).toBeGreaterThanOrEqual(afterHit.tick);
    expect(recovered.snapshot.boss.hp).toBeLessThan(GAME_LIMITS.boss.maxHp);
  });

  it("updates wallet profile data without blocking room play", () => {
    const room = createRoomAuthority(hostProfile, {
      roomCode: "WALLET",
      nowUnixMs: 50_000
    });
    const playerId = room.snapshot.players[0].id;
    const wallet = "11111111111111111111111111111111";

    const updated = updateRoomProfile(room, {
      playerId,
      wallet
    });

    expect(updated.snapshot.players[0].wallet).toBe(wallet);

    const cleared = updateRoomProfile(room, {
      playerId,
      wallet: null
    });

    expect(cleared.snapshot.players[0].wallet).toBeUndefined();
  });
});
