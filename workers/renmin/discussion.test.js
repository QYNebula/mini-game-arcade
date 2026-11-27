import assert from "node:assert/strict";
import { test } from "node:test";
import { botNames } from "../../games/renmin/online/catalog.js";
import { callModel, configuredModel, playable, updateReads } from "./agents.js";
import { dmKey, jobPriority, jobTime, queueJob, queueOutreach, queuePublicNotice, queueReply, spoken } from "./discussion.js";
import { createMatch, viewFor } from "./match.js";

const make = () => createMatch(botNames, 48096, 0);
const role = (game, key) => game.players.find((player) => player.role === key);

test("human DMs keep a separate queue and can get more than two replies in a day", () => {
  const game = make();
  const seats = game.players.map(({ id }) => ({ kind: id === 1 ? "human" : "computer" }));
  const match = { game, jobs: [], jobId: 0, spoken: { 9: 2 } };
  const posted = (id, text, channel = "dm:1:9") => ({ actor: 1, channel, id, text });
  queueJob(match, 9, "speech", 4000, { channel: "audit" });
  queueReply(match, seats, posted(7, "９号，你怎么看？", "public"), 1000);
  queueReply(match, seats, posted(1, "你觉得6号为何离场？"), 2000);
  queueReply(match, seats, posted(2, "昨晚有人用突袭吗？"), 2800);

  const privateJob = match.jobs.find((job) => job.channel === "dm:1:9");
  assert.deepEqual(privateJob.reply, { actor: 1, first: 1, last: 2 });
  assert.equal(privateJob.due, 4000);
  assert(jobPriority(privateJob) < jobPriority(match.jobs.find((job) => job.channel === "public")));
  assert.equal(match.jobs.length, 3);

  privateJob.expires = 9_000;
  assert.equal(jobTime(match, match.jobs[0]), 9_000);
  queueReply(match, seats, posted(3, "你想好了吗？"), 5000);
  const followup = match.jobs.find((job) => job.channel === "dm:1:9" && job.id !== privateJob.id);
  assert.deepEqual(followup.reply, { actor: 1, first: 3, last: 3 });
  match.jobs.splice(match.jobs.indexOf(privateJob), 1);
  spoken(match, privateJob, 6000);
  assert(jobTime(match, followup) < 9_000);
  match.jobs.splice(match.jobs.indexOf(followup), 1);

  for (let count = 4; count <= 8; count++) {
    queueReply(match, seats, posted(count, "新的问题 " + count), 9000 + count * 3000);
    const candidate = match.jobs.find((job) => job.channel === "dm:1:9");
    assert.equal(candidate.reply.last, count);
    match.jobs.splice(match.jobs.indexOf(candidate), 1);
    spoken(match, candidate, 9000 + count * 3000 + 1500);
  }
});

test("public replies require a human prompt or a new official notice", () => {
  const game = make();
  const seats = game.players.map(({ id }) => ({ kind: id === 4 ? "human" : "computer" }));
  const match = { game, jobs: [], jobId: 0 };
  assert.equal(queuePublicNotice(match, game.players, 4000), false);
  queueReply(match, seats, { actor: 4, channel: "public", id: 1, text: "大家好" }, 4200);
  queueReply(match, seats, { actor: 4, channel: "public", id: 1, text: "5号当时是怎么判断的？" }, 5000, {});
  assert.equal(match.jobs.length, 0);
  queueReply(match, seats, { actor: 4, channel: "public", id: 2, text: "5号，你怎么看这条线索？" }, 5000);
  const reply = match.jobs[0];
  assert.equal(reply.seat, 5);
  assert.equal(reply.depth, 0);
  queueReply(match, seats, { actor: 5, channel: "public", id: 2, text: "4号的说法我听到了。" }, 7000, reply);
  assert.equal(match.jobs.length, 1);
  spoken(match, reply, 10_000);
  assert.equal(jobTime(match, reply), 11_700);

  game.day++;
  game.public.push({ id: ++game.eventId, day: game.day, kind: "intel", target: 3 });
  assert(queuePublicNotice(match, game.players, 20_000));
  assert.equal(match.jobs.at(-1).seat, 3);
  assert.equal(queuePublicNotice(match, game.players, 20_000), false);
});

test("a middle seat with a lead can initiate a DM with a single AI reply", () => {
  const game = make();
  const executive = role(game, "executive");
  const target = game.evidence[0].target;
  const seats = game.players.map(() => ({ kind: "computer" }));
  const match = { game, jobs: [], jobId: 0 };
  queueOutreach(match, seats, 4000, false);
  queueOutreach(match, seats, 5000, false);
  assert.equal(match.jobs.length, 1);
  const outreach = match.jobs.pop();
  assert.equal(outreach.seat, executive.id);
  const view = viewFor(game, executive.id);
  const context = { view, purpose: "speech", outreach: true };
  assert.equal(playable(context, { peer: executive.id, move: "offer" }), null);
  assert.deepEqual(playable(context, { peer: target, move: "offer", text: "只传事先许可的发言意图" }),
    { contact: target, plan: { move: "offer" } });
  const channel = dmKey(executive.id, target);
  queueReply(match, seats, { actor: executive.id, channel, id: 1, text: "我有个线索想找你谈。" }, 7000, { initiated: true });
  assert.equal(match.jobs[0].seat, target);
  queueReply(match, seats, { actor: target, channel, id: 2, text: "你想聊什么？" }, 8000, match.jobs[0]);
  assert.equal(match.jobs.length, 1);
});

