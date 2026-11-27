import { auditTargetAllowed, dayActions, factions, goal, nightActions, playerAlias, roles, timing } from "../../games/renmin/online/catalog.js";

export const live = (player) => player?.status === "active";
export const find = (game, id) => Number.isInteger(id) ? game.players[id - 1] : undefined;
export const faction = (player) => roles[player?.role]?.faction;
export const inOffice = (game, player) => live(player) && faction(player) === "audit" && player.suspendedThrough < game.day;
export const decisionMaker = (game) => ["director", "investigator", "secretary"]
  .map((role) => game.players.find((player) => player.role === role))
  .find((player) => inOffice(game, player));
const audit = (game) => game.players.filter((player) => live(player) && faction(player) === "audit");
const corrupt = (game) => game.players.filter((player) => live(player) && faction(player) === "corrupt");
const seat = (game, id) => id + " 号" + (find(game, id).revealed ? " " + roles[find(game, id).role].character : "");

function allegiance(game, player) {
  const side = faction(player);
  if (side !== "middle") return side;
  if (player.turned) return "corrupt";
  const helped = player.helpedAudit ?? (game.winner ||
    (game.umbrella?.owner === player.id && game.umbrella.kind === "immunity") ||
    game.inbox[player.id].some((entry) => entry.text === "证据已移交给纪检方。"));
  return helped ? "audit" : "neutral";
}

function pick(game, pool) {
  if (!pool.length) return null;
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  return pool[Math.floor(game.seed / 4294967296 * pool.length)];
}

function event(game, list, kind, text, data = {}) {
  list.push({ id: ++game.eventId, day: game.day, kind, text, ...data });
  if (list.length > 100) list.shift();
}

function announce(game, kind, text, data) {
  event(game, game.public, kind, text, data);
}

function note(game, id, kind, text, data) {
  event(game, game.inbox[id], kind, text, data);
}

function evidence(game, target, holder, source) {
  const card = { id: ++game.cardId, target, holder, source, day: game.day };
  game.evidence.push(card);
  return card;
}

function recordAudit(game, entry) {
  const history = (game.auditHistory ??= []);
  history.push({ day: game.day, ...entry });
  if (history.length > 40) history.shift();
}

function phase(game, next, now, duration = 0) {
  game.phase = next;
  game.stage++;
  game.opened = now;
  game.until = duration ? now + duration : 0;
  if (next === "day") game.extendedBy = [];
}

export function createMatch(names, seed, now, requestedRoles = []) {
  const reserved = new Set();
  const selections = names.map((_, index) => {
    const role = requestedRoles[index];
    if (typeof role !== "string" || !Object.hasOwn(roles, role) || reserved.has(role)) return null;
    reserved.add(role);
    return role;
  });
  const deck = Object.keys(roles).filter((role) => !reserved.has(role));
  const game = {
    seed: seed >>> 0, stage: 0, day: 1, players: [], eventId: 0, cardId: 0,
    evidence: [], public: [], inbox: Object.fromEntries(names.map((_, i) => [i + 1, []])),
    pendingDepartures: [], auditChoices: {}, auditHistory: [], preludeChoices: {}, nightChoices: {},
    follow: null, listen: null, umbrella: null, detention: null, winner: null,
    attempts: [], escaped: 0, rebatePending: false, raidUntil: 0, directedDay: 0,
    dawnDay: 0, blockadeDay: 0, blockade: null, survey: null,
  };
  game.players = names.map((name, i) => {
    const role = selections[i] ?? pick(game, deck);
    if (!selections[i]) deck.splice(deck.indexOf(role), 1);
    return {
      id: i + 1, name, role, status: "active", money: roles[role].cash ?? null,
      illegal: roles[role].faction === "corrupt", turned: false, used: false, revealed: false,
      suspendedThrough: 0, favorNight: 0, helpedAudit: false,
    };
  });
  const executive = game.players.find((player) => player.role === "executive");
  const marked = pick(game, corrupt(game));
  evidence(game, marked.id, executive.id, "告密者");
  note(game, executive.id, "evidence", "你掌握了一张针对" + seat(game, marked.id) + "的【证据】。");
  note(game, marked.id, "warning", seat(game, executive.id) + "是国企总裁，开局持有针对你的【证据】。");
  phase(game, "day", now, timing.opening);
  announce(game, "system", "角色牌已发放。第一天白天讨论两分钟。");
  return game;
}

