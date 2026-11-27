import { DurableObject } from "cloudflare:workers";
import { playerAlias, roles } from "../../games/renmin/online/catalog.js";
import { advance, applyChoice, channelFor, chatExportScope, createMatch, extendDiscussion, faction, find, live, nextTransition, viewFor } from "./match.js";
import { callModel, configuredChatModel, configuredModel, fallback, playable, updateReads } from "./agents.js";
import { purgeDiagnostics, traceFor, writeDiagnostic } from "./diagnostics.js";
import { dmKey, jobPriority, jobTime, publicLead, queueJob, queueOutreach, queuePublicNotice, queueReply, spoken } from "./discussion.js";
import { auditConversation, decisionRevision, outsideTeamDm, reviewTactics, roundFacts, teamConversation } from "./strategy.js";

const protocol = "arcade-room-v1";
const gameKey = "renmin";
const grace = 5 * 60 * 1000;
const codes = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const validCode = /^[2-9A-HJ-NP-Z]{6}$/;
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const failure = (message, status) => json({ message }, status);
const roomCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((n) => codes[n & 31]).join("");
const playerName = (person) => playerAlias(person.number);
const open = (socket) => socket.readyState === WebSocket.OPEN;

async function body(request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    const data = JSON.parse(text + decoder.decode());
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function speak(socket, message) {
  if (!open(socket)) return;
  try { socket.send(JSON.stringify(message)); } catch { /* The close handler preserves the seat. */ }
}

function newPerson(number, now) {
  return {
    id: crypto.randomUUID(), token: crypto.randomUUID() + crypto.randomUUID(), number, until: now + grace, lastMessage: 0,
  };
}

function seatOf(room, personId) {
  return room.seats.findIndex((slot) => slot?.kind === "human" && slot.id === personId) + 1;
}

function removePerson(room, id) {
  const seat = seatOf(room, id);
  if (seat) room.seats[seat - 1] = null;
  room.people = room.people.filter((person) => person.id !== id);
}

function callLimit(env) {
  const value = Number(env.MATCH_CALL_LIMIT);
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(400, value) : 300;
}

function budgetReason(env, match, job) {
  const limit = callLimit(env);
  if (match.usage.calls >= limit) return "request_budget_reached";
  const reserved = Math.min(40, Math.ceil(limit / 4));
  if (job.purpose === "speech" && match.usage.calls >= limit - reserved) return "action_budget_reserved";
  return null;
}

function reviewChoice(context, data) {
  let reason;
  const action = playable(context, data, (code) => { reason = code; return null; });
  return { action, reason, reads: data?.reads };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/health" && request.method === "GET") {
      const enabled = Boolean(env.DASHSCOPE_API_KEY);
      return json({ service: "renmin-playtest", model: enabled ? configuredModel(env) : null,
        chatModel: enabled ? configuredChatModel(env) : null, callLimit: callLimit(env) });
    }
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return failure("请从试玩页面打开房间。", 403);
    if (path === "/api/rooms" && request.method === "POST") {
      if ((await body(request))?.game !== gameKey) return failure("无法创建房间。", 400);
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = roomCode();
        const response = await env.ROOMS.getByName(code).fetch("https://room.internal/create", {
          method: "POST", body: JSON.stringify({ code }),
        });
        if (response.status !== 409) return response;
      }
      return failure("暂时无法建房，请重试。", 503);
    }
    const match = /^\/api\/rooms\/([^/]+)\/(join|socket)$/.exec(path);
    if (!match || !validCode.test(match[1])) return failure("找不到这个房间。", 404);
    const [, code, action] = match;
    const room = env.ROOMS.getByName(code);
    if (action === "join" && request.method === "POST") {
      const input = await body(request);
      if (input?.game !== gameKey) return failure("这个房间属于另一款游戏。", 404);
      if (input.token !== undefined && (typeof input.token !== "string" || input.token.length !== 72)) {
        return failure("座位已失效，请重新加入。", 410);
      }
      return room.fetch("https://room.internal/join", { method: "POST", body: JSON.stringify({ token: input.token }) });
    }
    if (action === "socket" && request.method === "GET") return room.fetch(new Request("https://room.internal/socket", request));
    return failure("找不到这个操作。", 404);
  },
  async scheduled(_event, env) {
    if (env.DIAGNOSTICS) await purgeDiagnostics(env.DIAGNOSTICS, Date.now());
  },
};

