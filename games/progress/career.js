const ProgressCareer = (() => {
  const R = ProgressRules;
  const C = ProgressContent;
  const actionsPerRound = 3;
  const titles = {
    retirement: "办结退休手续", stay: "在一线干到退休", resignation: "离开机关",
    probation: "试用期结束", dismissal: "公职终止", prison: "判决生效", elected: "当选中央委员会总书记",
  };
  const selectionTitles = { appointment: "集体讨论任命", people: "同级人大选举", party: "党委全会选举及上级批准",
    rank: "职级审批", exchange: "办理交流任职", selection: "遴选考察与转任", central: "中央委员会全会选举" };
  const projectById = new Map(C.projects.map((project) => [project.id, project]));
  const storyById = new Map(C.stories.map((story) => [story.id, story]));

  function next(state) {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    return state.seed / 4294967296;
  }

  function sample(state, options) { return options[Math.floor(next(state) * options.length)]; }
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  const district = (state) => C.regions[state.region];
  const place = (state) => state.central >= 2 ? "中央" : state.post.title.startsWith("岚泽省") ? "岚泽省" : state.post.scope === 3 ? C.province :
    state.post.scope === 2 ? district(state).city : district(state).county;
  const scope = (state) => state.central ? 4 : state.post.scope;
  const age = (state) => R.degrees[state.degree].age + Math.floor(state.month / 12);
  const salary = (state) => 6 + Math.max(0, state.rank) + state.post.level * 2 + state.central * 2;
  const officeTitle = (state) => R.central[state.central] || state.post.title;
  const rankTitle = (state) => R.ranks[state.rank] || "试用期";
  const active = (state) => state.projects.filter((project) => project.status === "active");
  const serving = (state) => state.people.filter((person) => !person.retired);
  const latestRating = (state) => state.assessments.at(-1)?.rating || "";

  function record(state, title, detail, kind = "work") {
    state.log.push({ month: state.month, title, detail, kind });
    if (state.log.length > 210) state.log.shift();
  }

  function track(state) {
    const stint = { from: state.month, position: state.post.key, title: state.post.title, level: state.post.level, rank: state.rank };
    if (state.stints.at(-1)?.from === state.month) state.stints[state.stints.length - 1] = stint;
    else state.stints.push(stint);
  }

  function openPost(opening, degree) {
    const region = C.regions[opening.region];
    const unit = opening.channel === "rural" ? (degree === "bachelor" ? region.town + "人民政府" : region.county + "人民政府办公室") : opening.unit;
    return C.job("entry-" + opening.id, unit + " · " + opening.title, 0, opening.scope, opening.topic, "appointment", opening.scope === 0, opening.cap);
  }

  function ruralPost(state) {
    const region = district(state);
    return C.job("village-" + state.opening, region.village + " · " + (state.party.since === null ? "村委会主任助理" : "村党支部书记助理"),
      0, 0, region.focus, "placement", true, state.originalPost.rankCap);
  }

  function changePost(state, post, reason) {
    const old = state.post;
    if (old.key === post.key) return;
    state.post = { ...post };
    state.postSince = state.month;
    if (old.scope !== post.scope) state.agencySince = state.month;
    state.detailUntil = Math.max(state.detailUntil, state.month + 3);
    state.maxLevel = Math.max(state.maxLevel, post.level);
    state.regionsServed = [...new Set([...state.regionsServed, post.title.includes("岚泽省") ? "岚泽省" : place(state)])];
    track(state);
    record(state, reason, old.title + " → " + post.title, "career");
  }

  function create({ name = "", degree = "bachelor", opening: openingId = "county", member = false }, seed) {
    const opening = C.openings.find((option) => option.id === openingId && option.degrees.includes(degree));
    if (!opening) return null;
    const selected = openPost(opening, degree);
    const state = {
      seed: seed >>> 0, vacancySeed: (seed >>> 0) % 17, name: name.trim().slice(0, 16) || "顾行之",
      degree, opening: opening.id, channel: opening.channel, region: opening.region,
      post: selected, originalPost: selected, rank: -1, rankSince: 0, postSince: 0, agencySince: 0, localMonths: 0, formal: false, month: 0, maxLevel: 0,
      central: 0, centralNext: 0, lastCongress: -60, detailUntil: 12,
      placement: opening.channel === "rural" ? { start: 0, end: 24, active: true } :
        opening.channel === "targeted" ? { start: 12, end: 36, active: false } : null,
      party: { stage: member ? 3 : 0, since: member ? -24 : null, due: 0 },
      ap: actionsPerRound, budget: 6 + opening.scope * 2, funds: 8, legitimate: 8, gains: 0, merit: 0, yearWork: 0,
      public: 45, trust: 45, integrity: 60, recordLoss: 0, completed: 0, sound: 0, penalty: 0,
      people: [], projects: [], proposals: [], nextProject: 1, seen: [], event: null,
      stints: [], assessments: [], training: [], trainingThisRound: false, evidence: [], promises: [], log: [], regionsServed: [],
      review: null, inquiry: null, nextOffice: 12, nextRank: 12, nextExchange: 12, nextSelection: 24,
      outcome: null,
    };
    state.people = Array.from({ length: 6 }, (_, index) => {
      const person = C.people[(Math.floor(state.seed % C.people.length) + index) % C.people.length];
      return { id: index + 1, ...person, birthAge: 24 + (state.vacancySeed + index * 11) % 27,
        support: 1 + Math.floor(next(state) * 4), experience: Math.floor(next(state) * 8), position: 0, busy: 0 };
    });
    if (state.placement?.active) state.post = ruralPost(state);
    state.regionsServed.push(place(state));
    track(state);
    record(state, "到岗报到", state.post.title + " · " + C.channels[state.channel], "career");
    if (state.placement?.active) record(state, "开始驻村", district(state).village + "的任职安排为两年。", "career");
    const first = opening.scope === 3 ? "land" : opening.scope === 2 ? "reservoir" : { water: "drain", industry: "wages", services: "bus" }[opening.topic];
    addProject(state, projectById.get(first), true);
    prepare(state, state.channel + "-report");
    return state;
  }

  function prepare(state, first = "") {
    state.ap = actionsPerRound;
    state.trainingThisRound = false;
    const colleagues = serving(state);
    const subject = colleagues.find((person) => person.busy <= state.month)?.id || colleagues[0]?.id || 1;
    const visitingPromise = state.promises.find((promise) => promise.due <= state.month && !promise.closed);
    const revisit = state.projects.find((project) => project.revisit && project.revisit <= state.month && !project.revisited);
    const visitor = state.inquiry ? -1 : state.evidence.findIndex((entry) => !entry.processed && !entry.revisited && entry.followAt <= state.month);
    if (first) {
      state.event = { type: "story", id: first, person: subject };
    } else if (visitor >= 0) {
      state.event = { type: "favor-return", id: visitor, person: subject };
    } else if (visitingPromise) {
      state.event = { type: "promise", id: visitingPromise.id, person: visitingPromise.person };
    } else if (revisit) {
      state.event = { type: "legacy", id: revisit.id, person: subject };
    } else if (state.month >= 48 && state.month % 60 === 48) {
      state.event = { type: "story", id: "congress", person: subject };
    } else {
      const currentScope = scope(state);
      const inScope = C.stories.filter((story) => !story.id.endsWith("-report") && story.id !== "congress" &&
        story.min <= currentScope && story.max >= currentScope);
      const relevant = inScope.filter((story) => story.topic === "all" || story.topic === state.post.topic || state.post.topic === "all");
      const fresh = relevant.filter((story) => !state.seen.includes(story.id));
      const backlist = relevant.filter((story) => !state.seen.slice(-12).includes(story.id));
      const id = sample(state, fresh.length ? fresh : backlist.length ? backlist : relevant).id;
      state.event = { type: "story", id, person: colleagues.length ? sample(state, colleagues).id : subject };
    }
    proposals(state);
  }

  function proposals(state) {
    if (active(state).length >= 2) { state.proposals = []; return; }
    const currentScope = scope(state);
    const common = C.projects.filter((project) => project.min <= currentScope && project.max >= currentScope &&
      !active(state).some((item) => item.def === project.id));
    const already = new Set(state.projects.filter((item) => item.started >= state.month - 60).map((item) => item.def));
    const relevant = (project) => project.topic === "all" || project.topic === state.post.topic || state.post.topic === "all";
    const priority = common.filter((project) => relevant(project) && !already.has(project.id));
    const others = common.filter((project) => !already.has(project.id) && !priority.includes(project));
    const repeated = common.filter((project) => already.has(project.id));
    const option = [];
    for (const pool of [priority, others, repeated]) {
      while (pool.length && option.length < 3) {
        const item = sample(state, pool);
        pool.splice(pool.indexOf(item), 1);
        option.push(item.id);
      }
    }
    state.proposals = option;
  }

  function addProject(state, def, initial = false) {
    if (!def || !initial && (state.ap < 1 || state.budget < def.cost || active(state).length >= 2 ||
      !state.proposals.includes(def.id) || active(state).some((item) => item.def === def.id))) return false;
    if (!initial) state.ap--;
    state.budget -= Math.min(def.cost, state.budget);
    const project = {
      id: state.nextProject++, def: def.id, title: def.name, started: state.month, deadline: state.month + def.months,
      finished: 0, progress: 0, quality: initial ? 2 : 1, target: initial ? Math.min(def.target, 7) : def.target,
      status: "active", revisit: 0, revisited: false, area: place(state), scope: scope(state), staff: 0,
      urgent: initial || def.target >= 8 && next(state) < 0.36,
    };
    state.projects.push(project);
    record(state, "事项立项", project.area + " · " + project.title + "，办理期限到" + R.date(project.deadline) + "。");
    return true;
  }

  function event(state) {
    if (!state.event) return null;
    const { type, id, person } = state.event;
    const colleague = state.people.find((item) => item.id === person)?.name || "同事";
    if (type === "favor-return") {
      return {
        title: "那个人又来了一次",
        body: "当初在「" + state.evidence[id].name + "」里给你好处的人，今天又找到你。他希望在另一件事上得到照顾，私下提出新的好处。",
        choices: [
          C.choose("拒绝并把两次来往如实说清", "就过去和眼前的事项留下说明。", { integrity: 3, trust: 1 }),
          C.choose("停止私下联络", "后续由相关岗位按常规程序办理。", { trust: 1 }, 0),
          C.choose("再收一次好处", "眼前有所得，另一件事也会留下记录。", { illicit: 4, progress: 2, merit: 2, quality: -1 }),
        ],
      };
    }
    if (type === "promise") {
      const promise = state.promises.find((item) => item.id === id);
      return {
        title: "下期说好的那件事", body: colleague + " 把当初约好的交接单放到你面前。原定的时间到了，偏偏你这期事情不少。",
        choices: [
          C.choose("抽时间把交接办妥", "兑现承诺，顺带核掉一项积压。", { trust: 3, person: 3, merit: 1, closePromise: true }),
          C.choose("约定新的办理时间", "挪到后面两个季度。", { person: -1, deferPromise: true }, 0),
          C.choose("说明这件事做不了了", "腾出这期安排，对方会另找帮手。", { trust: -2, person: -3, closePromise: true }, 0),
        ],
      };
    }
    if (type === "legacy") {
      const project = state.projects.find((item) => item.id === id);
      const fine = project.status === "sound";
      return {
        title: fine ? "又见旧项目" : "旧项目需要说明", body: project.area + "的「" + project.title + "」" +
          (fine ? "做出了效果。接手的人发来一份回访，说想照着这份经验再办一处。" : "在复查清单上。接手的同事找到当时的记录，请你一起看看后续怎么补。"),
        choices: fine ? [
          C.choose("把经验和局限都说清", "花点时间交流，增加后续采用的机会。", { merit: 4, trust: 2, public: 1 }),
          C.choose("把验收记录转过去", "留下资料，让接手的人自己调整。", { merit: 2 }, 0),
        ] : [
          C.choose("回去协同复核和整改", "占一格精力，给原项目补做一次复盘。", { public: 3, integrity: 3, reviewLegacy: true }),
          C.choose("按实提交当时的记录", "参与核对，保持各方信息完整。", { trust: 1, integrity: 1, reviewLegacy: true }),
          C.choose("由接手单位处理", "记录移交情况，本期继续手里的事。", { public: -2 }, 0),
        ],
      };
    }
    const story = storyById.get(id);
    if (!story) return null;
    const setting = id.endsWith("-report") && state.channel !== "targeted" ? district(state).description : "";
    return { ...story, body: story.body.replaceAll("{person}", colleague) + setting, choices: story.choices };
  }

  function money(value) { return "¥" + (Math.round(value * 10) / 10).toLocaleString("zh-CN") + " 万"; }

  function sideEffects(state, effect, project = active(state)[0], contact = state.event?.person) {
    state.budget = clamp(state.budget + (effect.budget || 0), 0, 24);
    state.public = clamp(state.public + (effect.public || 0), 0, 100);
    state.trust = clamp(state.trust + (effect.trust || 0), 0, 100);
    state.integrity = clamp(state.integrity + (effect.integrity || 0), 0, 100);
    state.merit += effect.merit || 0;
    state.yearWork += (effect.merit || 0) + Math.max(effect.progress || 0, 0) + Math.max(effect.public || 0, 0);
    if (effect.training) state.training.push({ month: state.month, hours: effect.training });
    const person = state.people.find((item) => item.id === contact);
    if (person && effect.person) person.support = clamp(person.support + effect.person, 0, 12);
    if (project) {
      project.progress = clamp(project.progress + (effect.progress || 0), 0, project.target);
      project.quality = clamp(project.quality + (effect.quality || 0), 0, 8);
    }
    if (effect.illicit) {
      state.gains += effect.illicit;
      state.funds += effect.illicit;
      state.integrity = Math.max(0, state.integrity - effect.illicit * 3);
      state.evidence.push({ month: state.month, followAt: state.month + 6, project: project?.id || 0, name: project?.title || "来访事项",
        amount: effect.illicit, processed: false, revisited: false });
    }
  }

  function chooseStory(state, index, projectId = 0) {
    const card = event(state);
    const choice = card?.choices[index];
    const project = projectId ? active(state).find((item) => item.id === projectId) : active(state)[0];
    if (!choice || projectId && !project || state.ap < choice.cost || state.budget + (choice.effect.budget || 0) < 0) return false;
    state.ap -= choice.cost;
    sideEffects(state, choice.effect, project);
    const occurrence = state.event;
    if (occurrence.type === "story") state.seen.push(occurrence.id);
    if (occurrence.type === "favor-return") state.evidence[occurrence.id].revisited = true;
    if (occurrence.type === "legacy") {
      const project = state.projects.find((item) => item.id === occurrence.id);
      project.revisited = true;
      if (choice.effect.reviewLegacy) project.remediated = true;
    }
    if (occurrence.type === "promise") {
      const promise = state.promises.find((item) => item.id === occurrence.id);
      if (choice.effect.closePromise) promise.closed = true;
      if (choice.effect.deferPromise) promise.due = state.month + 6;
    }
    const link = project && (choice.effect.progress || choice.effect.quality) ? " 关联事项为「" + project.title + "」。" : "";
    record(state, card.title, choice.title + "。" + choice.note + link, choice.effect.illicit ? "scrutiny" : "work");
    state.event = null;
    return true;
  }

  function projectAction(state, id, type, personId = 0) {
    const project = active(state).find((item) => item.id === id);
    if (!project || state.ap < 1) return false;
    const person = state.people.find((item) => item.id === personId);
    let effect;
    let verb;
    switch (type) {
      case "advance":
        if (project.progress === project.target) return false;
        effect = { progress: 2, merit: 1 };
        verb = "推进办理";
        break;
      case "verify":
        if (project.quality === 8 && project.progress === project.target) return false;
        effect = { progress: 1, quality: 2, integrity: 1 };
        verb = "复核现场和材料";
        break;
      case "fund":
        if (state.budget < 2 || project.progress === project.target) return false;
        effect = { progress: 3, budget: -2, merit: 1 };
        verb = state.post.level >= 3 ? "调配额度" : "申请事项用款";
        break;
      case "assign":
        if (!person || !canAssign(state, person) || project.staff > state.month) return false;
        effect = person.strength === "执行" ? { progress: 3, trust: 1 } :
          person.strength === "核查" ? { progress: 1, quality: 3 } : { progress: 2, quality: 1, trust: 2 };
        person.busy = state.month + period(state);
        project.staff = person.busy;
        if (state.post.level < 3) {
          const id = state.promises.length + 1;
          state.promises.push({ id, person: person.id, due: state.month + 6 + Math.floor(next(state) * 3) * 3, closed: false });
        }
        verb = person.name + (state.post.level < 3 ? "答应协助" : "负责下一阶段");
        break;
      default:
        return false;
    }
    state.ap--;
    sideEffects(state, effect, project);
    record(state, verb, project.title + " · " + project.progress + " / " + project.target + " 进度");
    return true;
  }

  function jobNames(state, level) { return C.roles(level, state.region); }
  function canAssign(state, person) {
    return !person.retired && person.busy <= state.month && (state.post.level >= 3 || person.support > 0) &&
      (state.central > 0 || person.position <= state.post.level + 2);
  }
  function exchangePosts(state) {
    if (!state.post.level) {
      const region = district(state);
      const posts = [
        C.job("exchange-water", region.county + "水利局 · 综合岗", 0, 0, "water", "exchange", true, 8),
        C.job("exchange-community", region.town + "人民政府 · 综合岗", 0, 0, "services", "exchange", true, 8),
      ];
      return posts.filter((post) => post.key !== state.post.key);
    }
    const prior = new Set(state.stints.map((stint) => stint.position));
    const peers = jobNames(state, state.post.level).filter((role) => role.key !== state.post.key &&
      (role.path !== "party" || R.partyMonths(state) >= (role.level < 5 ? 36 : 60)));
    return [...peers.filter((role) => !prior.has(role.key)), ...peers.filter((role) => prior.has(role.key))];
  }

  const ready = (checks) => checks.every((check) => check.ok);
  function vacancy(state, role, slot) {
    const occupied = serving(state).some((person) => person.job === role.title && person.filledUntil > state.month);
    const window = (R.year(state.month) + state.vacancySeed + slot * 2 + role.level) % 4 !== 0;
    return state.formal && state.month >= state.nextOffice && !occupied && window;
  }

  function openings(state) {
    if (state.outcome || state.review) return [];
    const list = [];
    const blocked = Boolean(state.placement?.active);
    if (state.post.level < 8 && !blocked) {
      const positions = jobNames(state, state.post.level + 1);
      const style = state.post.topic === "all" ? district(state).focus : state.post.topic;
      const lead = positions.find((item) => item.topic === style && item.path !== "party") || positions[0];
      const second = positions.find((item) => item.path === "party") || positions.find((item) => item !== lead);
      const available = [lead, second].filter(Boolean);
      if (!state.post.level && state.rank >= 2) available.push(jobNames(state, 2)[1]);
      for (const [slot, role] of available.entries()) {
        const checks = R.officeGate(state, role);
        list.push({ id: "office-" + role.key, kind: "office", title: role.title, target: role, checks,
          offered: vacancy(state, role, slot), process: selectionTitles[role.path] });
      }
    }
    if (state.formal && state.rank < R.ranks.length - 1) {
      const target = state.rank + 1;
      const earnedFromOffice = ({ 1: 3, 2: 5, 3: 7, 4: 9, 5: 11 })[state.post.level];
      const candidates = [target];
      if (earnedFromOffice > target && ready(R.rankGate(state, earnedFromOffice))) candidates.push(earnedFromOffice);
      for (const rank of candidates) list.push({ id: "rank-" + rank, kind: "rank", title: R.ranks[rank], target: rank,
        checks: R.rankGate(state, rank), offered: state.month >= state.nextRank, process: selectionTitles.rank });
    }
    if (state.formal && !state.central && !blocked) {
      for (const target of exchangePosts(state)) {
        list.push({ id: "exchange-" + target.key, kind: "exchange", title: target.title, target, checks: [],
          offered: state.month >= state.nextExchange && state.month - state.postSince >= 12 && !state.inquiry,
          process: selectionTitles.exchange });
      }
      if (!state.post.level && state.post.scope < 3) {
        const region = district(state);
        const title = state.post.scope < 2 ? region.city + "发展和改革委员会 · 综合岗" : C.province + "水利厅 · 规划岗";
        const next = C.job("selection-" + state.post.scope, title, 0, state.post.scope < 2 ? 2 : 3, "all", "selection", false, state.post.scope < 2 ? 10 : 11);
        list.push({ id: "selection", kind: "selection", target: next, title: next.title, checks: R.selectionGate(state),
          offered: state.month >= state.nextSelection, process: selectionTitles.selection });
      }
    }
    if (state.post.level >= 8 || state.central) {
      const target = state.central + 1;
      const inCongressYear = state.month % 60 >= 48;
      const window = target === 1 ? inCongressYear && state.month - state.lastCongress >= 48 :
        state.month >= state.centralNext && (target < 4 || inCongressYear);
      list.push({ id: "central-" + target, kind: "central", title: R.central[target], target,
        checks: R.centralGate(state, target), offered: window,
        process: target === 1 ? "党的全国代表大会选举" : selectionTitles.central });
    }
    return list;
  }

  function startReview(state, id) {
    if (state.ap < 1 || state.review) return false;
    const opportunity = openings(state).find((item) => item.id === id);
    if (!opportunity?.offered || !ready(opportunity.checks)) return false;
    state.ap--;
    const colleagues = serving(state);
    const opposing = colleagues.filter((item) => item.position <= state.post.level + 1);
    const competitor = sample(state, opposing.length ? opposing : colleagues.length ? colleagues : state.people);
    state.review = {
      kind: opportunity.kind, title: opportunity.title, target: opportunity.target, process: opportunity.process,
      competitor: competitor.id, noise: next(state) * 10 - 5, competition: next(state) * 12,
      stage: 0, due: state.month + 3, clarified: false,
    };
    if (opportunity.kind === "central" && opportunity.target === 1) state.lastCongress = state.month;
    state.detailUntil = Math.max(state.detailUntil, state.month + 6);
    record(state, opportunity.kind === "selection" ? "参加遴选" : "进入任用程序", opportunity.title + " · " +
      (opportunity.kind === "central" ? opportunity.process : "组织考察"), "career");
    return true;
  }

  function reviewReady(state, review) {
    const competitor = state.people.find((person) => person.id === review.competitor);
    const excellent = state.assessments.slice(-5).filter((item) => item.rating === "优秀").length;
    const assessment = latestRating(state);
    const own = state.trust * 0.24 + state.public * 0.19 + state.integrity * 0.15 + Math.min(state.merit, 95) * 0.2 +
      excellent * 3 + review.noise + (review.clarified ? 5 : 0);
    if (state.penalty > state.month || state.inquiry?.stage > 0) return false;
    if (review.kind === "central") {
      const legacy = Math.min(24, state.sound * 1.7) + Math.min(8, state.regionsServed.length * 1.3);
      const target = review.target;
      const threshold = [0, 76, 91, 106, 125][target] + review.competition * (target === 4 ? 0.35 : 1);
      const minimum = [0, 3, 5, 7, 10][target];
      const national = state.projects.filter((project) => project.scope === 4 && project.status === "sound");
      const nationallyDistinct = new Set(national.map((project) => project.def)).size;
      const awarded = new Set(national.filter((project) => project.quality >= 7).map((project) => project.def)).size;
      const portfolio = target === 4 ? Math.min(3, nationallyDistinct) +
        (state.regionsServed.includes(C.province) && state.regionsServed.includes("岚泽省") ? 2.5 : 0) : 0;
      return state.sound >= minimum && (target !== 4 || (nationallyDistinct >= 3 && awarded >= 2 && excellent >= 4)) &&
        R.partyMonths(state) >= 60 && own + legacy + portfolio >= threshold;
    }
    if (review.kind === "exchange") return state.trust >= 20;
    if (review.kind === "rank") return assessment !== "不称职" && own >= 21 + review.competition * 0.65 + review.target;
    if (review.kind === "selection") return own >= 37 + review.competition;
    if (!ready(R.officeGate(state, review.target))) return false;
    const competition = 27 + review.target.level * 3 + review.competition +
      Math.min(8, Math.max(0, competitor.experience - state.month / 24) * 0.7);
    return own >= competition;
  }

  function settleReview(state) {
    const review = state.review;
    if (!review || review.due > state.month) return;
    if (!review.stage) {
      review.stage = 1;
      review.due = state.month + 3;
      record(state, "进入下一程序", review.title + " · " + review.process, "career");
      return;
    }
    state.review = null;
    if (review.kind === "office") state.nextOffice = state.month + 9;
    if (review.kind === "rank") state.nextRank = state.month + 9;
    if (review.kind === "exchange") state.nextExchange = state.month + 9;
    if (review.kind === "selection") state.nextSelection = state.month + 18;
    if (review.kind === "central") state.centralNext = state.month + (review.target === 4 ? 24 : 18);
    const competitor = state.people.find((person) => person.id === review.competitor);
    if (!reviewReady(state, review)) {
      if (review.kind === "office") {
        competitor.position = Math.max(competitor.position, review.target.level);
        competitor.job = review.title;
        competitor.filledUntil = state.month + 12;
        record(state, "本次任用结果", competitor.name + "获任" + review.title + "。你的现岗位继续履职。", "career");
      } else {
        record(state, "本次任用结果", "未列入「" + review.title + "」的拟任或当选名单。", "career");
      }
      return;
    }
    if (review.kind === "office" || review.kind === "exchange" || review.kind === "selection") {
      if (review.kind === "selection") state.budget += 3;
      changePost(state, review.target, review.kind === "office" ? "正式任职" : review.kind === "selection" ? "遴选后转任" : "同级交流");
    } else if (review.kind === "rank") {
      state.rank = review.target;
      state.rankSince = state.month;
      track(state);
      record(state, "职级晋升", rankTitle(state), "career");
    } else {
      state.central = review.target;
      record(state, "中央任职结果", review.title, "career");
      if (review.target === 4) finish(state, "elected", "中央委员会全体会议的选举结果公布，你当选中央委员会总书记。");
    }
  }

  function administration(state, action) {
    if (state.ap < 1) return false;
    switch (action) {
      case "training": {
        if (state.trainingThisRound) return false;
        state.trainingThisRound = true;
        const hours = state.post.level >= 3 || state.rank >= 6 ? 200 : 120;
        state.training.push({ month: state.month, hours });
        record(state, "集中培训", "本次集中培训记入 " + hours + " 学时。", "career");
        state.yearWork += 1;
        break;
      }
      case "budget":
        if (state.budget >= 21) return false;
        state.budget += state.post.level >= 3 ? 4 : 3;
        state.yearWork += 1;
        record(state, "补充额度", "办理事项可用额度增加。");
        break;
      case "party":
        if (state.party.stage || state.inquiry) return false;
        state.party.stage = 1;
        state.party.due = state.month + 15;
        record(state, "递交入党申请", "组织开展谈话、培养和考察。", "career");
        break;
      case "review":
        if (!state.review || state.review.clarified) return false;
        state.review.clarified = true;
        state.yearWork++;
        record(state, "核对考察材料", "补齐任职、培训和项目的现有记录。", "career");
        break;
      case "inquiry":
        if (!state.inquiry || state.inquiry.cooperated) return false;
        state.inquiry.cooperated = true;
        record(state, "配合核查", "就调查范围内的项目按实说明情况。", "scrutiny");
        break;
      case "rectify":
        if (!state.inquiry || state.inquiry.returned || !state.gains) return false;
        state.inquiry.returned = true;
        state.funds = Math.max(0, state.funds - state.gains);
        state.gains = 0;
        record(state, "退回不当所得", "处理过程纳入后续调查。", "scrutiny");
        break;
      default:
        return false;
    }
    state.ap--;
    return true;
  }

  function closeProjects(state) {
    for (const project of active(state)) {
      const definition = projectById.get(project.def);
      if (project.progress >= project.target) {
        project.status = project.quality >= 5 ? "sound" : "fragile";
        project.finished = state.month;
        project.revisit = state.month + 12 + Math.floor(next(state) * 9) * 3;
        state.completed++;
        const good = project.status === "sound";
        if (good) state.sound++;
        sideEffects(state, { merit: good ? 8 : 4, public: good ? 7 : 1, integrity: good ? 1 : 0 }, null);
        const detail = project.quality >= 7 ? "留下完整的复核资料，收入同类工作案例。" :
          good ? "形成可核对的验收记录。" : "完成了进度，部分质量记录还需要复查。";
        record(state, good ? "验收通过" : "结项后仍待复核", project.title + detail, "project");
      } else if (project.deadline <= state.month) {
        project.status = "overdue";
        project.finished = state.month;
        project.revisit = state.month + 12 + Math.floor(next(state) * 8) * 3;
        state.recordLoss++;
        sideEffects(state, { merit: -3, public: -5, trust: -2 }, null);
        record(state, "超过办理时限", definition.legacy + "留下了未完成事项。", "project");
      }
    }
  }

  function assess(state) {
    const work = state.yearWork;
    const overall = work + state.public / 15 + state.trust / 20 + state.integrity / 25;
    const rating = overall >= 18 && work >= 8 ? "优秀" :
      overall >= 10 && work >= 2 ? "称职" : overall >= 6 ? "基本称职" : "不称职";
    const recorded = state.month === 12 ? "未定等次" : rating;
    state.assessments.push({ month: state.month, rating: recorded, work });
    state.yearWork = 0;
    state.budget = Math.min(24, state.budget + 5 + scope(state) * 2);
    const pay = salary(state);
    state.funds += pay;
    state.legitimate += pay;
    for (const person of serving(state)) {
      if (person.birthAge + Math.floor(state.month / 12) >= 63) {
        person.retired = true;
        person.job = "已退休";
        record(state, "同事退休", person.name + "办完退休交接，相关岗位重新统筹。", "career");
        continue;
      }
      person.experience += next(state) < 0.65 ? 1 : 0;
      if (person.experience > 2 * (person.position + 1) + 4 && next(state) < 0.16 && person.position < 8) {
        person.position++;
        const role = C.roles(person.position, state.region)[0];
        person.job = role.title;
        record(state, "同事调动", person.name + "到" + person.job + "任职。", "career");
      }
    }
    if (serving(state).length < 4) {
      const successor = C.people.find((profile) => !state.people.some((person) => person.name === profile.name));
      if (successor) {
        state.people.push({ ...successor, id: state.people.length + 1, birthAge: 24 - Math.floor(state.month / 12),
          support: 2, experience: 0, position: 0, busy: 0 });
        record(state, "新同事报到", successor.name + "接手一部分日常工作。", "career");
      }
    }
    if (state.month === 12) {
      if (work < 2) {
        finish(state, "probation", "试用期满。按本局工作记录，任职考核未通过，录用手续终止。");
        return;
      }
      state.formal = true;
      state.rank = R.degrees[state.degree].rank;
      state.rankSince = state.month;
      track(state);
      record(state, "试用期满，任职定级", rankTitle(state) + " · 任职时间从本期起算。", "career");
    } else {
      record(state, "年度考核 · " + recorded, "第 " + (R.year(state.month) - 1) + " 年的考核归档。", "career");
      if (recorded === "不称职") {
        if (state.post.level) {
          changePost(state, C.roles(state.post.level - 1, state.region)[0] || state.originalPost, "考核后降低任职层次");
        } else if (state.rank > 0) {
          state.rank--;
          state.rankSince = state.month;
          track(state);
          record(state, "调整职级", rankTitle(state), "career");
        }
      }
    }
  }

  function placements(state) {
    if (!state.placement) return;
    const schedule = state.placement;
    if (!schedule.active && state.month >= schedule.start && state.month < schedule.end) {
      schedule.active = true;
      changePost(state, ruralPost(state), "按录用安排到基层锻炼");
    }
    if (schedule.active && state.month >= schedule.end) {
      state.placement = null;
      changePost(state, state.originalPost, "基层任职期满，回录用单位");
    }
  }

  function membership(state) {
    if (![1, 2].includes(state.party.stage) || state.party.due > state.month) return;
    if (state.party.stage === 1) {
      if (state.integrity < 32 || state.inquiry) {
        state.party.due = state.month + 12;
        return;
      }
      state.party.stage = 2;
      state.party.due = state.month + 12;
      record(state, "接收为预备党员", "进入为期一年的预备期。", "career");
    } else {
      state.party.stage = 3;
      state.party.since = state.month;
      record(state, "预备期满转正", "党龄从转为正式党员之日算起。", "career");
    }
  }

  const checks = ["初步核查", "监察调查", "检察机关审查起诉", "法院审判"];
  function inquiryStep(state) {
    if (!state.inquiry) {
      const oldest = state.evidence.find((item) => !item.processed && item.month <= state.month - 12 &&
        (state.projects.some((project) => project.id === item.project && project.status !== "active") || item.month <= state.month - 24));
      if (!oldest || (state.month % 12 && !state.review)) return;
      const evidence = state.evidence.filter((item) => !item.processed && item.month <= state.month - 6);
      const severity = evidence.reduce((sum, item) => sum + item.amount, 0);
      const event = next(state) < Math.min(0.92, 0.3 + severity * 0.045 + (state.review ? 0.2 : 0));
      if (!event) return;
      state.inquiry = { stage: 0, due: state.month + 3, severity, name: oldest.name, cooperated: false, returned: false, started: state.month };
      record(state, "收到核查通知", "此前「" + oldest.name + "」的往来记录进入核查。", "scrutiny");
      return;
    }
    const inquiry = state.inquiry;
    if (inquiry.due > state.month) return;
    if (!inquiry.stage && inquiry.severity <= 4) {
      state.penalty = state.month + (inquiry.cooperated ? 6 : 12);
      state.trust = Math.max(0, state.trust - 14);
      state.integrity = Math.max(0, state.integrity - 8);
      state.evidence.filter((item) => item.month <= inquiry.started - 6).forEach((item) => { item.processed = true; });
      record(state, "政务处分生效", "本次作出" + (inquiry.cooperated ? "警告" : "记过") + "处分。处分期内限制晋升。", "scrutiny");
      state.inquiry = null;
      return;
    }
    if (inquiry.stage < 3) {
      inquiry.stage++;
      inquiry.due = state.month + 3;
      record(state, checks[inquiry.stage], "核查事项涉及「" + inquiry.name + "」。", "scrutiny");
      return;
    }
    if (inquiry.cooperated && inquiry.returned && inquiry.severity < 10) {
      finish(state, "dismissal", "案件审判结束，本局的公职因依法处理终止。");
    } else {
      finish(state, "prison", "法院依法作出有罪判决并判处实刑。任职履历在判决生效时归档。");
    }
  }

  function period(state) {
    const remaining = Math.min(...active(state).filter((project) => project.urgent).map((project) => project.deadline - state.month));
    if (state.month < 12 || state.month < state.detailUntil || state.review || state.inquiry || remaining <= 6) return 3;
    const untilYear = 12 - state.month % 12;
    const untilPlacement = state.placement?.end - state.month;
    const untilVisitor = Math.min(...state.evidence.filter((entry) => !entry.processed && !entry.revisited && entry.followAt > state.month)
      .map((entry) => entry.followAt - state.month));
    return Math.min(untilYear, remaining - 6, untilPlacement > 0 ? untilPlacement : Infinity, untilVisitor);
  }

  function rotation(state) {
    if (state.central || state.month - state.postSince < 120 || !["party", "people"].includes(state.post.path)) return;
    const post = exchangePosts(state)[0];
    if (post) changePost(state, post, "依任期规定交流");
  }

  function finish(state, id, detail) {
    state.outcome = { id, title: titles[id], detail, month: state.month };
    record(state, titles[id], detail, "career");
  }

  function leave(state) {
    if (state.outcome || state.month < 60 || state.inquiry) return false;
    finish(state, "resignation", "按本局办理结果辞去公职。已完成的事项和历次任职记录随个人履历归档。");
    return true;
  }

  function advance(state) {
    if (state.outcome) return false;
    const until = state.month + period(state);
    if (state.event?.type === "story") state.seen.push(state.event.id);
    if (state.event?.type === "promise") {
      const promise = state.promises.find((item) => item.id === state.event.id);
      promise.due += 3;
    }
    state.event = null;
    do {
      if (state.post.local) state.localMonths += 3;
      state.month += 3;
      closeProjects(state);
      if (state.month % 12 === 0) assess(state);
      if (state.outcome) break;
      placements(state);
      membership(state);
      inquiryStep(state);
      if (state.outcome) break;
      settleReview(state);
      if (state.outcome) break;
      rotation(state);
      if (age(state) >= (state.central ? 70 : 63) && !state.inquiry && !state.review) {
        const title = state.maxLevel ? "retirement" : "stay";
        finish(state, title, "这段职业生涯走到退休。办过的事项、同期同事和年度考核都已归档。");
      }
    } while (state.month < until && !state.outcome && !state.inquiry && state.detailUntil <= state.month);
    if (!state.outcome) prepare(state);
    return true;
  }

  function valid(state) {
    return Boolean(state && Number.isSafeInteger(state.seed) && Number.isSafeInteger(state.month) && state.month >= 0 &&
      state.month % 3 === 0 && Number.isSafeInteger(state.rank) && state.rank >= -1 && state.rank < R.ranks.length &&
      Number.isSafeInteger(state.central) && state.central >= 0 && state.central < R.central.length &&
      Object.hasOwn(R.degrees, state.degree) && C.regions[state.region] &&
      C.openings.some((opening) => opening.id === state.opening) && typeof state.name === "string" &&
      state.post && typeof state.post.title === "string" && Number.isSafeInteger(state.post.level) &&
      state.party && Number.isSafeInteger(state.party.stage) &&
      ["projects", "people", "stints", "log", "seen", "proposals", "assessments", "evidence", "promises", "training", "regionsServed"]
        .every((field) => Array.isArray(state[field])) &&
      state.projects.every((item) => item && projectById.has(item.def)) &&
      (state.event?.type !== "story" || storyById.has(state.event.id)));
  }

  return { actionsPerRound, checks, create, valid, place, scope, age, period, officeTitle, rankTitle, active, latestRating, money,
    event, chooseStory, projectAction, canAssign, addProject, openings, startReview, administration, leave, advance };
})();