function mark(game, player, cause = "action") {
  player.illegal = true;
  if (faction(player) === "audit") {
    player.suspendedThrough = game.day + 1;
    note(game, player.id, "warning", "你将停职至第 " + player.suspendedThrough + " 晚结束。");
  } else if (faction(player) === "middle" && cause === "frame") {
    note(game, player.id, "warning", "你被栽赃并获得【违法】。本局胜负归属由你自己的行动决定。");
  } else if (faction(player) === "middle" && !player.turned) {
    player.turned = true;
    note(game, player.id, "warning", "你获得【违法】，本局胜负永久随腐败方结算。");
  }
}

function supportAudit(game, player) {
  if (player.turned || player.helpedAudit) return;
  player.helpedAudit = true;
  note(game, player.id, "skill", "你已站在纪检方，个人胜负随纪检结算。");
}

function departure(game, player, status, text, now) {
  player.status = status;
  player.departedAt = now;
  game.evidence = game.evidence.filter((card) => card.holder !== player.id);
  if (game.umbrella?.owner === player.id && game.umbrella.kind === "custody") game.umbrella = null;
  if (game.phase === "prelude" || game.phase === "night") {
    game.pendingDepartures.push({ target: player.id, kind: status, text });
    note(game, player.id, status, text);
  } else {
    announce(game, status, text, { target: player.id });
  }
}

function publishDepartures(game) {
  for (const { target, kind, text } of game.pendingDepartures) announce(game, kind, text, { target });
  game.pendingDepartures = [];
}

function checkWin(game, now) {
  let winner;
  if (game.escaped >= goal) winner = { side: "corrupt", reason: "累计出逃资产达到 " + goal.toLocaleString("en-US") + " 万。" };
  else if (game.players.filter((player) => faction(player) === "audit").every((player) => player.status === "dead")) {
    winner = { side: "corrupt", reason: "纪检方全员身亡。" };
  } else if (!game.players.some((player) => live(player) && faction(player) !== "audit" && player.illegal)) {
    winner = { side: "audit", reason: "场上已无待拘捕对象。" };
  }
  if (!winner) return false;
  publishDepartures(game);
  game.detention = null;
  for (const player of game.players) {
    if (faction(player) === "middle" && player.helpedAudit === undefined) {
      player.helpedAudit = allegiance(game, player) === "audit";
    }
  }
  game.winner = winner;
  phase(game, "ended", now);
  announce(game, "win", factions[winner.side] + "胜利。" + winner.reason);
  return true;
}

function behavior(game, actor, action, targets, result) {
  game.attempts.push({ actor: actor.id, day: game.day });
  const listener = game.listen;
  if (listener?.watched !== actor.id || !live(find(game, listener.holder))) return;
  const description = seat(game, actor.id) + "发动「" + action + "」" +
    (targets.length ? "，对象为" + targets.map((id) => seat(game, id)).join("、") : "") + "。" + result + "。";
  note(game, listener.holder, "hacker", description);
  for (const target of new Set([actor.id, ...targets])) {
    if (listener.records.includes(target)) continue;
    listener.records.push(target);
    evidence(game, target, listener.holder, "黑客");
  }
}

function lockAudit(game) {
  const secretary = game.players.find((player) => player.role === "secretary");
  if (inOffice(game, secretary) && !secretary.used && game.auditChoices[secretary.id]?.kind === "dawn") {
    secretary.used = true;
    game.dawnDay = game.day + 1;
    recordAudit(game, { type: "auditSkill", actor: secretary.id, kind: "dawn", status: "executed", effectiveDay: game.dawnDay });
    note(game, secretary.id, "skill", "「破晓」已发动，将在次日白天的拘捕中生效。");
  }
}

