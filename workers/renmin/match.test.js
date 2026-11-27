import assert from "node:assert/strict";
import { test } from "node:test";
import { botNames, goal, timing } from "../../games/renmin/online/catalog.js";
import { advance, applyChoice, channelFor, createMatch, decisionMaker, extendDiscussion, faction, viewFor } from "./match.js";
import { fallback, playable } from "./agents.js";

const role = (game, key) => game.players.find((player) => player.role === key);
const make = () => createMatch(botNames, 48096, 0);
const due = (game) => game.until;
const addCard = (game, target, holder, source = "跟踪") => game.evidence.push({
  id: ++game.cardId, target: target.id, holder: holder.id, source, day: game.day,
});
const submit = (game, actor, choice, now) => assert.equal(applyChoice(game, actor.id, choice, now), true);
const dawn = (game, day = 2) => {
  game.day = day;
  game.opened = 1000;
  game.until = 1000 + timing.discussion;
};

function openRegular(game) {
  assert.equal(advance(game, due(game)), true);
  if (game.phase === "prelude") {
    assert.equal(advance(game, due(game)), true);
  }
}

function finishRegular(game, choices = {}) {
  const now = due(game) - timing.night + 10;
  for (const player of game.players.filter((seat) => seat.status === "active" && faction(seat) === "corrupt")) {
    submit(game, player, { type: "night", kind: "hold", ...choices[player.role] }, now);
  }
  assert.equal(advance(game, now), true);
}

test("day one is exactly two minutes and only locks personal skills", () => {
  const game = make();
  submit(game, role(game, "secretary"), { type: "auditSkill", kind: "dawn" }, 100);
  assert.equal(applyChoice(game, role(game, "director").id, { type: "dayAction", kind: "intel", target: 1 }, 100), false);
  assert.equal(advance(game, timing.opening - 1), false);
  assert.equal(advance(game, timing.opening), true);
  assert.equal(game.until, timing.opening + timing.prelude);
  assert.equal(game.dawnDay, 2);
  assert.equal(role(game, "chair").money, 600);
});

test("later days unlock after five minutes and stay open until the acting chief submits", () => {
  const game = make();
  dawn(game);
  const director = role(game, "director");
  const investigator = role(game, "investigator");
  const choice = { type: "dayAction", kind: "intel", target: 1 };
  assert.equal(applyChoice(game, director.id, choice, due(game) - 1), false);
  assert.equal(advance(game, due(game) + 35_000_000), false);
  director.suspendedThrough = game.day;
  assert.equal(decisionMaker(game).id, investigator.id);
  assert.equal(applyChoice(game, director.id, choice, due(game)), false);
  submit(game, investigator, choice, due(game));
  assert.equal(game.phase, "prelude");
  assert.equal(game.inbox[director.id].at(-1).kind, "intel");
});

test("a day with nobody eligible proceeds automatically", () => {
  const game = make();
  dawn(game);
  for (const player of game.players.filter((seat) => faction(seat) === "audit")) player.suspendedThrough = game.day;
  assert.equal(advance(game, due(game) - 1), false);
  assert.equal(advance(game, due(game)), true);
  assert.equal(game.phase, "prelude");
});

test("failed custody spends the action and keeps the reason private", () => {
  const game = make();
  dawn(game);
  const director = role(game, "director");
  const target = role(game, "chair");
  submit(game, director, { type: "dayAction", kind: "arrest", target: target.id, member: director.id }, due(game));
  assert.equal(game.phase, "prelude");
  assert.equal(target.status, "active");
  assert.equal(game.inbox[director.id].at(-1).text, "本次拘捕未能执行。");
  assert(!game.public.some((line) => line.kind === "detention"));
});

test("high office requires two cards on the assigned seat, including under Dawn", () => {
  for (const split of [true, false]) {
    const game = make();
    dawn(game);
    const director = role(game, "director");
    const investigator = role(game, "investigator");
    const target = role(game, "political");
    addCard(game, target, director);
    addCard(game, target, split ? investigator : director);
    game.dawnDay = game.directedDay = game.blockadeDay = game.raidUntil = game.day;
    game.umbrella = { owner: role(game, "judge").id, target: target.id, kind: "custody" };
    submit(game, director, { type: "dayAction", kind: "arrest", target: target.id, member: director.id }, due(game));
    assert.equal(target.status, split ? "active" : "arrested");
    assert.equal(game.phase, "prelude");
    assert.equal(game.detention, null);
  }
});

