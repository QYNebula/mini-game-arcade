import { auditTargetAllowed, dayActions, factions, goal, nightActions, roles, skillActions, statusLabels, timing } from "./catalog.js";
import { legacyRulings, rulebook, rulebookVersion } from "./rulebook.js";

const endpoint = location.origin;
const gameKey = "renmin";
const storageKey = "renmin-playtest-session";
const $ = (id) => document.getElementById(id);
const say = (id, text) => { $(id).textContent = text; };
const show = (id, visible) => { $(id).hidden = !visible; };
const dmKey = (a, b) => "dm:" + Math.min(a, b) + ":" + Math.max(a, b);

let session;
let room;
let socket;
let connected = false;
let offset = 0;
let channel = "public";
let matchId;
let controlsKey;
let custodyKey;
let toastTimer;
let chatExport;
const histories = new Map();
const unread = new Map();
const openedDms = new Set();

function element(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, handler, className = "") {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", handler);
  return node;
}

function notify(text) {
  say("toast", text);
  show("toast", true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => show("toast", false), 3600);
}

function store(value) {
  try { if (value) localStorage.setItem(storageKey, JSON.stringify(value)); else localStorage.removeItem(storageKey); } catch { /* Reload recovery is optional. */ }
}

function dispatch(action) {
  if (room?.match) action = { ...action, match: room.match.id, stage: room.match.stage };
  if (!socket?.send(action)) {
    notify("正在连接房间，请稍等。");
    return false;
  }
  return true;
}

function reset(message) {
  socket?.close();
  socket = null;
  room = null;
  session = null;
  connected = false;
  store(null);
  if ($("custody-dialog").open) $("custody-dialog").close();
  closeChatExport();
  show("lobby", false);
  show("game", false);
  show("leave", false);
  show("welcome", true);
  say("welcome-status", message || "一位真人也可以填满电脑后开局。");
  document.body.dataset.phase = "";
}

function receive(data) {
  if (data.type === "closed") return reset(data.message);
  if (data.type === "offline") {
    connected = false;
    if (room) render();
    return;
  }
  if (data.type === "chatExport") {
    receiveChatExport(data);
    return;
  }
  if (data.type === "chat" || data.type === "history") {
    if (data.match !== room?.match?.id) return;
    const messages = data.type === "chat" ? [data.message] : data.rows;
    const id = data.channel ?? data.message.channel;
    if (!canRead(id)) return;
    if (data.type === "chat" && id !== channel) {
      unread.set(id, (unread.get(id) || 0) + 1);
      if (id.startsWith("dm:")) openedDms.add(id);
    }
    const saved = histories.get(id) || new Map();
    for (const entry of messages) saved.set(entry.id, entry);
    histories.set(id, saved);
    if (data.type === "history" && id === channel) $("older").hidden = messages.length < 36;
    renderChannels();
    if (id === channel) renderChat(data.type === "chat" || saved.size <= messages.length);
    return;
  }
  if (data.type === "error") notify(data.message);
  if (!data.room) return;
  const resuming = !connected;
  connected = true;
  room = data.room;
  offset = room.clock - Date.now();
  const current = room.match?.id;
  const changed = matchId !== current;
  if (changed) {
    closeChatExport();
    matchId = current;
    channel = "public";
    histories.clear();
    unread.clear();
    openedDms.clear();
    controlsKey = null;
    $("message").value = "";
  }
  render();
  if (current && (changed || resuming)) requestHistory(channel);
}

function connect(data) {
  socket?.close();
  session = data;
  store(data);
  say("welcome-status", "正在连接房间 " + data.code + "…");
  socket = globalThis.arcadeRooms.connect(endpoint, gameKey, data, receive);
}

async function enter(task) {
  $("create").disabled = true;
  $("join-form").querySelector("button").disabled = true;
  say("welcome-status", "正在连接…");
  try { connect(await task()); } catch (error) { say("welcome-status", error.message); }
  finally {
    $("create").disabled = false;
    $("join-form").querySelector("button").disabled = false;
  }
}

function seatLabel(index, label, note, handler) {
  const node = button("", handler, "seat");
  const number = element("span", "seat-number", index);
  const body = element("span");
  body.append(element("span", "seat-name", label), element("span", "seat-note", note));
  node.append(number, body);
  return node;
}