function beginNight(game, now) {
  phase(game, "prelude", now, timing.prelude);
  game.attempts = game.attempts.filter((entry) => entry.day >= game.day - 1);
  game.preludeChoices = {};
  game.nightChoices = {};
  for (const player of corrupt(game)) {
    const extra = player.role === "chair" && game.rebatePending ? 100 : 0;
    player.money += 100 + extra;
    note(game, player.id, "money", "入夜收入 +100 万。" + (extra ? "上一晚回扣 +100 万。" : ""));
  }
  game.rebatePending = false;
  const director = game.players.find((player) => player.role === "director");
  const subject = find(game, game.auditChoices[director.id]?.target);
  if (inOffice(game, director) && !director.used && game.auditChoices[director.id]?.kind === "raid" &&
      auditTargetAllowed("raid", subject)) {
    director.used = true;
    if (!subject.illegal) {
      game.raidUntil = game.day + 2;
      for (const player of audit(game)) note(game, player.id, "warning", "突袭误抓。此后两个白天，纪检只可用情报。");
    }
    recordAudit(game, { type: "auditSkill", actor: director.id, kind: "raid", target: subject.id, status: "executed" });
    departure(game, subject, "arrested", seat(game, subject.id) + "在夜间被拘捕。", now);
    if (checkWin(game, now)) return;
  }
  const investigator = game.players.find((player) => player.role === "investigator");
  const watched = find(game, game.auditChoices[investigator.id]?.target);
  if (inOffice(game, investigator) && !investigator.used && game.auditChoices[investigator.id]?.kind === "listen" && live(watched)) {
    investigator.used = true;
    game.listen = { holder: investigator.id, watched: watched.id, records: [] };
    recordAudit(game, { type: "auditSkill", actor: investigator.id, kind: "listen", target: watched.id, status: "executed" });
    note(game, investigator.id, "skill", "本夜监听对象为" + seat(game, watched.id) + "。");
  }
  game.auditChoices = {};
}

function custodyBlocked(game, action) {
  if (action === "arrest" && game.dawnDay === game.day) return false;
  return game.directedDay === game.day ||
    action !== "intel" && (game.raidUntil >= game.day || game.blockadeDay === game.day);
}

function dayAction(game, choice, now) {
  lockAudit(game);
  const target = find(game, choice.target);
  const member = find(game, choice.member);
  const action = choice.kind;
  const dawn = game.dawnDay === game.day;
  const proof = game.evidence.filter((card) => card.target === target.id && card.holder === member?.id).length;
  const canArrest = inOffice(game, member) && proof >= (target.role === "political" ? 2 : 1) &&
    (dawn || game.umbrella?.target !== target.id || game.umbrella.kind !== "custody");
  const canFollow = live(member) && faction(member) === "audit";
  const failed = custodyBlocked(game, action) || !live(target) ||
    action === "arrest" && !canArrest || action === "follow" && !canFollow;
  recordAudit(game, { type: "dayAction", actor: decisionMaker(game)?.id, kind: action,
    target: target.id, member: member?.id, status: failed ? "blocked" : action === "arrest" && !dawn ? "pending" : "executed",
    ...(action === "arrest" && dawn && !failed ? { dawn: true } : {}) });

  if (failed) {
    for (const player of audit(game)) {
      const text = action === "arrest" ? "本次拘捕未能执行。" : "本次" + dayActions[action].label + "未能执行。";
      note(game, player.id, "failed", text, { action, target: target.id });
    }
  } else if (action === "intel") {
    announce(game, "intel", "纪检方查询了" + seat(game, target.id) + "昨晚的行为。", { target: target.id });
    const found = game.attempts.some((entry) => entry.day === game.day - 1 && entry.actor === target.id);
    for (const player of audit(game)) note(game, player.id, "intel", seat(game, target.id) + "昨晚" +
      (found ? "有" : "无") + "违法行为。", { target: target.id, found });
  } else if (action === "follow") {
    game.follow = { target: target.id, holder: member.id, night: game.day };
    announce(game, "follow", "纪检方开始跟踪" + seat(game, target.id) + "并封锁其出逃口岸。", { target: target.id });
  } else {
    announce(game, "detention", seat(game, target.id) + "涉嫌严重违纪违法，已被带走接受调查。", { target: target.id });
    if (dawn) {
      departure(game, target, "arrested", seat(game, target.id) + "已被正式拘捕。", now);
      if (checkWin(game, now)) return;
    } else {
      const police = game.players.find((player) => player.role === "police" && live(player) && !player.used);
      game.detention = { target: target.id, rescuer: police?.id ?? null, answer: null };
      phase(game, "detention", now, timing.rescue);
      return;
    }
  }
  beginNight(game, now);
}

