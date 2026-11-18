const ProgressRules = (() => {
  const sources = {
    service: ["《公务员法》", "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/bgt/art/2023/art_6af2e9cf52224593b4dc15258bb34860.html"],
    entry: ["《新录用公务员任职定级规定》", "https://swj.yantai.gov.cn/art/2022/8/31/art_33332_2908860.html"],
    office: ["《公务员职务、职级与级别管理办法》", "https://www.jszzb.gov.cn/zcfg/zyzyzzbwj/art/2020/art_933077a2be1c4089a9a4660e6553d98f.html"],
    appointment: ["《党政领导干部选拔任用工作条例》", "https://www.court.gov.cn/zixun/xiangqing/146482.html"],
    rank: ["《公务员职务与职级并行规定》", "https://www.mod.gov.cn/gfbw/fgwx/flfg/4838282.html"],
    party: ["《中国共产党章程》", "https://www.cppcc.gov.cn/zxww/2022/10/27/ARTI1666832713240125.shtml"],
    admission: ["《中国共产党发展党员工作细则》", "https://www.mee.gov.cn/zcwj/zyygwj/202605/t20260519_1153800.shtml"],
    training: ["《干部教育培训工作条例》", "https://www.moe.gov.cn/jyb_xxgk/moe_1777/moe_1778/202310/t20231016_1085813.html"],
    transfer: ["《公务员公开遴选办法》", "https://www.jsxf.gov.cn/zcfg/zyzyzzbwj/art/2021/art_4fb3f0689b3a4ad3914fd68f5b86cb18.html"],
    discipline: ["《公职人员政务处分法》", "https://www.samr.gov.cn/jjz/djfg/dnfgzd/art/2023/art_9876cc85661849c4b354f6a1cd3b7d5f.html"],
    process: ["《监察法》", "https://www.spp.gov.cn/zdgz/202502/t20250205_700636.shtml"],
    government: ["《宪法》", "https://www.stats.gov.cn/gk/tjfg/xgfxfg/202503/t20250312_1958942.html"],
    rotation: ["《推进领导干部能上能下规定》", "https://www.ndrc.gov.cn/fggz/fgdj/zydj/202209/t20220922_1336006.html"],
    rural: ["河南省基层选调通知", "https://www.xinmi.gov.cn/xxbd/9828927.jhtml"],
    selected: ["安徽省定向选调公告", "https://www.ahu.edu.cn/_t992/2026/1009/c15046a402370/page.htm"],
    retirement: ["渐进式延迟法定退休年龄决定", "https://www.guide.gov.cn/zwgk/fdzdgknr/flfg/gjfg/content_400014140"],
    retirementCadres: ["厅局级、县处级女干部等退休年龄规定", "https://www.yxes.gov.cn/esxzfxxgk/esxrsjjyyatabljg6043/20251015/1628394.html"],
  };
  const levels = ["业务岗位", "乡科级副职", "乡科级正职", "县处级副职", "县处级正职", "厅局级副职", "厅局级正职", "省部级副职", "省部级正职"];
  const ranks = ["二级科员", "一级科员", "四级主任科员", "三级主任科员", "二级主任科员", "一级主任科员", "四级调研员", "三级调研员", "二级调研员", "一级调研员", "二级巡视员", "一级巡视员"];
  const rankMinimum = [0, 24, 24, 24, 24, 24, 24, 24, 24, 36, 48, 48];
  const central = ["", "中央委员会委员", "中央政治局委员", "中央政治局常委", "中央委员会总书记"];
  const degrees = {
    bachelor: { label: "本科", age: 22, rank: 1 },
    master: { label: "硕士", age: 25, rank: 2 },
    doctor: { label: "博士", age: 29, rank: 4 },
  };
  const startYear = 2027;
  const year = (month) => startYear + Math.floor(month / 12);
  const date = (month) => year(month) + " 年 " + (month % 12 + 1) + " 月";
  const half = (month) => year(month) + " 年" + (month % 12 < 6 ? "上半年" : "下半年");
  function duration(months) {
    months = Math.max(0, months);
    const years = months >= 12 ? Math.floor(months / 12) + " 年" : "";
    const remainder = months % 12 ? months % 12 + " 个月" : "";
    return [years, remainder].filter(Boolean).join(" ") || "0 个月";
  }

  function monthsIn(state, field, match) {
    return state.stints.reduce((total, stint, index) => {
      if (!match(stint[field])) return total;
      return total + (state.stints[index + 1]?.from ?? state.month) - stint.from;
    }, 0);
  }

  function tenure(state, level) {
    return monthsIn(state, "level", (value) => value === level);
  }

  function lastAssessment(state) { return state.assessments.at(-1)?.rating || ""; }

  function cohortRetirement(birth, formerAge) {
    const firstAffected = (2025 - formerAge) * 12;
    const added = Math.max(0, Math.min(36, Math.floor((birth - firstAffected) / 4) + 1));
    return birth + formerAge * 12 + added - startYear * 12;
  }

  function retirement(state, level = state.post.level, seat = state.central) {
    if (seat) return { month: state.birth + 70 * 12 - startYear * 12, simulated: true, label: "中央任期年龄 · 模拟" };
    if (level >= 7) return { month: state.birth + 65 * 12 - startYear * 12, simulated: true, label: "省部任期年龄 · 模拟" };
    const special = state.gender === "female" && (level >= 3 || state.rank >= 6);
    const original = state.gender === "female" && !special ? 55 : 60;
    return { month: cohortRetirement(state.birth, original), simulated: false,
      source: special ? "retirementCadres" : "retirement", label: "法定退休日期" };
  }

  function eligibleEarlyRetirement(state) {
    return state.gender === "female" && !state.central && state.post.level < 5 &&
      (state.post.level >= 3 || state.rank >= 6 && state.rank <= 9) && state.month >= cohortRetirement(state.birth, 55);
  }

  function numeric(label, have, need, source) {
    const ok = have >= need;
    return { label, ok, detail: ok ? duration(have) : "还差 " + duration(need - have).trim(), source };
  }

  function requirement(label, ok, detail, source) { return { label, ok, detail, source }; }

  function workGate(state) {
    const requirements = [];
    if (!state.formal) requirements.push(numeric("新录用公务员试用期 1 年", state.month, 12, "service"));
    if (state.penalty > state.month) requirements.push(requirement("政务处分期内限制晋升", false, "影响期还剩 " + duration(state.penalty - state.month), "discipline"));
    return requirements;
  }

  function officeGate(state, post) {
    const list = workGate(state);
    const level = post.level;
    if (level === 1) {
      list.push(numeric("一级科员及相当层次职级任职满 3 年", monthsIn(state, "rank", (rank) => rank >= 1), 36, "office"));
    } else if (level === 2) {
      const months = state.stints.reduce((total, stint, index) => {
        if (stint.level !== 1 && stint.rank < 2) return total;
        return total + (state.stints[index + 1]?.from ?? state.month) - stint.from;
      }, 0);
      list.push(numeric("乡科级副职或规定的职级经历累计满 2 年", months, 24, "office"));
    } else {
      const need = level % 2 ? 36 : 24;
      list.push(numeric(levels[level - 1] + "任职满 " + need / 12 + " 年", tenure(state, level - 1), need, "appointment"));
      const positions = new Set(state.stints.filter((stint, index) => stint.level === level - 1 &&
        (state.stints[index + 1]?.from ?? state.month) > stint.from).map((stint) => stint.position));
      list.push(requirement("一般具备下一级两个职位的经历", positions.size >= 2, positions.size + " / 2 个职位", "appointment"));
      if (level <= 4) {
        list.push(numeric("工龄满 5 年", state.month, 60, "appointment"));
        list.push(numeric("基层工作经历满 2 年", state.localMonths, 24, "appointment"));
      }
      list.push(requirement(level >= 5 ? "一般具备本科及以上学历" : "一般具备专科及以上学历", true, degrees[state.degree].label, "appointment"));
      const seniorTraining = state.post.level >= 3 || state.rank >= 6;
      const hours = state.training.filter((item) => item.month >= state.month - (seniorTraining ? 60 : 12))
        .reduce((sum, item) => sum + item.hours, 0);
      const target = seniorTraining ? 550 : 90;
      list.push(requirement(seniorTraining ? "近五年集中培训 550 学时" : "年度集中培训 90 学时", hours >= target,
        hours >= target ? hours + " 学时" : "还差 " + (target - hours) + " 学时", "training"));
    }
    const rating = lastAssessment(state);
    if (rating === "基本称职" || rating === "不称职") {
      list.push(requirement("上一年度考核须达到称职", false, "上次考核为" + rating, "appointment"));
    }
    if (post.path === "party") {
      const need = level < 5 ? 36 : 60;
      list.push(numeric("拟任地方党委岗位党龄满 " + need / 12 + " 年", partyMonths(state), need, "party"));
    }
    return list;
  }

  function rankTime(state, rank) {
    if (rank < 0) return 0;
    const start = state.rankSince;
    let count = state.month - start;
    for (const record of state.assessments) {
      const overlap = record.month - Math.max(start, record.month - 12);
      if (overlap <= 0) continue;
      if (record.rating === "优秀") count += 6;
      if (["基本称职", "不称职", "未定等次"].includes(record.rating)) count -= overlap;
    }
    return count;
  }

  function rankGate(state, target) {
    const list = workGate(state);
    const alternate = { 3: 1, 5: 2, 7: 3, 9: 4, 11: 5 }[target];
    const byOffice = alternate ? tenure(state, alternate) : 0;
    const byRank = state.rank === target - 1 ? rankTime(state, state.rank) : 0;
    const route = alternate ? ranks[target - 1] + "或" + levels[alternate] : ranks[target - 1];
    list.push(numeric(route + "达到规定任职年限", Math.max(byRank, byOffice), rankMinimum[target], "rank"));
    list.push(requirement("拟晋升职级在机关设置范围内", target <= state.post.rankCap, "本机关可设至" + ranks[state.post.rankCap], "rank"));
    return list;
  }

  function selectionGate(state) {
    const list = workGate(state);
    list.push(numeric("一般具有 2 年基层工作经历", state.localMonths, 24, "transfer"));
    list.push(numeric("一般在本级机关任职满 2 年", state.month - state.agencySince, 24, "transfer"));
    const current = state.assessments.filter((item) => item.month > state.agencySince);
    list.push(requirement("本级机关的年度考核无基本称职及以下", current.every((item) => !["基本称职", "不称职"].includes(item.rating)),
      current.some((item) => ["基本称职", "不称职"].includes(item.rating)) ? "有相应考核记录" : "符合", "transfer"));
    return list;
  }

  function partyMonths(state) { return state.party.since === null ? 0 : state.month - state.party.since; }
  function centralGate(state, target) {
    const list = workGate(state);
    list.push(numeric("中央委员会委员党龄满 5 年", partyMonths(state), 60, "party"));
    if (target === 4) list.push(requirement("总书记从中央政治局常委中产生", state.central === 3, "现任" + (central[state.central] || "地方职务"), "party"));
    return list;
  }

  const handbook = [
    { title: "报到与试用", rules: [
      ["试用和任职", "新录用公务员试用期为一年。直接从学校录用且没有工作经历的综合管理类毕业生，期满考核合格后，本科任一级科员，硕士任四级主任科员，博士任二级主任科员。任职时间自试用期满起算。", "entry", "service"],
      ["最低服务年限", "新录用公务员在机关的最低服务年限为五年，含试用期。未达到规定年限的，不得辞去公职。正在接受审查且尚未有结论的，也有相应限制。", "entry", "service"],
      ["选调安排", "选调职位按公布的录用和培养安排执行。基层选调可在报到后先到村任职，定向选调也可能在试用期满后安排基层锻炼。具体期限见录用通知书。", "rural", "selected"],
    ] },
    { title: "领导职务任用", rules: [
      ["乡科级", "一级科员及相当层次职级任满三年可达到乡科级副职的年限要求。乡科级正职的常规路径为副职两年，也可用规定范围内的主任科员等职级经历。乡镇、街道还适用省级实施办法。", "office", "appointment"],
      ["县处级至省部级", "提任县处级须有五年工龄、两年基层经历。县处级及以上一般须有下一级两个岗位经历。副职提正职须在副职工作两年以上，下级正职提上级副职须在下级正职工作三年以上。学历一般须达大专，厅局级及以上一般须达本科。", "appointment"],
      ["考察与任免", "干部按规定经推荐、组织考察、集体讨论决定，再依职位办理任命或选举。地方政府首长、副首长由同级人大选举。地方党委全会选举常委和书记、副书记，并报上级党委批准。", "appointment", "government", "party"],
      ["交流与遴选", "地方党委、政府领导成员在同一职位任满十年须交流。公开遴选一般要求两年基层经历及在本级机关工作两年以上，并按公告审查经历与考核。", "appointment", "transfer"],
    ] },
    { title: "职级与考核", rules: [
      ["职级基本年限", "从二级科员逐级升至二级调研员，基本年限每级为两年。再升一级调研员须三年。升二级巡视员、一级巡视员各须四年。部分职级也可依据规定的领导职务经历晋升。", "rank"],
      ["有效任职年限", "任职期间每次年度考核为优秀，职级晋升所需年限缩短半年。基本称职或未定等次的年度从有效任职年限中扣除。职级晋升还受机关职级设置与职数限制。", "rank"],
      ["干部培训", "县处级、厅局级、省部级党政领导干部及四级调研员等相当及以上职级，每五年规定的集中培训累计不少于三个月或 550 学时。乡科级党政领导干部、一级主任科员等相当及以下职级，每年集中培训不少于十二天或 90 学时。", "training"],
    ] },
    { title: "党内任职与纪律", rules: [
      ["党龄", "党龄自预备期满转为正式党员之日计算。县级党委委员、候补委员须满三年党龄。设区市、省级及中央委员会的委员、候补委员须满五年。", "party", "admission"],
      ["中央委员会总书记", "中央政治局、中央政治局常委会和中央委员会总书记由中央委员会全会选举。总书记须从中央政治局常委中产生。", "party"],
      ["处分与刑事程序", "公务员在政务处分期内不得晋升职务、职级等。职务犯罪案件按规定由监察机关调查，移送检察院审查起诉，由法院依法审判。", "discipline", "process"],
    ] },
    { title: "到龄退休", rules: [
      ["渐进式延迟", "法定退休年龄根据出生年月和适用身份计算。公务员达到国家规定的退休年龄，应当退休。", "retirement", "service"],
      ["机关女干部的适用规则", "规定范围内的厅局级、县处级女干部等按原 60 周岁基准渐进延迟至 63 周岁。符合条件的县处级女干部等可申请按另一档年龄退休。", "retirementCadres"],
    ] },
  ];

  return { sources, levels, ranks, rankMinimum, central, degrees, startYear, date, year, half, duration,
    workGate, tenure, officeGate, rankGate, selectionGate, partyMonths, centralGate, retirement, eligibleEarlyRetirement, handbook };
})();
