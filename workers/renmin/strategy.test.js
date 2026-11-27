import assert from "node:assert/strict";
import { test } from "node:test";
import { botNames, timing } from "../../games/renmin/online/catalog.js";
import { advance, applyChoice, chatExportScope, createMatch, viewFor } from "./match.js";
import { callModel, fallback, playable } from "./agents.js";
import { auditConversation, auditIntent, decisionRevision, describeAuditState, reviewTactics, roundFacts } from "./strategy.js";

const make = () => createMatch(botNames, 252741, 0);
const speech = (game, mind, channel, text, more = {}) => {
  const view = viewFor(game, more.seat ?? 7);
  const incoming = text ? [{ channel, actor: 1, text }] : [];
  return {
    view, memory: mind, purpose: "speech", channel, mustReply: true, replyTo: 1,
    threads: { public: [] }, incoming, intent: auditIntent(view, incoming), round: roundFacts(view, mind), ...more,
  };
};

test("the chief can change a raid discussed in a DM and still submit a separate team plan", async (t) => {
  const game = make();
  game.day = 5;
  game.until = timing.discussion;
  game.evidence.push({ id: ++game.cardId, target: 3, holder: 1, source: "测试取证", day: 3 });
  const mind = { proposal: { day: 5, kind: "arrest", target: 9, member: 4 } };
  assert(applyChoice(game, 7, { type: "auditSkill", kind: "raid", target: 3 }, 1000));
  const context = speech(game, mind, "dm:1:7", "今天派我拘捕3号。你突袭9号吧。", { tactical: true });
  assert(reviewTactics(context.view, { purpose: "speech", channel: context.channel, priority: 0 }, context.intent));
  assert(!auditConversation(context.view, "dm:3:7"));
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const payload = JSON.parse(options.body);
    calls.push({ model: payload.model, packet: JSON.parse(payload.messages[1].content) });
    const content = JSON.stringify(payload.model === "qwen3.7-plus" ?
      { proposal: { kind: "arrest", target: 3, member: 1 }, registration: { kind: "raid", target: 9 } } :
      { report: "skill" });
    return Response.json({ choices: [{ message: { content }, finish_reason: "stop" }] });
  });
  const env = { DASHSCOPE_API_KEY: "test-key" };
  const result = await callModel(env, context);
  const { tactics } = playable(context, result.choice);
  assert.equal(result.finishReason, "stop");
  assert(applyChoice(game, 7, tactics.registration, 2000));
  mind.proposal = { ...tactics.proposal, day: 5 };
  const group = speech(game, mind, "audit", "7号，现在突袭谁？");
  const dm = speech(game, mind, "dm:1:7", "还是突袭9号吗？");
  assert.notEqual(decisionRevision(context), decisionRevision(group));
  for (const view of [group, dm]) {
    const reply = playable(view, (await callModel(env, view)).choice);
    assert.equal(reply.text, "我已登记突袭9号，入夜前还可以改。");
  }
  assert.deepEqual(calls.map(({ model }) => model), ["qwen3.7-plus", "qwen3.8-flash", "qwen3.8-flash"]);
  assert.deepEqual(calls[1].packet.round, calls[2].packet.round);
  assert.equal(calls[1].packet.voice, calls[0].packet.voice);
  assert(!JSON.stringify(calls[1].packet).includes("你突袭9号吧。"));
  assert.equal(game.players[8].status, "active");
  const formal = { ...group, purpose: "dayAction" };
  const submitted = playable(formal, fallback(formal));
  assert.deepEqual(submitted, { type: "dayAction", kind: "arrest", target: 3, member: 1 });
  assert(applyChoice(game, 7, submitted, game.until));
  assert.equal(game.phase, "detention");
  assert(advance(game, game.until));
  assert.equal(game.players[2].status, "arrested");
  assert.equal(game.players[8].status, "arrested");
  const outcomes = roundFacts(viewFor(game, 7), mind).outcomes;
  assert.deepEqual(outcomes.map(({ kind, target, status }) => [kind, target, status]),
    [["arrest", 3, "executed"], ["raid", 9, "executed"]]);
  assert.equal(roundFacts(viewFor(game, 7), mind).proposal, null);
});

const replay = () => createMatch(botNames, 42, 0, ["secretary", "executive", "worker", "chair",
  "director", "judge", "political", "police", "investigator"]);
const canUpdate = (context) => reviewTactics(context.view,
  { purpose: "speech", channel: context.channel, priority: 0 }, context.intent);

test("opening day keeps regular actions closed and each role controls its own skill", () => {
  const game = replay();
  assert(applyChoice(game, 9, { type: "auditSkill", kind: "hold" }, 500));
  const first = speech(game, {}, "audit", "", { seat: 5 });
  assert.equal(first.round.decisionMaker, null);
  assert.match(describeAuditState(first), /今天没有纪检常规行动/);
  assert.match(playable(first, { text: "今天由我拍板，建议先用情报查一个座位。" }).text, /今天没有纪检常规行动/);
  const question = speech(game, {}, "audit", "5号你无权干涉9号发不发动技能", { seat: 5 });
  assert.equal(canUpdate(question), false);
  assert.match(describeAuditState(question), /黑客由9号本人登记。黑客本轮登记了跳过/);
  assert.equal(playable(first, { text: "监听未触发，3号昨晚无违法行为。" }), null);
});

