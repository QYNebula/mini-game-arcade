const ProgressContent = (() => {
  const provinces = ["云岬省", "岚泽省"];
  const regions = [
    { county: "鹤汀县", town: "白芦镇", village: "长埠村", city: "泊桥市" },
    { county: "岑炉县", town: "松埠镇", village: "望炉村", city: "栖川市" },
    { county: "栖岭县", town: "石梨镇", village: "背岭村", city: "沐川市" },
  ];
  const channels = { ordinary: "普通招录", rural: "常规选调", targeted: "定向选调" };
  const scopes = ["基层", "县域", "市级", "省级", "中央"];
  const categories = { merit: "政绩", credit: "信誉", ties: "人脉", rest: "休养" };
  const limits = { merit: 40, credit: 30, ties: 30 };
  const people = ["温荻", "周映岚", "陈闻安", "何既明", "叶穗", "林泊羽", "白梦棠", "郑南舟", "许观澜"];

  const roles = {
    deputyTown:         [1, 0, "town", "副镇长", "people", ["townHead", "bureauHead"]],
    deputyBureau:       [1, 0, "county", "住建局副局长", "office", ["bureauHead", "townHead"]],
    townHead:           [2, 0, "town", "镇长", "people", ["deputyCounty", "countyCommittee"]],
    bureauHead:         [2, 0, "county", "住建局局长", "office", ["deputyCounty", "countyCommittee"]],
    deputyCounty:       [3, 1, "county", "副县长", "people", ["countyHead", "countySecretary"]],
    countyCommittee:    [3, 1, "county", "委常委", "party", ["countySecretary", "countyHead"]],
    countyHead:         [4, 1, "county", "县长", "people", ["deputyCity", "cityCommittee"]],
    countySecretary:    [4, 1, "county", "委书记", "party", ["cityCommittee", "deputyCity"]],
    deputyCity:         [5, 2, "city", "副市长", "people", ["cityHead", "citySecretary"]],
    cityCommittee:      [5, 2, "city", "委常委", "party", ["citySecretary", "cityHead"]],
    cityHead:           [6, 2, "city", "市长", "people", ["deputyProvince", "provinceCommittee"]],
    citySecretary:      [6, 2, "city", "委书记", "party", ["provinceCommittee", "deputyProvince"]],
    deputyProvince:     [7, 3, "province", "副省长", "people", ["provinceHead", "provinceSecretary"]],
    provinceCommittee:  [7, 3, "province", "委常委", "party", ["provinceSecretary", "provinceHead"]],
    provinceHead:       [8, 3, "province", "省长", "people", []],
    provinceSecretary:  [8, 3, "province", "委书记", "party", []],
  };
  const procedures = {
    office: "按管理权限考察并任命",
    people: "组织推荐，履行同级人大选举程序",
    party: "履行党委全会选举并报上级党委批准",
    rank: "按职数开展推荐、考察与审批",
  };

  function position(role, region, provinceIndex) {
    const [level, scope, place, title, path] = roles[role];
    const location = place === "province" ? provinces[provinceIndex] : regions[region][place];
    return { id: role + "-" + region + "-" + provinceIndex, role, title: location + title, location, level, scope, path,
      region, provinceIndex, local: scope <= 1, rankCap: scope === 0 ? 8 : scope === 1 ? 10 : 11 };
  }

  function business(region, scope, township = false) {
    const area = regions[region];
    const offices = [area.county + ["住建局", "人社局", "民政局"][region], area.county + "人民政府办公室",
      area.city + ["水利局", "发改委", "交通运输局"][region], provinces[0] + "发展和改革委员会"];
    const location = township ? area.town : [area.county, area.county, area.city, provinces[0]][scope];
    const unit = township ? area.town + "人民政府" : offices[scope];
    return { id: "business-" + region + "-" + scope + (township ? "-town" : ""), role: "business",
      title: unit + " · " + (scope >= 2 ? "政策业务岗" : "综合业务岗"), location, level: 0, scope,
      path: "office", region, provinceIndex: 0, local: scope < 2, rankCap: scope < 2 ? 8 : scope === 2 ? 10 : 11 };
  }

  function deployment(region, member, title = "驻村锻炼") {
    return { ...business(region, 0), id: "village-" + region, role: "village", location: regions[region].village,
      title: regions[region].village + " · " + (member ? "村党支部书记助理" : "村委会主任助理"), path: title };
  }

  function allocation(profile, score, seed) {
    const region = ((seed >>> 0) % regions.length + Math.floor(score / 24)) % regions.length;
    let scope = score >= 88 ? 3 : score >= 72 ? 2 : score >= 48 ? 1 : 0;
    if (profile.channel === "rural") scope = profile.degree === "bachelor" ? 0 : 1;
    if (profile.channel === "targeted") scope = Math.max(1, Math.min(scope, profile.degree === "bachelor" ? 2 : 3));
    const township = scope === 0;
    const post = business(region, scope, township);
    return { post, band: township ? "乡镇机关" : ["", "县直机关", "市直机关", "省直机关"][scope],
      placement: profile.channel === "rural" ? { start: 0, end: 24 } : profile.channel === "targeted" ? { start: 12, end: 36 } : null };
  }

  function nextPositions(post) {
    const paths = post.level ? roles[post.role].at(-1) : ["deputyBureau", "deputyTown"];
    return paths.map((role) => position(role, post.region, post.provinceIndex));
  }

  function lateral(post) {
    if (!post.level) {
      if (post.scope >= 2) return business(post.region, 0, true);
      return business((post.region + 1) % regions.length, post.scope, post.scope === 0);
    }
    if (post.level >= 7) return position(post.role, post.region, (post.provinceIndex + 1) % provinces.length);
    return position(post.role, (post.region + 1) % regions.length, post.provinceIndex);
  }

  const pick = (title, months, effect = {}, note = "") => ({ title, months, effect, note });
  const routine = {
    merit: { title: "推进重点业务", body: "持续交付本职工作里的阶段成果。" },
    credit: { title: "兑现公开承诺", body: "跟进答复、整改和交接，按已办成的事积累信誉。" },
    ties: { title: "开展跨部门协作", body: "确定各方分工，把一次次合作做实。" },
  };

  function project(id, scope, title, body, turningPoint, ...options) {
    return { id, scope, title, body, turningPoint, options };
  }

  const projects = [
    project("flood-roads", 0, "汛前的两条路", "一条路通医院，另一条通安置点。先核查两处的工期和人手。",
      "汛期提前，施工队只能先收尾一处。两段路都完工，需要更多时间和协调。",
      pick("先保医院通道，公布安置点绕行路线", 3, { merit: 10, credit: 3 }),
      pick("做完两段再统一交付", 9, { merit: 18, credit: 5 }),
      pick("带队集中赶工，先完成两处关键路段", 3, { merit: 16, health: -25 })),
    project("wage-claims", 0, "欠薪清单", "梳理几家用工单位的工资记录，约定给工人逐一答复。",
      "一批工时已经核实，另外两批还在争议中。已核实的工资可以先发。",
      pick("办妥已核实的支付并逐人回访", 3, { credit: 12, merit: 2 }),
      pick("协调工人、企业和各单位一并办结", 9, { credit: 16, ties: 6, merit: 3 })),
    project("clinic-network", 1, "县域转诊试点", "中心院区希望扩容，偏远乡镇希望有人轮换。先摸清可用床位。",
      "部分乡镇凑齐了巡诊班次，另几处的交通衔接还差一轮测试。",
      pick("先办两处成熟的巡诊与转诊点", 3, { merit: 11, credit: 2 }),
      pick("做成覆盖偏远乡镇的双向转诊网", 9, { merit: 17, ties: 6 }),
      pick("组织县院集中支援，加快核心线路试行", 3, { merit: 14, ties: 4, health: -25 })),
    project("factory-move", 1, "老厂搬迁", "原址有机会提前交付，职工接驳与就业安置也在谈判。",
      "土地已具备交付条件，职工提出把通勤和面试纳入同一段安置安排。",
      pick("分两期交付，先兑现原址与接驳承诺", 3, { merit: 8, credit: 5 }),
      pick("与厂方和乡镇谈妥就业及交通再交付", 9, { merit: 9, credit: 9, ties: 6 })),
    project("city-link", 2, "跨县路网连通", "两县的路段已各自开工。打通交界处还需要共同安排封路和绕行。",
      "交界工期有冲突。两县都愿意先交付能单独运行的路段。",
      pick("先交付县内通行段，确认下一期联通日程", 3, { merit: 11, credit: 3 }),
      pick("联合交付整条跨县通道", 9, { merit: 18, ties: 6 }),
      pick("集中轮班，赶完主线交界处", 3, { merit: 16, ties: 2, health: -25 })),
    project("industry-pilot", 2, "重评市域产业试点", "几个产业园用同一套考核指标，实际带来的就业差异很大。",
      "已拿到部分园区的数据，边缘地区还需要核验，两类园区的评估口径正好有冲突。",
      pick("先公开已核实的成绩和暂缓名单", 3, { credit: 11, merit: 3 }),
      pick("共同定下分组规则，再交付可比的试点结果", 9, { credit: 13, merit: 6, ties: 5 })),
    project("shared-industry", 3, "跨市产业分工", "三市都想争主园区。就业、物流和环境成本要放到一张省级安排里。",
      "两市已接受错位分工，第三市要求先明确运输和就业配套。",
      pick("先落地两市已谈妥的环节", 3, { merit: 11, ties: 3 }),
      pick("落实三市分工及下一轮评估责任", 9, { merit: 17, ties: 7 }),
      pick("主持密集会商，先签跨市主方案", 3, { merit: 13, ties: 6, health: -25 })),
    project("province-reform", 3, "省级试点复核", "同一项改革在不同地市表现不一，需要定下下一批推广范围。",
      "成熟地区希望立即推广，缺乏配套的地市需要准备期。",
      pick("公布复核结果，安排成熟地区先行", 3, { credit: 11, merit: 3 }),
      pick("分组落实配套后再公布分批推广名单", 9, { credit: 12, merit: 8, ties: 4 })),
    project("national-rollout", 4, "跨省政策分期落地", "沿海、高地和老工业区给出不同的试点结果。各部门在等是否推广。",
      "部分省份已有把握落地，其他省份希望明确退出和纠偏条件。",
      pick("先在条件接近的省份推进，给出回看日期", 3, { merit: 10, credit: 5 }),
      pick("完成跨省协商后分批部署", 9, { merit: 16, credit: 5, ties: 4 }),
      pick("集中主持会签，赶出首批共同方案", 3, { merit: 13, ties: 4, health: -25 })),
    project("national-resources", 4, "全国资源布局", "一案覆盖更广，一案能先补紧缺地区。各部门要共用一份投放额度。",
      "分配原则已大体一致，调整期和地方责任仍需确认。",
      pick("先做最急地区的调拨，公开剩余缺口", 3, { merit: 10, ties: 4 }),
      pick("把基础覆盖、分期加量和后评估做成一体安排", 9, { merit: 15, ties: 9 })),
    { ...project("plenum-agenda", 4, "中央全会议程会商", "两项部署都列入议程，部委执行期限相互牵制。",
      "一项意见已齐备，另一项仍在等地区反馈。两项都列入本次会议会挤压执行准备。",
      pick("先审议已齐备的事项，写明其余反馈期", 3, { credit: 10, ties: 5 }),
      pick("协调各方的分期责任，再合并提交审议", 9, { credit: 13, ties: 8, merit: 4 })), central: 2 },
  ];

  const offenses = [
    { id: "improper-support", title: "接受违规引荐", body: "一位同僚提出替你争取任用支持，条件是你答应一项不合规的请托。",
      weight: 0.39, risk: 2, severity: 2 },
    { id: "false-record", title: "以失实成果争取任用", body: "有人提议把尚未办结的成果列入考察材料，好赶上下一次任用。",
      weight: 0.57, risk: 3, severity: 3 },
    { id: "improper-exchange", title: "接受违规利益交换", body: "一个合作方愿意承诺更直接的支持，也要求你为一项本不应获批的安排背书。",
      weight: 0.8, risk: 5, severity: 4 },
  ];

  const temptations = [
    "有人说可以替你递一份格外有分量的推荐，交换条件是一件排在等候名单后面的请托。",
    "一位熟人声称能为你争取这轮考察支持，希望你先同意一项不合规的安排。",
    "任用名单就要定了。一位合作方拿出一份已约好的支持名单，提出一项违规交换。",
    "本轮任用即将结算。有人愿意代为争取支持，条件是你给一项有争议的安排违规背书。",
    "会议即将开始。有人提出拿下一轮部署中的不当承诺，交换这一次的支持。",
  ];

  const incident = (id, scope, tag, title, body, ...options) => ({ id, scope, tag, title, body, options });
  const events = [
    incident("e0-rain", 0, "merit", "桥头积水突然上涨", "短时雨势变化，两处居民同时打进值班电话。",
      pick("重排本月现场安排", 1, { merit: 4, health: -5 }),
      pick("交当班队伍先按应急预案处置", 0, { credit: -1 })),
    incident("e0-elder", 0, "ties", "村民把一张旧车票送到窗口", "上一轮接驳时刻改了。他想知道谁还能来协商。",
      pick("和村里重新排一段班次", 1, { ties: 3, merit: 2, health: -2 }),
      pick("确认下一场协调会的时间", 0, { ties: 1 })),
    incident("e0-archive", 0, "credit", "两份回执只有一份签过字", "同一件事在台账里的位置不同，原经手人正在休假。",
      pick("自己复核再补齐记录", 1, { credit: 4, health: -1 }),
      pick("如实登记为待复核", 0, { credit: 1 })),
    incident("e1-hospital", 1, "merit", "乡镇接连提出转诊请求", "县院的床位和巡诊人手都快碰到上限。",
      pick("调一次县域巡诊", 1, { merit: 4, health: -4 }),
      pick("优先保重症转运", 0, { merit: -1, credit: 1 })),
    incident("e1-offer", 1, "ties", "另一县邀请联合排查", "双方有各自立过功的人，眼下最难的是谁先出人。",
      pick("安排自己的单位先支援", 1, { ties: 4, health: -3, follow: "help" }),
      pick("交换现有安排，约下次见面", 0, { ties: 2 })),
    incident("e1-check", 1, "credit", "交接时发现一页批示遗漏", "接任的人发来照片。有个接下来还要关键签字的节点没交代。",
      pick("主动补办交接", 1, { credit: 4, health: -1 }),
      pick("先发出可核实的进展", 0, { credit: 1 })),
    incident("e2-notice", 2, "merit", "跨县项目的评估提前", "两个县完成了可分期落地的部分。评估只留一个现场核验名额。",
      pick("先核验条件较难的一侧", 1, { merit: 4, health: -3 }),
      pick("说明差异后先看代表性强的一侧", 0, { merit: 2 })),
    incident("e2-vacancy", 2, "ties", "竞争者提议共用一组人员", "本期正在讨论新的分工，两人都能带队，人员只够组一个专班。",
      pick("一起排负责人和备用人选", 1, { ties: 4, credit: 1 }),
      pick("先支持对方按自己计划开工", 0, { ties: 1 })),
    incident("e2-brief", 2, "credit", "几县发来不同的整改回报", "汇总材料马上截止。一处提供了现场核验，另外两处只有文字。",
      pick("如实列出不同进展，继续核查", 1, { credit: 4, health: -2 }),
      pick("仅通报已经核实的部分", 0, { credit: 1 })),
    incident("e3-demo", 3, "merit", "两市同时够得上先行试点", "额度只够一处，一个需要更急，一个已经有可复制的条件。",
      pick("把额度给现在缺口更大的地区", 1, { merit: 4, credit: 1, health: -2 }),
      pick("先批成熟试点，保留次轮名额", 0, { merit: 2, ties: 1 })),
    incident("e3-divide", 3, "ties", "外省打来协调电话", "双方能共享运力，也都希望对方先动原来的计划。",
      pick("提出对等的先行安排", 1, { ties: 4, health: -2, follow: "help" }),
      pick("把目前各自能承担的部分写清楚", 0, { ties: 1 })),
    incident("e3-audit", 3, "credit", "旧项目信息与现有口径冲突", "巡视组请你提供当时的执行安排，手头正好有确切档案。",
      pick("整理实际责任和执行过程", 1, { credit: 4, health: -2 }),
      pick("按程序移交已核实材料", 0, { credit: 1 })),
    incident("e4-replan", 4, "merit", "多个省的试点成效相反", "会签时间临近，推进统一规则仍可能挤压薄弱地区准备时间。",
      pick("设计分批推广和纠偏节点", 1, { merit: 4, health: -4 }),
      pick("暂缓统一落地，先保留各地试点", 0, { credit: 2 })),
    incident("e4-contact", 4, "ties", "几方希望再谈一次", "各方愿意用同一个议案推进，最大的分歧在实际可调配的资源。",
      pick("主持最后一次共同会商", 1, { ties: 4, health: -3 }),
      pick("先请各方书面确认已达成的意见", 0, { ties: 1 })),
    incident("e4-statement", 4, "credit", "部署征求意见的回执到了", "几处回执提出了执行可能遇到的问题，要求在新文件里写明。",
      pick("明确写出约束和存疑事项", 1, { credit: 4, health: -2 }),
      pick("把书面异议附入会议材料", 0, { credit: 2 })),
    incident("e0-road", 0, "health-work", "两段山路临时封闭", "换路需要额外人手，值守点已经有人开始排队。",
      pick("补一班夜间值守", 1, { health: -7 }),
      pick("暂停远端窗口，设下一班接驳", 0, { ties: -2 })),
    incident("e0-museum", 0, "merit", "旧馆要开放，消防还差一道检查", "居民已经记住了开放日。馆员问你能否同时留出必要检查的时间。",
      pick("分批开馆并完成余下核验", 1, { merit: 3, credit: 2, health: -3 }),
      pick("公布新的开放日程", 0, { credit: 1 })),
    incident("e1-cluster", 1, "ties", "两个乡镇想共用值守人员", "晚上的队伍只够覆盖一条线，彼此对谁可以代班没有一致意见。",
      pick("把代班时段、交接和补位写进计划", 1, { ties: 4, health: -2 }),
      pick("保留独立值班，互报紧急情况", 0, { ties: 1 })),
    incident("e1-bridge", 1, "merit", "桥梁检查结果有两种解释", "县里的应急线路依赖这座桥。两边都在等临时安排。",
      pick("安排限载和应急绕行", 1, { merit: 3, health: -5 }),
      pick("暂停过桥车次，让其他线路代接", 0, { merit: -2, health: -2 })),
    incident("e2-balance", 2, "ties", "几县要你确认年度分担", "有个县承担了额外的过境工作，其他县希望照原比例结算。",
      pick("就新增工作另定下一期分担比例", 1, { ties: 3, credit: 1 }),
      pick("把有争议部分交联席会确认", 0, { credit: 1 })),
    incident("e2-cold", 2, "merit", "气象预报临时变了", "恶劣天气影响全市几个转运点，部分站点的计划必须取消。",
      pick("重排靠前的转运班次", 1, { health: -6, merit: 1 }),
      pick("暂时收缩接运范围", 0, { merit: -2 })),
    incident("e3-review", 3, "credit", "省级试点需要公开复盘", "一项成效已经得到验证，另一项的受益名单还要按地区核对。",
      pick("组织对各地条件的说明会", 1, { credit: 4, health: -3 }),
      pick("先发布已验证的结果", 0, { credit: 2 })),
    incident("e3-gap", 3, "merit", "扶持条例落地后出现缺口", "一些边缘地区虽然合格，配套却不足。要决定谁先试、谁需要准备。",
      pick("对缺口地区增设一轮准备期", 1, { merit: 3, ties: 2 }),
      pick("先开放具备条件的试点", 0, { merit: 2 })),
    incident("e4-dates", 4, "ties", "几个省在执行日期上互相等", "各省都完成了授权，人手和用地的可用时间不一致。",
      pick("确定全国共同节点和分期条件", 1, { ties: 4, credit: 1, health: -2 }),
      pick("允许具备条件的地区先实施", 0, { ties: 2 })),
    incident("e4-reports", 4, "credit", "一份跨省评估的两处结论冲突", "全国汇总时间已经敲定，复核人员要求把矛盾写进材料。",
      pick("追加一轮独立复核", 1, { credit: 4, health: -4 }),
      pick("汇总时公开交代存疑的范围", 0, { credit: 2 })),
    incident("e-health", null, "health", "身体发出警告", "连续忙过几个月，接下来的安排需要留出恢复时间。",
      pick("把下一项安排定为休养", 1, { health: 10 }),
      pick("移交紧急事项，先结束今天的安排", 0, { health: -3 })),
    incident("e-risk", null, "risk", "旧卷宗请补充说明", "一项早先办过的事情被翻出来核对。涉及的时间和经手人都在旧材料里。",
      pick("花一个月按实补充说明", 1, { credit: 2, health: -1 }),
      pick("交出原有材料，等正式结果", 0, {})),
    incident("e-candidate", null, "candidate", "有了下一次任用的消息", "和你同批接受考察的人也在准备。手头尚有一件过去答应办的事。",
      pick("把承诺的工作先收尾", 1, { credit: 4, health: -2 }),
      pick("保持当前工作安排", 0, {})),
  ];

  return { provinces, regions, channels, scopes, categories, limits, people, roles, procedures,
    business, deployment, allocation, nextPositions, lateral, routine, projects, offenses, temptations, events, pick };
})();