export class RenminRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS messages (match_id TEXT NOT NULL, channel TEXT NOT NULL, id INTEGER NOT NULL, actor INTEGER NOT NULL, day INTEGER NOT NULL, sent INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (match_id, channel, id))");
  }

  load() {
    return this.ctx.storage.kv.get("room");
  }

  online(id, except) {
    return this.ctx.getWebSockets(id).some((socket) => open(socket) && socket !== except);
  }

  ready(room) {
    return room.phase === "lobby" && room.seats.every((seat) => seat &&
      (seat.kind === "computer" || this.online(seat.id)));
  }

  participants(room) {
    return room.people.filter((person) => live(find(room.match.game, seatOf(room, person.id))));
  }

  sendState(room, recipients) {
    for (const socket of this.ctx.getWebSockets()) {
      const id = socket.deserializeAttachment()?.id;
      const person = room.people.find((item) => item.id === id);
      if (person && (!recipients || recipients(person))) speak(socket, { type: "state", room: this.view(room, person) });
    }
  }

  view(room, person) {
    const own = seatOf(room, person.id);
    const session = room.match;
    const paused = room.phase === "playing" ? session.pausedAt : 0;
    const waits = paused ? this.participants(room).filter((entry) => entry.until).map((entry) => entry.until) : [];
    return {
      code: room.code, host: person.id === room.host, you: own, phase: room.phase, ready: this.ready(room),
      clock: Date.now(), notice: room.notice, ai: Boolean(this.env.DASHSCOPE_API_KEY),
      pausedAt: paused || 0, pauseUntil: waits.length ? Math.min(...waits) : 0,
      ...(room.phase === "lobby" ? {
        selectedRole: person.selectedRole ?? null,
        reservedRoles: Object.keys(roles).filter((role) => room.people.some((member) => member.selectedRole === role)),
      } : {}),
      seats: room.seats.map((slot) => {
        if (!slot || slot.kind === "computer") return slot;
        const member = room.people.find((entry) => entry.id === slot.id);
        return { kind: "human", name: playerName(member), online: this.online(slot.id) };
      }),
      match: session && own ? {
        id: session.id, ...viewFor(session.game, own),
        ...(room.phase === "finished" && person.id === room.host ? { usage: { ...session.usage, limit: callLimit(this.env) } } : {}),
      } : null,
    };
  }

  closePerson(id, message) {
    for (const socket of this.ctx.getWebSockets(id)) {
      speak(socket, { type: "closed", message });
      socket.close(4404, "seat closed");
    }
  }

  closeRoom(room) {
    for (const person of room.people) this.closePerson(person.id, "房间已关闭，请重新建房。");
    this.ctx.storage.kv.delete("room");
    this.ctx.storage.sql.exec("DELETE FROM messages");
    this.ctx.waitUntil(this.ctx.storage.deleteAlarm());
  }

  electHost(room) {
    if (room.people.some((person) => person.id === room.host)) return;
    const next = room.people.find((person) => this.online(person.id)) || room.people[0];
    if (next) room.host = next.id;
  }

  abortGame(room) {
    if (room.match) this.ctx.storage.sql.exec("DELETE FROM messages WHERE match_id = ?", room.match.id);
    room.phase = "lobby";
    room.match = null;
    room.notice = "有玩家离开或超时未重连。补齐座位后可重新开局。";
  }

  updatePause(room, now) {
    if (room.phase !== "playing") return false;
    const match = room.match;
    const disconnected = this.participants(room).some((person) => person.until);
    if (disconnected && !match.pausedAt) {
      match.pausedAt = now;
      return true;
    }
    if (disconnected || !match.pausedAt) return false;
    const paused = now - match.pausedAt;
    match.pausedAt = 0;
    match.game.opened += paused;
    if (match.game.until) match.game.until += paused;
    for (const job of match.jobs) {
      if (job.due) job.due += paused;
      if (job.expires) job.expires += paused;
    }
    return true;
  }

  refresh(room, now) {
    if (!room) return null;
    let changed = false;
    for (const person of room.people) {
      if (!person.until && !this.online(person.id)) {
        person.until = now + grace;
        changed = true;
      }
    }
    const expired = room.people.filter((person) => person.until && person.until <= now);
    if (expired.length) {
      const abandoned = room.phase === "playing" && expired.some((person) => live(find(room.match.game, seatOf(room, person.id))));
      for (const person of expired) {
        this.closePerson(person.id, "重连时间已到，座位已释放。");
        removePerson(room, person.id);
      }
      if (!room.people.length) {
        this.closeRoom(room);
        return null;
      }
      this.electHost(room);
      if (abandoned) this.abortGame(room);
      changed = true;
    }
    changed = this.updatePause(room, now) || changed;
    changed = this.step(room, now) || changed;
    if (changed) this.commit(room);
    return room;
  }

  step(room, now) {
    const match = room.match;
    if (room.phase !== "playing" || match.pausedAt) return false;
    let changed = false;
    while (advance(match.game, now)) changed = true;
    if (match.game.winner) room.phase = "finished";
    return changed;
  }

  syncJobs(room, now) {
    const match = room.match;
    if (!match || match.stage === match.game.stage) return;
    const game = match.game;
    match.stage = game.stage;
    match.jobs = [];
    if (room.phase !== "playing") return;
    const bots = game.players.filter((player) => live(player) && room.seats[player.id - 1]?.kind === "computer");
    if (game.phase === "day") {
      const views = bots.map((player) => viewFor(game, player.id));
      const audit = views.filter((view) => faction(view.self) === "audit");
      for (const [i, view] of audit.entries()) {
        queueJob(match, view.self.id, "speech", now + 4000 + i * 1500, { channel: "audit" });
        if (view.auditSkill) queueJob(match, view.self.id, "auditSkill", now + (game.day === 1 ? 20_000 : 170_000));
      }
      const corrupt = views.filter((view) => faction(view.self) === "corrupt");
      if (corrupt.length) {
        queueJob(match, corrupt[(game.day - 1) % corrupt.length].self.id, "speech", now + 6000, { channel: "corrupt" });
      }
      const notice = queuePublicNotice(match, bots, now);
      queueOutreach(match, room.seats, now, notice);
      const chief = views.find((view) => view.chief === view.self.id);
      if (chief && game.day > 1) queueJob(match, chief.self.id, "dayAction", game.until);
    } else {
      for (const [i, player] of bots.entries()) {
        const view = viewFor(game, player.id);
        if (game.phase === "prelude" && view.prelude.length) queueJob(match, player.id, "prelude", now + 650 + i * 90);
        if (game.phase === "night" && view.night.length) queueJob(match, player.id, "night", now + 550 + i * 120);
        if (view.detention?.canRescue) queueJob(match, player.id, "rescue", now + 350);
      }
    }
  }

  commit(room, recipients = null, broadcast = true) {
    const now = Date.now();
    this.syncJobs(room, now);
    this.ctx.storage.kv.put("room", room);
    const due = room.people.map((person) => person.until).filter(Boolean);
    if (room.phase === "playing" && !room.match.pausedAt) {
      const transition = nextTransition(room.match.game);
      if (transition) due.push(transition);
      for (const task of room.match.jobs) due.push(jobTime(room.match, task));
    }
    const alarm = due.length ? this.ctx.storage.setAlarm(Math.max(now + 10, Math.min(...due))) : this.ctx.storage.deleteAlarm();
    this.ctx.waitUntil(alarm);
    if (broadcast) this.sendState(room, recipients);
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const data = request.method === "POST" ? await request.json() : null;
    const now = Date.now();
    const room = this.refresh(this.load(), now);
    if (path === "/create" && request.method === "POST") {
      if (room) return failure("房间码已被占用。", 409);
      const person = newPerson(1, now);
      this.commit({
        code: data.code, phase: "lobby", host: person.id, nextNumber: 2, people: [person],
        seats: [{ kind: "human", id: person.id }, ...Array(8).fill(null)], match: null, notice: "",
      });
      return json({ code: data.code, token: person.token }, 201);
    }
    if (!room) return failure("房间已关闭或不存在。", 404);
    if (path === "/join" && request.method === "POST") {
      if (data.token) return room.people.some((person) => person.token === data.token)
        ? json({ code: room.code, token: data.token })
        : failure("座位已失效，请重新加入。", 410);
      const index = room.seats.indexOf(null);
      if (room.phase !== "lobby" || index < 0) return failure("房间已满或正在对局。", 409);
      const person = newPerson(room.nextNumber++, now);
      room.people.push(person);
      room.seats[index] = { kind: "human", id: person.id };
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
      this.updatePause(room, now);
      this.commit(room);
      return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": protocol } });
    }
    return failure("找不到这个操作。", 404);
  }

  history(match, channel, before = Number.MAX_SAFE_INTEGER, limit = 36) {
    return [...this.ctx.storage.sql.exec(
      "SELECT id, channel, actor, day, sent, text FROM messages WHERE match_id = ? AND channel = ? AND id < ? ORDER BY id DESC LIMIT ?",
      match.id, channel, before, limit,
    )].reverse();
  }

  exportChat(match, id, offset) {
    const scope = chatExportScope(match.game, id);
    if (!scope || !Number.isSafeInteger(offset) || offset < 0) return null;
    const channels = [scope.team, ...match.game.players.filter((player) => player.id !== id).map((player) => dmKey(id, player.id))];
    const pageSize = 160;
    const rows = [...this.ctx.storage.sql.exec(
      "SELECT id, channel, actor, day, sent, text FROM messages WHERE match_id = ? AND " +
      "(channel = 'public' OR (sent <= ? AND channel IN (" + channels.map(() => "?").join(", ") + "))) " +
      "ORDER BY sent, channel, id LIMIT ? OFFSET ?",
      match.id, scope.privateUntil, ...channels, pageSize + 1, offset,
    )];
    const next = rows.length > pageSize ? offset + pageSize : null;
    return { type: "chatExport", match: match.id, offset, next, rows: rows.slice(0, pageSize) };
  }

  post(room, actor, channel, text, time) {
    const match = room.match;
    const day = match.game.day;
    const { id } = this.ctx.storage.sql.exec(
      "INSERT INTO messages (id, match_id, channel, actor, day, sent, text) VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM messages WHERE match_id = ? AND channel = ?), ?, ?, ?, ?, ?, ?) RETURNING id",
      match.id, channel, match.id, channel, actor, day, time, text,
    ).one();
    const message = { id, channel, actor, day, sent: time, text };
    for (const person of room.people) {
      if (!channelFor(match.game, seatOf(room, person.id), channel)) continue;
      for (const socket of this.ctx.getWebSockets(person.id)) speak(socket, { type: "chat", match: match.id, message });
    }
    return message;
  }

  start(room, now) {
    const names = room.seats.map((_, i) => playerAlias(i + 1));
    const selections = room.seats.map((slot) => slot.kind === "human" ?
      room.people.find((person) => person.id === slot.id)?.selectedRole : null);
    room.phase = "playing";
    room.notice = "";
    room.match = {
      id: crypto.randomUUID(), game: createMatch(names, crypto.getRandomValues(new Uint32Array(1))[0], now, selections),
      stage: 0, jobId: 0, jobs: [], minds: {}, pausedAt: 0,
      usage: { calls: 0, input: 0, output: 0, cached: 0, fallback: 0, lastError: "", elapsed: 0 },
    };
    for (const person of room.people) delete person.selectedRole;
  }

  lobbyAction(room, person, action, now) {
    const index = action.seat;
    if (action.type === "restart" && room.phase === "finished" && person.id === room.host) {
      this.ctx.storage.sql.exec("DELETE FROM messages WHERE match_id = ?", room.match.id);
      room.match = null;
      room.phase = "lobby";
      room.notice = "";
      return true;
    }
    if (room.phase !== "lobby") return false;
    if (action.type === "seat" && Number.isInteger(index) && index >= 0 && index < 9 && !room.seats[index]) {
      room.seats[seatOf(room, person.id) - 1] = null;
      room.seats[index] = { kind: "human", id: person.id };
      return true;
    }
    if (person.id !== room.host) return false;
    if (action.type === "computer" && Number.isInteger(index) && index >= 0 && index < 9 && room.seats[index]?.kind !== "human") {
      room.seats[index] = room.seats[index] ? null : { kind: "computer" };
      return true;
    }
    if (action.type === "fill") {
      room.seats = room.seats.map((seat) => seat || { kind: "computer" });
      return true;
    }
    if (action.type === "start" && this.ready(room)) {
      this.start(room, now);
      return true;
    }
    return false;
  }

  leave(room, person) {
    if (room.phase === "playing" && live(find(room.match.game, seatOf(room, person.id)))) this.abortGame(room);
    removePerson(room, person.id);
    this.closePerson(person.id, "你已离开房间。");
    if (!room.people.length) this.closeRoom(room);
    else {
      this.electHost(room);
      this.updatePause(room, Date.now());
      this.commit(room);
    }
  }

  webSocketMessage(socket, message) {
    if (typeof message !== "string" || message.length > 2200) return;
    let action;
    try { action = JSON.parse(message); } catch { return; }
    if (!action || typeof action.type !== "string" || action.kind !== undefined && typeof action.kind !== "string") return;
    const now = Date.now();
    const room = this.refresh(this.load(), now);
    const person = room?.people.find((member) => member.id === socket.deserializeAttachment()?.id);
    if (!person) {
      socket.close(4404, "seat closed");
      return;
    }
    const fail = (message) => speak(socket, { type: "error", message, room: this.view(room, person) });
    if (action.type === "leave") return this.leave(room, person);
    if (action.type === "selectRole") {
      if (room.phase !== "lobby" || action.role !== null &&
          (typeof action.role !== "string" || !Object.hasOwn(roles, action.role))) {
        return fail("请在开局前选择角色。");
      }
      if (action.role !== null && room.people.some((member) => member.id !== person.id && member.selectedRole === action.role)) {
        return fail("这个角色已被选走，请选其他角色。");
      }
      person.selectedRole = action.role;
      return this.commit(room);
    }
    if (this.lobbyAction(room, person, action, now)) return this.commit(room);
    const match = room.match;
    const id = seatOf(room, person.id);
    if (match?.id !== action.match || !match || !id) return fail("当前房间无法执行这个操作。");
    const game = match.game;
    if (action.type === "history") {
      if (typeof action.channel !== "string" || !channelFor(game, id, action.channel)) return fail("这个频道不可用。");
      const rows = this.history(match, action.channel, Number.isSafeInteger(action.before) && action.before > 0 ? action.before : undefined);
      return speak(socket, { type: "history", match: match.id, channel: action.channel, rows });
    }
    if (action.type === "exportChat") {
      const data = this.exportChat(match, id, action.offset ?? 0);
      return data ? speak(socket, data) : fail("结算后可以导出本席聊天。");
    }
    if (room.phase !== "playing" || match.pausedAt || action.stage !== game.stage) return fail("当前阶段已变化或正在等待重连。");
    if (action.type === "extendDiscussion") {
      if (!extendDiscussion(game, id, now)) return fail("每位在场玩家每天可在倒计时结束前加时一次。");
      const decision = match.jobs.find((job) => job.purpose === "dayAction");
      if (decision) decision.due = game.until;
      return this.commit(room);
    }
    if (action.type === "chat") {
      const channel = action.channel;
      const peer = typeof channel === "string" && channel.startsWith("dm:") ?
        channel.split(":").slice(1).map(Number).find((seat) => seat !== id) : null;
      if (game.phase !== "day" || !live(find(game, id)) || typeof channel !== "string" ||
          !channelFor(game, id, channel) || peer && !live(find(game, peer))) return fail("现在无法在这个频道发言。");
      if (now - person.lastMessage < 700) return fail("发言太快，请稍等片刻。");
      const text = typeof action.text === "string" ? action.text.replace(/[\u0000-\u001f]+/g, " ").trim() : "";
      if (!text || text.length > 280) return fail("发言需要填写，最多 280 字。");
      person.lastMessage = now;
      const posted = this.post(room, id, channel, text, now);
      queueReply(match, room.seats, posted, now);
      if (channel === "public" && publicLead(text)) queueOutreach(match, room.seats, now, true);
      return this.commit(room, null, false);
    }
    if (!applyChoice(game, id, action, now)) return fail("现在无法提交这个选择。");
    this.step(room, now);
    this.commit(room, this.choiceAudience(room, id, action.type, action.stage));
  }

  choiceAudience(room, id, type, stage) {
    if (room.match.game.stage !== stage) return null;
    if (type === "auditSkill") return (person) => faction(find(room.match.game, seatOf(room, person.id))) === "audit";
    return (person) => seatOf(room, person.id) === id;
  }

  webSocketClose(socket, code) {
    const room = this.load();
    const id = socket.deserializeAttachment()?.id;
    const person = room?.people.find((entry) => entry.id === id);
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
      socket.close(code >= 1000 && code !== 1006 && code !== 1005 ? code : 1000);
    }
    if (person && !this.online(id, socket)) {
      const now = Date.now();
      person.until ||= now + grace;
      this.updatePause(room, now);
      this.commit(room);
    }
  }

  webSocketError(socket) {
    this.webSocketClose(socket, 1011);
  }

  context(room, job) {
    const match = room.match;
    const game = match.game;
    const seat = job.seat;
    const view = viewFor(game, seat);
    if (!view.self.alive || room.seats[seat - 1]?.kind !== "computer") return null;
    if (job.purpose === "speech" && (game.phase !== "day" || !job.outreach && !channelFor(game, seat, job.channel)) ||
        job.purpose === "auditSkill" && (!view.auditSkill || view.auditChoice) ||
        job.purpose === "dayAction" && view.chief !== seat ||
        job.purpose === "prelude" && !view.prelude.length ||
        job.purpose === "night" && !view.night.length ||
        job.purpose === "rescue" && (!view.detention?.canRescue || view.detention.answered)) return null;
    const threads = { public: this.history(match, "public", undefined, 14) };
    const side = faction(view.self);
    const writing = job.purpose === "speech" && (job.plan || job.channel !== "public");
    if (side !== "middle" && (!writing || teamConversation(view, job.channel))) {
      threads[side] = this.history(match, side, undefined, 14);
    }
    if (!writing || job.channel?.startsWith("dm:")) {
      for (const other of view.seats.filter((player) => player.id !== seat)) {
        const key = dmKey(seat, other.id);
        if (!channelFor(game, seat, key) || writing && key !== job.channel) continue;
        const rows = this.history(match, key, undefined, key === job.channel ? 12 : 4);
        if (rows.length) threads[key] = rows;
      }
    }
    const reply = job.reply;
    const incoming = reply ? this.history(match, job.channel, reply.last + 1, 10)
      .filter((entry) => entry.id >= reply.first && entry.actor === reply.actor) : [];
    const ownRemarks = [...this.ctx.storage.sql.exec(
      "SELECT id, channel, actor, day, text FROM messages WHERE match_id = ? AND actor = ? AND (? IS NULL OR channel = 'public' OR channel = ?) ORDER BY sent DESC LIMIT 12",
      match.id, seat, writing ? job.channel ?? "public" : null, writing ? job.channel ?? "public" : null,
    )].reverse();
    const memory = job.plan ? undefined : match.minds?.[seat];
    const round = side === "audit" && (job.purpose !== "speech" || auditConversation(view, job.channel)) ?
      roundFacts(view, memory) : undefined;
    return {
      view, threads, purpose: job.purpose, channel: job.channel, plan: job.plan, incoming, ownRemarks,
      replyTo: reply?.actor ?? job.replyTo, mustReply: Boolean(reply && job.priority <= 2),
      memory, round, tactical: reviewTactics(view, job, incoming), briefed: job.briefed,
      tacticsApplied: job.tacticsApplied, retry: job.retry, outreach: job.outreach, initiated: job.initiated,
      notice: job.notice ? game.public.find((entry) => entry.id === job.notice) : undefined,
    };
  }

  deliver(room, job, context, review, now) {
    const match = room.match;
    const { action } = review;
    if (!action) return { outcome: "rejected", reason: review.reason };
    if (job.purpose === "speech") {
      if (action.tactics) {
        const { proposal, registration } = action.tactics;
        if (registration && !applyChoice(match.game, job.seat, registration, now)) {
          return { outcome: "rejected", reason: "action_no_longer_available" };
        }
        const mind = ((match.minds ??= {})[job.seat] ??= {});
        if (proposal) mind.proposal = { ...proposal, day: context.view.day };
        const { channel, reply, priority, depth } = job;
        const tacticsApplied = registration ? "skill" : proposal ? "current" : undefined;
        const next = queueJob(match, job.seat, "speech", now, {
          channel, reply, priority, depth, briefed: true, tacticsApplied, traceRoot: job.traceRoot ?? job.id,
        });
        return { outcome: "prepared", draftJob: next.id, proposal, registration };
      }
      if (action.plan) {
        const { reply, priority, depth, notice } = job;
        const channel = action.contact ? dmKey(job.seat, action.contact) : job.channel;
        const next = queueJob(match, job.seat, "speech", now, {
          channel, reply, priority, depth, notice, initiated: Boolean(action.contact),
          plan: action.plan, traceRoot: job.traceRoot ?? job.id,
        });
        return { outcome: "planned", draftJob: next.id, peer: action.contact, ...action.plan };
      } else if (action.text) {
        spoken(match, job, now);
        const posted = this.post(room, job.seat, job.channel, action.text, now);
        queueReply(match, room.seats, posted, now, job);
        return { outcome: "posted", messageId: posted.id, reference: action.reference, text: posted.text };
      }
      return { outcome: "quiet" };
    }
    if (!applyChoice(match.game, job.seat, action, now)) return { outcome: "rejected", reason: "action_no_longer_available" };
    const mind = ((match.minds ??= {})[job.seat] ??= {});
    const choice = { ...action, day: context.view.day };
    mind.choices = [...(mind.choices || []), choice].slice(-12);
    return { outcome: "applied", kind: action.kind, target: action.target, member: action.member };
  }

  resolveJob(room, job, context, review, now, fallbackReason, source = "model") {
    const match = room.match;
    const trace = traceFor(room, job);
    let rejected;
    if (review) {
      const result = this.deliver(room, job, context, review, now);
      if (result.outcome !== "rejected") {
        if (!job.plan && review.reads) {
          const mind = ((match.minds ??= {})[job.seat] ??= {});
          mind.reads = updateReads(mind.reads, review, context.view);
        }
        writeDiagnostic(this.ctx, this.env.DIAGNOSTICS, trace, "decision", { ...result, source });
        return;
      }
      rejected = result.reason;
      match.usage.lastError = job.error || "模型返回了无法提交的选择";
      writeDiagnostic(this.ctx, this.env.DIAGNOSTICS, trace, "model_rejected", { reason: rejected });
    }

    match.usage.fallback++;
    if (fallbackReason === "watchdog_timeout") match.usage.lastError = "百炼请求超时";
    const safeContext = { ...context, tactical: false };
    const compose = job.purpose === "speech" && !context.plan &&
      (job.channel === "public" || outsideTeamDm(context.view, job.channel));
    const chosen = compose ? { ...safeContext, plan: playable(safeContext, fallback(safeContext))?.plan } : safeContext;
    const safe = reviewChoice(chosen, fallback(chosen));
    const result = this.deliver(room, job, chosen, safe, now);
    writeDiagnostic(this.ctx, this.env.DIAGNOSTICS, trace, "fallback", {
      ...result, cause: rejected || fallbackReason,
    });
  }

  completeJob(room, job, context, review, now, fallbackReason) {
    const match = room.match;
    match.jobs = match.jobs.filter((item) => item.id !== job.id);
    if (job.purpose === "dayAction" && context.round?.proposal) {
      return this.resolveJob(room, job, context, reviewChoice(context, context.round.proposal), now, null, "plan");
    }
    const stale = job.revision !== undefined && job.revision !== decisionRevision(context);
    const actionRetry = (job.purpose !== "speech" || context.tactical) &&
      ["model_truncated", "bad_model_json", "invalid_action", "invalid_tactical_choice"].includes(review?.reason);
    const speechRetry = job.purpose === "speech" && (review?.reason === "first_night_not_completed" ||
      job.plan && ["unverified_public_reference", "inactive_speech_target"].includes(review?.reason));
    const retry = !job.retry && (actionRetry || speechRetry);
    const timeLeft = context.view.phase === "day" && context.view.day > 1 || now + 7800 < context.view.until;
    if ((stale && !job.revised || retry) && timeLeft && this.env.DASHSCOPE_API_KEY && !budgetReason(this.env, match, job)) {
      const { channel, reply, priority, depth, plan, briefed, tacticsApplied, notice, initiated, outreach } = job;
      const next = queueJob(match, job.seat, job.purpose, now + 50, {
        channel, reply, priority, depth, plan, briefed, tacticsApplied, notice, initiated, outreach,
        traceRoot: job.traceRoot ?? job.id,
        revised: Boolean(job.revised || stale), retry: Boolean(job.retry || retry),
      });
      writeDiagnostic(this.ctx, this.env.DIAGNOSTICS, traceFor(room, job), "retry", {
        reason: stale ? "decision_changed" : review.reason, nextJob: next.id,
      });
      return;
    }
    this.resolveJob(room, job, context, stale ? null : review, now, stale ? "decision_changed" : fallbackReason);
  }

  async finishModel(trace, job, context, now) {
    const report = (event, details) => writeDiagnostic(this.ctx, this.env.DIAGNOSTICS, trace, event, details);
    let response;
    let error = "";
    let reason;
    let providerStatus;
    try { response = await callModel(this.env, context, report); } catch (failure) {
      error = /^百炼返回 HTTP [0-9]{3}$/.test(failure.message) ? failure.message : "百炼请求超时或暂不可用";
      reason = failure.code === "input_scope_violation" || failure.code === "provider_http" ? failure.code :
        ["TimeoutError", "AbortError"].includes(failure.name) ? "provider_timeout" : "provider_failure";
      providerStatus = Number.isInteger(failure.status) ? failure.status : undefined;
    }
    const time = Date.now();
    const room = this.refresh(this.load(), time);
    report("model_response", {
      outcome: response ? "received" : "failed", reason,
      elapsedMs: time - now, providerStatus, providerRequest: response?.providerRequest,
      inputTokens: response?.input, outputTokens: response?.output, finishReason: response?.finishReason,
    });
    if (room?.match?.id !== trace.match) return report("result_discarded", { reason: "match_closed" });
    const match = room.match;
    const usage = match.usage;
    if (reason === "input_scope_violation") usage.calls--;
    usage.elapsed += time - now;
    if (response) {
      usage.input += response.input;
      usage.output += response.output;
      usage.cached += response.cached;
    }
    const liveJob = match.jobs.find((item) => item.id === job.id);
    if (match.game.stage !== trace.stage || !liveJob) {
      report("result_discarded", { reason: "stage_changed_or_job_expired" });
      return this.commit(room, null, false);
    }
    liveJob.error = error;
    const current = this.context(room, liveJob);
    const review = response?.choice ? reviewChoice(current || context, response.choice) :
      { reason: reason || (response?.finishReason === "length" ? "model_truncated" : "bad_model_json") };
    if (match.pausedAt) {
      liveJob.reviewed = review;
      liveJob.expires = 0;
      liveJob.due = now;
      return this.commit(room, null, false);
    }
    if (current) this.completeJob(room, liveJob, current, review, time);
    else {
      match.jobs = match.jobs.filter((item) => item.id !== liveJob.id);
      report("result_discarded", { reason: "seat_no_longer_eligible" });
    }
    this.step(room, time);
    const type = current?.tactical ? "auditSkill" : liveJob.purpose;
    this.commit(room, this.choiceAudience(room, liveJob.seat, type, trace.stage), type !== "speech");
  }

  alarm() {
    const now = Date.now();
    const room = this.refresh(this.load(), now);
    if (!room) return;
    if (room.phase !== "playing" || room.match.pausedAt) return this.commit(room, null, false);
    const match = room.match;
    const stage = match.game.stage;
    const started = [];
    const audiences = [];
    const ready = [...match.jobs].sort((a, b) => jobPriority(a) - jobPriority(b) || a.due - b.due);
    for (const job of ready) {
      if (match.game.stage !== stage) break;
      if (jobTime(match, job) > now) continue;
      const context = this.context(room, job);
      if (!context) {
        match.jobs = match.jobs.filter((item) => item.id !== job.id);
        continue;
      }
      job.tactical = context.tactical;
      job.stranger = outsideTeamDm(context.view, job.channel);
      if (job.purpose === "dayAction" && !job.expires && !job.reviewed && match.jobs.some((other) =>
        other.seat === job.seat && other.purpose === "speech" && other.reply && other.priority <= 2 &&
        !other.briefed && auditConversation(context.view, other.channel))) {
        job.deferUntil ??= now + 8000;
        if (now < job.deferUntil) {
          job.due = Math.min(job.deferUntil, now + 450);
          continue;
        }
      }
      const reviewed = job.reviewed ?? (Object.hasOwn(job, "result") ? reviewChoice(context, job.result) : null);
      const fallbackReason = job.expires ? "watchdog_timeout" : !this.env.DASHSCOPE_API_KEY ? "model_disabled" :
        budgetReason(this.env, match, job);
      if (reviewed || fallbackReason || job.purpose === "dayAction" && context.round?.proposal) {
        this.completeJob(room, job, context, reviewed, now, fallbackReason);
        this.step(room, now);
        const type = context.tactical ? "auditSkill" : job.purpose;
        if (type !== "speech") audiences.push(this.choiceAudience(room, job.seat, type, stage));
      } else {
        job.due = 0;
        job.expires = now + 7600;
        if (context.round) job.revision = decisionRevision(context);
        match.usage.calls++;
        started.push({ job, context, trace: traceFor(room, job) });
      }
    }
    const everyone = audiences.includes(null);
    this.commit(room, everyone ? null : (person) => audiences.some((filter) => filter(person)), audiences.length > 0);
    for (const { job, context, trace } of started) this.ctx.waitUntil(this.finishModel(trace, job, context, now));
  }
}