function renderLobby() {
  say("lobby-title", "房间 " + room.code);
  const used = room.seats.filter(Boolean).length;
  say("lobby-count", used + " / 9");
  $("lobby-seats").replaceChildren(...room.seats.map((seat, i) => {
    const name = seat?.kind === "computer" ? "电脑" : seat?.name || "空位";
    const own = room.you === i + 1;
    let note = seat?.kind === "computer" ? "房主可移除" : seat ? seat.online ? own ? "你的座位" : "已连接" : "等待重连" :
      room.host ? "点击添加电脑" : "点击换座";
    if (!room.host && seat?.kind === "computer") note = "电脑席";
    const control = seatLabel(i + 1, name, note, () => dispatch({
      type: room.host ? "computer" : "seat", seat: i,
    }));
    control.dataset.own = own;
    control.disabled = !connected || seat?.kind === "human" || Boolean(seat && !room.host);
    return control;
  }));
  const taken = new Set(room.reservedRoles);
  $("lobby-roles").replaceChildren(...Object.entries(roles).map(([id, role]) => {
    const own = id === room.selectedRole;
    const control = button("", () => dispatch({ type: "selectRole", role: id }), "role-choice");
    control.append(element("span", "", role.character), element("small", "",
      role.name + (taken.has(id) ? own ? " · 我的选择" : " · 已占用" : "")));
    control.setAttribute("aria-pressed", String(own));
    control.disabled = !connected || taken.has(id) && !own;
    return control;
  }));
  $("random-role").disabled = !connected;
  $("random-role").setAttribute("aria-pressed", String(!room.selectedRole));
  $("fill").disabled = !connected || used === 9;
  $("start").disabled = !connected || !room.ready;
  show("fill", room.host);
  show("start", room.host);
  say("lobby-note", room.notice || (!connected ? "正在重连房间…" :
    room.host ? "点空位安排电脑，也可以复制邀请，让朋友坐进空位。" : "等待房主补齐座位并开始。"));
}

function channelName(id, match = room.match) {
  if (id === "public") return "公屏";
  if (id === "audit") return "纪检群";
  if (id === "corrupt") return "反派群";
  const other = id.split(":").slice(1).map(Number).find((seat) => seat !== match.self.id);
  return other + " 号私信";
}

function canRead(id) {
  const match = room?.match;
  if (!match) return false;
  if (id === "public") return true;
  if (!match.self.alive || match.winner) return false;
  if (id.startsWith("dm:")) return id.split(":").slice(1).map(Number).includes(match.self.id);
  return roles[match.self.role].faction === id;
}

function canChat() {
  const match = room?.match;
  if (!match || !connected || room.pausedAt || match.phase !== "day" || !match.self.alive || !canRead(channel)) return false;
  if (!channel.startsWith("dm:")) return true;
  const peer = channel.split(":").slice(1).map(Number).find((id) => id !== match.self.id);
  return match.seats.find((seat) => seat.id === peer)?.status === "active";
}

function renderChannels() {
  const match = room.match;
  const side = roles[match.self.role].faction;
  const channels = ["public", ...(side !== "middle" && canRead(side) ? [side] : []),
    ...[...openedDms].filter(canRead)];
  $("channels").replaceChildren(...channels.map((id) => {
    const count = unread.get(id) || 0;
    const item = button(channelName(id) + (count ? " · " + count : ""), () => switchChannel(id));
    item.setAttribute("aria-pressed", String(id === channel));
    return item;
  }));
}

function switchChannel(id, focus = false) {
  if (!canRead(id)) return;
  channel = id;
  if (id.startsWith("dm:")) openedDms.add(id);
  unread.delete(id);
  show("older", false);
  renderSeats(room.match);
  renderChannels();
  renderChat(true);
  renderComposer();
  show("latest-event", id === "public" && room.match.public.length > 0);
  requestHistory(id);
  if (focus && canChat()) $("message").focus();
}

function requestHistory(id, before) {
  if (connected && canRead(id)) dispatch({ type: "history", channel: id, before });
}

