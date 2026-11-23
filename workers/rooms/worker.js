import { DurableObject } from "cloudflare:workers";
import { games } from "./games.js";

const protocol = "arcade-room-v1";
const grace = 5 * 60 * 1000;
const codes = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const validCode = /^[2-9A-HJ-NP-Z]{6}$/;
const isGame = (name) => Object.hasOwn(games, name);
const json = (data, status = 200) => Response.json(data, { status });
const failure = (message, status) => json({ message }, status);
const online = (sockets) => sockets.some((socket) => socket.readyState === WebSocket.OPEN);
const nameOf = (person) => "玩家 " + person.number;

function roomCode() {
  return [...crypto.getRandomValues(new Uint32Array(6))].map((part) => codes[part % codes.length]).join("");
}

function cors(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const allowed = (env.ROOM_ORIGINS || "").split(",").map((value) => value.trim());
  if (!allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function withHeaders(response, headers) {
  if (response.status === 101) return response;
  const wrapped = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers)) wrapped.headers.set(key, value);
  wrapped.headers.set("Cache-Control", "no-store");
  return wrapped;
}

async function body(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.startsWith("application/json")) return null;
  // Limit the complete body, including chunked requests.
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let raw = "";
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 1024) {
        await reader.cancel();
        return null;
      }
      raw += decoder.decode(value, { stream: true });
    }
    const value = JSON.parse(raw + decoder.decode());
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function send(socket, data) {
  if (socket.readyState !== WebSocket.OPEN) return;
  try { socket.send(JSON.stringify(data)); } catch { /* The close event handles disconnection. */ }
}

function newPerson(number, now) {
  return { id: crypto.randomUUID(), token: crypto.randomUUID() + crypto.randomUUID(), number, until: now + grace };
}

function seatOf(room, personId) {
  return room.seats.findIndex((seat) => seat?.kind === "human" && seat.id === personId);
}

