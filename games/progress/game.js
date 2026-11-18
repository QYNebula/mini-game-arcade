(() => {
  const id = "progress-v2";
  const version = 2;
  const R = ProgressRules;
  const C = ProgressContent;
  const E = ProgressCareer;
  const Q = ProgressExam;
  const byId = (key) => document.getElementById(key);
  const text = (key, value) => { byId(key).textContent = value; };
  const tabs = [...document.querySelectorAll("[data-view]")];
  const categories = [...document.querySelectorAll("[data-group]")];
  const fresh = new URLSearchParams(location.search).get("mode") === "new";
  const legacy = arcadeSaves.read("progress");
  let replaceMode = fresh;
  let state = null;
  let exam = null;
  let view = "desk";
  let group = "merit";
  let confirmation = null;
  let revealItem = null;
  let revealed = false;
  let timer = 0;

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
    const hadEvent = Boolean(state.pending.length);
    if (!action()) return;
    save();
    const last = state.log.at(-1);
    if (last) text("announcement", last.title + "。" + last.detail);
    render();
    if (scroll || state.outcome) window.scrollTo(0, 0);
    else if (!hadEvent && state.pending.length && !state.reveals.length && view === "desk") {
      byId("event").scrollIntoView({ block: "nearest" });
    }
  }

  function activate(next) {
    view = next;
    render();
    window.scrollTo(0, 0);
  }

  const percent = (value) => Number(value.toFixed(1)) + "%";
  const signed = (value) => (value > 0 ? "+" : "−") + Math.abs(value);

  function bannerStat(label, value) {
    const row = element("div", "banner-stat");
    row.append(element("span", "", label), element("strong", "", value));
    return row;
  }

  function renderBanner() {
    const [unit, duty] = E.title(state).split(" · ");
    text("current-period", R.half(state.month) + " · " + (state.central ? "中央" : state.post.location));
    text("current-title", duty || unit);
    text("current-profile", (duty ? unit + " · " : "") + state.name + " · " +
      (state.formal ? R.ranks[state.rank] : "新录用试用期") + " · " + E.age(state) + " 岁");
    const review = E.assessTarget(state);
    byId("banner-stats").replaceChildren(
      bannerStat("任用胜算", review.qualified && state.health >= 20 ? percent(review.probability) : "—"),
      bannerStat("危险值", E.danger(state) + "%"), bannerStat("健康", state.health + " / 100"));
  }

  function renderCalendar() {
    const left = E.remaining(state);
    const spent = state.month % 6;
    const base = state.month % 12 < 6 ? 1 : 7;
    const ticks = element("div", "month-ticks");
    ticks.setAttribute("aria-label", "已安排 " + spent + " 个月");
    for (let index = 0; index < 6; index++) {
      const cell = element("div", "month-cell" + (index < spent ? " spent" : index === spent ? " current" : ""), base + index + " 月");
      if (index === spent) cell.setAttribute("aria-current", "date");
      ticks.append(cell);
    }
    const copy = element("div");
    copy.append(element("h2", "", "已安排 " + spent + " / 6 月"),
      element("p", "", state.health < 20 ? "病休中，可先恢复健康。" : left < 6 - spent ? "到龄前还能安排 " + left + " 个月。" : "安排满六个月后自动结算。"));
    byId("calendar").replaceChildren(copy, ticks);
  }

  function effectLine(option) {
    const tags = [option.months ? option.months + " 个月" : "当场处理"];
    for (const [key, label] of [...Object.entries(C.categories).filter(([key]) => key !== "rest"), ["health", "健康"]]) {
      if (option.effect[key]) tags.push(label + " " + signed(option.effect[key]));
    }
    if (option.effect.risk) tags.push("危险 +" + option.effect.risk + " 个百分点");
    return element("span", "effect-line" + (option.effect.risk ? " danger-effect" : ""), tags.join(" · "));
  }

  function choiceButton(option, handler) {
    const control = element("button", "choice");
    control.type = "button";
    control.disabled = !E.allowed(state, option);
    control.append(element("strong", "", option.title), effectLine(option));
    if (option.note) control.append(element("span", "effect-line", option.note));
    control.addEventListener("click", handler);
    return control;
  }

  function renderEvent() {
    const root = byId("event");
    const event = E.currentEvent(state);
    root.hidden = !event;
    if (!event) return;
    const options = element("div", "choices");
    for (const [index, option] of event.options.entries()) {
      options.append(choiceButton(option, () => doAction(() => E.chooseEvent(state, index))));
    }
    root.replaceChildren(element("p", "overline", R.date(event.month) + " · 到期待办"), element("h2", "", event.title),
      element("p", "muted explanation", event.body), options);
  }

  function openTask(task) {
    if (task.options.length === 1) {
      doAction(() => E.doTask(state, task.id, 0));
      return;
    }
    text("decision-title", task.title);
    text("decision-body", task.body);
    byId("decision-options").replaceChildren(...task.options.map((option, index) =>
      choiceButton(option, () => {
        byId("task-dialog").close();
        doAction(() => E.doTask(state, task.id, index));
      })));
    byId("task-dialog").showModal();
  }

  function taskCard(task) {
    const card = element("article", "task");
    const copy = element("div");
    copy.append(element("h3", "", task.title), element("p", "muted", task.body));
    if (task.options.length === 1) {
      const effects = effectLine(task.options[0]);
      effects.classList.add("fine");
      copy.append(effects);
    }
    const months = task.options.map((choice) => choice.months);
    const first = Math.min(...months);
    const last = Math.max(...months);
    const label = task.options.length === 1 ? "安排 · " + first + " 月" : "选择方案 · " + (first === last ? first : first + "～" + last) + " 月";
    const blocked = Boolean(state.pending.length) || !task.options.some((option) => E.allowed(state, option));
    card.append(copy, button(label, () => openTask(task), { disabled: blocked }));
    return card;
  }

  function restCard() {
    const block = element("div", "paper rest-options");
    const label = element("label", "", "休养时长");
    const select = element("select");
    select.setAttribute("aria-label", "休养时长");
    const remaining = E.remaining(state);
    const max = state.health < 20 ? Math.min(remaining, Math.ceil((20 - state.health) / 10)) : remaining;
    for (let months = 1; months <= max; months++) {
      const option = element("option", "", months + " 个月");
      option.value = String(months);
      select.append(option);
    }
    const blocked = Boolean(state.pending.length || state.reveals.length || !max);
    select.disabled = blocked;
    label.append(select);
    block.append(label, button(state.health < 20 ? "安排病休" : "安排休养", () => doAction(() => E.rest(state, Number(select.value))), { style: "primary", disabled: blocked }));
    if (remaining > 1 && state.health >= 20) block.append(button("休到本期结束", () => doAction(() => E.rest(state, remaining)), { disabled: blocked }));
    const intro = element("p", "muted fine", "休养每月恢复 10 点健康，最多到 100。本期时钟继续推进。");
    return [intro, block];
  }

  function renderTasks() {
    const root = byId("tasks");
    if (state.health < 20) group = "rest";
    for (const tab of categories) tab.setAttribute("aria-pressed", String(tab.dataset.group === group));
    text("period-left", "本期还剩 " + E.remaining(state) + " 月");
    if (group === "rest") root.replaceChildren(...restCard());
    else {
      const tasks = E.tasks(state).filter((task) => task.group === group);
      root.replaceChildren(...(tasks.length ? tasks.map(taskCard) : [element("p", "fine", "本期这一类事项已办完，仍可安排其他事项或休养。")]));
    }
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

  function nextDate(month) { return month === null ? "到龄前暂无排定窗口" : "下个窗口预计在" + R.date(month); }

  function renderDesk() {
    renderCalendar();
    renderEvent();
    renderTasks();
    byId("scores").replaceChildren(...Object.entries(C.limits).map(([key, value]) => scoreMeter(C.categories[key], state.score[key], value)));
    const current = E.assessTarget(state);
    const currentStatus = current.wanted ? nextDate(current.next) + "。" +
      (state.health < 20 ? "当前处于病休。" : current.qualified ? "符合资格时按当期表现结算。" :
        state.placement?.active ? "当前正在完成基层锻炼。" : "查看资格详情和未满足的条件。") : "留任，由你安排本期工作。";
    byId("notice").replaceChildren(notice(current.wanted?.title || "继续任职", currentStatus),
      notice("下次纪检检查", R.date(E.nextInspection(state)) + " · 当前危险 " + E.danger(state) + "%"),
      button("查看任用与资格", () => activate("dossier")));
    timeline("journal", state.log.slice(-6).reverse());
  }

  function targetCard(option, active) {
    const card = element("article", "target");
    const head = element("div", "section-top");
    const copy = element("div");
    copy.append(element("h3", "", option.title), element("p", "muted", option.procedure + "。"));
    const choose = button(active ? "当前方向" : "选为方向", () => doAction(() => E.setGoal(state, option.id)), {
      style: active ? "primary" : "secondary", disabled: active,
    });
    head.append(copy, choose);
    const current = E.assessTarget(state, option);
    const detail = element("p", "fine", nextDate(current.next) + " · " + (current.qualified ?
      "参考胜算 " + percent(current.probability) + " · 当轮上限 " + current.cap + "%" : "有资格要求待完成"));
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
    rows.push(button(!target ? "当前方向 · 留任" : "留任，暂不争取晋升", () => doAction(() => E.setGoal(state, "stay")), { disabled: !target }));
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
    const canLeave = state.month >= 60 && state.penalty <= state.month && !state.pending.length;
    const actions = [button("申请辞去公职", () => confirm("申请辞去公职？", "办理后进入生涯结算。", () => doAction(() => E.leave(state), true)),
      { disabled: !canLeave })];
    if (R.eligibleEarlyRetirement(state)) actions.push(button("申请按另一档年龄退休", () =>
      confirm("办理退休？", "将按本人申请和适用的退休条件办结生涯。", () => doAction(() => E.leave(state, true), true))));
    byId("departure").querySelector(".actions").replaceChildren(...actions);
    text("departure-note", state.month < 60 ? "规定服务期还剩 " + R.duration(60 - state.month) + "。" :
      state.penalty > state.month ? "当前仍在本局处分影响期。" : state.pending.length ? "先处理当前待办事件。" : "");
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

  function openReveal() {
    if (revealed || !revealItem) return;
    clearTimeout(timer);
    revealed = true;
    const dialog = byId("reveal-dialog");
    dialog.classList.remove("playing");
    dialog.classList.add("open");
    if (revealItem.kind === "promotion" && revealItem.hit) dialog.classList.add("success");
    byId("reveal-result").hidden = false;
    text("reveal-title", revealItem.title);
    text("reveal-detail", revealItem.detail);
    text("reveal-next", "继续");
    byId("reveal-title").focus({ preventScroll: true });
  }

  function renderReveal() {
    const next = state.reveals[0];
    const dialog = byId("reveal-dialog");
    if (!next) {
      clearTimeout(timer);
      revealItem = null;
      if (dialog.open) dialog.close();
      return;
    }
    if (next === revealItem) return;
    clearTimeout(timer);
    revealItem = next;
    revealed = false;
    dialog.className = "dialog paper reveal";
    text("reveal-kind", R.half(next.month - 1) + " · " + (next.kind === "audit" ? "纪检" : "任用"));
    text("reveal-heading", next.subject);
    text("reveal-chance", (next.kind === "audit" ? "本轮危险 " : "本轮胜算 ") + percent(next.chance));
    text("reveal-next", "跳过动画");
    byId("reveal-result").hidden = true;
    if (!dialog.open) dialog.showModal();
    void byId("reveal-document").offsetWidth;
    dialog.classList.add("playing");
    timer = setTimeout(openReveal, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1130);
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
    group = "merit";
    save();
    render();
    window.scrollTo(0, 0);
  });
  for (const tab of tabs) tab.addEventListener("click", () => activate(tab.dataset.view));
  for (const tab of categories) tab.addEventListener("click", () => { group = tab.dataset.group; renderTasks(); });
  byId("decision-close").addEventListener("click", () => byId("task-dialog").close());
  byId("reveal-next").addEventListener("click", () => {
    if (!revealed) openReveal();
    else doAction(() => E.acknowledge(state));
  });
  byId("reveal-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!revealed) openReveal();
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

  const record = fresh ? null : arcadeSaves.read(id);
  if (record?.version === version && record.state?.phase === "career" && E.valid(record.state.data)) {
    state = record.state.data;
    byId("saved").hidden = false;
    text("saved", "本机已存档");
    render();
  } else if (record?.version === version && record.state?.phase === "exam" && examValid(record.state.data)) {
    exam = record.state.data;
    byId("saved").hidden = false;
    text("saved", "本机已存档");
    if (exam.done) renderAssignment();
    else renderExam();
  } else {
    showIntake();
    if (legacy || new URLSearchParams(location.search).get("mode") === "resume") {
      text("resume-note", legacy ? "旧版生涯存档仍保存在这台设备。本次重做从模拟考试开始。" : "这里还没有可续玩的新版存档。");
      byId("resume-note").hidden = false;
    }
  }
})();