function renderChat(scrollDown = false) {
  const log = $("chat-log");
  const remaining = log.scrollHeight - log.scrollTop - log.clientHeight;
  const oldTop = log.scrollTop;
  const oldHeight = log.scrollHeight;
  const match = room.match;
  const saved = [...(histories.get(channel)?.values() ?? [])].sort((a, b) => a.id - b.id);
  $("chat-lines").replaceChildren(...saved.map((record) => {
    const row = element("div", "message-row");
    row.append(element("div", "message-seat", record.actor));
    const content = element("div");
    const meta = element("div", "message-meta");
    const name = match.seats[record.actor - 1]?.name || "玩家";
    meta.append(element("strong", "", name), element("span", "", "第 " + record.day + " 天"));
    content.append(meta, element("p", "message-content", record.text));
    row.append(content);
    return row;
  }));
  if (scrollDown && (remaining < 66 || oldHeight === log.clientHeight || !saved.length)) log.scrollTop = log.scrollHeight;
  else if (!scrollDown && oldTop < 55) log.scrollTop = Math.max(0, log.scrollHeight - oldHeight + oldTop);
}

function renderComposer() {
  const allowed = canChat();
  $("message").disabled = !allowed;
  $("send").disabled = !allowed;
  $("message").placeholder = allowed ? "发到" + channelName(channel) : "当前仅可查看消息";
  say("chat-hint", allowed ? (channel === "public" ? "点一个座位可以开启私信" : "发到" + channelName(channel)) : "");
}

function renderSeats(match) {
  $("game-seats").replaceChildren(...match.seats.map((seat) => {
    const own = seat.id === match.self.id;
    const role = roles[seat.role];
    const note = role?.name || "身份未明";
    const node = seatLabel(seat.id, seat.name, note, () => switchChannel(dmKey(match.self.id, seat.id), true));
    node.dataset.own = own;
    node.dataset.out = seat.status !== "active";
    if (role) node.querySelector(".seat-note").dataset.side = role.faction;
    if (seat.status !== "active") node.lastElementChild.append(element("span", "seat-status", statusLabels[seat.status]));
    if (seat.status === "active" && seat.onDuty === false) node.querySelector(".seat-note").textContent += " · 停职";
    node.disabled = own || !match.self.alive || match.winner || seat.status !== "active" || match.phase !== "day";
    node.setAttribute("aria-pressed", String(!own && channel === dmKey(match.self.id, seat.id)));
    return node;
  }));
}

function card(label, detail, className, description) {
  const control = button("", () => notify(description), "card " + className);
  control.append(element("strong", "", label), element("span", "", detail));
  return control;
}

function renderIdentity(match) {
  const self = match.self;
  const role = roles[self.role];
  $("identity").dataset.side = role.faction;
  say("role-mark", role.mark);
  say("role-name", role.character);
  const allegiance = self.allegiance === "neutral" ? "未站队" : "随" + factions[self.allegiance] + "结算";
  say("role-side", role.name + " · " + factions[role.faction] + (role.faction === "middle" ? " · " + allegiance : "") +
    (self.money !== null ? " · " + self.money.toLocaleString("en-US") + " 万" : ""));
  say("role-detail", role.detail);
  const cards = [];
  if (self.illegal) {
    const detail = self.suspended ? "停职至第 " + self.suspendedThrough + " 晚" : "状态牌";
    cards.push(card("违法", detail, "illegal", self.suspended ? detail + "结束。" : "你目前带有【违法】。"));
  }
  const groups = new Map();
  for (const item of match.cards) {
    if (!groups.has(item.target)) groups.set(item.target, []);
    groups.get(item.target).push(item);
  }
  for (const [target, group] of groups) {
    const name = match.seats[target - 1].name;
    cards.push(card("证据 · " + target + "号" + (group.length > 1 ? " ×" + group.length : ""),
      self.suspended ? "暂停使用" : name, "evidence" + (self.suspended ? " inactive" : ""),
      target + "号 " + name + " · " + group.map((item) => "第" + item.day + "天 " + item.source).join("、")));
  }
  if (self.role === "judge" && !self.used && self.alive) cards.push(card("保护伞", "夜间安置", "umbrella", role.detail));
  if (!cards.length) cards.push(element("p", "muted", "判定区为空"));
  $("cards").replaceChildren(...cards);
  const list = match.inbox.slice().reverse().map((message) => notice(message));
  $("private-notices").replaceChildren(...list);
  say("notice-count", list.length ? String(list.length) + " 条" : "");
  if (match.inbox.at(-1)?.kind === "warning") $("notices").open = true;
}

