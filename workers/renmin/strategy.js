import { auditTargetAllowed, dayActions, roles } from "../../games/renmin/online/catalog.js";

const skillNames = { raid: "突袭", listen: "黑客", dawn: "破晓" };
const seatLabel = (id) => id + "号";
const visibleSeat = (view, id) => view.seats.find((seat) => seat.id === id);
const earlier = /昨[天晚夜]|前一?[天晚夜]|之前|此前|先前|上一[晚夜轮]|什么时候|何时|第\s*\d+\s*[天晚夜]/;
const directive = /请|务必|建议|提议|应该|最好|不如|要不|你(?:就|先|直接)|(?:今天|今晚|本轮)(?:就|先)?[，,]?\s*(?:用|查|跟踪|拘捕)|(?:派|由|让|安排)(?:我|[1-9]\s*号)(?:去|来|执行)?(?:跟踪|拘捕|抓捕)/;
const riskQuestion = /(?:会不会|万一|如果|假如|能不能|够不够|不够|是否|可能).{0,45}(?:高官|政法委书记|高育良|双证|[一两二12]张|证据)|(?:双证|证据|高官).{0,12}(?:够不够|不够|需要几张|要几张)/;
const skillIn = (text) => Object.keys(skillNames).find((key) => text.includes(skillNames[key])) ??
  (text.includes("监听") ? "listen" : undefined);

function mentionedAction(text) {
  const action = /(?:(拘捕|抓捕|抓)|(跟踪)|(?:情报(?:查|验)?|查|验))(?:过|了|一下)?\s*([1-9])\s*号/.exec(text);
  if (action) return { kind: action[1] ? "arrest" : action[2] ? "follow" : "intel", target: Number(action[3]) };
  const intel = /对\s*([1-9])\s*号(?:使用|用)情报/.exec(text);
  if (intel) return { kind: "intel", target: Number(intel[1]) };
  const kind = Object.keys(dayActions).find((key) => text.includes(dayActions[key].label));
  if (kind) return { kind };
  return null;
}

function readAuditIntent(view, { text: raw, actor }) {
  const text = raw.normalize("NFKC");
  const skill = skillIn(text);
  const action = mentionedAction(text);
  if (riskQuestion.test(text)) {
    const highOffice = /([1-9])\s*号.{0,6}(?:政法委书记|高官|高育良)/.exec(text);
    const target = Number(highOffice?.[1]) || action?.target || Number(/([1-9])\s*号/.exec(text)?.[1]) || undefined;
    return { type: "risk", target };
  }
  const dayAsked = Number(/第\s*(\d+)\s*[天晚夜]/.exec(text)?.[1]) || undefined;
  const current = /今天|今晚|现在|本轮/.test(text);
  if ((action || skill || /执行|结果|拍板/.test(text)) && earlier.test(text) &&
      dayAsked !== view.day && !current) {
    return { type: "outcome", kind: skill || action?.kind, target: skill ? undefined : action?.target,
      day: dayAsked ?? (/昨[天晚夜]|上一[晚夜]/.test(text) ? view.day - 1 : undefined) };
  }
  // Only positive, present-tense suggestions can alter a draft or register a skill.
  const segments = text.split(/[。！？?；;\n]|[，,](?=\s*(?:明天|后天|次日))/).filter((segment) =>
    (!earlier.test(segment) || /今天|今晚|现在|本轮/.test(segment)) &&
      !/不要|不能|不用|不会|无权|明天|后天|次日|别.{0,6}(?:跟踪|拘捕|抓|监听|突袭|情报)/.test(segment))
    .map((segment) => earlier.test(segment) ? segment.slice(segment.search(/今天|今晚|现在|本轮/)) : segment);
  const actionText = segments.find((segment) => directive.test(segment) && mentionedAction(segment)?.target);
  const proposal = actionText ? mentionedAction(actionText) : null;
  if (proposal && proposal.kind !== "intel") {
    const member = /(?:派|由|让|安排)\s*(我|[1-9]\s*号)/.exec(actionText)?.[1];
    proposal.member = member === "我" ? actor : Number(member?.[0]) || undefined;
  }
  const skillText = segments.find((segment) => skillIn(segment) && /(?:请|建议|不如|要不|务必|发动|你(?:就|先|直接)|吧)/.test(segment));
  const hold = (!earlier.test(text) || current) &&
    /(?:技能|突袭|黑客|破晓).{0,12}(?:跳过|先留着|先留|别用|暂缓)|(?:先别|不用|不要|不发动).{0,8}(?:技能|突袭|黑客|破晓)/.test(text);
  const owner = Number(/([1-9])\s*号(?:的技能|发不发动)|(?:^|请|让|由)([1-9])\s*号(?:你)?发动/.exec(text)?.slice(1).find(Boolean)) || undefined;
  const registration = hold ? { kind: "hold", skill, owner } : skillText ? {
    kind: skillIn(skillText),
    target: Number(/(?:突袭|黑客(?:监听)?|监听)\s*([1-9])\s*号/.exec(skillText)?.[1] ||
      /对\s*([1-9])\s*号.{0,4}(?:突袭|黑客|监听)/.exec(skillText)?.[1]) || undefined,
    owner,
  } : null;
  if (proposal || registration) return { type: "proposal", action: proposal, registration };
  if (skill || /技能|发不发动/.test(text)) {
    return { type: "skill", kind: skill, owner };
  }
  if (/拍板|谁决定|怎么安排|怎么行动|什么计划|现在怎么走/.test(text) ||
      action && /谁|什么|哪|[?]|吗|呢/.test(text)) return { type: "current" };
  return null;
}