function resolveDetention(game, now) {
  const { target, rescuer, answer } = game.detention;
  game.detention = null;
  const submission = game.auditHistory?.findLast((row) => row.type === "dayAction" && row.day === game.day &&
    row.target === target && row.status === "pending");
  const subject = find(game, target);
  if (!auditTargetAllowed("arrest", subject)) {
    if (submission) submission.status = "blocked";
    beginNight(game, now);
    return;
  }
  if (submission) submission.status = answer ? "rescued" : "executed";
  if (answer) {
    const actor = find(game, rescuer);
    actor.used = true;
    actor.revealed = true;
    mark(game, actor);
    announce(game, "rescue", seat(game, actor.id) + "亮明公安厅长身份，发动「营救」。" + seat(game, target) + "回场。",
      { target, actor: actor.id });
  } else {
    departure(game, subject, "arrested", seat(game, target) + "已被正式拘捕。", now);
    if (checkWin(game, now)) return;
  }
  beginNight(game, now);
}

function heldForTransfer(game, player) {
  const source = player.role === "worker" ? "群众调查" : "告密者";
  return game.evidence.find((card) => card.holder === player.id && card.source === source);
}

export function preludeOptions(game, player) {
  if (!live(player) || game.phase !== "prelude" || Object.hasOwn(game.preludeChoices, player.id)) return [];
  if (player.role === "worker" && heldForTransfer(game, player)) return ["transfer", "hold"];
  if (player.used) return [];
  switch (player.role) {
    case "political": return ["order", "hold"];
    case "chair": return ["favor", "hold"];
    case "judge": return ["umbrella", "hold"];
    case "worker": return ["survey", "blockade", "hold"];
    case "executive": return game.day >= 2 && heldForTransfer(game, player) ? ["transfer", "destroy", "hold"] : [];
    default: return [];
  }
}

function transfer(game, actor, card) {
  const receiver = pick(game, audit(game));
  if (!card || !receiver) return false;
  card.holder = receiver.id;
  if (actor.role === "executive") actor.used = true;
  note(game, actor.id, "skill", "证据已移交给纪检方。");
  supportAudit(game, actor);
  note(game, receiver.id, "evidence", "系统向你移交了一张针对" + seat(game, card.target) + "的【证据】。");
  return true;
}

function resolvePrelude(game, now) {
  const order = ["umbrella", "favor", "transfer", "destroy", "survey", "order", "blockade"];
  const actors = game.players.filter((player) => live(player) && order.includes(game.preludeChoices[player.id]?.kind));
  actors.sort((a, b) => order.indexOf(game.preludeChoices[a.id].kind) - order.indexOf(game.preludeChoices[b.id].kind));
  for (const actor of actors) {
    const choice = game.preludeChoices[actor.id];
    const { kind } = choice;
    if (kind === "umbrella") {
      const target = find(game, choice.target);
      if (!live(target)) continue;
      const side = faction(target);
      game.umbrella = { owner: actor.id, target: target.id, kind: side === "audit" ? "immunity" : side === "corrupt" ? "custody" : "empty",
        spent: false };
      actor.used = true;
      note(game, actor.id, "skill", "你已将保护伞安置给" + seat(game, target.id) + "。");
      if (side === "audit") supportAudit(game, actor);
      if (side === "corrupt") {
        mark(game, actor);
        behavior(game, actor, "安置保护伞", [target.id], "保护伞已生效");
      }
    } else if (kind === "favor") {
      actor.used = true;
      actor.favorNight = game.day;
      note(game, actor.id, "skill", "「人脉」已发动，本夜常规行动免费。");
    } else if (kind === "transfer") {
      transfer(game, actor, heldForTransfer(game, actor));
    } else if (kind === "destroy") {
      const card = heldForTransfer(game, actor);
      if (!card) continue;
      actor.used = true;
      game.evidence = game.evidence.filter((item) => item !== card);
      mark(game, actor);
      behavior(game, actor, "销毁证据", [], "证据已销毁");
    } else if (kind === "survey") {
      const target = pick(game, corrupt(game));
      if (!target) continue;
      actor.used = true;
      const card = evidence(game, target.id, actor.id, "群众调查");
      game.survey = choice.deliver ? { actor: actor.id, card: card.id } : null;
      note(game, actor.id, "evidence", "群众调查取得了针对" + seat(game, target.id) + "的【证据】。");
      note(game, target.id, "warning", "有人掌握了针对你的一张证据。");
    } else if (kind === "order") {
      actor.used = true;
      game.directedDay = game.day + 1;
      behavior(game, actor, "指示", [], "纪检次日行动受到限制");
      note(game, actor.id, "skill", "「指示」将在次日生效。");
    } else {
      actor.used = true;
      game.blockade = actor.id;
      note(game, actor.id, "skill", "群众围堵将在次日白天优先结算。");
    }
  }
  game.preludeChoices = {};
  phase(game, "night", now, timing.night);
}