function notice(event) {
  const line = element("p", "notice");
  line.append(element("small", "", "第" + event.day + "天"), document.createTextNode(event.text));
  return line;
}

function labelForSeat(seat) {
  return seat.id + " 号 " + seat.name + (seat.role ? " · " + roles[seat.role].name : "");
}

function setOptions(select, options, value = select.value) {
  select.replaceChildren(...options.map(([id, name]) => {
    const option = element("option", "", name);
    option.value = id;
    return option;
  }));
  if (options.some(([id]) => String(id) === String(value))) select.value = value;
}

function pickField(label, options, value) {
  const select = element("select");
  setOptions(select, options, value);
  const wrapper = element("label", "", label);
  wrapper.append(select);
  return { wrapper, select };
}

function group(title, text) {
  const section = element("section", "action-group");
  section.append(element("h3", "", title));
  if (text) section.append(element("p", "muted", text));
  return section;
}

function formFor(section, fields, label, submit) {
  const form = element("form", "action-fields");
  const primary = element("button", "primary", label);
  primary.type = "submit";
  form.append(...fields, primary);
  form.addEventListener("submit", (event) => { event.preventDefault(); submit(); });
  section.append(form);
}

function auditControls(match, targets) {
  const selfRole = roles[match.self.role];
  if (!match.auditSkill) return null;
  const section = group(selfRole.skill, match.auditChoice ?
    "已登记" + (match.auditChoice.kind === "hold" ? "跳过。" : "发动，白天锁定前可以修改。") : "白天登记，随纪检行动一起锁定。");
  const kind = pickField("是否发动", [["hold", "本日跳过"], [match.auditSkill, "发动 " + selfRole.skill]], match.auditChoice?.kind);
  const target = pickField("目标", targets.filter((seat) => auditTargetAllowed(match.auditSkill, seat)).map((seat) =>
    [seat.id, labelForSeat(seat)]), match.auditChoice?.target);
  const update = () => { target.wrapper.hidden = !selfRole.target || kind.select.value === "hold"; };
  kind.select.addEventListener("change", update);
  update();
  formFor(section, [kind.wrapper, target.wrapper], "保存技能选择", () => dispatch({
    type: "auditSkill", kind: kind.select.value, target: Number(target.select.value) || undefined,
  }));
  return section;
}

function dayControls(match, targets) {
  const section = group("纪检常规行动", "确认后占用当日次数，行动处理完即入夜。");
  const kind = pickField("行动", Object.entries(dayActions).map(([id, action]) => [id, action.label + " · " + action.time]));
  const target = pickField("目标", []);
  const members = targets.filter((seat) => roles[seat.role]?.faction === "audit");
  const member = pickField("纪检成员", members.map((seat) => [seat.id, labelForSeat(seat)]), match.self.id);
  const update = () => {
    setOptions(target.select, targets.filter((seat) => auditTargetAllowed(kind.select.value, seat))
      .map((seat) => [seat.id, labelForSeat(seat)]));
    member.wrapper.hidden = kind.select.value === "intel";
    member.wrapper.firstChild.textContent = kind.select.value === "arrest" ? "指派执行拘捕" : "指定证据接收人";
  };
  kind.select.addEventListener("change", update);
  update();
  formFor(section, [kind.wrapper, target.wrapper, member.wrapper], "提交当天行动", () => dispatch({
    type: "dayAction", kind: kind.select.value, target: Number(target.select.value), member: Number(member.select.value),
  }));
  return section;
}

