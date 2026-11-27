import assert from "node:assert/strict";
import { test } from "node:test";
import { botNames, timing } from "../../games/renmin/online/catalog.js";
import { advance, applyChoice, chatExportScope, createMatch, viewFor } from "./match.js";
import { callModel, fallback, playable } from "./agents.js";
import { auditConversation, decisionRevision, reviewTactics, roundFacts } from "./strategy.js";

const make = () => createMatch(botNames, 252741, 0);
const speech = (game, mind, channel, text, more = {}) => {
  const view = viewFor(game, 7);
  return {
    view, memory: mind, purpose: "speech", channel, mustReply: true, replyTo: 1,
    threads: { public: [] }, incoming: [{ channel, actor: 1, text }], round: roundFacts(view, mind), ...more,
  };
};

test("the chief can change a raid discussed in a DM and still submit a separate team plan", async (t) => {
  const game = make();
  game.day = 5;
  game.until = timing.discussion;
  game.evidence.push({ id: ++game.cardId, target: 3, holder: 1, source: "测试取证", day: 3 });
  const mind = { proposal: { day: 5, kind: "arrest", target: 9, member: 4 } };
  assert(applyChoice(game, 7, { type: "auditSkill", kind: "raid", target: 3 }, 1000));
  const context = speech(game, mind, "dm:1:7", "3号证据在我手上，你突袭9号吧。", { tactical: true });
  assert(reviewTactics(context.view, { purpose: "speech", channel: context.channel, priority: 0 }, context.incoming));
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