function cover(game, target) {
  const protection = game.umbrella;
  if (!protection || protection.target !== target.id || protection.kind !== "immunity" || protection.spent) return false;
  protection.spent = true;
  note(game, target.id, "skill", "【保护伞】抵挡了针对你的一次夜间行动。");
  return true;
}

export function costOf(game, player, kind) {
  return player.favorNight === game.day ? 0 : nightActions[kind].cost;
}

function escapeEstimate(game, player) {
  if (faction(player) !== "corrupt" || !live(player)) return null;
  const beforeNight = game.phase === "day" || game.phase === "detention";
  const income = beforeNight ? 100 + (player.role === "chair" && game.rebatePending ? 100 : 0) : 0;
  const fee = costOf(game, player, "escape");
  const balance = player.money + income;
  return { income, fee, portable: balance >= fee ? balance - fee : null, goal };
}

function pay(game, player, kind) {
  const cost = costOf(game, player, kind);
  if (player.money < cost) return false;
  player.money -= cost;
  if (cost) {
    note(game, player.id, "money", "「" + nightActions[kind].label + "」扣除 " + cost + " 万。");
    if (kind !== "escape") game.rebatePending = true;
  }
  return true;
}

function finishNight(game, now) {
  const follow = game.follow;
  if (follow?.night === game.day && live(find(game, follow.holder))) {
    const target = find(game, follow.target);
    const hit = live(target) && target.illegal;
    if (hit) evidence(game, target.id, follow.holder, "跟踪");
    note(game, follow.holder, hit ? "evidence" : "follow", hit ? "夜末取证成功。你取得针对" + seat(game, target.id) + "的【证据】。" :
      "本夜跟踪" + seat(game, target.id) + "未取得证据。", { target: target.id, found: hit });
  }
  if (game.listen && !game.listen.records.length && live(find(game, game.listen.holder))) {
    note(game, game.listen.holder, "hacker", "本夜未记录到监听对象的违法行为。");
  }
  if (game.survey && live(find(game, game.survey.actor))) {
    transfer(game, find(game, game.survey.actor), game.evidence.find((card) => card.id === game.survey.card));
  }
  game.survey = null;
  game.follow = null;
  game.listen = null;
  game.nightChoices = {};
  for (const player of audit(game)) {
    if (player.suspendedThrough && player.suspendedThrough <= game.day) {
      player.suspendedThrough = 0;
      player.illegal = false;
      note(game, player.id, "system", "停职期满，你已复职。");
    }
  }
  game.day++;
  phase(game, "day", now, timing.discussion);
  publishDepartures(game);
  announce(game, "system", "第 " + game.day + " 天，天亮了。");
  if (game.blockade) {
    const actor = find(game, game.blockade);
    game.blockade = null;
    game.blockadeDay = game.day;
    mark(game, actor);
    announce(game, "blockade", "发生群众围堵。今天的拘捕和跟踪受到限制。");
  }
}