function nightControls(match, targets) {
  const prelude = match.phase === "prelude";
  const choices = prelude ? match.prelude : match.night;
  const source = prelude ? skillActions : nightActions;
  if (!choices.length) return null;
  const section = group(prelude ? "夜间前置技能" : "夜间常规行动", prelude ? "在窗口内选择技能，或跳过。" :
    "每晚选一项。全员提交后开始结算。");
  const label = (id) => source[id].label + (prelude || id === "hold" ? "" :
    " · " + (match.freeAction ? "免费" : source[id].cost + " 万"));
  const kind = pickField("选择", choices.map((id) => [id, label(id)]), "hold");
  const target = pickField("目标", targets.filter((seat) => prelude || seat.id !== match.self.id).map((seat) =>
    [seat.id, labelForSeat(seat)]));
  const toggle = element("label", "checkbox");
  const deliver = element("input");
  deliver.type = "checkbox";
  deliver.checked = true;
  toggle.append(deliver, document.createTextNode("天亮时交给纪检"));
  const update = () => {
    target.wrapper.hidden = !source[kind.select.value].target;
    toggle.hidden = kind.select.value !== "survey";
  };
  kind.select.addEventListener("change", update);
  update();
  formFor(section, [kind.wrapper, target.wrapper, toggle], "确认", () => dispatch({
    type: prelude ? "prelude" : "night", kind: kind.select.value, target: Number(target.select.value) || undefined,
    deliver: kind.select.value === "survey" && deliver.checked,
  }));
  return section;
}

function renderActions(match, unlocked) {
  const key = [match.id, match.stage, unlocked, room.pausedAt, connected, match.self.alive, match.chief, match.auditSkill,
    JSON.stringify(match.auditChoice), JSON.stringify(match.teamSkills), match.prelude.join(), match.night.join(),
    match.preludeChoice?.kind, match.nightChoice?.kind].join("|");
  if (controlsKey === key) return;
  controlsKey = key;
  const actions = $("actions");
  actions.replaceChildren();
  const targets = match.seats.filter((seat) => seat.status === "active");
  if (!match.self.alive || match.winner || room.pausedAt || !connected) {
    actions.append(element("p", "muted", room.pausedAt || !connected ? "等待重连。" : match.winner ? "本局已结算。" : "你正在观战。"));
    return;
  }
  if (match.phase === "day") {
    if (match.teamSkills.length) {
      const summary = group("纪检技能");
      const list = element("div", "skills-notes");
      for (const current of match.teamSkills) {
        const role = roles[current.role];
        list.append(element("p", "muted", role.skill + " · " + (current.choice === "spent" ? "已用" :
          current.choice === "hold" ? "跳过" : current.choice ? "已登记" : "待选择")));
      }
      summary.append(list);
      actions.append(summary);
    }
    const skill = auditControls(match, targets);
    if (skill) actions.append(skill);
    if (match.day > 1 && match.chief === match.self.id && unlocked) actions.append(dayControls(match, targets));
    else actions.append(element("p", "muted", match.day === 1 ? "首日自由讨论，倒计时结束后自动入夜。" :
      match.chief === match.self.id ? "讨论倒计时结束后开放拍板。" : "纪检拍板并处理行动后入夜。"));
  } else if (match.phase === "prelude" || match.phase === "night") {
    const controls = nightControls(match, targets);
    if (controls) actions.append(controls);
    else actions.append(element("p", "muted", match.preludeChoice && match.phase === "prelude" ||
      match.nightChoice && match.phase === "night" ? "选择已提交，等本阶段结算。" : "当前阶段等待结算。"));
  } else actions.append(element("p", "muted", "等待系统处理。"));
}

