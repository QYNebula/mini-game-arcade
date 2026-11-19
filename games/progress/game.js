(() => {
  const id = "progress-v3";
  const priorId = "progress-v2";
  const version = 3;
  const R = ProgressRules;
  const C = ProgressContent;
  const E = ProgressCareer;
  const Q = ProgressExam;
  const byId = (key) => document.getElementById(key);
  const text = (key, value) => { byId(key).textContent = value; };
  const tabs = [...document.querySelectorAll("[data-view]")];
  const fresh = new URLSearchParams(location.search).get("mode") === "new";
  const legacy = arcadeSaves.read("progress");
  let replaceMode = fresh;
  let state = null;
  let exam = null;
  let view = "desk";
  let confirmation = null;
  let revealItem = null;
  let revealed = false;
  let timers = [];

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }

  function button(label, action, { style = "secondary", disabled = false } = {}) {
    const node = element("button", "button " + style, label);
    node.type = "button";
    node.disabled = disabled;
    node.addEventListener("click", action);
    return node;
  }

  function datum(label, value) {
    const row = element("div");
    const detail = element("dd");
    detail.append(value);
    row.append(element("dt", "", label), detail);
    return row;
  }

  function source(key) {
    const [label, href] = R.sources[key];
    const link = element("a", "source", label);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  function save() {
    const summary = state ? (state.outcome?.title || R.half(state.month) + " · " + E.title(state)) : "模拟招考 · " + (exam.done ? "待报到" : "答题中");
    const data = state ? { phase: "career", data: state } : { phase: "exam", data: exam };
    const success = arcadeSaves.write(id, { version, summary, state: data });
    const saved = byId("saved");
    saved.hidden = false;
    saved.classList.toggle("alert", !success);
    saved.textContent = success ? "本机已存档" : "存档未写入";
    if (success && replaceMode) {
      const url = new URL(location.href);
      url.searchParams.delete("mode");
      try { history.replaceState(null, "", url); } catch { return; }
      replaceMode = false;
    }
  }

  function panel(key) {
    for (const name of ["intake", "exam", "assignment", "career", "ending"]) byId(name).hidden = name !== key;
  }

  function showIntake() {
    state = null;
    exam = null;
    panel("intake");
    byId("saved").hidden = true;
    if (legacy) byId("legacy-download").hidden = false;
    window.scrollTo(0, 0);
  }

  function profileValid(p) {
    return p && typeof p.name === "string" && Object.hasOwn(R.degrees, p.degree) &&
      Object.hasOwn(C.channels, p.channel) && ["male", "female"].includes(p.gender) && typeof p.member === "boolean";
  }

  function examValid(draft) {
    return draft && profileValid(draft.profile) && Number.isSafeInteger(draft.seed) && Q.valid(draft.questions) &&
      Array.isArray(draft.answers) && draft.answers.length === 7 && draft.answers.every((n) => n === null || Number.isInteger(n) && n >= 0 && n < 4) &&
      Number.isInteger(draft.position) && draft.position >= 0 && draft.position < 7 &&
      (!draft.done || Q.grade(draft.questions, draft.answers));
  }

  function renderExam(focus = false) {
    panel("exam");
    const q = Q.display(exam.questions[exam.position]);
    text("exam-kind", q.kind);
    text("exam-count", (exam.position + 1) + " / " + exam.questions.length);
    text("question", q.prompt);
    byId("exam-meter").value = exam.position + 1;
    byId("previous").disabled = !exam.position;
    byId("next").disabled = exam.answers[exam.position] === null;
    text("next", exam.position === exam.questions.length - 1 ? "提交并分配岗位" : "下一题");
    byId("answers").replaceChildren(...q.options.map((option, index) => {
      const choice = element("button", "answer", option);
      choice.type = "button";
      choice.setAttribute("aria-pressed", String(exam.answers[exam.position] === index));
      choice.addEventListener("click", () => {
        exam.answers[exam.position] = index;
        save();
        byId("next").disabled = false;
        for (const [i, optionButton] of [...byId("answers").children].entries()) optionButton.setAttribute("aria-pressed", String(i === index));
      });
      return choice;
    }));
    if (focus) byId("question").focus({ preventScroll: true });
  }

  function renderAssignment() {
    panel("assignment");
    const grade = Q.grade(exam.questions, exam.answers);
    const allocation = C.allocation(exam.profile, grade.score, exam.seed);
    const p = exam.profile;
    text("assigned-title", allocation.post.title);
    text("assigned-band", C.channels[p.channel] + " · " + allocation.band);
    text("exam-score", grade.score + " 分");
    text("assign-detail", p.channel === "rural" ? "报到后到村任职两年，期满回到录用单位。" :
      p.channel === "targeted" ? "先在录用单位试用一年，再到基层锻炼两年。" : "按录用单位报到，试用期满考核合格后定级。");
    byId("assign-facts").replaceChildren(datum("学历", R.degrees[p.degree].label), datum("试用期", "1 年"),
      datum("期满拟定职级", R.ranks[R.degrees[p.degree].rank]));
    byId("exam-marked").replaceChildren(...grade.marked.map((result, index) => {
      const line = element("li");
      line.append(element("time", "", (index + 1) + " · " + result.kind + " · " + result.points + " / " + result.max + " 分"),
        element("strong", "", result.prompt), element("p", "", "你的选择 · " + result.selected),
        element("p", "", "参考答案 · " + result.best), element("p", "", result.explanation));
      return line;
    }));
    window.scrollTo(0, 0);
  }

  function doAction(action, scroll = false) {
    if (!state) return;
    const previous = E.currentEvent(state)?.kind;
    const previousLog = state.log.at(-1);
    if (!action()) return;
    save();
    const last = state.log.at(-1);
    if (last && last !== previousLog) text("announcement", last.title + "。" + last.detail);
    render();
    const current = E.currentEvent(state)?.kind;
    if (state.outcome) window.scrollTo(0, 0);
    else if (current && current !== previous && !state.reveals.length && view === "desk") {
      byId("event").scrollIntoView({ block: "nearest" });
      byId("event").querySelector("h2").focus({ preventScroll: true });
    } else if (scroll) window.scrollTo(0, 0);
  }

  function activate(next) {
    view = next;
    render();
    window.scrollTo(0, 0);
  }

  const percent = (value) => Number(value.toFixed(1)) + "%";
  const signed = (value) => (value > 0 ? "+" : "−") + Math.abs(value);

  function qualification(review) {
    if (!review.wanted) return "暂无方向";
    if (!review.qualified) return "资格未满足";
    if (state.health < 20) return "病休 · 暂缓任用";
    return review.next === null ? "到龄前暂无窗口" : "已满足资格";
  }

  function bannerStat(label, value, detail = "") {
    const row = element("div", "banner-stat");
    row.append(element("span", "", label), element("strong", "", value));
    if (detail) row.append(element("small", "", detail));
    return row;
  }

  function renderBanner() {
    const [unit, duty] = E.title(state).split(" · ");
    text("current-period", R.date(state.month) + " · " + (state.central ? "中央" : state.post.location));
    text("current-title", duty || unit);
    text("current-profile", (duty ? unit + " · " : "") + state.name + " · " +
      (state.formal ? R.ranks[state.rank] : "新录用试用期") + " · " + E.age(state) + " 岁");
    const review = E.assessTarget(state);
    byId("banner-stats").replaceChildren(
      bannerStat("参考胜算", percent(review.probability), state.goal === "stay" ? "留任 · 暂不参评" : qualification(review)),
      bannerStat("永久危险", E.danger(state) + "%"), bannerStat("健康 · " + E.healthStatus(state), state.health + " / 100"));
  }

  function arrange(action) {
    const apply = () => doAction(action, true);
    if (state.plan) confirm("改排在办事项？", "已到账的成果继续计入履历。在办事项将按新安排推进。", apply);
    else apply();
  }

  function renderAgenda() {
    const plan = E.planInfo(state);
    const heading = element("h2", "", plan?.title || (state.health < 20 ? "请先安排病休" : "继续履职"));
    heading.id = "agenda-title";
    const status = byId("plan-status");
    status.replaceChildren(heading);
    if (plan) {
      const date = plan.due <= state.month ? plan.label + "待处理" : plan.label + " · " + R.date(plan.due);
      status.append(element("p", "", date + (plan.end && plan.end !== plan.due ? " · 计划至 " + R.date(plan.end) : "")));
      const until = plan.end ?? plan.due;
      if (until > plan.from) {
        const meter = element("progress", "meter");
        meter.setAttribute("aria-label", "当前安排进度");
        meter.max = until - plan.from;
        meter.value = state.month - plan.from;
        status.append(meter);
      }
    } else {
      status.append(element("p", "", state.health < 20 ? "病休每月恢复 10 点健康。" : "可排一项工作，或直接推进。一次最多推进两年。"));
    }
    const advance = byId("advance");
    advance.disabled = !E.canAdvance(state);
    byId("cancel-plan").hidden = !plan || !E.canArrange(state);
  }

  function effectLine(option, project = false) {
    const when = option.months ? (project ? R.date(state.month + option.months) + " 交付" : R.duration(option.months)) : "当场处理";
    const tags = [when];
    for (const [key, label] of [...Object.entries(C.categories).filter(([key]) => key !== "rest"), ["health", "健康"]]) {
      if (option.effect[key]) tags.push(label + " " + signed(option.effect[key]));
    }
    if (project && option.effect.health < -15) tags.push("健康至少 60");
    return element("span", "effect-line", tags.join(" · "));
  }

  function choiceButton(option, index, event) {
    const control = element("button", "choice");
    control.type = "button";
    control.disabled = !E.allowed(state, option);
    control.append(element("strong", "", option.title), effectLine(option, event.kind === "project"));
    if (option.note) control.append(element("span", "effect-line", option.note));
    control.addEventListener("click", () => doAction(() => E.chooseEvent(state, index)));
    return control;
  }

  function renderEvent() {
    const root = byId("event");
    const event = E.currentEvent(state);
    root.hidden = !event;
    if (!event) return;
    const options = element("div", "choices");
    const review = event.kind === "review";
    const label = review ? "任用前" : event.kind === "project" ? "项目取舍" : "到期待办";
    const heading = element("h2", "", review ? event.offer.title : event.title);
    heading.tabIndex = -1;
    if (review) {
      const current = E.assessTarget(state);
      const offer = event.offer;
      const effects = element("p", "danger-effect", percent(current.probability) + " → " + percent(current.probability + offer.bonus) +
        " · 永久危险 +" + offer.risk + " 个百分点");
      const actions = element("div", "actions spread");
      actions.append(button("拒绝，进入结算", () => doAction(() => E.resolveReview(state, false))),
        button("接受交换", () => doAction(() => E.resolveReview(state, true)), { style: "primary" }));
      options.append(effects, actions);
    } else {
      options.append(...event.options.map((option, index) => choiceButton(option, index, event)));
      if (event.kind === "project") options.append(button("移交项目", () =>
        confirm("移交这个项目？", "前期工作将一并交接，当前安排结束。", () => doAction(() => E.cancelPlan(state)))));
    }
    root.replaceChildren(element("p", "overline", R.date(event.month) + " · " + label), heading,
      element("p", "muted", review ? event.offer.body : event.body));
    if (event.kind === "project" && state.goal !== "stay") {
      const current = E.assessTarget(state);
      root.append(element("p", "fine", nextDate(current.next) + " · " + qualification(current)));
    }
    root.append(options);
  }

  function card(title, body, detail, action) {
    const root = element("article", "task");
    const copy = element("div");
    copy.append(element("h3", "", title), element("p", "muted", body), element("p", "fine task-detail", detail));
    root.append(copy, action);
    return root;
  }

  function renderRoutine() {
    const selector = byId("routine-duration");
    const months = Number(selector.value);
    if (!E.durations.includes(months)) return;
    const blocked = !E.canArrange(state);
    selector.disabled = blocked;
    byId("routine-list").replaceChildren(...Object.entries(C.routine).map(([key, routine]) => {
      const gain = E.routineYield(state, key, months);
      const detail = state.score[key] >= C.limits[key] ? "已达上限" :
        gain ? "每半年 +" + E.routineGain + " · 预计 +" + gain : "当前可用时间不足半年";
      const control = button("安排" + C.categories[key], () => arrange(() => E.startRoutine(state, key, months)),
        { disabled: blocked || !gain });
      const item = element("article", "routine-card");
      item.append(element("h3", "", routine.title), element("p", "fine", routine.body), element("p", "routine-yield", detail), control);
      return item;
    }));
  }

  function renderRest() {
    const duration = element("select");
    const label = element("label", "duration", "休养时长");
    const atMost = E.retirement(state).month - state.month;
    const first = state.health < 20 ? Math.ceil((20 - state.health) / 10) : 3;
    const lengths = [...new Set([first, 6, 12].map((length) => Math.min(length, atMost)))].filter((length) => length > 0);
    for (const length of lengths) {
      const option = element("option", "", R.duration(length));
      option.value = String(length);
      duration.append(option);
    }
    label.append(duration);
    const blocked = !E.canArrange(state) || !lengths.length;
    duration.disabled = blocked;
    byId("rest-controls").replaceChildren(element("p", "fine", "休养每月恢复 10 点健康。赶工要求健康达到 60。"), label,
      button(state.health < 20 ? "安排病休" : "安排休养", () => arrange(() => E.startRest(state, Number(duration.value))), { disabled: blocked }));
  }

  function renderPlans() {
    renderRoutine();
    renderRest();
    const blocked = !E.canArrange(state);
    const projects = E.projects(state);
    byId("projects").replaceChildren(...(projects.length ? projects.map((project) => card(project.title, project.body,
      "6 个月后定方案 · 最快 9 个月交付", button("安排项目", () => arrange(() => E.startProject(state, project.id)),
        { disabled: blocked || E.workTime(state) < 9 }))) : [element("p", "fine", "本岗重点项目已办结，可继续安排常驻工作。")]));
    byId("services").replaceChildren(...E.services(state).map((item) => card(item.title, item.body, R.duration(item.option.months),
      button("安排", () => arrange(() => E.startService(state, item.id)),
        { disabled: blocked || E.workTime(state) < item.option.months }))));
  }

  function scoreMeter(label, value, max) {
    const row = element("div", "score-row");
    const title = element("div", "section-top");
    title.append(element("strong", "", label), element("small", "", value + " / " + max));
    const meter = element("progress", "meter");
    meter.value = value;
    meter.max = max;
    meter.setAttribute("aria-label", label);
    row.append(title, meter);
    return row;
  }

  function notice(title, detail) {
    const row = element("div", "notice");
    row.append(element("strong", "", title), element("p", "", detail));
    return row;
  }

  function timeline(id, entries) {
    byId(id).replaceChildren(...entries.map((entry) => {
      const li = element("li", entry.kind || "");
      li.append(element("time", "", R.date(entry.month)), element("strong", "", entry.title), element("p", "", entry.detail));
      return li;
    }));
  }

  function nextDate(month) {
    if (month === null) return "到龄前暂无排定窗口";
    return month === state.month ? "窗口已到 · 正在结算" : "下个岗位窗口 · " + R.date(month);
  }

  function renderDesk() {
    renderAgenda();
    renderEvent();
    renderPlans();
    byId("scores").replaceChildren(...Object.entries(C.limits).map(([key, value]) => scoreMeter(C.categories[key], state.score[key], value)));
    const current = E.assessTarget(state);
    const requirement = current.wanted?.needs.find((item) => !item.ok);
    const detail = state.goal === "stay" ? "当前选择留任。" : requirement ?
      requirement.label + " · " + requirement.detail : qualification(current);
    const currentStatus = nextDate(current.next) + "。" + detail;
    byId("notice").replaceChildren(notice(current.wanted?.title || "继续任职", currentStatus),
      notice("下次纪检检查", R.date(E.nextInspection(state)) + " · 当前危险 " + E.danger(state) + "%"),
      button("查看任用与资格", () => activate("dossier")));
    timeline("journal", state.log.slice(-5).reverse());
  }

  function renderViolations() {
    const review = E.assessTarget(state);
    byId("offense-list").replaceChildren(...E.offenses(state).map((offer) => {
      const detail = offer.used ? "本任已使用" : !offer.bonus ? "本任加成已满" : !offer.risk ? "危险值已达 100%" :
        "任内胜算 +" + offer.bonus + " 个百分点 · 永久危险 +" + offer.risk + " 个百分点";
      const action = button("查看代价", () => confirm(offer.title,
        "参考胜算由 " + percent(review.probability) + " 提到 " + percent(review.probability + offer.bonus) +
        "，永久危险增加 " + offer.risk + " 个百分点。任用生效或调任时结清加成。",
        () => doAction(() => E.offend(state, offer.id))),
      { disabled: offer.used || !offer.bonus || !offer.risk || Boolean(state.review) });
      return card(offer.title, offer.body, detail, action);
    }));
    byId("offense-summary").replaceChildren(
      notice("合规表现", percent(review.legitimate)),
      notice("任内加成", "+" + review.boost + " / " + review.boostLimit + " 个百分点"),
      notice("累计危险", E.danger(state) + "% · 下次检查 " + R.date(E.nextInspection(state))));
  }

  function targetCard(option, active) {
    const card = element("article", "target");
    const head = element("div", "section-top");
    const copy = element("div");
    copy.append(element("h3", "", option.title), element("p", "muted", option.procedure + "。"));
    const choose = button(active ? "当前方向" : "选为方向", () => doAction(() => E.setGoal(state, option.id)), {
      style: active ? "primary" : "secondary", disabled: active || Boolean(state.review),
    });
    head.append(copy, choose);
    const current = E.assessTarget(state, option);
    const detail = element("p", "fine", "参考胜算 " + percent(current.probability) + " · " + qualification(current) + " · " + nextDate(current.next));
    const rules = element("details", "disclosure");
    rules.append(element("summary", "", "资格与出处"));
    const list = element("ul", "requirements");
    for (const item of option.needs) {
      const li = element("li");
      li.append(element("strong", "", item.label), element("p", item.ok ? "muted" : "alert", item.detail), source(item.source));
      list.append(li);
    }
    rules.append(list);
    if (state.placement?.active && option.kind !== "rank") rules.append(element("p", "fine alert", "当前还在录用规定的基层锻炼期内。"));
    card.append(head, detail, rules);
    return card;
  }

  function confirm(title, detail, action) {
    confirmation = action;
    text("confirm-heading", title);
    text("confirm-detail", detail);
    const dialog = byId("confirm-dialog");
    dialog.returnValue = "";
    dialog.showModal();
  }

  function renderDossier() {
    const target = E.target(state);
    const rows = E.opportunities(state).map((option) => targetCard(option, target?.id === option.id));
    rows.push(button(!target ? "当前方向 · 留任" : "留任，暂不争取晋升", () => doAction(() => E.setGoal(state, "stay")), { disabled: !target || Boolean(state.review) }));
    byId("targets").replaceChildren(...rows);
    const retire = E.retirement(state);
    byId("career-facts").replaceChildren(datum("工龄", R.duration(state.month)), datum("基层经历", R.duration(state.localMonths)),
      datum("现职经历", R.duration(state.month - state.postSince)), datum("党龄", R.partyMonths(state) ? R.duration(R.partyMonths(state)) : "—"),
      datum(retire.label, R.date(retire.month)), datum("距到龄", R.duration(retire.month - state.month)),
      datum("年度考核", state.assessments.at(-1)?.rating || "待考核"), datum("入职考试", state.examScore + " 分"),
      datum("近五年培训", state.training.filter((item) => item.month >= state.month - 60).reduce((sum, item) => sum + item.hours, 0) + " 学时"));
    if (retire.source) byId("career-facts").lastElementChild.after(datum("退休依据", source(retire.source)));
    timeline("career-log", state.log.filter((item) => item.kind === "office").slice(-12).reverse());
    text("risk-note", "终身累计 " + E.danger(state) + "% · 已检查 " + state.checks + " 次 · " + R.date(E.nextInspection(state)) + "再检查。");
    const incidents = [...state.incidents].reverse().map((item) => ({
      month: item.month, kind: "audit", title: item.title,
      detail: item.choice + " · +" + item.risk + " 个百分点 · " + (item.resolved ? "已处理，保留记录" : "待查"),
    }));
    timeline("incidents", incidents);
    if (!incidents.length) byId("incidents").append(element("li", "fine muted", "当前履历没有违规记录。"));
    const canLeave = state.month >= 60 && state.penalty <= state.month && E.canArrange(state);
    const actions = [button("申请辞去公职", () => confirm("申请辞去公职？", "办理后进入生涯结算。", () => doAction(() => E.leave(state), true)),
      { disabled: !canLeave })];
    if (R.eligibleEarlyRetirement(state)) actions.push(button("申请按另一档年龄退休", () =>
      confirm("办理退休？", "将按本人申请和适用的退休条件办结生涯。", () => doAction(() => E.leave(state, true), true)), { disabled: !E.canArrange(state) }));
    byId("departure").querySelector(".actions").replaceChildren(...actions);
    text("departure-note", state.month < 60 ? "规定服务期还剩 " + R.duration(60 - state.month) + "。" :
      state.penalty > state.month ? "当前仍在本局处分影响期。" : E.currentEvent(state) ? "先处理当前待办事件。" : "");
  }

  function renderHandbook() {
    const book = byId("book");
    if (book.childElementCount) return;
    for (const [index, chapter] of R.handbook.entries()) {
      const group = element("details", "disclosure");
      group.open = index === 0;
      group.append(element("summary", "", chapter.title));
      for (const [label, detail, ...sources] of chapter.rules) {
        const row = element("article", "rule");
        const refs = element("div", "source-list");
        refs.append(...sources.map(source));
        row.append(element("h3", "", label), element("p", "", detail), refs);
        group.append(row);
      }
      book.append(group);
    }
  }

  function renderEnding() {
    panel("ending");
    const ending = state.outcome;
    text("ending-date", R.date(ending.month) + " · " + state.name);
    text("ending-title", ending.title);
    text("ending-detail", ending.detail);
    byId("ending-facts").replaceChildren(datum("最后任职", E.title(state)), datum("在岗时间", R.duration(ending.month)),
      datum("推进的事项", state.projects + " 件"), datum("终身危险值", E.danger(state) + "%"),
      datum("任用判定", state.attempts + " 次"), datum("例行检查", state.checks + " 次"));
    const highlights = state.log.filter((item) => item.kind === "audit" || item.kind === "office" &&
      ["任用生效", "职级晋升", "中央任用生效", "交流任职"].includes(item.title)).slice(-8);
    timeline("ending-log", [{ kind: "office", month: 0, title: "入职报到", detail: state.stints[0].title }, ...highlights]);
  }

  function clearCeremony() {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  }

  function confetti() {
    const colors = ["#b63934", "#e6a637", "#edcf75", "#f4a583", "#a45459", "#abc097"];
    return Array.from({ length: 30 }, (_, index) => {
      const particle = element("i");
      const angle = 2 * Math.PI * index / 30;
      const distance = 75 + (index * 29) % 140;
      particle.style.setProperty("--x", Math.round(distance * Math.cos(angle)) + "px");
      particle.style.setProperty("--y", Math.round(distance * Math.sin(angle)) + "px");
      particle.style.setProperty("--spin", (index % 2 ? -1 : 1) * (240 + index * 22) + "deg");
      particle.style.setProperty("--color", colors[index % colors.length]);
      return particle;
    });
  }

  function openReveal(skip = false) {
    if (revealed || !revealItem) return;
    clearCeremony();
    revealed = true;
    const dialog = byId("reveal-dialog");
    const audit = revealItem.kind === "audit";
    const success = !audit && revealItem.hit;
    dialog.classList.remove("playing");
    dialog.classList.add("open", audit ? (revealItem.hit ? "audit-hit" : "audit-clear") : success ? "success" : "miss");
    if (skip) dialog.classList.add("instant");
    if (success && !skip) byId("reveal-confetti").replaceChildren(...confetti());
    text("result-stamp", audit ? (revealItem.hit ? "核查结论" : "核对归档") : success ? "任命生效" : "本轮结束");
    byId("reveal-result").hidden = false;
    text("reveal-title", revealItem.title);
    text("reveal-detail", revealItem.detail);
    text("reveal-caption", "");
    text("reveal-next", "继续");
    byId("reveal-title").focus({ preventScroll: true });
  }

  function renderReveal() {
    const next = state.reveals[0];
    const dialog = byId("reveal-dialog");
    if (!next) {
      clearCeremony();
      revealItem = null;
      if (dialog.open) dialog.close();
      return;
    }
    if (next === revealItem) return;
    clearCeremony();
    revealItem = next;
    revealed = false;
    const audit = next.kind === "audit";
    const duration = next.major || !audit && R.central.includes(next.subject) ? 6200 : 5000;
    const steps = audit ? ["调阅历年案卷", "核对相关记录", "检查结果即将公布"] : ["任用材料送审", "复核考察和推荐记录", "任用结果即将公布"];
    dialog.className = "dialog paper reveal" + (audit ? " audit" : "");
    dialog.style.setProperty("--suspense", duration + "ms");
    text("reveal-kind", R.date(next.month) + " · " + (audit ? "纪检" : "任用"));
    text("reveal-heading", next.subject);
    text("reveal-chance", (audit ? "本轮危险 " : "本轮胜算 ") + percent(next.chance));
    text("reveal-seal", audit ? "纪检案卷" : "任用文件");
    text("reveal-next", "跳过动画");
    text("reveal-caption", steps[0]);
    byId("reveal-result").hidden = true;
    byId("reveal-confetti").replaceChildren();
    if (!dialog.open) dialog.showModal();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      openReveal(true);
      return;
    }
    void byId("reveal-document").offsetWidth;
    dialog.classList.add("playing");
    timers = [
      setTimeout(() => text("reveal-caption", steps[1]), duration * 0.32),
      setTimeout(() => text("reveal-caption", steps[2]), duration * 0.74),
      setTimeout(openReveal, duration),
    ];
  }

  function render() {
    if (!state) return;
    if (state.outcome) renderEnding();
    else {
      panel("career");
      renderBanner();
      for (const tab of tabs) {
        const selected = tab.dataset.view === view;
        tab.setAttribute("aria-pressed", String(selected));
        byId(tab.dataset.view).hidden = !selected;
      }
      if (view === "desk") renderDesk();
      if (view === "dossier") renderDossier();
      if (view === "violations") renderViolations();
      if (view === "handbook") renderHandbook();
    }
    renderReveal();
  }

  byId("intake-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const profile = { name: byId("name").value.trim().slice(0, 16) || "顾行之", degree: byId("degree").value,
      gender: byId("gender").value, channel: byId("channel").value, member: byId("member").checked };
    if (!profileValid(profile)) return;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    exam = { profile, seed, questions: Q.generate(seed), position: 0, answers: Array(7).fill(null), done: false };
    save();
    renderExam(true);
    window.scrollTo(0, 0);
  });
  byId("previous").addEventListener("click", () => {
    if (!exam.position) return;
    exam.position--;
    save();
    renderExam(true);
  });
  byId("next").addEventListener("click", () => {
    if (exam.answers[exam.position] === null) return;
    if (exam.position === 6) {
      if (!Q.grade(exam.questions, exam.answers)) return;
      exam.done = true;
      save();
      renderAssignment();
    } else {
      exam.position++;
      save();
      renderExam(true);
    }
  });
  byId("report").addEventListener("click", () => {
    if (!exam?.done) return;
    const grade = Q.grade(exam.questions, exam.answers);
    state = E.create(exam.profile, grade.score, exam.seed);
    exam = null;
    view = "desk";
    save();
    render();
    window.scrollTo(0, 0);
  });
  for (const tab of tabs) tab.addEventListener("click", () => activate(tab.dataset.view));
  byId("routine-duration").addEventListener("change", renderRoutine);
  byId("advance").addEventListener("click", () => doAction(() => E.advance(state)));
  byId("cancel-plan").addEventListener("click", () =>
    confirm("取消安排？", "已经到账的分数和履历继续有效。", () => doAction(() => E.cancelPlan(state))));
  byId("reveal-next").addEventListener("click", () => {
    if (!revealed) openReveal(true);
    else doAction(() => E.acknowledge(state));
  });
  byId("reveal-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!revealed) openReveal(true);
  });
  byId("confirm-dialog").addEventListener("close", (event) => {
    const action = confirmation;
    confirmation = null;
    if (event.currentTarget.returnValue === "confirm") action?.();
  });
  byId("restart").addEventListener("click", () => confirm("另开一段生涯？", "开始新考试时将写入新的新版存档。", showIntake));
  byId("legacy-download").addEventListener("click", () => {
    if (!legacy) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(legacy, null, 2)], { type: "application/json" }));
    const link = element("a");
    link.href = url;
    link.download = "进步模拟器-旧版生涯.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const current = fresh ? null : arcadeSaves.read(id);
  const prior = fresh || current ? null : arcadeSaves.read(priorId);
  const record = current?.version === version ? current : prior?.version === 2 ? prior : null;
  const career = record?.state?.phase === "career" ? (record === prior ? E.upgrade(record.state.data) : record.state.data) : null;
  if (E.valid(career)) {
    state = career;
    if (record === prior) save();
    else {
      byId("saved").hidden = false;
      text("saved", "本机已存档");
    }
    render();
  } else if (record?.state?.phase === "exam" && examValid(record.state.data)) {
    exam = record.state.data;
    if (record === prior) save();
    else {
      byId("saved").hidden = false;
      text("saved", "本机已存档");
    }
    if (exam.done) renderAssignment();
    else renderExam();
  } else {
    showIntake();
    if (legacy || new URLSearchParams(location.search).get("mode") === "resume") {
      text("resume-note", legacy ? "旧版生涯存档仍保存在这台设备，可在这里导出。" : "这里还没有可续玩的存档。");
      byId("resume-note").hidden = false;
    }
  }
})();