function resolveNight(game, now) {
  for (const kind of ["frame", "remove"]) {
    const victims = new Set();
    for (const actor of corrupt(game)) {
      const choice = game.nightChoices[actor.id];
      if (choice?.kind !== kind) continue;
      const target = find(game, choice.target);
      if (!live(target) || target.id === actor.id || !pay(game, actor, kind)) {
        note(game, actor.id, "warning", "本夜的" + nightActions[kind].label + "未能执行。");
        continue;
      }
      const blocked = cover(game, target);
      behavior(game, actor, nightActions[kind].label, [target.id], blocked ? "被保护伞挡下" : "行动生效");
      if (kind === "remove" || !blocked) mark(game, actor);
      if (!blocked && kind === "frame") mark(game, target, "frame");
      if (!blocked && kind === "remove") victims.add(target);
      note(game, actor.id, blocked ? "warning" : "skill", "对" + seat(game, target.id) + "的行动" +
        (blocked ? "被保护伞挡下。" : "已结算。"));
    }
    for (const victim of victims) departure(game, victim, "dead", seat(game, victim.id) + "在天亮前因车祸身亡。", now);
    if (victims.size && checkWin(game, now)) return;
  }

  for (const actor of corrupt(game)) {
    if (game.nightChoices[actor.id]?.kind !== "escape") continue;
    if (!pay(game, actor, "escape")) {
      note(game, actor.id, "warning", "余额不足，本次出逃未能执行。");
      continue;
    }
    const blocked = game.follow?.target === actor.id && actor.role !== "police";
    behavior(game, actor, "出逃", [], blocked ? "口岸封锁，出逃失败" : "出逃成功");
    if (blocked) {
      mark(game, actor);
      note(game, actor.id, "warning", "口岸封锁，本次出逃失败。");
    } else {
      game.escaped += actor.money;
      departure(game, actor, "escaped", seat(game, actor.id) + "已成功出逃。", now);
      if (checkWin(game, now)) return;
    }
  }
  finishNight(game, now);
}

export function nextTransition(game) {
  if (game.phase === "day" && game.day > 1 && decisionMaker(game)) return 0;
  return game.until;
}

function mayExtend(game, id) {
  return game.phase === "day" && live(find(game, id)) && !game.extendedBy?.includes(id);
}

export function extendDiscussion(game, id, now) {
  if (!mayExtend(game, id) || now >= game.until) return false;
  (game.extendedBy ??= []).push(id);
  game.until += timing.extension;
  return true;
}

export function advance(game, now) {
  if (game.phase === "day" && now >= game.until && (game.day === 1 || !decisionMaker(game))) {
    lockAudit(game);
    beginNight(game, now);
  } else if (game.phase === "detention" && now >= game.until) resolveDetention(game, now);
  else if (game.phase === "prelude" && now >= game.until) resolvePrelude(game, now);
  else if (game.phase === "night" && (now >= game.until || corrupt(game).every((player) => Object.hasOwn(game.nightChoices, player.id)))) {
    resolveNight(game, now);
  } else return false;
  return true;
}

export function applyChoice(game, id, action, now) {
  const player = find(game, id);
  const target = find(game, action.target);
  if (!live(player)) return false;
  switch (action.type) {
    case "auditSkill": {
      if (game.phase !== "day" || (game.day === 1 && now >= game.until) || !inOffice(game, player) || player.used) return false;
      const role = roles[player.role];
      if (action.kind !== "hold" &&
          (action.kind !== role.key || role.target && !auditTargetAllowed(action.kind, target))) return false;
      game.auditChoices[id] = { kind: action.kind, target: target?.id };
      return true;
    }
    case "dayAction": {
      if (game.phase !== "day" || game.day < 2 || now < game.until || decisionMaker(game)?.id !== id ||
          !Object.hasOwn(dayActions, action.kind) || !auditTargetAllowed(action.kind, target) ||
          action.kind !== "intel" && !find(game, action.member)) return false;
      dayAction(game, action, now);
      return true;
    }
    case "rescue": {
      if (game.phase !== "detention" || now >= game.until || game.detention.rescuer !== id ||
          game.detention.answer !== null || typeof action.use !== "boolean") return false;
      game.detention.answer = action.use;
      return true;
    }
    case "prelude": {
      if (now >= game.until || !preludeOptions(game, player).includes(action.kind) ||
          action.kind === "umbrella" && !target) return false;
      game.preludeChoices[id] = { kind: action.kind, target: target?.id, deliver: action.deliver === true };
      return true;
    }
    case "night": {
      if (game.phase !== "night" || now >= game.until || faction(player) !== "corrupt" ||
          Object.hasOwn(game.nightChoices, id) || !Object.hasOwn(nightActions, action.kind) ||
          nightActions[action.kind].target && (!target || target.id === id) || player.money < costOf(game, player, action.kind)) return false;
      game.nightChoices[id] = { kind: action.kind, target: target?.id };
      return true;
    }
    default: return false;
  }
}