function clockText(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

function renderClock() {
  const match = room?.match;
  if (!match) return;
  const time = room.pausedAt || Date.now() + offset;
  const remaining = match.until - time;
  const unlocked = match.phase === "day" && remaining <= 0;
  const phaseNames = { day: "白天讨论", prelude: "夜间技能", night: "夜间行动", detention: "拘捕调查", ended: "对局结算" };
  say("round-phase", unlocked && match.day > 1 ? "等待纪检拍板" : phaseNames[match.phase]);
  say("clock", match.until ? unlocked && match.day > 1 ? "可提交" : clockText(remaining) : "已结束");
  const extend = $("extend-discussion");
  extend.hidden = match.phase !== "day" || !match.self.alive || unlocked;
  extend.disabled = !match.canExtend || !connected || Boolean(room.pausedAt);
  const extensionLabel = match.canExtend ? "＋1 分钟" : "已加时";
  if (extend.textContent !== extensionLabel) extend.textContent = extensionLabel;
  if (match.detention) $("custody-progress").value = Math.max(0, timing.rescue - remaining);
  if (room.pausedAt || !connected) {
    const timeLeft = room.pauseUntil ? "，剩余 " + clockText(room.pauseUntil - Date.now() - offset) : "";
    say("pause-note", connected ? "等在场玩家重连" + timeLeft + "。" : "连接中断，正在重连。");
  }
  renderActions(match, unlocked);
}

function renderCustody(match) {
  const dialog = $("custody-dialog");
  if (!match.detention) {
    if (dialog.open) dialog.close();
    custodyKey = null;
    return;
  }
  const { target, canRescue, answered } = match.detention;
  const key = [match.stage, target, canRescue, answered, room.pausedAt, connected].join(",");
  if (key === custodyKey) return;
  custodyKey = key;
  say("custody-title", target + " 号 " + match.seats[target - 1].name + "被带走调查");
  say("custody-note", canRescue ? answered ? "选择已提交，等待公布结果。" :
    "你可以发动「营救」。发动会公开你的身份。" : "调查正在进行，稍后公布结果。");
  $("custody-actions").replaceChildren();
  if (canRescue && !answered && connected && !room.pausedAt) $("custody-actions").append(
    button("发动营救", () => dispatch({ type: "rescue", use: true }), "primary"),
    button("放弃", () => dispatch({ type: "rescue", use: false })),
  );
  if (!dialog.open) dialog.showModal();
}

function renderWinner(match) {
  show("winner", Boolean(match.winner));
  if (!match.winner) return;
  const result = match.self.allegiance === "neutral" ? "你到终局仍未站队，个人落败。" :
    "你的结果是" + (match.self.won ? "胜利。" : "落败。");
  $("winner").replaceChildren(element("h2", "", factions[match.winner.side] + "获胜"),
    element("p", "", match.winner.reason + " " + result));
  if (match.usage) {
    const usage = match.usage;
    const response = usage.calls ? " · 平均 " + (usage.elapsed / usage.calls / 1000).toFixed(1) + " 秒" : "";
    $("winner").append(element("p", "muted", "百炼 " + usage.calls + " / " + usage.limit + " 次 · 输入 " + usage.input +
      " · 输出 " + usage.output + " · 缓存 " + usage.cached + " · 规则电脑 " + usage.fallback + " 次" + response));
    if (usage.lastError) $("winner").append(element("p", "muted", "最近一次模型问题 · " + usage.lastError));
  }
  const actions = element("div", "winner-actions");
  if (room.host) actions.append(button("返回房间", () => dispatch({ type: "restart" }), "primary"));
  actions.append(button("复制本席可见聊天", openChatExport));
  $("winner").append(actions);
}

function closeChatExport() {
  chatExport = undefined;
  if ($("chat-export-dialog").open) $("chat-export-dialog").close();
}

function requestChatExport() {
  if (!dispatch({ type: "exportChat", offset: chatExport.offset })) {
    say("chat-export-status", "连接恢复后可以关闭窗口重试。");
  }
}

function openChatExport() {
  chatExport = { match: room.match.id, offset: 0, lines: [] };
  $("chat-export-text").value = "";
  $("chat-export-copy").disabled = true;
  $("chat-export-download").disabled = true;
  say("chat-export-status", "正在读取聊天记录…");
  $("chat-export-dialog").showModal();
  requestChatExport();
}

function receiveChatExport(data) {
  if (!chatExport || data.match !== chatExport.match || data.offset !== chatExport.offset) return;
  for (const row of data.rows) {
    const name = room.match.seats[row.actor - 1]?.name || "玩家" + row.actor;
    chatExport.lines.push("第 " + row.day + " 天 · " + channelName(row.channel) +
      " · " + row.actor + " 号 " + name + "\n" + row.text);
  }
  chatExport.offset = data.next;
  if (data.next !== null) return requestChatExport();
  $("chat-export-text").value = "《人民的名义》 · 房间 " + room.code + " · " + room.match.self.id + " 号可见聊天\n\n" +
    (chatExport.lines.join("\n\n") || "本局没有聊天记录。");
  say("chat-export-status", "共 " + chatExport.lines.length + " 条消息。");
  $("chat-export-copy").disabled = false;
  $("chat-export-download").disabled = false;
}

function render() {
  show("leave", true);
  show("welcome", false);
  show("lobby", room.phase === "lobby");
  show("game", Boolean(room.match));
  if (room.phase === "lobby") {
    document.body.dataset.phase = "";
    if ($("custody-dialog").open) $("custody-dialog").close();
    renderLobby();
    return;
  }
  const match = room.match;
  if (!canRead(channel)) channel = "public";
  document.body.dataset.phase = match.phase;
  say("round-day", "第 " + match.day + " 天");
  say("room-label", "房间 " + room.code + (room.ai ? "" : " · 规则电脑"));
  show("pause-note", room.pausedAt || !connected);
  renderSeats(match);
  renderChannels();
  renderComposer();
  renderChat();
  renderIdentity(match);
  renderWinner(match);
  renderCustody(match);
  renderClock();
  const latest = match.public.at(-1);
  show("latest-event", Boolean(latest) && channel === "public");
  if (latest) say("latest-event", latest.text);
}

$("create").addEventListener("click", () => enter(() => globalThis.arcadeRooms.create(endpoint, gameKey)));
$("join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const code = globalThis.arcadeRooms.normalizeCode($("join-code").value);
  if (!code) return say("welcome-status", "请输入六位房间码。");
  enter(() => globalThis.arcadeRooms.join(endpoint, gameKey, code));
});
$("fill").addEventListener("click", () => dispatch({ type: "fill" }));
$("start").addEventListener("click", () => dispatch({ type: "start" }));
$("random-role").addEventListener("click", () => dispatch({ type: "selectRole", role: null }));
$("extend-discussion").addEventListener("click", () => dispatch({ type: "extendDiscussion" }));
$("leave").addEventListener("click", () => {
  const dialog = $("leave-dialog");
  dialog.returnValue = "";
  dialog.showModal();
});
$("leave-dialog").addEventListener("close", () => {
  if ($("leave-dialog").returnValue === "leave" && !dispatch({ type: "leave" })) reset();
});
$("copy-invite").addEventListener("click", async () => {
  const address = new URL(location.pathname, endpoint);
  address.searchParams.set("room", room.code);
  try { await navigator.clipboard.writeText(address.href); notify("邀请链接已复制。"); }
  catch { notify("分享房间码 " + room.code + " 即可加入。"); }
});
$("chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("message").value.trim();
  if (!text || !canChat()) return;
  if (dispatch({ type: "chat", channel, text })) $("message").value = "";
});
$("older").addEventListener("click", () => {
  const saved = histories.get(channel);
  if (saved?.size) requestHistory(channel, Math.min(...saved.keys()));
});
$("jump-action").addEventListener("click", () => {
  $("action-panel").scrollIntoView({ behavior: "smooth" });
  $("action-panel").focus({ preventScroll: true });
});
$("open-events").addEventListener("click", () => {
  $("events").replaceChildren(...(room?.match?.public.toReversed() ?? []).map(notice));
  $("events-dialog").showModal();
});
$("custody-dialog").addEventListener("cancel", (event) => event.preventDefault());
$("chat-export-dialog").addEventListener("close", () => { chatExport = undefined; });
$("chat-export-copy").addEventListener("click", async () => {
  const field = $("chat-export-text");
  try {
    await navigator.clipboard.writeText(field.value);
    say("chat-export-status", "已复制聊天记录。");
  } catch {
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);
    say("chat-export-status", "文字已选中，可以使用设备的复制操作。");
  }
});
$("chat-export-download").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([$("chat-export-text").value], { type: "text/plain;charset=utf-8" }));
  const link = element("a");
  link.href = url;
  link.download = "人民的名义-" + room.code + "-聊天记录.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function ruleText() {
  const once = [
    ["开局与讨论", "真人先到先得选角色。九席填满后由房主开局，其余座位随机发牌。纪检和反派各自认识开局队友。首日讨论从两分钟起算，结束后自动入夜。之后从五分钟起算，到点局长可拍板或继续讨论。每位在场真人每天可在倒计时结束前为全体加时一分钟。局长离场或停职时依次由侦查处长、省委书记代理。无人能拍板时倒计时结束自动入夜。"],
    ["发言与证据", "白天可发公屏、阵营群和私信，夜里只读。点其他玩家的座位即可私信。证据只指向一人，放在持有人判定区。高官需同一位在岗执行人本人持有两张。"],
    ["白天行动", (room?.match?.intelBasis === "behavior" ? "本局按开局规则查询上一夜实际违法行为。纪检被栽赃后会在停职期间显示临时牌。" :
      dayActions.intel.detail + "纪检被栽赃只会停职。") + "拘捕、跟踪和突袭只可选择在场的非纪检玩家。拘捕指定执行人，跟踪指定取证人并封锁当晚口岸。黑客可监听纪检，并查当夜实际发生的行为。提交常规行动即用掉当天次数。纪检技能随提交或自动入夜锁定，未选择按跳过。"],
    ["夜间结算", "先到账，再执行突袭、黑客。反派和中间人有三十秒选技能，反派有九十秒选常规行动。先判栽赃，再统一结算除掉，最后判出逃。栽赃三百万，除掉五百万，出逃三百万。"],
    ["胜利条件", "场上无纪检以外带违法的待拘捕对象时，纪检方获胜。反派成功出逃的实带资产累计 " +
      goal.toLocaleString("en-US") + " 万，或纪检全员身亡，即获胜。"],
    ["中间人站队", "中间人开局未站队。向纪检安置保护伞或实际移交证据后随纪检结算。被栽赃只获得【违法】和被拘捕的风险。本人主动违法后永久随反派结算。被拘捕离场后，个人结果照站队结算。未站队到终局，个人落败。站队情况只给本人看。"],
  ];
  $("rules-content").replaceChildren(...[...once, ...Object.values(roles).map((role) =>
    [role.character + " · " + role.name + " · " + role.skill, role.detail])]
    .flatMap(([title, detail]) => [element("h3", "", title), element("p", "", detail)]));
}

