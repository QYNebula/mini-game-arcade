const ProgressCareer = (() => {
  const R = ProgressRules;
  const C = ProgressContent;
  const projectIndex = new Map(C.projects.map((project) => [project.id, project]));
  const legacyEvents = new Map(C.events.map((event) => [event.id, event]));
  const caps = { section: [72, 90], county: [58, 75], bureau: [46, 64], province: [36, 50], central: [26, 36], secretary: [9, 15] };
  const endingTitles = { retired: "按期退休", steady: "留在岗位直至退休", resign: "辞去公职",
    dismissed: "开除公职", sentenced: "裁判生效 · 服刑", elected: "当选中央委员会总书记" };
  const durations = [6, 12, 24];
  const routineGain = 4;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const currentScope = (state) => state.central ? 4 : state.post.scope;
  const title = (state) => R.central[state.central] || state.post.title;
  const age = (state) => Math.floor((R.startYear * 12 + state.month - state.birth) / 12);
  const retirement = (state) => R.retirement(state);
  const totalScore = (state) => state.score.merit + state.score.credit + state.score.ties;
  const danger = (state) => Math.min(100, state.incidents.reduce((sum, incident) => sum + incident.risk, 0));
  const nextInspection = (state) => (Math.floor(state.month / 48) + 1) * 48;
  const healthStatus = (state) => state.health < 20 ? "病休" : state.health < 60 ? "疲劳" : "正常";

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

  function newPosition(state) {
    if (state.plan) record(state, "work", "交接在办安排", "本岗已到账的成果纳入履历。");
    state.plan = null;
    state.projectsDone = [];
    state.postSince = state.month;
    state.agencySince = state.month;
    state.term++;
  }

  function install(state, post, heading) {
    const before = state.post.title;
    newPosition(state);
    state.post = post;
    state.highest = Math.max(state.highest, post.level);
    noteStint(state);
    record(state, "office", heading, before + " → " + post.title);
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
      stints: [], assessments: [], training: [], incidents: [], followUps: [], pending: [], log: [], reveals: [],
      checks: 0, attempts: 0, projects: 0, goal: "", outcome: null,
      term: 0, plan: null, projectsDone: [], review: null,
    };
    if (state.placement?.start === 0) {
      state.placement.active = true;
      state.post = C.deployment(state.post.region, profile.member);
    }
    noteStint(state);
    record(state, "office", "入职报到", C.channels[state.channel] + "，模拟考试 " + examScore + " 分。任职从" + state.post.title + "开始。");
    return state;
  }

  function finish(state, kind, detail) {
    state.outcome = { kind, title: endingTitles[kind], detail, month: state.month };
    state.plan = null;
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
      const seat = state.central + 1;
      list.push({ id: "central-" + seat, kind: "central", target: seat, title: R.central[seat],
        band: seat === 4 ? "secretary" : "central", needs: R.centralGate(state, seat),
        procedure: seat === 1 ? "由党的全国代表大会选举" : "由中央委员会全体会议选举" });
    }
    const rank = state.rank + 1;
    if (state.formal && rank > 0 && rank < R.ranks.length && !state.central) {
      list.push({ id: "rank-" + rank, kind: "rank", title: R.ranks[rank], target: rank, band: rankBand(rank),
        needs: R.rankGate(state, rank), procedure: C.procedures.rank });
    }
    return list;
  }

  function referenceTarget(state) {
    const options = opportunities(state);
    return options.find((item) => item.id === state.goal) || options.find((item) => item.kind !== "rank") || options[0] || null;
  }

  function target(state) {
    return state.goal === "stay" ? null : referenceTarget(state);
  }

  function availableWindow(state, wanted, month) {
    if (!wanted || !month || month % 6) return false;
    if (wanted.kind === "central") return wanted.target === 1 || wanted.target === 4 ? month % 60 === 0 :
      month % 24 === 0 || month % 60 === 0;
    if (wanted.band === "province" && month % 12) return false;
    const lane = wanted.kind === "office" ? wanted.target.level : wanted.target + 2;
    return (Math.floor(month / 6) + state.calendar + lane) % 7 !== 0;
  }

  function windowDate(state, wanted) {
    if (state.review?.target === wanted.id) return state.month;
    const start = (Math.floor(state.month / 6) + 1) * 6;
    for (let candidate = start; candidate <= start + 60 && candidate < retirement(state).month; candidate += 6) {
      if (availableWindow(state, wanted, candidate)) return candidate;
    }
    return null;
  }

  function assessTarget(state, wanted = referenceTarget(state)) {
    if (!wanted) return { wanted: null, qualified: false, probability: 0, legitimate: 0, boost: 0, boostLimit: 0, cap: 0, next: null };
    const [cleanCap, cap] = caps[wanted.band];
    const boostLimit = cap - cleanCap;
    const termBonus = state.incidents.reduce((sum, item) => item.term === state.term && !item.resolved ? sum + item.boost : sum, 0);
    const boost = Math.min(boostLimit, termBonus);
    const legitimate = totalScore(state) / 100 * cleanCap;
    const qualified = !(state.placement?.active && wanted.kind !== "rank") && wanted.needs.every((condition) => condition.ok);
    return { wanted, qualified, legitimate, boost, boostLimit, cap, probability: legitimate + boost, next: windowDate(state, wanted) };
  }

  function setGoal(state, id) {
    if (state.outcome || state.reveals.length || state.review) return false;
    if (id !== "stay" && !opportunities(state).some((item) => item.id === id)) return false;
    state.goal = id;
    return true;
  }

  function inheritScore(state, rate) {
    for (const key of Object.keys(C.limits)) state.score[key] = Math.floor(state.score[key] * rate);
    for (const item of state.incidents) {
      if (item.resolved || !item.gains) continue;
      for (const key of Object.keys(C.limits)) item.gains[key] = Math.floor(item.gains[key] * rate);
    }
  }

  function promote(state, wanted) {
    if (wanted.kind === "office") {
      install(state, wanted.target, "任用生效");
    } else if (wanted.kind === "rank") {
      state.term++;
      state.rank = wanted.target;
      state.rankSince = state.month;
      noteStint(state);
      record(state, "office", "职级晋升", wanted.title);
    } else {
      newPosition(state);
      state.central = wanted.target;
      record(state, "office", "中央任用生效", wanted.title);
      if (state.central === 4) finish(state, "elected", "中央委员会全体会议选举结果公布，你当选中央委员会总书记。");
    }
    state.goal = wanted.kind === "rank" ? (state.rank < state.post.rankCap ? "rank-" + (state.rank + 1) : "stay") : "";
    if (!state.outcome) inheritScore(state, wanted.kind === "rank" ? 0.8 : 0.62);
  }

  function offenseOffer(state, offer) {
    const review = assessTarget(state);
    const used = state.incidents.some((item) => item.term === state.term && item.action === offer.id);
    const bonus = Math.min(review.boostLimit - review.boost, Math.max(1, Math.round(review.boostLimit * offer.weight)));
    const risk = Math.min(offer.risk, 100 - danger(state));
    return { ...offer, bonus, risk, used };
  }

  function offenses(state) {
    return C.offenses.map((offer) => offenseOffer(state, offer));
  }

  function applyOffense(state, offer) {
    state.incidents.push({ title: offer.title, choice: offer.title, month: state.month, risk: offer.risk, severity: offer.severity,
      action: offer.id, boost: offer.bonus, term: state.term, resolved: false });
    record(state, "audit", offer.title, "任内胜算 +" + offer.bonus + " 个百分点 · 永久危险 +" + offer.risk + " 个百分点。");
  }

  function offend(state, id) {
    if (state.outcome || state.reveals.length || state.review) return false;
    const offer = offenses(state).find((item) => item.id === id);
    if (!offer || offer.used || !offer.bonus || !offer.risk) return false;
    applyOffense(state, offer);
    return true;
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
    let major = false;
    if (hit && !discovered.length) {
      headline = "核对既有处理记录";
      detail = "本次核对了既有处分和处理记录。履历累计记载继续有效。";
    } else if (hit) {
      const gravity = discovered.reduce((sum, item) => sum + item.severity, 0);
      for (const item of discovered) {
        item.resolved = true;
        item.checkedAt = state.month;
        if (item.gains) {
          for (const key of Object.keys(C.limits)) state.score[key] = Math.max(0, state.score[key] - item.gains[key]);
        }
      }
      major = gravity >= 5;
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
    state.reveals.push({ kind: "audit", subject: "例行纪检检查", chance, hit, major, title: headline, detail, month: state.month });
  }

  function candidate(state) {
    const wanted = target(state);
    if (state.health < 20 || !availableWindow(state, wanted, state.month)) return null;
    const current = assessTarget(state, wanted);
    return current.qualified ? current : null;
  }

  function settleMonth(state) {
    if (state.month % 48 === 0) inspect(state);
    if (state.outcome) return;
    if (state.month >= retirement(state).month) {
      finish(state, state.highest ? "retired" : "steady", "本局任职到龄，所有任用、办事和纪检记录均已归档。");
      return;
    }
    const current = candidate(state);
    if (!current?.probability) return;
    const { wanted, probability } = current;
    state.attempts++;
    const hit = random(state) * 100 < probability;
    const result = hit ? (wanted.kind === "rank" ? "职级晋升" : "任用成功") : "本轮未获任用";
    const rival = C.people[(state.calendar + Math.floor(state.month / 6)) % C.people.length];
    const later = current.next === null ? "本局到龄前暂无排定窗口。" : "下次预计机会在" + R.date(current.next) + "。";
    const detail = hit ? wanted.procedure + "。拟任" + wanted.title + "。" :
      (wanted.kind === "rank" ? "本轮审批结果已登记。" : "该轮任用名额由" + rival + "获得。") + later;
    state.reveals.push({ kind: "promotion", subject: wanted.title, chance: probability, hit,
      major: wanted.kind === "central" || wanted.band === "province" && hit, title: result, detail, month: state.month });
    record(state, "office", result, wanted.title + " · 当轮胜算 " + probability.toFixed(1) + "%。");
    if (hit) promote(state, wanted);
  }

  function lateOffer(state) {
    return offenseOffer(state, {
      id: "window-" + state.month, title: "临窗的违规交换", body: C.temptations[currentScope(state)],
      weight: 0.72, risk: 4, severity: 3,
    });
  }

  function prepareReview(state) {
    if (state.month >= retirement(state).month) return false;
    const current = candidate(state);
    if (!current || current.probability >= current.cap * 0.82) return false;
    const offer = lateOffer(state);
    if (offer.bonus < 2 || !offer.risk || random(state) >= 0.28) return false;
    state.review = { month: state.month, target: current.wanted.id, offer };
    return true;
  }

  function resolveReview(state, accept) {
    if (!state.review || state.outcome || state.reveals.length) return false;
    if (accept) applyOffense(state, state.review.offer);
    state.review = null;
    settleMonth(state);
    return true;
  }

  function trainingHours(state) {
    const senior = state.post.level >= 3 || state.rank >= 6;
    return { hours: senior ? 550 : 120, months: senior ? 3 : 1 };
  }

  function services(state) {
    const training = trainingHours(state);
    const list = [{
      id: "training", title: "参加集中培训", body: "完成后记入 " + training.hours + " 学时。",
      option: C.pick("参加集中培训", training.months, { training: training.hours }),
    }];
    if (!state.party.stage) list.push({
      id: "party", title: "递交入党申请", body: "进入培养和考察安排，党龄从转为正式党员之日计算。",
      option: C.pick("递交入党申请", 1, { party: true }),
    });
    if (!state.formal || state.placement?.active || state.central || state.month - state.postSince < 12 ||
      state.penalty > state.month) return list;
    const next = C.lateral(state.post);
    list.push({
      id: "exchange", title: state.post.level ? "赴异地任同类职务" : "接受组织交流安排",
      body: "办理后转任" + next.title + "，积累相应履历。",
      option: C.pick("办理交流", 2, { post: next }),
    });
    if (!state.post.level && state.post.scope < 2 && R.selectionGate(state).every((condition) => condition.ok)) {
      const city = C.business(state.post.region, 2);
      list.push({ id: "selection", title: "参加市直公开遴选", body: city.title + "进入本局遴选安排。",
        option: C.pick("参加遴选并办理转任", 2, { post: city }) });
    }
    return list;
  }

  const follows = {
    work: { title: "旧事项回来接受复核", body: "新的负责人约你一起对照原承诺，确认真正办成了多少。",
      options: [C.pick("参加复核，明确结果与责任", 1, { merit: 2, credit: 3, health: -2 }), C.pick("交出已有材料", 0, { credit: 1 })] },
    promise: { title: "上次许下的期限到了", body: "你给过一个偏紧的承诺。现在需要交代哪些环节已经兑现。",
      options: [C.pick("腾出时间完成剩下的安排", 1, { credit: 3, health: -4 }), C.pick("如实说明目前只能交付一部分", 0, { credit: -3 })] },
    help: { title: "到了相互支援的时候", body: "先前与你合作的人正在等一次回报，与你手头的计划刚好撞期。",
      options: [C.pick("按约定完成这一轮协作", 1, { ties: 4, credit: 1, health: -2 }), C.pick("说明本期挪不开安排", 0, { ties: -2 })] },
    favor: { title: "旧请托再次找上门", body: "提出过不当交换的人要求你继续配合。过去的记录还在履历里。",
      options: [C.pick("说明并按正常程序交接", 1, { credit: 2 }), C.pick("拒绝再做额外安排", 0, { ties: -2 })] },
  };
  const followDelay = { work: 12, promise: 12, help: 9, favor: 18 };

  function currentEvent(state) {
    if (state.review) return { kind: "review", ...state.review };
    const next = state.pending[0];
    if (next?.type === "random") return { kind: "legacy", ...legacyEvents.get(next.id), month: next.month };
    if (next?.type === "follow") {
      const related = state.followUps[next.id];
      return { kind: "legacy", ...follows[related.kind],
        body: "此前「" + related.topic + "」留下了一件后续事项。" + follows[related.kind].body, month: next.month };
    }
    if (state.plan?.type === "project" && state.plan.phase === "choice") {
      const project = projectIndex.get(state.plan.id);
      return { kind: "project", title: project.title, body: project.turningPoint, options: project.options, month: state.month };
    }
    return null;
  }

  function queueFollowUps(state) {
    for (const [index, item] of state.followUps.entries()) {
      if (item.queued || item.due > state.month) continue;
      item.queued = true;
      state.pending.push({ type: "follow", id: index, month: state.month });
    }
  }

  function apply(state, label, effect, kind, action = "") {
    const growth = [];
    for (const [key, limit] of Object.entries(C.limits)) {
      if (!effect[key]) continue;
      const before = state.score[key];
      state.score[key] = clamp(before + effect[key], 0, limit);
      const difference = state.score[key] - before;
      if (difference) growth.push(C.categories[key] + (difference > 0 ? " +" : " −") + Math.abs(difference));
      state.yearWork += Math.max(0, difference);
    }
    state.health = clamp(state.health + (effect.health || 0), 0, 100);
    if (effect.training) state.training.push({ month: state.month, hours: effect.training });
    if (effect.party) {
      state.party.stage = 1;
      state.party.ends = state.month + 15;
      record(state, "office", "开始培养考察", "入党申请已提交，进入本局培养安排。");
    }
    if (effect.post) install(state, effect.post, action === "selection" ? "遴选后转任" : "交流任职");
    if (effect.follow) state.followUps.push({ kind: effect.follow, topic: label,
      due: state.month + followDelay[effect.follow], queued: false });
    const detail = [...(action && kind === "event" ? [action] : []), ...growth];
    if (effect.training) detail.push("培训 +" + effect.training + " 学时");
    if (detail.length || kind !== "routine") record(state, kind, label, detail.join(" · ") || "按安排完成。");
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
      }
      if (p.active && state.month === p.end) {
        p.active = false;
        p.done = true;
        install(state, state.initialPost, "锻炼期满，回录用单位");
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

  function annual(state) {
    if (state.month === 12) {
      state.assessments.push({ month: state.month, rating: "未定等次" });
    } else {
      const rating = state.yearWork >= 16 ? "优秀" : "称职";
      state.assessments.push({ month: state.month, rating });
      record(state, "office", "年度考核 · " + rating, R.year(state.month - 1) + " 年的履职情况已存入档案。");
    }
    state.yearWork = 0;
  }

  function projects(state) {
    return C.projects.filter((project) => project.scope === currentScope(state) && (project.central || 0) <= state.central &&
      !state.projectsDone.includes(project.id));
  }

  function workTime(state, health = state.health) {
    return Math.max(0, Math.min(retirement(state).month - state.month, health - 19));
  }

  function routineYield(state, key, months) {
    const time = Math.min(months, workTime(state));
    return Math.min(C.limits[key] - state.score[key], Math.floor(time / 6) * routineGain);
  }

  function canArrange(state) {
    return !state.outcome && !state.reveals.length && !currentEvent(state);
  }

  function startRoutine(state, key, months) {
    if (!canArrange(state) || state.health < 20 || !Object.hasOwn(C.routine, key) || !durations.includes(months) ||
      !routineYield(state, key, months)) return false;
    state.plan = { type: "routine", id: key, start: state.month, due: state.month + 6, end: state.month + months };
    return true;
  }

  function startProject(state, id) {
    if (!canArrange(state) || workTime(state) < 9 || !projects(state).some((project) => project.id === id)) return false;
    state.plan = { type: "project", id, start: state.month, due: state.month + 6, phase: "survey" };
    return true;
  }

  function startService(state, id) {
    if (!canArrange(state) || state.health < 20) return false;
    const item = services(state).find((service) => service.id === id);
    if (!item || workTime(state) < item.option.months) return false;
    state.plan = { type: "service", id, title: item.title, start: state.month, end: state.month + item.option.months, effect: item.option.effect };
    return true;
  }

  function startRest(state, months) {
    if (!canArrange(state) || !Number.isInteger(months) || months < 1 || months > 24) return false;
    state.plan = { type: "rest", start: state.month, end: state.month + months };
    return true;
  }

  function cancelPlan(state) {
    if (!state.plan || state.outcome || state.reveals.length) return false;
    const event = currentEvent(state);
    if (event && event.kind !== "project") return false;
    state.plan = null;
    return true;
  }

  function planInfo(state) {
    const plan = state.plan;
    if (!plan) return null;
    if (plan.type === "project") {
      const project = projectIndex.get(plan.id);
      return { title: project.title, from: plan.start, due: plan.end ?? plan.due, label: plan.end ? "成果交付" : "方案审议" };
    }
    if (plan.type === "routine") {
      return { title: C.routine[plan.id].title, from: plan.start, due: plan.due, end: plan.end, label: "下一笔" + C.categories[plan.id] };
    }
    return { title: plan.type === "rest" ? "休养生息" : plan.title, from: plan.start, due: plan.end, label: "安排结束" };
  }

  function allowed(state, option) {
    if (!option || state.outcome || state.reveals.length || state.review) return false;
    if (currentEvent(state)?.kind !== "project") return !option.months || option.months <= workTime(state);
    const effort = option.effect.health || 0;
    return (effort >= -15 || state.health >= 60) && option.months <= workTime(state, state.health + effort);
  }

  function chooseEvent(state, index) {
    const event = currentEvent(state);
    const option = event?.options?.[index];
    if (!allowed(state, option)) return false;
    if (event.kind === "project") {
      state.plan.phase = "delivery";
      state.plan.end = state.month + option.months;
      state.plan.effect = { ...option.effect };
      state.plan.choice = option.title;
      if (option.effect.health) state.health = clamp(state.health + option.effect.health, 0, 100);
      delete state.plan.effect.health;
      record(state, "event", event.title, option.title + " · 预计 " + R.date(state.plan.end) + " 交付。");
    } else {
      state.pending.shift();
      if (!option.months) apply(state, event.title, option.effect, "event", option.title);
      else {
        const resume = state.plan;
        for (let delayed = resume; delayed; delayed = delayed.resume) {
          if (delayed.due != null) delayed.due += option.months;
          if (delayed.end != null) delayed.end += option.months;
        }
        state.plan = { type: "response", title: event.title, start: state.month, end: state.month + option.months,
          effect: option.effect, choice: option.title, resume };
      }
    }
    return true;
  }

  function tickWork(state) {
    const plan = state.plan;
    if (!plan || plan.type === "rest") {
      state.health = Math.min(100, state.health + (plan ? 10 : 2));
      if (plan && state.month >= plan.end) {
        state.plan = null;
        record(state, "rest", "休养生息", "安排完成 · 健康 " + state.health + " / 100。");
      }
      return;
    }
    state.health = Math.max(0, state.health - 1);
    if (plan.type === "routine" && state.month >= plan.due) {
      apply(state, C.routine[plan.id].title, { [plan.id]: routineGain }, "routine");
      plan.due += 6;
      if (state.month >= plan.end || state.score[plan.id] >= C.limits[plan.id]) state.plan = null;
    } else if (plan.type === "project" && plan.phase === "survey" && state.month >= plan.due) {
      if (workTime(state) < 3) {
        state.plan = null;
        record(state, "work", "移交未完项目", projectIndex.get(plan.id).title + "已完成前期准备。");
      } else {
        plan.phase = "choice";
      }
    } else if (plan.end != null && state.month >= plan.end) {
      state.plan = plan.resume || null;
      if (plan.type === "project") {
        state.projects++;
        state.projectsDone.push(plan.id);
        apply(state, projectIndex.get(plan.id).title, plan.effect, "work");
      } else {
        apply(state, plan.title, plan.effect, plan.type === "response" ? "event" : "work", plan.choice || plan.id);
      }
    }
    if (state.health < 20 && state.plan) {
      state.plan = null;
      record(state, "rest", "进入病休", "在办安排暂停，已到账成果纳入履历。");
    }
  }

  function canAdvance(state) {
    return canArrange(state) && (state.health >= 20 || state.plan?.type === "rest");
  }

  function advance(state) {
    if (!canAdvance(state)) return false;
    for (let elapsed = 0; elapsed < 24; elapsed++) {
      const plan = state.plan;
      const position = state.post.id;
      const since = state.postSince;
      if (state.post.local) state.localMonths++;
      state.month++;
      tickWork(state);
      const tenure = state.month - state.postSince;
      if (tenure > 0 && tenure <= 36 && tenure % 12 === 0 && plan?.type !== "rest") {
        apply(state, "日常履职", { credit: 2 }, "routine");
      }
      advanceEntry(state);
      if (state.month % 12 === 0) annual(state);
      if (!state.central && state.post.level >= 3 && ["party", "people"].includes(state.post.path) &&
        state.month - state.postSince >= 120 && state.month < retirement(state).month) {
        install(state, C.lateral(state.post), "按任期安排交流");
      }
      queueFollowUps(state);
      if (prepareReview(state)) return true;
      settleMonth(state);
      if (state.outcome || state.reveals.length || currentEvent(state) || state.post.id !== position || state.postSince !== since ||
        plan && state.plan !== plan || state.health < 20 && !state.plan) return true;
    }
    return true;
  }

  function acknowledge(state) {
    if (!state.reveals.length) return false;
    state.reveals.shift();
    return true;
  }

  function leave(state, early = false) {
    if (!canArrange(state)) return false;
    if (early ? !R.eligibleEarlyRetirement(state) : state.month < 60 || state.penalty > state.month) return false;
    finish(state, early ? "retired" : "resign", early ? "符合适用条件，按本人申请办理退休。" : "辞去公职，归档本人的任职经历和案情记录。");
    return true;
  }

  function hasCareer(state) {
    return Boolean(state && Number.isSafeInteger(state.seed) && Number.isInteger(state.month) && state.month >= 0 &&
      typeof state.name === "string" && Object.hasOwn(R.degrees, state.degree) && Object.hasOwn(C.channels, state.channel) &&
      ["male", "female"].includes(state.gender) && Number.isInteger(state.birth) &&
      Number.isInteger(state.central) && state.central >= 0 && state.central < R.central.length &&
      Number.isInteger(state.rank) && state.rank >= -1 && state.rank < R.ranks.length &&
      Number.isFinite(state.health) && state.post && C.regions[state.post.region] &&
      (Object.hasOwn(C.roles, state.post.role) || ["business", "village"].includes(state.post.role)) &&
      Object.keys(C.limits).every((key) => Number.isFinite(state.score?.[key])) && state.party &&
      ["stints", "training", "assessments", "incidents", "followUps", "pending", "log", "reveals"].every((key) => Array.isArray(state[key])));
  }

  function validPlan(plan) {
    if (plan === null) return true;
    if (!plan || !Number.isInteger(plan.start)) return false;
    if (plan.type === "routine") return Object.hasOwn(C.routine, plan.id) && Number.isInteger(plan.due) && Number.isInteger(plan.end);
    if (plan.type === "project") return projectIndex.has(plan.id) && ["survey", "choice", "delivery"].includes(plan.phase) &&
      Number.isInteger(plan.due) && (plan.phase !== "delivery" || Number.isInteger(plan.end) && plan.effect);
    return ["rest", "service", "response"].includes(plan.type) && Number.isInteger(plan.end) &&
      (plan.type === "rest" || plan.effect && typeof plan.title === "string");
  }

  function valid(state) {
    return hasCareer(state) && Number.isInteger(state.term) && state.term >= 0 && Array.isArray(state.projectsDone) &&
      validPlan(state.plan) && (state.review === null || state.review?.month === state.month && state.review.offer?.bonus > 0);
  }

  function upgrade(state) {
    if (!hasCareer(state)) return null;
    const { cycle, recentOffers, recentEvents, eligibleSince, ...career } = state;
    return { ...career, plan: null, term: 0, projectsDone: [], review: null };
  }

  return { create, valid, upgrade, currentScope, title, age, retirement, totalScore, danger, healthStatus, nextInspection,
    durations, routineGain, opportunities, target, assessTarget, setGoal, offenses, offend, resolveReview,
    services, projects, routineYield, workTime, canArrange, startRoutine, startProject, startService, startRest, cancelPlan,
    planInfo, currentEvent, allowed, chooseEvent, canAdvance, advance, acknowledge, leave };
})();
