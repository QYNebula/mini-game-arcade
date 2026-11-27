import { channelFor, faction, live } from "./match.js";

const replyDelay = 1200;
const channelGap = { public: 1700, audit: 1000, corrupt: 1000 };
const conversationNotices = new Set(["rescue", "arrested", "dead", "escaped", "intel", "follow", "blockade"]);
export const publicLead = (text) => /[?？]|证据|线索|举报|通报|身份|查到|可疑|怀疑|怎么看|想找/.test(text);
export const dmKey = (a, b) => "dm:" + Math.min(a, b) + ":" + Math.max(a, b);

export function queueJob(match, seat, purpose, due, fields = {}) {
  const job = { id: ++match.jobId, seat, purpose, due, expires: 0, ...fields };
  match.jobs.push(job);
  return job;
}

export function queueReply(match, seats, message, now, parent) {
  const { actor, channel, id, text } = message;
  const directMessage = channel.startsWith("dm:");
  if (parent && (channel === "public" || directMessage && !parent.initiated || parent.depth >= 1)) return;
  const mentioned = directMessage ? channel.split(":").slice(1).map(Number).find((seat) => seat !== actor) :
    Number(/(?:^|[^0-9])([1-9])\s*号/.exec(text.normalize("NFKC"))?.[1]);
  if (channel === "public" && !mentioned && !publicLead(text)) return;
  const bots = match.game.players.filter((player) => player.id !== actor && live(player) &&
    seats[player.id - 1]?.kind === "computer" && channelFor(match.game, player.id, channel));
  const waiting = (seat) => match.jobs.filter((job) => job.purpose === "speech" && job.seat === seat &&
    job.channel === channel && !job.expires && !job.plan && !job.briefed);
  const bot = mentioned ? bots.find((player) => player.id === mentioned) :
    bots.find((player) => waiting(player.id).some((job) => job.reply?.actor === actor)) ||
    bots.sort((a, b) => (match.lastSpoke?.[a.id] || 0) - (match.lastSpoke?.[b.id] || 0))
      .find((player) => !waiting(player.id).some((job) => job.reply));
  if (!bot) return;

  const queued = waiting(bot.id);
  if (parent && queued.some((job) => job.reply && job.priority <= 2)) return;
  const pending = queued.find((job) => job.reply?.actor === actor) || queued.find((job) => !job.reply);
  const priority = parent ? 3 : directMessage ? 0 : mentioned ? 1 : 2;
  const reply = { actor, first: pending?.reply?.first ?? id, last: id };
  const fields = { channel, reply, priority, depth: parent ? (parent.depth || 0) + 1 : 0 };
  if (pending) Object.assign(pending, fields, { due: now + replyDelay });
  else queueJob(match, bot.id, "speech", now + replyDelay, fields);
}

export function queuePublicNotice(match, bots, now) {
  const notice = match.game.public.findLast((entry) => entry.id > (match.lastDiscussionNotice ?? 0) &&
    entry.day >= match.game.day - 1 && conversationNotices.has(entry.kind));
  if (!notice || !bots.length) return false;
  const speaker = bots.find((bot) => bot.id === notice.target) ?? bots.find((bot) => bot.id === notice.actor) ??
    [...bots].sort((a, b) => (match.lastSpoke?.[a.id] ?? 0) - (match.lastSpoke?.[b.id] ?? 0))[0];
  match.lastDiscussionNotice = notice.id;
  queueJob(match, speaker.id, "speech", now + 2500, { channel: "public", notice: notice.id });
  return true;
}

export function queueOutreach(match, seats, now, prompted) {
  const { game } = match;
  const days = (match.contactDays ??= {});
  const candidates = game.players.filter((player) => live(player) && faction(player) === "middle" &&
    seats[player.id - 1]?.kind === "computer" && days[player.id] !== game.day);
  if (!candidates.length) return;
  const speaker = candidates.find((player) => game.evidence.some((card) => card.holder === player.id)) ??
    (prompted ? candidates[(game.day - 1) % candidates.length] : undefined);
  if (!speaker) return;
  days[speaker.id] = game.day;
  queueJob(match, speaker.id, "speech", now + 4300, { outreach: true, priority: 4 });
}

export function jobTime(match, job) {
  if (job.purpose !== "speech" || job.expires) return job.due || job.expires;
  const blocking = match.jobs.filter((other) => other.purpose === "speech" &&
    (other.channel === job.channel || other.seat === job.seat));
  return Math.max(job.due, match.chatReady?.[job.channel] || 0, ...blocking.map((other) => other.expires));
}

export function jobPriority(job) {
  if (job.expires) return -2;
  return job.purpose === "speech" ? (job.priority ?? 3) : -1;
}

export function spoken(match, job, now) {
  (match.lastSpoke ??= {})[job.seat] = now;
  (match.chatReady ??= {})[job.channel] = now + (channelGap[job.channel] ?? 450);
}
