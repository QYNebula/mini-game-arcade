import { auditTargetAllowed, dayActions, roles } from "../../games/renmin/online/catalog.js";

const skillNames = { raid: "突袭", listen: "黑客", dawn: "破晓" };
const seatLabel = (id) => id + "号";
const visibleSeat = (view, id) => view.seats.find((seat) => seat.id === id);

export function auditConversation(view, channel) {
  return roles[view.self.role].faction === "audit" && teamConversation(view, channel);
}

export function teamConversation(view, channel) {
  const side = roles[view.self.role].faction;
  if (side === "middle") return false;
  if (channel === side) return true;
  if (!channel?.startsWith("dm:")) return false;
  const peer = channel.split(":").slice(1).map(Number).find((id) => id !== view.self.id);
  return roles[visibleSeat(view, peer)?.role]?.faction === side;
}

export function outsideTeamDm(view, channel) {
  return channel?.startsWith("dm:") && !teamConversation(view, channel);
}

const tacticalWords = /拘捕|抓捕|跟踪|情报|突袭|黑客|破晓|拍板|改目标|换目标|派我|怎么查|决定|证据/;

export function reviewTactics(view, job, incoming) {
  return job.purpose === "speech" && !job.briefed && job.priority <= 2 &&
    auditConversation(view, job.channel) && (view.chief === view.self.id || Boolean(view.auditSkill)) &&
    incoming.some(({ text }) => tacticalWords.test(text));
}

export function currentProposal(view, mind) {
  const plan = mind?.proposal;
  if (!plan || plan.day !== view.day || view.chief !== view.self.id) return null;
  return checkProposal(view, plan);
}

export function checkProposal(view, candidate) {
  if (!candidate || view.day < 2 || view.chief !== view.self.id ||
      !Object.hasOwn(dayActions, candidate.kind) || !Number.isInteger(candidate.target)) return null;
  const target = visibleSeat(view, candidate.target);
  if (!auditTargetAllowed(candidate.kind, target)) return null;
  if (candidate.kind === "intel") return { kind: "intel", target: target.id };
  const member = visibleSeat(view, candidate.member);
  if (!member?.onDuty) return null;
  if (candidate.kind === "arrest" && member.id === view.self.id &&
      view.cards.filter((card) => card.target === target.id).length < (target.role === "political" ? 2 : 1)) return null;
  return { kind: candidate.kind, target: target.id, member: member.id };
}

export function checkRegistration(view, candidate) {
  if (!candidate || !view.auditSkill || !["hold", view.auditSkill].includes(candidate.kind)) return null;
  if (candidate.kind === "raid" || candidate.kind === "listen") {
    const target = Number.isInteger(candidate.target) && visibleSeat(view, candidate.target);
    if (!auditTargetAllowed(candidate.kind, target)) return null;
    return { type: "auditSkill", kind: candidate.kind, target: target.id };
  }
  return { type: "auditSkill", kind: candidate.kind };
}

export function roundFacts(view, mind) {
  return {
    decisionMaker: view.chief ?? null,
    proposal: currentProposal(view, mind),
    registeredSkill: view.auditChoice,
    outcomes: view.auditHistory?.slice(-6) || [],
  };
}

export function describeAuditState(context, topic = "current") {
  const { view, round } = context;
  if (!round) return "";
  const incoming = (context.incoming || []).map(({ text }) => text).join(" ");
  const skill = Object.keys(skillNames).find((kind) => incoming.includes(skillNames[kind]));
  const discussion = describeAction(round.proposal);
  const registered = round.registeredSkill;
  const registeredName = registered && skillNames[registered.kind];
  const mentionedAction = Object.keys(dayActions).find((kind) => incoming.includes(dayActions[kind].label));
  const last = round.outcomes.findLast(({ kind, type, actor }) => {
    if (skill) return kind === skill;
    if (topic === "skill") return type === "auditSkill" && actor === view.self.id;
    return type === "dayAction" && (!mentionedAction || kind === mentionedAction);
  });
  if (topic === "outcome" && !last) return "我目前没看到这项行动的结算记录，先把已知线索对一下。";
  if ((topic === "outcome" || topic === "current" && !context.briefed &&
      /(?:昨晚|昨天|前一晚|什么时候|何时|未能执行|已经执行)/.test(incoming)) && last) {
    return describeOutcome(last);
  }
  if (registeredName && (topic === "skill" || skill === registered.kind)) {
    return "我已登记" + registeredName + (registered.target ? seatLabel(registered.target) : "") + "，入夜前还可以改。";
  }
  if (registered?.kind === "hold" && (topic === "skill" || skill === view.auditSkill)) {
    return "我本轮登记了跳过技能，入夜前还可以改。";
  }
  if (topic === "skill" || skill) {
    if (skill && skill === view.auditSkill) return "我的" + skillNames[skill] + "还没有登记，这一轮可以先商量目标。";
    if (last?.type === "auditSkill") return describeOutcome(last);
  }
  if (discussion) return "今天我打算" + discussion + "，还在讨论。";
  if (view.chief === view.self.id && view.day === 1) return "今天是首日，我先听意见，白天没有常规行动。";
  if (view.chief === view.self.id) return "今天我来拍板。目标和执行人还在商量。";
  return view.chief ? "今天由" + seatLabel(view.chief) + "拍板，我可以先给建议。" : "";
}

export function asksAboutDecision(context) {
  return (context.incoming || []).some(({ text }) => tacticalWords.test(text));
}

function describeAction(action) {
  if (!action) return "";
  const target = seatLabel(action.target);
  if (action.kind === "intel") return "查" + target + "昨晚有无违法行为";
  if (action.kind === "follow") return "跟踪" + target + "，由" + seatLabel(action.member) + "接收证据";
  return "派" + seatLabel(action.member) + "拘捕" + target;
}

function describeOutcome(row) {
  if (row.type === "auditSkill") {
    const name = skillNames[row.kind];
    const target = row.target ? seatLabel(row.target) : "";
    if (row.kind === "dawn") return "第" + row.day + "天发动了破晓，第" + row.effectiveDay + "天才生效。";
    return "第" + row.day + "夜已发动" + name + (target ? "，目标是" + target : "") + "。";
  }
  const action = describeAction(row);
  const result = { blocked: "未能执行", pending: "正在处理", rescued: "目标被营救", executed: "已执行" };
  const dawn = row.dawn ? "，本次拘捕由破晓生效" : "";
  return "第" + row.day + "天提交了" + action + "，" + result[row.status] + dawn + "。";
}

export function decisionRevision(context) {
  return JSON.stringify([context.memory?.proposal ?? null, context.round ?? null, context.view.auditChoice]);
}