export function auditIntent(view, incoming = []) {
  for (const line of [...incoming].reverse()) {
    const intent = readAuditIntent(view, line);
    if (intent) return intent;
  }
  return null;
}

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

export function reviewTactics(view, job, intent) {
  const skill = intent?.registration?.skill ?? intent?.registration?.kind;
  return job.purpose === "speech" && !job.briefed && job.priority <= 2 && intent?.type === "proposal" &&
    auditConversation(view, job.channel) && Boolean(
      intent.action && view.day > 1 && view.chief === view.self.id ||
      view.auditSkill && (skill === view.auditSkill || skill === "hold") &&
        (!intent.registration?.owner || intent.registration.owner === view.self.id));
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
  if (candidate.kind === "arrest" && !member?.onDuty || candidate.kind === "follow" &&
      (member?.status !== "active" || roles[member.role]?.faction !== "audit")) return null;
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
    decisionMaker: view.day > 1 ? view.chief ?? null : null,
    proposal: currentProposal(view, mind),
    registeredSkill: view.auditChoice,
    skills: (view.teamSkills || []).map(({ id, role, choice }) => ({ id, kind: roles[role].key, choice })),
    outcomes: view.auditHistory || [],
  };
}

function describeSkill({ view, round }, intent) {
  const skill = intent.kind ?? intent.registration?.skill ?? intent.registration?.kind;
  const owner = intent.owner ?? intent.registration?.owner;
  const entry = round.skills.find((item) => owner ? item.id === owner :
    skill && skill !== "hold" ? item.kind === skill : item.id === view.self.id);
  if (!entry) return "每张纪检技能卡由对应角色本人登记，锁卡前可以讨论。";
  const name = skillNames[entry.kind];
  const own = entry.id === view.self.id;
  const status = entry.choice === "spent" ? "已经用过" : entry.choice === "hold" ? "本轮登记了跳过" :
    entry.choice ? "本轮已登记" : "本轮还未登记";
  if (!own) return name + "由" + seatLabel(entry.id) + "本人登记。" + name + status + "。";
  const registered = round.registeredSkill;
  if (registered && registered.kind !== "hold") return "我已登记" + name +
    (registered.target ? seatLabel(registered.target) : "") + "，入夜前还可以改。";
  if (view.self.suspended) return "我现在停职，不能登记" + name + "。";
  if (registered?.kind === "hold") return "我本轮登记了跳过技能，入夜前还可以改。";
  return "我的" + name + status + "。";
}