test("asking about yesterday's blocked arrest in either chat leaves today's draft alone", () => {
  const game = replay();
  game.day = 2;
  game.directedDay = 2;
  const attempted = { kind: "arrest", target: 8, member: 9 };
  assert(applyChoice(game, 5, { type: "dayAction", ...attempted }, game.until));
  advance(game, game.until);
  advance(game, game.until);
  const mind = { proposal: { day: 3, kind: "follow", target: 7, member: 1 } };
  for (const [channel, text] of [["audit", "5号，昨天没有派9号去拘捕8号吗"],
    ["dm:1:5", "昨天大家讨论好了，拍9号拘捕8号啊，你为什么没有执行？"]]) {
    const context = speech(game, mind, channel, text, { seat: 5 });
    assert.equal(context.intent.type, "outcome");
    assert.equal(canUpdate(context), false);
    assert.match(describeAuditState(context), /第2天提交的行动是派9号拘捕8号。裁判返回未能执行，具体原因未公布/);
    assert.equal(playable({ ...context, tactical: true }, { proposal: attempted, registration: null }), null);
    assert.deepEqual(context.round.proposal, { kind: "follow", target: 7, member: 1 });
  }
});

test("a two-card question is answered without changing the draft, but a clear follow-up works on fallback", () => {
  const game = replay();
  game.day = 12;
  const mind = { proposal: { day: 12, kind: "arrest", target: 7, member: 1 } };
  const question = speech(game, mind, "dm:1:5", "你觉得会不会，7号是政法委书记，我们的证据还不够呢，因为场上被拘捕的目前都是一张证据就拘捕了", { seat: 5 });
  assert.equal(canUpdate(question), false);
  assert.match(describeAuditState(question), /7号是政法委书记，须同一个在岗执行人持两张/);
  assert.match(describeAuditState(question), /目前草案是派1号拘捕7号/);

  game.day = 13;
  const line = "5号，今天你务必派我跟踪7号，我接受证据，这样我手上就有两张针对7的证据，明天就能把他缉拿归案";
  const update = speech(game, mind, "audit", line, { seat: 5, tactical: true });
  assert(canUpdate(update));
  const accepted = { kind: "follow", target: 7, member: 1 };
  assert.deepEqual(playable(update, fallback(update)).tactics, { proposal: accepted, registration: null });
  assert.equal(playable(update, { proposal: { ...accepted, member: 9 }, registration: null }), null);
  mind.proposal = { day: 13, ...accepted };
  const fromGroup = speech(game, mind, "audit", line, { seat: 5 });
  const fromDm = speech(game, mind, "dm:1:5", "今天打算怎么安排？", { seat: 5 });
  for (const query of [fromGroup, fromDm]) assert.match(describeAuditState(query), /草案.*跟踪7号，?由1号接收证据|跟踪7号，由1号接收证据.*草案/);
  const submit = { ...fromGroup, purpose: "dayAction" };
  assert.deepEqual(playable(submit, fallback(submit)), { type: "dayAction", ...accepted });
});

test("team replies do not claim unknown allies or ask the chief to appoint himself", () => {
  const game = make();
  game.day = 8;
  game.evidence.push({ target: 8, holder: 7, source: "跟踪", day: 7 });
  const group = speech(game, {}, "audit", "局长，手里有什么？");
  assert.equal(playable(group, { text: "2和8已确认为友军。" }), null);
  assert.equal(playable(group, { text: "局长需要的话可以派我。" }), null);
  assert.match(fallback(group).text, /我有1张针对8号的证据/);
  assert.doesNotMatch(fallback(group).text, /局长需要/);
  assert.match(playable(group, { text: "我这就提交跟踪6号。" }).text, /目标和执行人还在商量/);
});

test("character names respect visibility and departure does not hide the final role", () => {
  const game = make();
  const audit = viewFor(game, 7);
  assert.equal(audit.seats[0].name, "陆亦可");
  assert.equal(audit.seats[2].name, "玩家3");
  assert.equal(audit.seats[2].role, undefined);
  assert.equal(viewFor(game, 2).seats[6].name, "玩家7");
  assert.equal(viewFor(game, 3).seats[7].name, "高育良");
  assert.equal(chatExportScope(game, 7), null);
  game.players[2].revealed = true;
  assert.equal(viewFor(game, 2).seats[2].name, "祁同伟");
  Object.assign(game.players[7], { status: "arrested", departedAt: 8000 });
  game.winner = { side: "audit" };
  game.phase = "ended";
  assert.deepEqual(viewFor(game, 7).seats[7], {
    id: 8, name: "高育良", role: "political", status: "arrested",
  });
  assert.deepEqual(chatExportScope(game, 8), { team: "corrupt", privateUntil: 8000 });
  assert.deepEqual(chatExportScope(game, 2), { team: "", privateUntil: Number.MAX_SAFE_INTEGER });
  assert.equal(roundFacts(viewFor(make(), 7), { proposal: { day: 5, kind: "intel", target: 3 } }).proposal, null);
});