test("either qualified officer may be assigned, and ordinary rescue never shortens the window", () => {
  const game = make();
  dawn(game);
  const director = role(game, "director");
  const investigator = role(game, "investigator");
  const target = role(game, "political");
  for (const holder of [director, investigator, director, investigator]) addCard(game, target, holder);
  const now = due(game);
  submit(game, director, { type: "dayAction", kind: "arrest", target: target.id, member: investigator.id }, now);
  const police = role(game, "police");
  assert.equal(viewFor(game, director.id).detention.canRescue, false);
  submit(game, police, { type: "rescue", use: true }, now + 800);
  assert.equal(advance(game, now + timing.rescue - 1), false);
  assert.equal(advance(game, now + timing.rescue), true);
  assert.equal(target.status, "active");
  assert.equal(police.revealed, true);
  assert.equal(game.evidence.filter((card) => card.target === target.id).length, 4 + Number(game.evidence[0].target === target.id));
});

test("listening covers orders and framing, with one card per implicated seat", () => {
  const game = make();
  const political = role(game, "political");
  const investigator = role(game, "investigator");
  const target = role(game, "secretary");
  submit(game, investigator, { type: "auditSkill", kind: "listen", target: political.id }, 10);
  advance(game, timing.opening);
  political.money = 500;
  submit(game, political, { type: "prelude", kind: "order" }, due(game) - 10);
  advance(game, due(game));
  finishRegular(game, { political: { kind: "frame", target: target.id } });
  assert.deepEqual(game.evidence.filter((card) => card.holder === investigator.id).map((card) => card.target).sort(),
    [political.id, target.id].sort());
  assert.equal(game.inbox[investigator.id].filter((entry) => entry.kind === "hacker").length, 2);
  assert.equal(game.attempts.some((entry) => entry.actor === target.id), false);
});

test("blocked escape still costs money and the commissioner may bypass the same block", () => {
  const game = make();
  advance(game, due(game));
  advance(game, due(game));
  const political = role(game, "political");
  political.money = 490;
  game.follow = { target: political.id, holder: role(game, "director").id, night: game.day };
  finishRegular(game, { political: { kind: "escape" } });
  assert.equal(political.money, 190);
  assert.equal(political.status, "active");
  assert.equal(game.escaped, 0);
  submit(game, role(game, "director"), { type: "dayAction", kind: "follow", target: role(game, "police").id,
    member: role(game, "secretary").id }, due(game));
  advance(game, due(game));
  role(game, "police").money = 480;
  finishRegular(game, { police: { kind: "escape" } });
  assert.equal(role(game, "police").status, "escaped");
  assert.equal(game.escaped, 180);
});

test("survey warns only its subject before action and delivers only if the holder survives", () => {
  for (const kill of [true, false]) {
    const game = make();
    advance(game, due(game));
    const worker = role(game, "worker");
    submit(game, worker, { type: "prelude", kind: "survey", deliver: true }, due(game) - 1);
    advance(game, due(game));
    const card = game.evidence.find((entry) => entry.holder === worker.id);
    assert(card);
    assert.equal(game.inbox[card.target].at(-1).text, "有人掌握了针对你的一张证据。");
    assert(!game.public.some((entry) => entry.text.includes("掌握了针对你")));
    finishRegular(game, kill ? { chair: { kind: "remove", target: worker.id } } : {});
    const moved = game.evidence.find((entry) => entry.id === card.id);
    assert.equal(Boolean(moved), !kill);
    if (moved) assert.equal(faction(game.players[moved.holder - 1]), "audit");
  }
});

test("both eligible evidence transfers settle in one prelude", () => {
  const game = make();
  dawn(game);
  const director = role(game, "director");
  const executive = role(game, "executive");
  const worker = role(game, "worker");
  const target = role(game, "chair");
  worker.used = true;
  addCard(game, target, worker, "群众调查");
  submit(game, director, { type: "dayAction", kind: "intel", target: target.id }, due(game));
  for (const actor of [executive, worker]) submit(game, actor, { type: "prelude", kind: "transfer" }, due(game) - 1);
  advance(game, due(game));
  assert.equal(game.evidence.length, 2);
  assert(game.evidence.every((card) => faction(game.players[card.holder - 1]) === "audit"));
});