export function describeAuditState(context, topic) {
  const { view, round } = context;
  if (!round) return "";
  const intent = context.intent ?? auditIntent(view, context.incoming) ?? {};
  const subject = topic ?? intent.type;
  if (subject === "risk") {
    const target = intent.target ? seatLabel(intent.target) : "目标";
    const planned = round.proposal?.kind === "arrest" && round.proposal.target === intent.target ? round.proposal : null;
    return "若" + target + "是政法委书记，须同一个在岗执行人持两张指向他的证据。其他座位的拘捕结果只适用于各自的案子。" +
      (planned ? "目前草案是派" + seatLabel(planned.member) + "拘捕" + target + "。稳妥做法是让同一个人继续跟踪、收齐第二张。" :
        "若手里只有一张，可让原持证人继续接收跟踪证据。") + "单次拘捕失败也有多种可能。";
  }
  if (subject === "outcome") {
    const last = round.outcomes.findLast(({ kind, day, target }) => (!intent.kind || kind === intent.kind) &&
      (!intent.target || target === intent.target) && (!intent.day || day === intent.day));
    if (last) return describeOutcome(view, last);
    return view.day === 1 ? "第一夜还未开始，首日只有个人技能登记。" : "我可见的裁判记录里没有这项行动的结果。";
  }
  if (subject === "skill" || subject === "proposal" && !intent.action && intent.registration) return describeSkill(context, intent);
  if (view.day === 1) return "首日先讨论线索，今天没有纪检常规行动。个人技能由各自登记，倒计时结束时锁定。";
  const discussion = describeAction(view, round.proposal);
  if (subject === "proposal" && intent.action) {
    const { action } = intent;
    const proposed = describeAction(view, action);
    if (round.proposal?.kind === action.kind && round.proposal.target === action.target &&
        (!action.member || round.proposal.member === action.member)) return "已把" + discussion + "记为今天的草案，等正式提交。";
    return "收到建议，" + proposed + "。" + (discussion ? "目前草案仍是" + discussion + "。" :
      round.decisionMaker === view.self.id ? "我会在拍板前核对这个方案。" :
        round.decisionMaker ? "今天由" + seatLabel(round.decisionMaker) + "拍板。" : "目前没有在岗决策者。");
  }
  if (discussion) return "今天的草案是" + discussion + "，等待正式提交。";
  if (round.decisionMaker === view.self.id) return "今天我来拍板。目标和执行人还在商量。";
  return round.decisionMaker ? "今天由" + seatLabel(round.decisionMaker) + "拍板，我可以先给建议。" : "目前没有在岗决策者。";
}

export function describeAction(view, action) {
  if (!action) return "";
  const target = seatLabel(action.target);
  if (action.kind === "intel") return "查" + target + (view.intelBasis === "behavior" ? "上一夜有无违法行为" : "上一夜结束时是否持有【违法】");
  if (action.kind === "follow") return "跟踪" + target + (action.member ? "，由" + seatLabel(action.member) + "接收证据" : "");
  return (action.member ? "派" + seatLabel(action.member) : "") + "拘捕" + target;
}

function describeOutcome(view, row) {
  if (row.type === "auditSkill") {
    const name = skillNames[row.kind];
    const target = row.target ? seatLabel(row.target) : "";
    if (row.kind === "dawn") return "第" + row.day + "天发动了破晓，第" + row.effectiveDay + "天才生效。";
    return "第" + row.day + "夜已发动" + name + (target ? "，目标是" + target : "") + "。";
  }
  const action = describeAction(view, row);
  const result = { blocked: "裁判返回未能执行，具体原因未公布", pending: "正在处理", rescued: "目标被营救", executed: "已执行" };
  const dawn = row.dawn ? "，本次拘捕由破晓生效" : "";
  const notice = row.status === "executed" && view.inbox.findLast((entry) => entry.day === row.day && entry.target === row.target &&
    (row.kind === "intel" && entry.kind === "intel" || row.kind === "follow" && row.member === view.self.id &&
      (entry.kind === "evidence" || entry.kind === "follow") && typeof entry.found === "boolean"));
  return "第" + row.day + "天提交的行动是" + action + "。" + result[row.status] + dawn + "。" + (notice ? notice.text : "");
}

export function decisionRevision(context) {
  return JSON.stringify([context.memory?.proposal ?? null, context.round ?? null, context.view.auditChoice]);
}