function removePerson(room, personId) {
  const seat = seatOf(room, personId);
  if (seat >= 0) room.seats[seat] = null;
  room.people = room.people.filter((person) => person.id !== personId);
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (!headers) return failure("这个站点无法连接房间。", 403);
    const url = new URL(request.url);
    const handled = async () => {
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      if (request.method === "GET" && url.pathname === "/health") return json({ service: "arcade-rooms", version: 1 });
      if (request.method === "POST" && url.pathname === "/api/rooms") {
        const data = await body(request);
        if (!isGame(data?.game)) return failure("暂不支持这个游戏。", 400);
        for (let attempt = 0; attempt < 4; attempt++) {
          const code = roomCode();
          const response = await env.ROOMS.getByName(code).fetch("https://room.internal/create", {
            method: "POST", body: JSON.stringify({ code, game: data.game }),
          });
          if (response.status !== 409) return response;
        }
        return failure("暂时无法建房，请重试。", 503);
      }
      const match = /^\/api\/rooms\/([^/]+)\/(join|socket)$/.exec(url.pathname);
      if (!match || !validCode.test(match[1])) return failure("找不到这个房间。", 404);
      const [, code, action] = match;
      if (action === "socket" && request.method === "GET") {
        return env.ROOMS.getByName(code).fetch(new Request("https://room.internal/socket", request));
      }
      if (action === "join" && request.method === "POST") {
        const data = await body(request);
        if (!isGame(data?.game)) return failure("暂不支持这个游戏。", 400);
        if (data.token !== undefined && (typeof data.token !== "string" || data.token.length !== 72)) {
          return failure("座位已失效，请重新加入。", 410);
        }
        return env.ROOMS.getByName(code).fetch("https://room.internal/join", {
          method: "POST", body: JSON.stringify({ game: data.game, token: data.token }),
        });
      }
      return failure("找不到这个房间。", 404);
    };
    return withHeaders(await handled(), headers);
  },
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  load() {
    return this.ctx.storage.kv.get("room");
  }

  isOnline(id, except = null) {
    return online(this.ctx.getWebSockets(id).filter((socket) => socket !== except));
  }

  paused(room) {
    return room.phase === "playing" && room.seats.some((seat) => seat?.kind === "human" && !this.isOnline(seat.id));
  }

  ready(room) {
    return room.phase === "lobby" && seatOf(room, room.host) >= 0 &&
      room.seats.every((seat) => seat && (seat.kind === "computer" || this.isOnline(seat.id)));
  }

  electHost(room) {
    const seated = room.people.find((person) => this.isOnline(person.id) && seatOf(room, person.id) >= 0);
    const next = seated || room.people.find((person) => this.isOnline(person.id));
    if (!next) return false;
    room.host = next.id;
    if (!seated) {
      const index = room.seats.findIndex((seat) => !seat || seat.kind === "computer");
      if (index >= 0) room.seats[index] = { kind: "human", id: next.id };
    }
    return true;
  }

  view(room, personId) {
    const game = games[room.game];
    const pauses = room.people.filter((person) => person.until && seatOf(room, person.id) >= 0);
    return {
      code: room.code, phase: room.phase, you: personId, host: room.host,
      ready: this.ready(room), notice: room.notice, clock: Date.now(),
      pauseUntil: this.paused(room) && pauses.length ? Math.min(...pauses.map((person) => person.until)) : 0,
      seats: room.seats.map((seat) => {
        if (!seat || seat.kind === "computer") return seat;
        const person = room.people.find((entry) => entry.id === seat.id);
        return { kind: "human", id: seat.id, name: nameOf(person), online: this.isOnline(seat.id), until: person.until };
      }),
      match: room.match ? {
        id: room.match.id, revision: room.match.revision, resigned: room.match.resigned,
        ...game.view(room.match.state, seatOf(room, personId)),
      } : null,
    };
  }

  commit(room) {
    const now = Date.now();
    if (room.phase === "playing" && !this.paused(room) &&
        room.seats[games[room.game].turn(room.match.state)]?.kind === "computer") {
      room.match.aiAt ||= now + 420;
    } else if (room.match) {
      room.match.aiAt = 0;
    }
    const deadlines = room.people.map((person) => person.until).filter(Boolean);
    if (room.match?.aiAt) deadlines.push(room.match.aiAt);
    this.ctx.storage.kv.put("room", room);
    const alarm = deadlines.length ? this.ctx.storage.setAlarm(Math.min(...deadlines)) : this.ctx.storage.deleteAlarm();
    this.ctx.waitUntil(alarm);
    for (const socket of this.ctx.getWebSockets()) {
      const personId = socket.deserializeAttachment()?.id;
      if (room.people.some((person) => person.id === personId)) send(socket, { type: "state", room: this.view(room, personId) });
    }
  }

  closeRoom() {
    this.ctx.storage.kv.delete("room");
    this.ctx.waitUntil(this.ctx.storage.deleteAlarm());
    for (const socket of this.ctx.getWebSockets()) {
      send(socket, { type: "closed", message: "房间已关闭，请重新建房。" });
      socket.close(4404, "room closed");
    }
  }

  expire(room, now) {
    if (!room) return null;
    let changed = false;
    // A new instance may be restored after an interrupted connection.
    for (const person of room.people) {
      if (!person.until && !this.isOnline(person.id)) {
        person.until = now + grace;
        changed = true;
      }
    }
    const expired = room.people.filter((person) => person.until && person.until <= now);
    if (expired.length) {
      const abort = room.phase === "playing" && expired.some((person) => seatOf(room, person.id) >= 0);
      for (const person of expired) removePerson(room, person.id);
      if (!room.people.some((person) => this.isOnline(person.id))) {
        this.closeRoom();
        return null;
      }
      if (!room.people.some((person) => person.id === room.host)) this.electHost(room);
      if (abort) {
        room.phase = "lobby";
        room.match = null;
        room.notice = "对局因掉线中止。补齐座位后可以重开。";
      }
      changed = true;
    }
    if (changed) this.commit(room);
    return room;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const data = request.method === "POST" ? await request.json() : null;
    const now = Date.now();
    const room = this.expire(this.load(), now);
    if (path === "/create" && request.method === "POST") {
      if (room) return failure("房间码已被占用。", 409);
      const person = newPerson(1, now);
      const seats = Array(games[data.game].seats).fill(null);
      seats[0] = { kind: "human", id: person.id };
      this.commit({
        code: data.code, game: data.game, phase: "lobby", host: person.id,
        seats, people: [person], nextNumber: 2, match: null, notice: "",
      });
      return json({ code: data.code, token: person.token }, 201);
    }
    if (!room) return failure("房间已关闭或不存在。", 404);
    if (path === "/join" && request.method === "POST") {
      if (room.game !== data.game) return failure("这个房间属于另一款游戏。", 404);
      if (data.token) {
        if (room.people.some((person) => person.token === data.token)) return json({ code: room.code, token: data.token });
        return failure("座位已失效，请重新加入。", 410);
      }
      if (room.phase !== "lobby" || room.seats.every(Boolean)) return failure("房间已满或正在对局。", 409);
      if (room.people.length >= room.seats.length * 2) return failure("暂时无法加入，请稍后再试。", 409);
      const person = newPerson(room.nextNumber++, now);
      room.people.push(person);
      this.commit(room);
      return json({ code: room.code, token: person.token });
    }
    if (path === "/socket" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const [version, token] = (request.headers.get("Sec-WebSocket-Protocol") || "").split(",").map((part) => part.trim());
      const person = room.people.find((entry) => entry.token === token);
      if (version !== protocol || !person) return failure("座位已失效，请重新加入。", 403);
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, [person.id]);
      server.serializeAttachment({ id: person.id });
      person.until = 0;
      this.commit(room);
      return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": protocol } });
    }
    return failure("找不到这个操作。", 404);
  }

  update(room, person, action) {
    const index = action.seat;
    const host = person.id === room.host;
    if (action.type === "seat") {
      if (room.phase !== "lobby" || !Number.isInteger(index) || index < 0 || index >= room.seats.length || room.seats[index]) {
        return "这个座位目前不可用。";
      }
      const old = seatOf(room, person.id);
      if (old >= 0) room.seats[old] = null;
      room.seats[index] = { kind: "human", id: person.id };
    } else if (action.type === "computer") {
      if (!host || room.phase !== "lobby" || !Number.isInteger(index) || index < 0 || index >= room.seats.length ||
          room.seats[index]?.kind === "human" || ![null, "normal", "advanced"].includes(action.level)) return "这个座位无法安排电脑。";
      room.seats[index] = action.level ? { kind: "computer", level: action.level } : null;
    } else if (action.type === "start") {
      if (!host || !this.ready(room)) return "等所有座位就绪后再开始。";
      for (const entry of [...room.people]) {
        if (seatOf(room, entry.id) >= 0) continue;
        removePerson(room, entry.id);
        this.closePerson(entry.id, "对局已开始，请加入下一局。");
      }
      room.phase = "playing";
      room.notice = "";
      room.match = { id: crypto.randomUUID(), revision: 0, state: games[room.game].start(), aiAt: 0, resigned: null };
    } else if (action.type === "move") {
      const game = games[room.game];
      if (room.phase !== "playing" || this.paused(room) || room.match.id !== action.match ||
          room.match.revision !== action.revision || game.turn(room.match.state) !== seatOf(room, person.id)) {
        return "当前无法落子，请等房间同步。";
      }
      const next = game.move(room.match.state, action);
      if (!next) return "这个位置不能落子。";
      room.match.state = next;
      room.match.revision++;
      if (game.finished(next)) room.phase = "finished";
    } else if (action.type === "restart") {
      if (!host || room.phase !== "finished") return "由房主返回房间安排下一局。";
      room.phase = "lobby";
      room.match = null;
      room.notice = "";
    } else {
      return "这个操作暂不可用。";
    }
    return null;
  }

  closePerson(id, message) {
    for (const socket of this.ctx.getWebSockets(id)) {
      send(socket, { type: "closed", message });
      socket.close(4404, "seat closed");
    }
  }

  leave(room, person) {
    if (room.phase === "playing" && seatOf(room, person.id) >= 0) {
      room.match.resigned = seatOf(room, person.id);
      room.phase = "finished";
    }
    removePerson(room, person.id);
    this.closePerson(person.id, "你已离开房间。");
    const stay = room.people.some((entry) => this.isOnline(entry.id));
    if (!stay) return this.closeRoom();
    if (room.host === person.id) this.electHost(room);
    this.commit(room);
  }

  webSocketMessage(socket, message) {
    if (typeof message !== "string" || message.length > 2048) return;
    const room = this.expire(this.load(), Date.now());
    const person = room?.people.find((entry) => entry.id === socket.deserializeAttachment()?.id);
    if (!person) {
      send(socket, { type: "closed", message: "房间或座位已关闭。" });
      socket.close(4404, "seat closed");
      return;
    }
    let action;
    try { action = JSON.parse(message); } catch { return; }
    if (!action || typeof action !== "object") return;
    if (action.type === "leave") return this.leave(room, person);
    const error = this.update(room, person, action);
    if (error) send(socket, { type: "error", message: error, room: this.view(room, person.id) });
    else this.commit(room);
  }

  webSocketClose(socket, code) {
    const room = this.load();
    const id = socket.deserializeAttachment()?.id;
    const person = room?.people.find((entry) => entry.id === id);
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
      socket.close(code >= 1000 && code !== 1006 && code !== 1005 ? code : 1000);
    }
    if (person && !this.isOnline(id, socket)) {
      person.until ||= Date.now() + grace;
      this.commit(room);
    }
  }

  webSocketError(socket) {
    this.webSocketClose(socket, 1011);
  }

  alarm() {
    const now = Date.now();
    const room = this.expire(this.load(), now);
    if (!room) return;
    if (room.phase === "playing" && !this.paused(room) && room.match.aiAt && room.match.aiAt <= now) {
      const game = games[room.game];
      const seat = room.seats[game.turn(room.match.state)];
      if (seat?.kind === "computer") {
        room.match.state = game.computer(room.match.state, seat.level);
        room.match.revision++;
        if (game.finished(room.match.state)) room.phase = "finished";
      }
      room.match.aiAt = 0;
    }
    this.commit(room);
  }
}