test("public conversation plans keep private data and unconfirmed identities out of the drafting request", async (t) => {
  const game = make();
  const police = role(game, "police");
  const political = role(game, "political");
  const view = viewFor(game, police.id);
  const publicLine = { channel: "public", actor: 1, text: "4号，谁应该先说说自己的判断？" };
  const privateLine = { channel: "corrupt", actor: political.id, text: "测试用的机密群消息" };
  const base = {
    view, purpose: "speech", channel: "public",
    threads: { public: [publicLine], corrupt: [privateLine] },
    incoming: [publicLine, privateLine], ownRemarks: [publicLine, privateLine],
    mustReply: true, memory: { reads: { 1: { stance: "suspect", reason: "机密座位笔记" } } },
  };
  const payloads = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    const content = JSON.stringify(payloads.length === 1 ?
      { move: "defend", focus: 1, text: "我是公安厅长" } : { text: "1号，你从哪句话判断应该先问他？" });
    return Response.json({ choices: [{ message: { content } }] });
  });
  const env = { DASHSCOPE_API_KEY: "mock-key" };
  const first = await callModel(env, base);
  const plan = playable(base, first.choice).plan;
  assert.deepEqual(plan, { move: "defend", focus: 1 });
  assert.equal(playable(base, { move: "quiet" }), null);

  const context = { ...base, plan };
  const second = await callModel(env, context);
  assert(playable(context, second.choice).text.includes("从哪句话"));
  const strategy = JSON.parse(payloads[0].messages[1].content);
  assert.equal(strategy.self.role, "police");
  assert(strategy.threads.corrupt.length);
  assert.equal(strategy.seats[political.id - 1].role, "political");
  const writing = payloads[1].messages[1].content;
  for (const secret of ["公安厅长", "政法委书记", "祁同伟", "高育良", "机密", "privateNotices", "ownEvidence", "ownSuspicions"]) {
    assert(!writing.includes(secret));
  }
  assert.equal(payloads[0].model, "qwen3.7-plus");
  assert.equal(payloads[1].model, "qwen3.8-flash");
  assert.equal(configuredModel({ DASHSCOPE_MODEL: "qwen3.8-flash" }), "qwen3.8-flash");

  for (const text of ["我是公安厅长，持有【违法】状态。", political.id + "号是政法委书记。",
    "高育良在问线索，我建议大家先查清楚。", "高书记在问线索，我建议大家先做情报。"]) {
    assert.equal(playable(context, { text }), null);
  }
  assert(playable(context, { text: "你觉得谁最可疑？" }));
});

test("only the acting seat's own bounded reads survive a follow-up", () => {
  const game = make();
  const view = viewFor(game, role(game, "police").id);
  const first = updateReads(undefined, { reads: [{ seat: 1, stance: "suspect", reason: "先问清来历。" }] }, view);
  const saved = updateReads(first, { reads: [{ seat: 1, stance: "unsure", reason: "听到新说法，先观察。" },
    { seat: view.self.id, stance: "trust", reason: "自己的座位" }] }, view);
  assert.deepEqual(Object.keys(saved), ["1"]);
  assert.equal(first[1].stance, "suspect");
  assert.equal(saved[1].stance, "unsure");
  assert.equal(updateReads(saved, {}, view), saved);
});

test("opening speech rejects fabricated previous remarks and first-night claims", () => {
  const view = viewFor(createMatch(botNames, 3297970325, 0), 4);
  const context = { view, purpose: "speech", channel: "public", threads: { public: [] }, plan: { move: "challenge", focus: 8 } };
  const reasons = [];
  const inspect = (text) => playable(context, { text }, (reason) => { reasons.push(reason); return null; });
  assert.equal(inspect("8号，你刚才那番话的逻辑基点是什么？"), null);
  assert.equal(inspect("4号，先说说你昨晚验了谁。"), null);
  assert.equal(inspect("我先听一圈。"), null);
  assert.equal(inspect("8号，你想先听哪个座位的判断？").text, "8号，你想先听哪个座位的判断？");
  assert.deepEqual(reasons, ["unverified_public_reference", "first_night_not_completed", "opening_requires_question"]);
  assert.equal(playable({ ...context, plan: undefined, channel: "dm:1:4" }, { text: "你昨夜做了什么？" }), null);
});