test("an eliminated escapee pays nothing and a successful escape can win immediately", () => {
  const game = make();
  advance(game, due(game));
  advance(game, due(game));
  const police = role(game, "police");
  police.money = 900;
  finishRegular(game, { police: { kind: "escape" }, chair: { kind: "remove", target: police.id } });
  assert.equal(police.money, 900);
  assert.equal(police.status, "dead");
  assert.equal(game.escaped, 0);
  const chief = decisionMaker(game);
  submit(game, chief, { type: "dayAction", kind: "intel", target: 1 }, due(game));
  advance(game, due(game));
  const political = role(game, "political");
  political.money = 900;
  game.escaped = 400;
  finishRegular(game, { political: { kind: "escape" } });
  assert.equal(game.winner.side, "corrupt");
  assert.equal(game.escaped, goal);
  assert.equal(game.day, 2);
});

test("mutual removals are simultaneous and only paid work accrues the next night's rebate", () => {
  const game = make();
  advance(game, due(game));
  advance(game, due(game));
  const political = role(game, "political");
  const police = role(game, "police");
  political.money = police.money = 550;
  finishRegular(game, { political: { kind: "remove", target: police.id }, police: { kind: "remove", target: political.id } });
  assert.equal(political.status, "dead");
  assert.equal(police.status, "dead");
  assert.equal(game.rebatePending, true);
  const director = role(game, "director");
  const chair = role(game, "chair");
  const funds = chair.money;
  submit(game, director, { type: "dayAction", kind: "intel", target: chair.id }, due(game));
  assert.equal(chair.money, funds + 200);
  assert.equal(game.rebatePending, false);
});

test("the DTO and channel readers keep opponents, private hands and DMs separate", () => {
  const game = make();
  const director = role(game, "director");
  const investigator = role(game, "investigator");
  const political = role(game, "political");
  const worker = role(game, "worker");
  addCard(game, political, investigator);
  const view = viewFor(game, director.id);
  assert.equal(view.seats[investigator.id - 1].role, "investigator");
  assert(!Object.hasOwn(view.seats[political.id - 1], "role"));
  assert(!view.cards.length);
  assert(!Object.hasOwn(view, "evidence"));
  assert.equal(channelFor(game, director.id, "corrupt"), false);
  assert.equal(channelFor(game, worker.id, "audit"), false);
  const pair = [director.id, political.id].sort((a, b) => a - b);
  const dm = "dm:" + pair.join(":");
  assert(channelFor(game, director.id, dm));
  assert(channelFor(game, political.id, dm));
  assert.equal(channelFor(game, investigator.id, dm), false);
  assert.equal(channelFor(game, worker.id, "public"), true);
  worker.turned = true;
  game.phase = "ended";
  const revealed = viewFor(game, director.id).seats[worker.id - 1];
  assert.equal(revealed.role, "worker");
  assert(!Object.hasOwn(revealed, "turned"));
  assert.equal(viewFor(game, worker.id).self.turned, true);
});

test("an AI chief can use an ally's stated lead but never receives the ally's hidden cards", () => {
  const game = make();
  dawn(game);
  const chief = role(game, "director");
  const detective = role(game, "investigator");
  const target = role(game, "political");
  const view = viewFor(game, chief.id);
  const base = { view, purpose: "dayAction" };
  assert.equal(fallback({ ...base, threads: {} }).kind, "follow");
  assert.deepEqual(fallback({ ...base, threads: {
    audit: [{ actor: detective.id, text: "我有两张针对" + target.id + "号的证据。" }],
  } }), { kind: "arrest", target: target.id, member: detective.id });
  assert.equal(playable(base, { kind: "arrest", target: target.id }), null);
  assert.equal(playable(base, { kind: "arrest", target: target.id, member: detective.id }).type, "dayAction");
});