function rulebookParagraphs(rules) {
  return rules.map(([title, detail]) => {
    const paragraph = element("p");
    paragraph.append(element("strong", "", title), "　" + detail);
    return paragraph;
  });
}

function rulebookLink(label, heading) {
  const link = element("a", "", label);
  link.href = "#" + heading.id;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "start" });
  });
  return link;
}

function renderRulebook() {
  const version = $("rulebook-version");
  version.dateTime = rulebookVersion;
  version.textContent = rulebookVersion;
  $("rulebook-legacy").append(element("h4", "", "本局沿用开局时的规则"), ...rulebookParagraphs(legacyRulings));
  const directory = $("rulebook-directory-title");
  for (const [key, chapter] of Object.entries(rulebook)) {
    const heading = element("h4", "", chapter.title);
    heading.id = "rulebook-" + key;
    heading.tabIndex = -1;
    const item = element("li");
    item.append(rulebookLink(chapter.title, heading));
    $("rulebook-links").append(item);

    const section = element("section", "rulebook-chapter");
    const back = rulebookLink("回到目录", directory);
    back.className = "rulebook-return";
    section.append(heading, ...rulebookParagraphs(chapter.rules), back);
    $("rulebook-chapters").append(section);
  }
}

function showRules(full) {
  if (full && !$("rulebook-chapters").firstChild) renderRulebook();
  show("rules-content", !full);
  show("rulebook", full);
  show("rulebook-legacy", room?.match?.intelBasis === "behavior");
  $("rules-quick").setAttribute("aria-pressed", String(!full));
  $("rules-full").setAttribute("aria-pressed", String(full));
  $("rules-scroll").scrollTop = 0;
}

$("rules-quick").addEventListener("click", () => showRules(false));
$("rules-full").addEventListener("click", () => showRules(true));
$("open-rules").addEventListener("click", () => {
  ruleText();
  showRules(false);
  $("rules-dialog").showModal();
});

const invite = globalThis.arcadeRooms.normalizeCode(new URL(location.href).searchParams.get("room"));
if (invite) $("join-code").value = invite;
let saved;
try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch { /* No saved seat. */ }
if (saved?.token && globalThis.arcadeRooms.normalizeCode(saved.code) && (!invite || invite === saved.code)) connect(saved);
setInterval(renderClock, 250);