export function channelFor(game, id, channel) {
  const player = find(game, id);
  if (!player) return false;
  if (channel === "public") return true;
  if (!live(player) || game.winner) return false;
  if (channel === "audit" || channel === "corrupt") return faction(player) === channel;
  const pair = /^dm:([1-9]):([1-9])$/.exec(channel);
  return Boolean(pair && Number(pair[1]) < Number(pair[2]) && pair.slice(1).map(Number).includes(id));
}

export function chatExportScope(game, id) {
  const viewer = find(game, id);
  if (!viewer || !game.winner) return null;
  const side = faction(viewer);
  const privateUntil = live(viewer) ? Number.MAX_SAFE_INTEGER : viewer.departedAt ?? 0;
  return { team: side === "middle" ? "" : side, privateUntil };
}

export function viewFor(game, id) {
  const viewer = find(game, id);
  const side = faction(viewer);
  const ownAllegiance = allegiance(game, viewer);
  const concealed = new Set(game.pendingDepartures.map((event) => event.target));
  const ended = game.phase === "ended";
  const seats = game.players.map((player) => {
    const own = player.id === id;
    const known = own || player.revealed || ended || live(viewer) && side !== "middle" && faction(player) === side;
    const exposed = concealed.has(player.id) && !own ? "active" : player.status;
    return {
      id: player.id, name: known ? roles[player.role].character : playerAlias(player.id), status: exposed,
      ...(known ? { role: player.role } : {}),
      ...(player.revealed ? { revealed: true } : {}),
      ...(known && side === "audit" && faction(player) === "audit" ? { onDuty: exposed === "active" && player.suspendedThrough < game.day } : {}),
    };
  });
  const auditView = side === "audit" && live(viewer);
  const auditChoice = game.auditChoices[id];
  const ownNight = game.nightChoices[id];
  const ownPrelude = game.preludeChoices[id];
  return {
    stage: game.stage, day: game.day, phase: game.phase, opened: game.opened, until: game.until, seats,
    canExtend: mayExtend(game, id),
    self: {
      id, role: viewer.role, alive: live(viewer), used: viewer.used, money: viewer.money,
      illegal: viewer.illegal, turned: viewer.turned, allegiance: ownAllegiance,
      ...(game.winner ? { won: ownAllegiance === game.winner.side } : {}),
      suspended: auditView && !inOffice(game, viewer), suspendedThrough: viewer.suspendedThrough,
    },
    chief: auditView && game.phase === "day" ? decisionMaker(game)?.id ?? null : null,
    cards: game.evidence.filter((card) => card.holder === id).map(({ target, source, day }) => ({ target, source, day })),
    public: game.public.map(({ id, ...entry }) => entry),
    inbox: game.inbox[id].map(({ id, ...entry }) => entry),
    auditSkill: auditView && inOffice(game, viewer) && !viewer.used && game.phase === "day" ? roles[viewer.role].key : null,
    auditChoice: auditView && game.phase === "day" ? auditChoice ?? null : null,
    auditHistory: auditView ? (game.auditHistory || []).filter((entry) => entry.kind !== "listen" || entry.actor === id).slice(-12) : [],
    teamSkills: auditView && game.phase === "day" ? seats.filter((player) => faction(player) === "audit")
      .map((player) => ({
        id: player.id, role: player.role,
        choice: find(game, player.id).used ? "spent" : game.auditChoices[player.id]?.kind ?? null,
      })) : [],
    prelude: preludeOptions(game, viewer),
    preludeChoice: ownPrelude ?? null,
    night: game.phase === "night" && live(viewer) && side === "corrupt" && !ownNight ?
      Object.keys(nightActions).filter((kind) => viewer.money >= costOf(game, viewer, kind)) : [],
    nightChoice: ownNight ?? null,
    freeAction: side === "corrupt" && viewer.favorNight === game.day,
    escapeEstimate: escapeEstimate(game, viewer),
    followed: game.follow?.target ?? null,
    winner: game.winner,
    detention: game.detention ? {
      target: game.detention.target, canRescue: game.detention.rescuer === id,
      answered: game.detention.rescuer === id && game.detention.answer !== null,
    } : null,
  };
}