test("public references cite a real message and its speaker, including when another channel shares the same ID", () => {
  const view = viewFor(make(), 4);
  const publicLine = { channel: "public", id: 1, actor: 8, day: 1, text: "我想先听2号的判断。" };
  const privateLine = { channel: "corrupt", id: 1, actor: 8, day: 1, text: "蓝封条731" };
  const context = { view, purpose: "speech", channel: "public", threads: { public: [publicLine], corrupt: [privateLine] },
    plan: { move: "ask", focus: 8 }, incoming: [privateLine], ownRemarks: [privateLine] };
  const reply = { text: "我也想听听，你有比较在意的一点吗？", reference: { id: 1, actor: 8, quote: "想先听2号的判断" } };
  assert.deepEqual(playable(context, reply), {
    text: "8号，你提到「想先听2号的判断」。我也想听听，你有比较在意的一点吗？", reference: { id: 1, actor: 8 },
  });
  assert.equal(playable(context, { ...reply, reference: { ...reply.reference, actor: 4 } }), null);
  assert.equal(playable(context, { ...reply, reference: { ...reply.reference, id: 2 } }), null);
  assert.equal(playable(context, { ...reply, reference: { ...reply.reference, quote: "蓝封条731" } }), null);
  assert.equal(playable(context, { ...reply, text: "8号，你刚才那番话能再解释一下吗？" }), null);
});

test("the outbound request gate blocks an out-of-faction message and diagnoses it without chat text", async (t) => {
  const game = createMatch(botNames, 3297970325, 0);
  const view = viewFor(game, 4);
  assert.equal(view.self.role, "executive");
  assert.equal(view.cards[0].target, 8);
  const corrupt = { id: 1, channel: "corrupt", actor: 8, day: 1, text: "蓝封条731" };
  const context = { view, purpose: "speech", channel: "public", threads: { public: [], corrupt: [corrupt] } };
  const fetch = t.mock.method(globalThis, "fetch");
  const reports = [];
  await assert.rejects(callModel({ DASHSCOPE_API_KEY: "unit-secret" }, context, (...event) => reports.push(event)),
    { code: "input_scope_violation" });
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(reports[0][0], "request_blocked");
  const logged = reports[0][1];
  assert.deepEqual(logged.unexpected, ["corrupt"]);
  assert.deepEqual(logged.chat["history.corrupt"], [{ channel: "corrupt", id: 1, seat: 8, day: 1 }]);
  assert.equal(logged.publicCount, 0);
  assert.deepEqual(logged.sources.ownCards, [{ day: 1, source: "告密者" }]);
  assert(!JSON.stringify(reports).includes("蓝封条731"));
  assert(!JSON.stringify(reports).includes("unit-secret"));
});

test("stranger DMs use scoped writing while confirmed teammates can share facts", async (t) => {
  const game = createMatch(botNames, 3297970325, 0);
  const police = role(game, "police");
  const political = role(game, "political");
  const executive = role(game, "executive");
  const view = viewFor(game, police.id);
  view.inbox.push({ day: 1, kind: "warning", text: "私有记号701" });
  const channel = dmKey(police.id, executive.id);
  const other = dmKey(police.id, political.id);
  const incoming = [{ channel, id: 1, actor: executive.id, text: "你到底是什么身份？" }];
  const allyLine = { channel: other, id: 1, actor: political.id, text: "队友握有关键线索389" };
  const base = { view, channel, purpose: "speech", incoming, mustReply: true, threads: { public: [], [channel]: incoming } };
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const packet = JSON.parse(options.body);
    requests.push({ model: packet.model, prompt: JSON.parse(packet.messages[1].content) });
    const choice = requests.length === 1 ? { move: "negotiate", text: "我是祁同伟" } : { text: "你先说说想怎么合作？" };
    return Response.json({ choices: [{ message: { content: JSON.stringify(choice) } }] });
  });
  const env = { DASHSCOPE_API_KEY: "mock-key" };
  const plan = playable(base, (await callModel(env, base)).choice).plan;
  assert.deepEqual(plan, { move: "negotiate" });
  const draft = { ...base, plan, threads: { ...base.threads, [other]: [allyLine] } };
  const result = playable(draft, (await callModel(env, draft)).choice);
  assert.equal(result.text, "你先说说想怎么合作？");
  assert.equal(playable(draft, { text: "我是公安厅长。" }), null);
  const peer = { ...base, channel: other, incoming: [allyLine], threads: { public: [], [other]: [allyLine] } };
  await callModel(env, peer);
  assert.equal(playable(peer, { text: "我是祁同伟。我手里100万。" }).text, "我是祁同伟。我手里100万。");
  assert.deepEqual(requests.map(({ model }) => model), ["qwen3.7-plus", "qwen3.8-flash", "qwen3.8-flash"]);
  assert.equal(requests[0].prompt.self.role, "police");
  assert.equal(requests[2].prompt.self.role, "police");
  assert.equal(requests[1].prompt.dmChat[0].text, incoming[0].text);
  assert.doesNotMatch(JSON.stringify(requests[1].prompt), /公安厅长|政法委书记|祁同伟|高育良|私有记号701|队友握有关键线索389|"self"|"ownEvidence"|"privateNotices"/);
});