test("neutral middle seats lose even when either original faction wins", () => {
  for (const winner of ["audit", "corrupt"]) {
    const game = make();
    const chair = role(game, "chair");
    const worker = role(game, "worker");
    if (winner === "audit") delete worker.helpedAudit;
    assert.equal(viewFor(game, worker.id).self.allegiance, "neutral");
    assert(!Object.hasOwn(viewFor(game, chair.id).seats[worker.id - 1], "allegiance"));
    openRegular(game);
    role(game, "police").status = "escaped";
    role(game, "political").status = "escaped";
    game.escaped = winner === "corrupt" ? goal - 100 : 0;
    chair.money = 400;
    finishRegular(game, { chair: { kind: "escape" } });
    assert.equal(game.winner.side, winner);
    assert.equal(viewFor(game, worker.id).self.won, false);
    assert(!Object.hasOwn(viewFor(game, chair.id).seats[worker.id - 1], "allegiance"));
  }
});

test("protection and completed transfers count privately, including on the night the giver is framed", () => {
  const game = make();
  const judge = role(game, "judge");
  const worker = role(game, "worker");
  const director = role(game, "director");
  const executive = role(game, "executive");
  advance(game, timing.opening);
  submit(game, judge, { type: "prelude", kind: "umbrella", target: director.id }, due(game) - 100);
  submit(game, worker, { type: "prelude", kind: "survey", deliver: true }, due(game) - 100);
  advance(game, due(game));
  assert.equal(viewFor(game, worker.id).self.allegiance, "neutral");
  assert.equal(viewFor(game, executive.id).self.allegiance, "neutral");
  assert.equal(viewFor(game, judge.id).self.allegiance, "audit");
  finishRegular(game);
  assert.equal(viewFor(game, worker.id).self.allegiance, "audit");
  assert.equal(channelFor(game, worker.id, "audit"), false);
  submit(game, director, { type: "dayAction", kind: "intel", target: judge.id }, due(game));
  submit(game, executive, { type: "prelude", kind: "transfer" }, due(game) - 100);
  advance(game, due(game));
  assert.equal(viewFor(game, executive.id).self.allegiance, "audit");
  finishRegular(game, { chair: { kind: "frame", target: executive.id } });
  assert.equal(viewFor(game, executive.id).self.allegiance, "audit");
  assert.equal(viewFor(game, executive.id).self.illegal, true);
  assert.equal(channelFor(game, executive.id, "audit"), false);
  assert.equal(channelFor(game, executive.id, "corrupt"), false);
});

test("framing leaves an uncommitted middle seat free to help audit or actively turn corrupt", () => {
  for (const kind of ["transfer", "destroy"]) {
    const game = make();
    const executive = role(game, "executive");
    const director = role(game, "director");
    openRegular(game);
    finishRegular(game, { chair: { kind: "frame", target: executive.id } });
    assert.equal(viewFor(game, executive.id).self.allegiance, "neutral");
    assert.equal(viewFor(game, executive.id).self.illegal, true);

    submit(game, director, { type: "dayAction", kind: "intel", target: executive.id }, due(game));
    assert.equal(viewFor(game, director.id).inbox.findLast((entry) => entry.kind === "intel").found, false);
    submit(game, executive, { type: "prelude", kind }, due(game) - 100);
    assert(advance(game, due(game)));
    const { self } = viewFor(game, executive.id);
    assert.equal(self.allegiance, kind === "transfer" ? "audit" : "corrupt");
    assert.equal(self.illegal, true);
  }
});

test("the last framed audit ally can be arrested and still wins with audit", () => {
  const game = make();
  const director = role(game, "director");
  const executive = role(game, "executive");
  openRegular(game);
  finishRegular(game);

  submit(game, director, { type: "dayAction", kind: "intel", target: executive.id }, due(game));
  submit(game, executive, { type: "prelude", kind: "transfer" }, due(game) - 100);
  assert(advance(game, due(game)));
  finishRegular(game, {
    chair: { kind: "frame", target: executive.id }, police: { kind: "escape" }, political: { kind: "escape" },
  });
  submit(game, director, { type: "dayAction", kind: "follow", target: executive.id, member: director.id }, due(game));
  assert(advance(game, due(game)));
  finishRegular(game, { chair: { kind: "escape" } });
  assert(game.escaped < goal);
  assert.equal(game.winner, null);
  assert(viewFor(game, director.id).cards.some((card) => card.target === executive.id && card.source === "跟踪"));

  submit(game, director, { type: "dayAction", kind: "arrest", target: executive.id, member: director.id }, due(game));
  assert.equal(game.winner, null);
  assert(advance(game, due(game)));
  assert.equal(game.winner.side, "audit");
  assert.equal(executive.status, "arrested");
  assert.equal(viewFor(game, executive.id).self.won, true);
});

