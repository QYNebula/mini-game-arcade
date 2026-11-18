const ProgressCareer = (() => {
  const R = ProgressRules;
  const C = ProgressContent;
  const taskIndex = new Map(C.tasks.map((task) => [task.id, task]));
  const eventIndex = new Map(C.events.map((event) => [event.id, event]));
  const caps = { section: [75, 90], county: [55, 75], bureau: [40, 60], province: [30, 50], central: [20, 35], secretary: [8, 15] };
  const endingTitles = { retired: "按期退休", steady: "留在岗位直至退休", resign: "辞去公职",
    dismissed: "开除公职", sentenced: "裁判生效 · 服刑", elected: "当选中央委员会总书记" };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const currentScope = (state) => state.central ? 4 : state.post.scope;
  const title = (state) => R.central[state.central] || state.post.title;
  const age = (state) => Math.floor((R.startYear * 12 + state.month - state.birth) / 12);
  const healthFactor = (health) => Math.min(1, 0.3 + health / 100);
  const retirement = (state) => R.retirement(state);
  const totalScore = (state) => state.score.merit + state.score.credit + state.score.ties;
  const danger = (state) => Math.min(100, state.incidents.reduce((sum, incident) => sum + incident.risk, 0));
  const remaining = (state) => state.outcome ? 0 : Math.max(0, Math.min(6 - state.month % 6, retirement(state).month - state.month));
  const nextInspection = (state) => (Math.floor(state.month / 48) + 1) * 48;

  function random(state) {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    return state.seed / 4294967296;
  }

  function record(state, kind, headline, detail, month = state.month) {
    state.log.push({ kind, title: headline, detail, month });
    if (state.log.length > 260) state.log.shift();
  }

  function noteStint(state) {
    const entry = { from: state.month, position: state.post.id, title: state.post.title, level: state.post.level, rank: state.rank };
    if (state.stints.at(-1)?.from === state.month) state.stints[state.stints.length - 1] = entry;
    else state.stints.push(entry);
  }

  function install(state, post, heading) {
    const before = state.post.title;
    state.post = post;
    state.postSince = state.month;
    state.agencySince = state.month;
    state.highest = Math.max(state.highest, post.level);
    noteStint(state);
    record(state, "office", heading, before + " → " + post.title);
  }

  function periodStart(state) {
    state.cycle = { from: state.month, at: state.month + 2 + Math.floor(random(state) * 4), generated: false, used: [], offers: [] };
    const scope = currentScope(state);
    for (const group of Object.keys(C.limits)) {
      const pool = C.tasks.filter((item) => item.scope === scope && item.group === group && (item.central || 0) <= state.central);
      const last = state.recentOffers.filter((item) => pool.some((task) => task.id === item));
      const fresh = pool.filter((item) => !last.includes(item.id));
      const choose = (items) => {
        const index = Math.floor(random(state) * items.length);
        return items.splice(index, 1)[0];
      };
      const options = [];
      while (options.length < Math.min(3, pool.length)) {
        const picked = choose(fresh.length ? fresh : pool.filter((item) => !options.includes(item)));
        options.push(picked);
      }
      state.cycle.offers.push(...options.map((item) => item.id));
    }
    state.recentOffers = state.cycle.offers.slice();
  }

  function create(profile, examScore, seed) {
    const allocation = C.allocation(profile, examScore, seed);
    const education = R.degrees[profile.degree];
    const birthMonth = (seed >>> 5) % 12;
    const birth = (R.startYear - education.age - (birthMonth ? 1 : 0)) * 12 + birthMonth;
    const state = {
      name: profile.name, degree: profile.degree, gender: profile.gender, channel: profile.channel, examScore, birth,
      seed: (seed ^ 0x7b5c9a3d) >>> 0, calendar: seed % 19, month: 0,
      initialPost: allocation.post, post: allocation.post, postSince: 0, agencySince: 0, formal: false, rank: -1, rankSince: 0,
      placement: allocation.placement ? { ...allocation.placement, active: false, done: false } : null,
      central: 0, highest: 0, localMonths: 0, party: { since: profile.member ? -24 : null, stage: profile.member ? 3 : 0, ends: 0 },
      penalty: 0, yearWork: 0, score: { merit: 0, credit: 0, ties: 0 }, health: 85,
      stints: [], assessments: [], training: [], incidents: [], followUps: [], pending: [], log: [], recentOffers: [], recentEvents: [],
      reveals: [], checks: 0, attempts: 0, projects: 0, goal: "", eligibleSince: {}, outcome: null,
    };
    if (state.placement?.start === 0) {
      state.placement.active = true;
      state.post = C.deployment(state.post.region, profile.member);
    }
    noteStint(state);
    record(state, "office", "入职报到", C.channels[state.channel] + "，模拟考试 " + examScore + " 分。任职从" + state.post.title + "开始。");
    periodStart(state);
    return state;
  }

  function finish(state, kind, detail) {
    state.outcome = { kind, title: endingTitles[kind], detail, month: state.month };
    record(state, "office", endingTitles[kind], detail);
  }

  function leadershipBand(level) {
    return level <= 2 ? "section" : level <= 4 ? "county" : level <= 6 ? "bureau" : "province";
  }

  function rankBand(rank) {
    return rank <= 5 ? "section" : rank <= 9 ? "county" : "bureau";
  }

  function opportunities(state) {
    const list = [];
    if (!state.central && state.post.level < 8) {
      for (const post of C.nextPositions(state.post)) {
        list.push({ id: post.id, kind: "office", title: post.title, target: post, band: leadershipBand(post.level),
          needs: R.officeGate(state, post), procedure: C.procedures[post.path] });
      }
    } else if (state.central < 4) {
      const target = state.central + 1;
      list.push({ id: "central-" + target, kind: "central", target, title: R.central[target],
        band: target === 4 ? "secretary" : "central", needs: R.centralGate(state, target),
        procedure: target === 1 ? "由党的全国代表大会选举" : "由中央委员会全体会议选举" });
    }
    const rank = state.rank + 1;
    if (state.formal && rank > 0 && rank < R.ranks.length && !state.central) {
      list.push({ id: "rank-" + rank, kind: "rank", title: R.ranks[rank], target: rank, band: rankBand(rank),
        needs: R.rankGate(state, rank), procedure: C.procedures.rank });
    }
    return list;
  }

  function target(state) {
    if (state.goal === "stay") return null;
    const options = opportunities(state);
    return options.find((item) => item.id === state.goal) || options.find((item) => item.kind !== "rank") || options[0] || null;
  }

  function availableWindow(state, wanted, month) {
    if (!wanted || !month || month % 6) return false;
    if (wanted.kind === "central") return wanted.target === 1 || wanted.target === 4 ? month % 60 === 0 :
      month % 24 === 0 || month % 60 === 0;
    if (wanted.band === "province" && month % 12) return false;
    const lane = wanted.kind === "office" ? wanted.target.level : wanted.target + 2;
    return (Math.floor(month / 6) + state.calendar + lane) % 7 !== 0;
  }

  function windowDate(state, wanted, month = state.month) {
    const start = (Math.floor(month / 6) + 1) * 6;
    for (let candidate = start; candidate <= start + 60; candidate += 6) {
      if (availableWindow(state, wanted, candidate)) return candidate;
    }
    return null;
  }

  function gate(state, wanted) {
    if (!wanted) return false;
    const placement = state.placement?.active && wanted.kind !== "rank";
    return !placement && wanted.needs.every((condition) => condition.ok);
  }

  function assessTarget(state, wanted = target(state)) {
    if (!wanted) return { wanted: null, qualified: false, probability: 0, next: null, cap: 0 };
    const [first, maximum] = caps[wanted.band];
    const started = state.eligibleSince[wanted.id] ?? state.month;
    const cap = Math.min(maximum, first + Math.floor((state.month - started) / 12) * (wanted.band === "secretary" ? 2 : 3));
    const qualified = gate(state, wanted);
    const probability = qualified && state.health >= 20 ? (totalScore(state) / 100) * cap * healthFactor(state.health) : 0;
    const next = windowDate(state, wanted);
    return { wanted, qualified, probability, cap, next: next !== null && next < retirement(state).month ? next : null };
  }

  function setGoal(state, id) {
    if (state.outcome || state.reveals.length) return false;
    if (id !== "stay" && !opportunities(state).some((item) => item.id === id)) return false;
    state.goal = id;
    return true;
  }

  function inheritScore(state, rate) {
    for (const key of Object.keys(C.limits)) state.score[key] = Math.floor(state.score[key] * rate);
    for (const item of state.incidents) {
      if (item.resolved) continue;
      for (const key of Object.keys(C.limits)) item.gains[key] = Math.floor(item.gains[key] * rate);
    }
  }

  function promote(state, wanted) {
    if (wanted.kind === "office") {
      install(state, wanted.target, "任用生效");
    } else if (wanted.kind === "rank") {
      state.rank = wanted.target;
      state.rankSince = state.month;
      noteStint(state);
      record(state, "office", "职级晋升", wanted.title);
    } else {
      state.central = wanted.target;
      record(state, "office", "中央任用生效", wanted.title);
      if (state.central === 4) finish(state, "elected", "中央委员会全体会议选举结果公布，你当选中央委员会总书记。");
    }
    state.goal = wanted.kind === "rank" ? (state.rank < state.post.rankCap ? "rank-" + (state.rank + 1) : "stay") : "";
    if (!state.outcome) inheritScore(state, wanted.kind === "rank" ? 0.8 : 0.45);
  }

  function inspect(state) {
    state.checks++;
    const chance = danger(state);
    if (!chance) {
      record(state, "audit", "四年一次的例行检查", "当前履历的危险值为 0%。");
      return;
    }
    const hit = random(state) * 100 < chance;
    const discovered = state.incidents.filter((item) => !item.resolved);
    let headline = "本轮未触发进一步核查";
    let detail = "记录继续进入下一轮例行检查。";
    if (hit && !discovered.length) {
      headline = "核对既有处理记录";
      detail = "本次核对了既有处分和处理记录。履历累计记载继续有效。";
    } else if (hit) {
      const gravity = discovered.reduce((sum, item) => sum + item.severity, 0);
      for (const item of discovered) {
        item.resolved = true;
        item.checkedAt = state.month;
        for (const key of Object.keys(C.limits)) state.score[key] = Math.max(0, state.score[key] - item.gains[key]);
      }
      if (gravity >= 7) {
        headline = "职务犯罪案件生效判决";
        detail = "监察调查后移送检察机关审查起诉，最终由法院作出有罪判决并判处实刑。";
        finish(state, "sentenced", detail);
      } else if (gravity >= 5) {
        headline = "开除公职";
        detail = "本轮核查查实多项问题，处分决定终止了这段任职经历。";
        finish(state, "dismissed", detail);
      } else {
        const months = gravity >= 3 ? 12 : 6;
        state.penalty = Math.max(state.penalty, state.month + months);
        state.score.credit = Math.max(0, state.score.credit - gravity * 2);
        headline = gravity >= 3 ? "记过处分" : "警告处分";
        detail = "核查认定 " + discovered.length + " 项待查事项。处分影响期 " + R.duration(months) + "。";
      }
    }
    record(state, "audit", headline, detail);
    state.reveals.push({ kind: "audit", subject: "例行纪检检查", chance, hit, title: headline, detail, month: state.month });
  }

  function halfYear(state) {
    if (state.month % 48 === 0) inspect(state);
    if (state.outcome) return;
    const current = assessTarget(state);
    const { wanted, qualified, probability } = current;
    if (wanted && qualified && availableWindow(state, wanted, state.month)) {
      if (!probability) {
        record(state, "office", state.health < 20 ? "本期病休" : "本期任用", state.health < 20 ? "按病休状态暂缓任用。" : "本期晋升积累为零。");
      } else {
        state.attempts++;
        const hit = random(state) * 100 < probability;
        const result = hit ? (wanted.kind === "rank" ? "职级晋升" : "任用成功") : "本轮未获任用";
        const rival = C.people[(state.calendar + Math.floor(state.month / 6)) % C.people.length];
        const later = current.next === null ? "本局到龄前暂无排定窗口。" : "下次预计机会在" + R.date(current.next) + "。";
        const detail = hit ? wanted.procedure + "。拟任" + wanted.title + "。" :
          (wanted.kind === "rank" ? "本轮审批结果已登记。" : "该轮任用名额由" + rival + "获得。") + later;
        state.reveals.push({ kind: "promotion", subject: wanted.title, chance: probability, hit, title: result, detail, month: state.month });
        record(state, "office", result, wanted.title + " · 当轮胜算 " + probability.toFixed(1) + "%。");
        if (hit) promote(state, wanted);
      }
    }
    if (!state.outcome) periodStart(state);
  }

  function transferTasks(state) {
    if (!state.formal || state.placement?.active || state.central || state.month - state.postSince < 12 ||
      state.cycle.used.includes("exchange") || state.penalty > state.month) return [];
    const next = C.lateral(state.post);
    const list = [{
      id: "exchange", group: "ties", title: state.post.level ? "赴异地任同类职务" : "接受组织交流安排",
      body: next.title + "。按岗位所需的任用程序办理，履历开始记入这段经历。",
      options: [C.pick("办理交流", 2, { post: next, ties: 3, health: -3 })],
    }];
    if (!state.post.level && state.post.scope < 2 && !state.cycle.used.includes("selection") &&
      R.selectionGate(state).every((condition) => condition.ok)) {
      const city = C.business(state.post.region, 2);
      list.push({ id: "selection", group: "credit", title: "参加市直公开遴选", body: city.title + "进入本局遴选安排。",
        options: [C.pick("参加遴选并办理转任", 2, { post: city, credit: 3, health: -4 })] });
    }
    return list;
  }

  function tasks(state) {
    const planned = state.cycle.offers.map((id) => taskIndex.get(id)).filter((task) =>
      task?.scope === currentScope(state) && !state.cycle.used.includes(task.id));
    const hours = state.post.level >= 3 || state.rank >= 6 ? 200 : 120;
    if (!state.cycle.used.includes("training")) {
      planned.push({ id: "training", group: "credit", title: "参加集中培训",
        body: "记入 " + hours + " 学时，计入履历和拟任资格。",
        options: [C.pick("参加培训", 1, { training: hours, credit: 2, health: -1 })] });
    }
    if (!state.party.stage && !state.cycle.used.includes("party")) {
      planned.push({ id: "party", group: "credit", title: "递交入党申请",
        body: "进入培养和考察安排，党龄从转为正式党员之日计算。",
        options: [C.pick("递交申请", 1, { party: true, health: -1 })] });
    }
    return planned.concat(transferTasks(state));
  }

  const follows = {
    work: { after: 12, title: "旧事项回来接受复核", body: "新的负责人约你一起对照原承诺，确认真正办成了多少。",
      options: [C.pick("参加复核，明确结果与责任", 1, { merit: 2, credit: 3, health: -2 }), C.pick("交出已有材料", 0, { credit: 1 })] },
    promise: { after: 12, title: "上次许下的期限到了", body: "你给过一个偏紧的承诺。现在需要交代哪些环节已经兑现。",
      options: [C.pick("腾出时间完成剩下的安排", 1, { credit: 3, health: -4 }), C.pick("如实说明目前只能交付一部分", 0, { credit: -3 })] },
    help: { after: 9, title: "到了相互支援的时候", body: "先前与你合作的人正在等一次回报，与你手头的计划刚好撞期。",
      options: [C.pick("按约定完成这一轮协作", 1, { ties: 4, credit: 1, health: -2 }), C.pick("说明本期挪不开安排", 0, { ties: -2 })] },
    favor: { after: 18, title: "旧请托再次找上门", body: "提出过不当交换的人要求你继续配合。过去的记录还在履历里。",
      options: [C.pick("说明并按正常程序交接", 1, { credit: 2 }), C.pick("再次接受违规请托", 1, { ties: 8, risk: 2, severity: 2 }),
        C.pick("拒绝再做额外安排", 0, { ties: -2 })] },
  };

  function currentEvent(state) {
    const next = state.pending[0];
    if (!next) return null;
    if (next.type === "random") return { ...eventIndex.get(next.id), month: next.month };
    const related = state.followUps[next.id];
    return { ...follows[related.kind], body: "此前「" + related.topic + "」留下了一件后续事项。" + follows[related.kind].body, month: next.month };
  }

  function chanceEvent(state) {
    const scope = currentScope(state);
    const risk = danger(state);
    const chance = assessTarget(state);
    const choices = C.events.filter((event) => (event.scope === scope || event.scope === null) &&
      (event.tag !== "risk" || risk > 0) && (event.tag !== "health" || state.health < 60) &&
      (event.tag !== "candidate" || chance.qualified && totalScore(state) >= 35));
    const fresh = choices.filter((event) => !state.recentEvents.includes(event.id));
    const pool = fresh.length ? fresh : choices;
    const weights = pool.map((event) => {
      if (event.tag === "risk") return 1 + risk / 3;
      if (event.tag === "health") return 1 + (60 - state.health) / 8;
      if (event.tag === "candidate") return 1 + chance.probability / 10;
      return 1 + (state.score[event.tag] || 0) / 8;
    });
    let roll = random(state) * weights.reduce((sum, weight) => sum + weight, 0);
    for (const [index, event] of pool.entries()) {
      roll -= weights[index];
      if (roll >= 0) continue;
      state.pending.push({ type: "random", id: event.id, month: state.month });
      state.recentEvents = [...state.recentEvents.slice(-4), event.id];
      return;
    }
  }

  function queueEvents(state) {
    for (const [index, item] of state.followUps.entries()) {
      if (item.queued || item.due > state.month) continue;
      item.queued = true;
      state.pending.push({ type: "follow", id: index, month: state.month });
    }
    if (!state.cycle.generated && state.cycle.at === state.month) {
      state.cycle.generated = true;
      if (random(state) < 0.74) chanceEvent(state);
    }
  }

  function apply(state, label, option, kind) {
    const effect = option.effect;
    const gains = {};
    for (const [key, limit] of Object.entries(C.limits)) {
      const before = state.score[key];
      state.score[key] = clamp(before + (effect[key] || 0), 0, limit);
      gains[key] = Math.max(0, state.score[key] - before);
    }
    state.health = clamp(state.health + (effect.health || 0), 0, 100);
    if (kind !== "rest") state.yearWork += Math.max(0, effect.merit || 0) + Math.max(0, effect.credit || 0) + Math.max(0, effect.ties || 0);
    if (kind !== "rest" && effect.merit > 1) state.projects++;
    if (effect.training) state.training.push({ month: state.month, hours: effect.training });
    if (effect.party) {
      state.party.stage = 1;
      state.party.ends = state.month + 15;
      record(state, "office", "开始培养考察", "入党申请已提交，进入本局培养安排。");
    }
    if (effect.post) {
      const previousScope = currentScope(state);
      install(state, effect.post, label.includes("遴选") ? "遴选后转任" : "交流任职");
      if (previousScope !== currentScope(state)) rebaseOffers(state);
    }
    if (effect.follow) state.followUps.push({ kind: effect.follow, topic: label,
      due: state.month + follows[effect.follow].after, queued: false });
    if (effect.risk) {
      state.incidents.push({ title: label, choice: option.title, month: state.month, risk: effect.risk, severity: effect.severity,
        gains, resolved: false });
    }
    record(state, effect.risk ? "audit" : kind, label, option.title + " · " + (option.months ? R.duration(option.months) : "当场处理"));
  }

  function advanceEntry(state) {
    if (state.month === 12 && !state.formal) {
      state.formal = true;
      state.rank = R.degrees[state.degree].rank;
      state.rankSince = state.month;
      noteStint(state);
      record(state, "office", "试用期满任职定级", R.ranks[state.rank] + "。职级任职时间从期满起算。");
    }
    const p = state.placement;
    if (p && !p.done) {
      if (!p.active && state.month === p.start) {
        p.active = true;
        install(state, C.deployment(state.post.region, state.party.stage === 3, "定向锻炼"), "到基层锻炼");
        rebaseOffers(state);
      }
      if (p.active && state.month === p.end) {
        p.active = false;
        p.done = true;
        install(state, state.initialPost, "锻炼期满，回录用单位");
        rebaseOffers(state);
      }
    }
    if (state.party.stage === 1 && state.month >= state.party.ends) {
      state.party.stage = 2;
      state.party.ends = state.month + 12;
      record(state, "office", "接收为预备党员", "开始为期一年的预备期。");
    } else if (state.party.stage === 2 && state.month >= state.party.ends) {
      state.party.stage = 3;
      state.party.since = state.month;
      record(state, "office", "预备期满转正", "从本月起计算党龄。");
    }
  }

  function rebaseOffers(state) {
    if (state.month % 6 === 0) return;
    const group = state.cycle;
    periodStart(state);
    state.cycle.from = group.from;
    state.cycle.at = group.at;
    state.cycle.generated = group.generated;
    state.cycle.used = group.used;
  }

  function noteEligibility(state) {
    for (const wanted of opportunities(state)) {
      if (gate(state, wanted)) state.eligibleSince[wanted.id] ??= state.month;
    }
  }

  function annual(state) {
    if (state.month === 12) {
      state.assessments.push({ month: state.month, rating: "未定等次" });
    } else {
      const rating = state.yearWork >= 34 ? "优秀" : "称职";
      state.assessments.push({ month: state.month, rating });
      record(state, "office", "年度考核 · " + rating, R.year(state.month - 1) + " 年的履职情况已存入档案。");
    }
    state.yearWork = 0;
  }

  function passTime(state, option, label, kind) {
    if (!option.months) {
      apply(state, label, option, kind);
      noteEligibility(state);
      return;
    }
    for (let elapsed = 1; elapsed <= option.months; elapsed++) {
      if (state.post.local) state.localMonths++;
      state.month++;
      if (elapsed === option.months) apply(state, label, option, kind);
      advanceEntry(state);
      if (state.month % 12 === 0) annual(state);
      if (!state.central && state.post.level >= 3 && ["party", "people"].includes(state.post.path) &&
        state.month - state.postSince >= 120 && state.month < retirement(state).month) {
        install(state, C.lateral(state.post), "按任期安排交流");
        rebaseOffers(state);
      }
      if (state.month >= retirement(state).month) {
        if (state.month % 48 === 0) inspect(state);
        if (!state.outcome) finish(state, state.highest ? "retired" : "steady", "本局任职到龄，所有任用、办事和纪检记录均已归档。");
        break;
      }
      noteEligibility(state);
      queueEvents(state);
      if (state.month % 6 === 0) halfYear(state);
      if (state.outcome) break;
    }
  }

  function allowed(state, option) {
    return !state.outcome && !state.reveals.length && option && option.months <= remaining(state) &&
      (state.health >= 20 || !option.months || option.effect.health > 0);
  }

  function doTask(state, id, index) {
    if (state.pending.length) return false;
    const task = tasks(state).find((item) => item.id === id);
    const option = task?.options[index];
    if (!allowed(state, option)) return false;
    state.cycle.used.push(task.id);
    passTime(state, option, task.title, "work");
    return true;
  }

  function chooseEvent(state, index) {
    const event = currentEvent(state);
    const option = event?.options[index];
    if (!allowed(state, option)) return false;
    state.pending.shift();
    passTime(state, option, event.title, "event");
    return true;
  }

  function rest(state, months) {
    if (state.pending.length || !Number.isInteger(months) || months < 1 ||
      state.health < 20 && months > Math.ceil((20 - state.health) / 10)) return false;
    const option = C.pick("按月恢复", months, { health: months * 10 });
    if (!allowed(state, option)) return false;
    passTime(state, option, state.health < 20 ? "病休" : "休养生息", "rest");
    return true;
  }

  function acknowledge(state) {
    if (!state.reveals.length) return false;
    state.reveals.shift();
    return true;
  }

  function leave(state, early = false) {
    if (state.outcome || state.reveals.length || state.pending.length) return false;
    if (early ? !R.eligibleEarlyRetirement(state) : state.month < 60 || state.penalty > state.month) return false;
    finish(state, early ? "retired" : "resign", early ? "符合适用条件，按本人申请办理退休。" : "辞去公职，归档本人的任职经历和案情记录。");
    return true;
  }

  function valid(state) {
    return Boolean(state && Number.isSafeInteger(state.seed) && Number.isInteger(state.month) && state.month >= 0 &&
      typeof state.name === "string" && Object.hasOwn(R.degrees, state.degree) && Object.hasOwn(C.channels, state.channel) &&
      ["male", "female"].includes(state.gender) && Number.isInteger(state.birth) &&
      Number.isInteger(state.central) && state.central >= 0 && state.central < R.central.length &&
      Number.isInteger(state.rank) && state.rank >= -1 && state.rank < R.ranks.length &&
      Number.isFinite(state.health) && state.post && C.regions[state.post.region] &&
      (Object.hasOwn(C.roles, state.post.role) || ["business", "village"].includes(state.post.role)) &&
      state.cycle && Array.isArray(state.cycle.offers) && Array.isArray(state.cycle.used) &&
      Object.keys(C.limits).every((key) => Number.isFinite(state.score?.[key])) &&
      state.party && state.eligibleSince &&
      ["stints", "training", "assessments", "incidents", "followUps", "pending", "log", "reveals", "recentOffers", "recentEvents"].every((key) => Array.isArray(state[key])));
  }

  return { create, valid, currentScope, title, age, healthFactor, retirement, totalScore, danger, remaining,
    nextInspection, opportunities, target, assessTarget, setGoal, tasks, currentEvent, allowed,
    doTask, chooseEvent, rest, acknowledge, leave };
})();
