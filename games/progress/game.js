(() => {
  const id = "progress";
  const version = 1;
  const R = ProgressRules;
  const C = ProgressContent;
  const E = ProgressCareer;
  const byId = (key) => document.getElementById(key);
  const text = (key, value) => { byId(key).textContent = value; };
  const tabs = [...document.querySelectorAll("[data-view]")];
  const remembered = new Map();
  let state = null;
  let view = "desk";
  let selected = "county";
  let eventProject = 0;
  let replaceMode = new URLSearchParams(location.search).get("mode") === "new";

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }

  function button(label, onClick, { style = "secondary", disabled = false, key = "" } = {}) {
    const node = element("button", "button " + style, label);
    node.type = "button";
    node.disabled = disabled;
    if (key) node.dataset.focus = key;
    node.addEventListener("click", onClick);
    return node;
  }

  function datum(label, value) {
    const row = element("div");
    row.append(element("dt", "", label), element("dd", "", value));
    return row;
  }

  function source(key) {
    const [label, url] = R.sources[key];
    const node = element("a", "reference-link", label);
    node.href = url;
    node.target = "_blank";
    node.rel = "noopener noreferrer";
    return node;
  }

  function details(key, label, open = false) {
    const node = element("details");
    node.dataset.keep = key;
    node.open = remembered.get(key) ?? open;
    node.append(element("summary", "", label));
    return node;
  }

  function remember() {
    for (const node of document.querySelectorAll("details[data-keep]")) remembered.set(node.dataset.keep, node.open);
  }

  function save() {
    const summary = state.outcome ? state.outcome.title + " · " + state.name :
      state.name + " · 第 " + R.year(state.month) + " 年 · " + E.officeTitle(state);
    const success = arcadeSaves.write(id, { version, summary, state });
    const label = byId("save-status");
    label.hidden = false;
    label.classList.toggle("error", !success);
    label.textContent = success ? "本机已存档" : "存档未写入";
    if (success && replaceMode) {
      const url = new URL(location.href);
      url.searchParams.delete("mode");
      try { history.replaceState(null, "", url); } catch { return; }
      replaceMode = false;
    }
  }

  function perform(action, options = {}) {
    if (!state || state.outcome) return;
    remember();
    const key = document.activeElement?.dataset.focus;
    if (!action()) return;
    save();
    render();
    const log = state.log.at(-1);
    text("announcement", log ? log.title + "。" + log.detail : "");
    if (options.top || state.outcome) {
      window.scrollTo(0, 0);
    } else if (key) {
      const next = [...document.querySelectorAll("[data-focus]")].find((node) => node.dataset.focus === key && !node.disabled);
      next?.focus({ preventScroll: true });
    }
  }

  function chooseView(next) {
    remember();
    view = next;
    render();
    window.scrollTo(0, 0);
  }

  function intake() {
    state = null;
    byId("career").hidden = true;
    byId("outcome").hidden = true;
    byId("intake").hidden = false;
    byId("save-status").hidden = true;
    renderOffers();
    window.scrollTo(0, 0);
  }

  function offerUnit(offer, degree) {
    if (offer.channel !== "rural") return offer.unit;
    const region = C.regions[offer.region];
    return degree === "bachelor" ? region.town + "人民政府" : region.county + "人民政府办公室";
  }

  function renderNotice() {
    const degree = byId("degree").value;
    const offer = C.openings.find((item) => item.id === selected);
    const education = R.degrees[degree];
    text("notice-unit", offerUnit(offer, degree) + " · " + offer.title);
    text("notice-first", offer.first);
    byId("notice-details").replaceChildren(
      datum("招录渠道", C.channels[offer.channel]), datum("报到年龄", education.age + " 岁"),
      datum("试用期", "1 年"), datum("考核合格拟定级", R.ranks[education.rank]),
      datum("基层安排", offer.channel === "ordinary" ? "按录用岗位报到" :
        offer.channel === "rural" ? "到村任职 2 年" : "试用期满后基层锻炼 2 年"));
    text("inline-preview", "拟定" + R.ranks[education.rank] + " · " +
      (offer.channel === "rural" ? "先到村任职两年" : offer.channel === "targeted" ? "试用期满后下基层两年" : "在录用单位试用一年"));
  }

  function renderOffers() {
    const degree = byId("degree").value;
    const available = C.openings.filter((offer) => offer.degrees.includes(degree));
    if (!available.some((offer) => offer.id === selected)) selected = available[0].id;
    const options = available.map((offer) => {
      const label = element("label", "offer");
      const input = element("input");
      input.type = "radio";
      input.name = "opening";
      input.value = offer.id;
      input.checked = selected === offer.id;
      input.addEventListener("change", () => {
        selected = offer.id;
        renderNotice();
      });
      const box = element("span", "offer-copy");
      box.append(element("span", "", C.channels[offer.channel]), element("strong", "", offerUnit(offer, degree)),
        element("span", "", offer.title));
      label.append(input, box);
      return label;
    });
    byId("offers").replaceChildren(...options);
    renderNotice();
  }

  function renderBanner() {
    const [unit, duty] = E.officeTitle(state).split(" · ");
    text("career-place", R.date(state.month) + "　·　" + E.place(state));
    text("career-title", duty || unit);
    text("career-caption", (duty ? unit + " · " : "") + state.name + " · " + E.rankTitle(state) + " · " +
      (state.central ? "中央任职" : state.placement?.active ? "基层锻炼" : R.levels[state.post.level]));
    byId("header-metrics").replaceChildren(datum("年龄", E.age(state) + " 岁"), datum("最近考核", E.latestRating(state) || "待评定"),
      datum("预算额度", state.budget), datum("已结项", state.completed + " 件"));
  }

  function info(title, body) {
    const node = element("div", "info");
    node.append(element("h3", "", title), element("p", "", body));
    return node;
  }

  function dossierButton(label) { return button(label, () => chooseView("dossier")); }

  function renderInquiry() {
    const section = byId("inquiry");
    const matter = state.inquiry;
    section.hidden = !matter;
    if (!matter) return;
    const title = element("h2", "", E.checks[matter.stage]);
    const copy = element("p", "", "涉及「" + matter.name + "」的事项正在办理。下一个程序在" + R.date(matter.due) + "。");
    const actions = element("div", "project-actions");
    actions.append(button(matter.cooperated ? "已配合说明" : "配合说明 · 1 格", () => perform(() => E.administration(state, "inquiry")),
      { disabled: !state.ap || matter.cooperated, key: "inquiry" }));
    if (state.gains > 0) actions.append(button("退回不当所得 · 1 格", () => perform(() => E.administration(state, "rectify")),
      { disabled: !state.ap || matter.returned, key: "rectify" }));
    section.replaceChildren(title, copy, actions);
  }

  function renderBriefing() {
    const panel = byId("briefing");
    const card = E.event(state);
    if (!card) {
      const row = element("div", "settled");
      const label = element("div");
      label.append(element("h2", "", "议题已处理"), element("p", "muted small", "剩余精力可用于在办事项、培训或任用。"));
      row.append(label, button("看在办事项", () => byId("workload").scrollIntoView({ block: "start" }), { style: "flat" }));
      panel.replaceChildren(row);
      return;
    }
    const projects = E.active(state);
    const affectsProject = card.choices.some((choice) => choice.effect.progress || choice.effect.quality || choice.effect.illicit);
    const association = element("label", "association");
    if (projects.length > 1 && affectsProject) {
      const selector = element("select");
      selector.setAttribute("aria-label", "议题关联事项");
      for (const project of projects) {
        const option = element("option", "", project.title);
        option.value = String(project.id);
        selector.append(option);
      }
      if (projects.some((project) => project.id === eventProject)) selector.value = String(eventProject);
      selector.addEventListener("change", () => { eventProject = Number(selector.value); });
      association.append(element("span", "", "关联事项"), selector);
    }
    const choices = element("div", "decision-list");
    card.choices.forEach((option, index) => {
      const choice = element("button", "decision");
      choice.type = "button";
      choice.disabled = option.cost > state.ap || state.budget + (option.effect.budget || 0) < 0;
      choice.dataset.choice = String(index);
      choice.append(element("strong", "", option.title), element("small", "", option.note),
        element("span", "cost", option.cost ? option.cost + " 格精力" : "不占精力"));
      choice.addEventListener("click", () => perform(() => E.chooseStory(state, index,
        projects.length > 1 && affectsProject && projects.some((project) => project.id === eventProject) ? eventProject : 0)));
      choices.append(choice);
    });
    panel.replaceChildren(element("p", "issue-type", "本期议题"), element("h2", "", card.title), element("p", "body-copy", card.body),
      ...(association.childElementCount ? [association] : []), choices);
  }

  function projectCard(project) {
    const def = C.projects.find((item) => item.id === project.def);
    const card = element("article", "project-card");
    const row = element("div", "card-heading");
    row.append(element("h3", "", project.title), element("span", "timing", "限" + R.date(project.deadline)));
    const meter = element("progress", "project-meter");
    meter.max = project.target;
    meter.value = project.progress;
    meter.setAttribute("aria-label", project.title + "进度");
    const progress = element("div", "progress-label");
    progress.append(element("span", "", project.progress + " / " + project.target + " 办理进度"),
      element("span", "", project.quality >= 7 ? "专项复核完成" : project.quality >= 5 ? "复核记录齐全" : "复核记录待补"));
    const actions = element("div", "project-actions");
    actions.append(
      button("推进 · 1 格", () => perform(() => E.projectAction(state, project.id, "advance")),
        { disabled: !state.ap || project.progress >= project.target, key: "advance-" + project.id }),
      button("复核 · 1 格", () => perform(() => E.projectAction(state, project.id, "verify")),
        { disabled: !state.ap || project.quality === 8 && project.progress === project.target, key: "verify-" + project.id }),
      button(state.post.level >= 3 ? "调配额度" : "申请用款", () => perform(() => E.projectAction(state, project.id, "fund")),
        { disabled: !state.ap || state.budget < 2 || project.progress >= project.target, key: "fund-" + project.id }));
    actions.lastChild.title = "1 格精力和 2 点额度";

    const staff = details("staff-" + project.id, state.post.level >= 3 ? "安排负责人" : "请同事协作");
    staff.className = "staff-picker";
    const controls = element("div", "staff-controls");
    const select = element("select");
    select.setAttribute("aria-label", project.title + "协作名单");
    const people = state.people.filter((person) => E.canAssign(state, person));
    for (const person of people) {
      const option = element("option", "", person.name + " · 擅长" + person.strength);
      option.value = String(person.id);
      select.append(option);
    }
    select.disabled = !people.length || project.staff > state.month;
    const assign = button("确定 · 1 格", () => perform(() => E.projectAction(state, project.id, "assign", Number(select.value))),
      { disabled: select.disabled || !state.ap, key: "assign-" + project.id });
    controls.append(select, assign);
    staff.append(controls, element("p", "note muted small", project.staff > state.month ? "本期已有人接手。" :
      !people.length ? "本期暂时找不到合适的协作者。" :
        state.post.level >= 3 ? "负责人本期会协助推进。" : "对方会帮一段时间，日后可能请你一起办事。"));
    card.append(row, element("p", "muted", def.briefing), meter, progress, actions, staff);
    return card;
  }

  function renderProjects() {
    const projects = E.active(state);
    text("workload-count", projects.length + " / 2 件");
    byId("project-list").replaceChildren(...(projects.length ? projects.map(projectCard) :
      [element("p", "muted small", "当前在办事项已办结，可以接办新的工作。")]));
    const possible = C.projects.filter((def) => state.proposals.includes(def.id) && !projects.some((project) => project.def === def.id));
    const drawer = byId("proposal-drawer");
    drawer.hidden = !possible.length || projects.length >= 2;
    const proposals = possible.map((def) => {
      const row = element("article", "proposal");
      const copy = element("div");
      copy.append(element("h3", "", def.name), element("p", "muted", def.briefing),
        element("p", "muted", R.duration(def.months).trim() + "期限 · " + def.cost + " 点预算"));
      row.append(copy, button("接办 · 1 格", () => perform(() => E.addProject(state, def)), {
        disabled: !state.ap || state.budget < def.cost, key: "proposal-" + def.id,
      }));
      return row;
    });
    byId("proposal-list").replaceChildren(...proposals);
  }

  function caseInfo(review) {
    const stage = review.stage ? review.process : review.kind === "central" ? "履历核验" : "组织考察";
    const row = info(review.title, stage + "进行中。下一项程序在" + R.date(review.due) + "。");
    if (!review.clarified) row.append(button("核对材料 · 1 格", () => perform(() => E.administration(state, "review")),
      { disabled: !state.ap, key: "clarify" }));
    return row;
  }

  function timeline(key, entries) {
    byId(key).replaceChildren(...entries.map((note) => {
      const row = element("li", note.kind);
      row.append(element("time", "", R.date(note.month)), element("strong", "", note.title), element("p", "", note.detail));
      return row;
    }));
  }

  const isReady = (item) => item.offered && item.checks.every((check) => check.ok);
  function renderDesk() {
    renderInquiry();
    renderBriefing();
    renderProjects();
    const options = E.openings(state).filter(isReady);
    const appointments = byId("desk-appointments");
    const headline = state.review ? caseInfo(state.review) :
      options.length ? info("本期任用机会", "可办理" + options[0].title +
        (options.length > 1 ? "等 " + options.length + " 项程序。" : "的相关程序。")) :
        info("任用与流动", state.placement?.active ? "在基层安排期内，可以查当前履历。" : "查看下一职务和职级的资格。");
    appointments.replaceChildren(headline, dossierButton("查看履历与任用"));
    const actions = [];
    for (const [action, label, note, disabled] of [
      ["training", "参加集中培训", state.trainingThisRound ? "本期已参加" : "1 格精力", state.trainingThisRound],
      ["budget", state.post.level >= 3 ? "统筹工作额度" : "协调工作额度", state.budget >= 21 ? "当前额度充足" : "1 格精力", state.budget >= 21],
    ]) {
      const control = button("", () => perform(() => E.administration(state, action)), { disabled: !state.ap || disabled, key: action });
      control.append(element("strong", "", label), element("small", "", note));
      actions.push(control);
    }
    if (state.party.stage === 0) actions.push(button("递交入党申请 · 1 格", () => perform(() => E.administration(state, "party")),
      { disabled: !state.ap || Boolean(state.inquiry), key: "party" }));
    if (state.party.stage === 1 || state.party.stage === 2) actions.push(element("p", "muted small",
      state.party.stage === 1 ? "入党申请处于培养考察阶段。" : "当前为预备党员，预备期至" + R.date(state.party.due) + "。"));
    byId("side-actions").replaceChildren(...actions);
    timeline("journal-list", state.log.slice(-5).reverse());
    text("effort-label", "精力 " + state.ap + " / " + E.actionsPerRound);
    byId("effort-meter").replaceChildren(...Array.from({ length: E.actionsPerRound }, (_, index) =>
      element("i", index < state.ap ? "filled" : "")));
    text("turn-notice", state.event ? "推进时将结算本期已处理的事项。" : "未到期的在办事项会延续到下一期。");
    const months = E.period(state);
    byId("advance").replaceChildren(document.createTextNode("推进至" + (months === 12 ? "下一年" : R.date(state.month + months).split(" · ")[1])),
      element("span", "", " →"));
  }

  function requirements(item) {
    const checks = details("gate-" + item.id, "资格与条文");
    checks.className = "requirements";
    const list = element("ul", "requirement-list");
    for (const check of item.checks) {
      const row = element("li");
      const labels = element("div", "requirement-main");
      labels.append(element("span", "", check.label), element("strong", check.ok ? "good" : "missing", check.detail));
      row.append(labels, source(check.source));
      list.append(row);
    }
    checks.append(list);
    return checks;
  }

  const kinds = { office: "领导职务", rank: "职级晋升", exchange: "同级交流", selection: "公开遴选", central: "党内任职" };
  const applications = { office: "接受考察", rank: "参加职级考察", exchange: "办理交流", selection: "报名遴选", central: "进入本轮程序" };
  function opportunityCard(item) {
    const card = element("article", "opening-card");
    const row = element("div", "opening-row");
    const copy = element("div");
    const parsed = item.checks.find((check) => !check.ok);
    const status = parsed ? parsed.label + " · " + parsed.detail :
      !item.offered ? "等候办理窗口" : item.process + " · 占 1 格精力";
    copy.append(element("p", "route-label", kinds[item.kind]), element("h3", "", item.title),
      element("p", "opening-status muted", status));
    const take = button(applications[item.kind], () => perform(() => E.startReview(state, item.id)),
      { style: isReady(item) ? "primary" : "flat", disabled: !isReady(item) || !state.ap, key: item.id });
    row.append(copy, take);
    card.append(row);
    if (item.checks.length) card.append(requirements(item));
    return card;
  }

  const projectOutcomes = { sound: "验收通过", fragile: "已结项，待复核", overdue: "办理超期" };
  function pastProject(project) {
    const row = element("article", "past-project");
    row.append(element("strong", "", project.title), element("small", "", (project.status === "sound" && project.quality >= 7 ?
      "收录为工作案例" : projectOutcomes[project.status]) +
      (project.remediated ? " · 已协同复核" : "") + " · " + R.date(project.finished)));
    return row;
  }

  function renderDossier() {
    const party = state.party.stage === 3 ? "正式党员 · " + R.duration(R.partyMonths(state)).trim() :
      ["群众", "培养考察中", "预备党员"][state.party.stage];
    const hours = state.training.filter((item) => item.month >= state.month - 60).reduce((sum, item) => sum + item.hours, 0);
    byId("facts").replaceChildren(
      datum("工龄", R.duration(state.month).trim()), datum("基层经历", R.duration(state.localMonths).trim()),
      datum("现职任职", R.duration(state.month - state.postSince).trim()), datum("党籍", party),
      datum("近五年集中培训", hours + " 学时"), datum("最近考核", E.latestRating(state) || "待评定"),
      datum("个人储蓄", E.money(state.funds)), datum("招录渠道", C.channels[state.channel]),
      datum("学历", R.degrees[state.degree].label));
    const options = E.openings(state);
    const panel = byId("review-panel");
    if (state.review) {
      const note = caseInfo(state.review);
      note.append(button("回工作台推进", () => chooseView("desk")));
      panel.replaceChildren(note);
    } else {
      panel.replaceChildren();
    }
    byId("opening-list").replaceChildren(...(options.length ? options.map(opportunityCard) :
      state.review ? [] : [element("p", "muted small", "暂时没有可查看的任用岗位。")]));
    const past = state.projects.filter((project) => project.status !== "active");
    const archive = byId("past-projects");
    if (past.length) {
      const fold = details("archive", "查阅 " + past.length + " 件事项", true);
      fold.className = "archive";
      const list = element("div", "past-list");
      list.append(...[...past].reverse().map(pastProject));
      fold.append(list);
      archive.replaceChildren(fold);
    } else {
      archive.replaceChildren(element("p", "muted small", "结项和超期事项会在这里归档。"));
    }
    const colleagues = state.people.map((person) => {
      const node = element("article", "person");
      const due = state.promises.find((item) => item.person === person.id && !item.closed);
      node.append(element("h3", "", person.name + " · " + person.job), element("p", "", person.note));
      if (due) node.append(element("p", "", "还有一项约定在" + R.date(due.due) + "。"));
      return node;
    });
    byId("people-list").replaceChildren(...colleagues);
    timeline("career-log", state.log.filter((item) => item.kind === "career" || item.kind === "scrutiny").slice(-12).reverse());
    const resign = byId("resign");
    resign.disabled = state.month < 60 || Boolean(state.inquiry);
    text("resign-note", state.month < 60 ? "最低服务年限还差 " + R.duration(60 - state.month).trim() + "。" :
      state.inquiry ? "案件办理期间限制辞去公职。" : "");
  }

  function renderHandbook() {
    const groups = R.handbook.map((group, index) => {
      const box = details("manual-" + index, group.title, index === 0);
      box.className = "rule-group";
      for (const [title, rule, ...sources] of group.rules) {
        const row = element("article", "rule");
        const links = element("p", "source-row");
        links.append(...sources.map(source));
        row.append(element("h3", "", title), element("p", "", rule), links);
        box.append(row);
      }
      return box;
    });
    byId("handbook-content").replaceChildren(...groups);
  }

  function renderEnding() {
    byId("outcome").hidden = false;
    text("outcome-date", state.name + " · " + R.date(state.month));
    text("outcome-title", state.outcome.title);
    text("outcome-detail", state.outcome.detail);
    byId("outcome-facts").replaceChildren(datum("最后任职", E.officeTitle(state)), datum("最高领导层次", state.central ?
      R.central[state.central] : R.levels[state.maxLevel]), datum("总工龄", R.duration(state.month).trim()),
      datum("通过验收", state.sound + " 件"), datum("未按期办结", state.recordLoss + " 件"),
      datum("年度优秀", state.assessments.filter((item) => item.rating === "优秀").length + " 次"),
      datum("正常收入与初始存款", E.money(state.legitimate)), datum("期末个人储蓄", E.money(state.funds)));
    const major = state.log.filter((item) => ["正式任职", "中央任职结果", "职级晋升", "验收通过", "政务处分生效", "收到核查通知"].includes(item.title));
    const first = { month: 0, title: "到岗报到", detail: state.stints[0].title + " · " + C.channels[state.channel], kind: "career" };
    timeline("outcome-log", [first, ...major.slice(-6)]);
  }

  function render() {
    if (!state) return;
    byId("intake").hidden = true;
    byId("career").hidden = Boolean(state.outcome);
    byId("outcome").hidden = !state.outcome;
    if (state.outcome) {
      renderEnding();
      return;
    }
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

  byId("degree").addEventListener("change", renderOffers);
  byId("intake-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state = E.create({ name: byId("name").value, degree: byId("degree").value, opening: selected,
      member: byId("member").checked }, crypto.getRandomValues(new Uint32Array(1))[0]);
    if (!state) return;
    remembered.clear();
    eventProject = 0;
    view = "desk";
    save();
    render();
    window.scrollTo(0, 0);
  });
  for (const tab of tabs) tab.addEventListener("click", () => chooseView(tab.dataset.view));
  byId("advance").addEventListener("click", () => perform(() => E.advance(state), { top: true }));
  byId("resign").addEventListener("click", () => {
    byId("resign-dialog").returnValue = "";
    byId("resign-dialog").showModal();
  });
  byId("resign-dialog").addEventListener("close", () => {
    if (byId("resign-dialog").returnValue === "leave") perform(() => E.leave(state), { top: true });
  });
  byId("restart").addEventListener("click", () => {
    byId("restart-dialog").returnValue = "";
    byId("restart-dialog").showModal();
  });
  byId("restart-dialog").addEventListener("close", () => {
    if (byId("restart-dialog").returnValue === "start") intake();
  });

  const record = arcadeSaves.read(id);
  if (!replaceMode && record?.version === version && E.valid(record.state)) {
    state = record.state;
    byId("save-status").hidden = false;
    text("save-status", "本机已存档");
    render();
  } else {
    intake();
    if (new URLSearchParams(location.search).get("mode") === "resume") {
      text("intake-message", "这里没有可继续的存档，可以选择一份通知书开始。");
      byId("intake-message").hidden = false;
    }
  }
})();