test("audit members are exempt from arrests and raids and available to the hacker", () => {
  const game = make();
  const director = role(game, "director");
  const investigator = role(game, "investigator");
  const secretary = role(game, "secretary");
  dawn(game);
  for (const ally of [director, investigator, secretary]) {
    addCard(game, ally, director);
    assert.equal(applyChoice(game, director.id, { type: "auditSkill", kind: "raid", target: ally.id }, 1200), false);
    assert.equal(applyChoice(game, director.id, { type: "dayAction", kind: "arrest", target: ally.id, member: director.id }, due(game)), false);
    const draft = { view: viewFor(game, director.id), purpose: "dayAction" };
    assert.equal(playable(draft, { kind: "arrest", target: ally.id, member: director.id }), null);
  }
  submit(game, investigator, { type: "auditSkill", kind: "listen", target: secretary.id }, 1200);
  game.auditChoices[director.id] = { kind: "raid", target: secretary.id };
  submit(game, director, { type: "dayAction", kind: "intel", target: secretary.id }, due(game));
  assert.equal(secretary.status, "active");
  assert.equal(director.used, false);
  assert.equal(game.listen.watched, secretary.id);
});

test("discussion extensions accumulate per live seat and reset at dawn", () => {
  const game = make();
  assert(extendDiscussion(game, 1, timing.opening - 1));
  assert.equal(extendDiscussion(game, 1, timing.opening - 1), false);
  assert(extendDiscussion(game, 2, timing.opening - 1));
  game.players[2].status = "dead";
  assert.equal(extendDiscussion(game, 3, timing.opening - 1), false);
  assert.equal(due(game), timing.opening + 2 * timing.extension);
  assert.equal(advance(game, timing.opening), false);
  assert.equal(extendDiscussion(game, 4, due(game)), false);
  openRegular(game);
  finishRegular(game);
  assert.equal(game.day, 2);
  assert(viewFor(game, 1).canExtend);
  assert(extendDiscussion(game, 1, due(game) - 1));
});

test("confirmed role choices are dealt to their seats before random assignment", () => {
  const game = createMatch(botNames, 48096, 0, ["executive", null, "director", "executive", ["chair"]]);
  assert.equal(game.players[0].role, "executive");
  assert.equal(game.players[2].role, "director");
  assert.equal(new Set(game.players.map((player) => player.role)).size, 9);
  assert.equal(game.evidence[0].holder, 1);
});

test("an escape estimate credits pending income once and accounts for an active favor", () => {
  const game = make();
  const chair = role(game, "chair");
  chair.money = 400;
  game.rebatePending = true;
  assert.deepEqual(viewFor(game, chair.id).escapeEstimate, { income: 200, fee: 300, portable: 300, goal });
  assert(advance(game, due(game)));
  submit(game, chair, { type: "prelude", kind: "favor" }, due(game) - 1);
  assert(advance(game, due(game)));
  assert.deepEqual(viewFor(game, chair.id).escapeEstimate, { income: 0, fee: 0, portable: 600, goal });
  assert.equal(viewFor(game, role(game, "executive").id).escapeEstimate, null);
});

test("an in-progress legacy middle seat keeps credit for a transfer completed before the update", () => {
  const game = make();
  const executive = role(game, "executive");
  delete executive.helpedAudit;
  assert.equal(viewFor(game, executive.id).self.allegiance, "neutral");
  game.inbox[executive.id].push({ kind: "skill", text: "证据已移交给纪检方。" });
  assert.equal(viewFor(game, executive.id).self.allegiance, "audit");
  executive.turned = true;
  assert.equal(viewFor(game, executive.id).self.allegiance, "corrupt");
});
