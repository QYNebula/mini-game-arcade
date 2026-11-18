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
  const act = (id, scope, group, title, body, ...options) => ({ id, scope, group, title, body, options });
  const done = (id, scope, group, title, body, months, gain) => act(id, scope, group, title, body,
    pick("安排此事", months, { [group]: gain, health: -months }));
  const risk = (points, severity) => ({ risk: points, severity });
  const tasks = [
    done("s0-readings", 0, "merit", "复核河岸和背街的隐患点", "把居民反映的位置和现场结果汇成一张能交接的图。", 1, 3),
    act("s0-flood", 0, "merit", "汛前的两条路", "一条通医院，另一条通往安置点。队伍只够先收尾一处。",
      pick("先保医院路，再安排安置点绕行", 2, { merit: 6, health: -4, follow: "work" }),
      pick("申请加班并分步处置", 1, { merit: 4, health: -6, follow: "work" }),
      pick("违规占用另一处专项物资", 1, { merit: 9, health: -3, ...risk(2, 2) })),
    act("s0-wage", 0, "merit", "欠薪清单", "三份材料记的工作日期不同，工人等着过节前的答复。",
      pick("核实工时、欠付并跟踪支付结果", 3, { merit: 10, credit: 2, health: -5, follow: "work" }),
      pick("先办已验证的那一批", 1, { merit: 3, health: -1 })),
    act("s0-budget", 0, "merit", "站点突然停运", "备用车还在保养，两条线路中至少一条要马上恢复。",
      pick("协调公用车短期接驳", 2, { merit: 6, health: -5 }),
      pick("抢修并缩短一班线路", 1, { merit: 4, health: -6 }),
      pick("擅自占用救助专项额度保运行", 1, { merit: 9, ...risk(2, 2) })),
    done("s0-ledger", 0, "credit", "兑现交接时说好的回访", "把之前留下的几个未办事项逐一回复。", 1, 3),
    act("s0-delay", 0, "credit", "延误的台账", "工程实际还差一次复核。明天交考核进展，办公室已给你留了一行。",
      pick("说明未办部分并接下整改", 2, { credit: 6, health: -2, follow: "work" }),
      pick("承诺一个很紧的新期限", 1, { credit: 4, follow: "promise" }),
      pick("失实填报已经完工", 1, { credit: 9, ...risk(2, 2) })),
    act("s0-error", 0, "credit", "交接单的漏项", "一项承诺没有按期答复，原来负责登记的人已经借调。",
      pick("承担自己的部分并补回访", 2, { credit: 6, health: -3 }),
      pick("提交失实说明，推给前任", 1, { credit: 8, ties: -2, ...risk(2, 2) })),
    done("s0-help", 0, "ties", "给邻镇支援一次窗口工作", "双方把最常见的材料问题整理成一页清单。", 1, 3),
    act("s0-favor", 0, "ties", "帮忙带句话", "一位同僚答应在调配人手时支持你，也提起一件按顺序还轮不到的请求。",
      pick("公开协作并说明分别办理", 2, { ties: 6, health: -2 }),
      pick("答应违规优先处理", 1, { ties: 8, ...risk(1, 1), follow: "favor" })),
    act("s0-pair", 0, "ties", "共用一支巡查队", "隔壁镇也缺人，可以换班，但你需要承诺下一次支援。",
      pick("排出双方都能履行的班表", 2, { ties: 6, follow: "help", health: -2 }),
      pick("先帮对方补本月的空班", 1, { ties: 3, health: -4 })),

    done("s1-school", 1, "merit", "调整县域校车班次", "把空跑和常年满员的线路放在一张调度表上重排。", 1, 3),
    act("s1-relocate", 1, "merit", "老厂搬迁", "原址可提前交付，搬迁职工的接驳与就业安置还没谈妥。",
      pick("把安置和交付拆成两期", 2, { merit: 6, health: -4, follow: "work" }),
      pick("先交已具备条件的地块", 1, { merit: 3, health: -3 }),
      pick("违规动用安置资金抢完工", 1, { merit: 10, health: -4, ...risk(4, 3) })),
    act("s1-clinic", 1, "merit", "县域转诊试点", "一个中心院区想扩大规模，偏远乡镇需要医生轮换。",
      pick("安排巡诊和转诊双向试点", 2, { merit: 7, health: -6, follow: "work" }),
      pick("先让一处条件好的院区试行", 1, { merit: 4, health: -2 })),
    act("s1-diversion", 1, "merit", "过境货运分流", "镇区不愿再承受重车噪声，改线会影响另一片厂区。",
      pick("分时段试跑，跟踪两地负担", 2, { merit: 6, ties: 1, health: -3 }),
      pick("连夜集中改线抢通", 1, { merit: 5, health: -9 })),
    done("s1-handover", 1, "credit", "兑现专班延期交接", "把真实完成节点、后续责任和居民承诺一并归档。", 1, 3),
    act("s1-account", 1, "credit", "周报里的验收结论", "一处验收暂时合格，另一处尚未实测。两份简报看起来差不多。",
      pick("分开说明并接受复核", 2, { credit: 6, health: -3 }),
      pick("把未检部分列入已验收", 1, { credit: 10, ...risk(2, 2) })),
    act("s1-debt", 1, "credit", "谁来承担延期", "你的批示和部门执行都有过延误。任期报告正在写责任归属。",
      pick("承认自己的审批延迟", 1, { credit: 3, ties: 1 }),
      pick("提交失实责任说明", 1, { credit: 8, ties: -3, ...risk(2, 2) })),
    done("s1-collab", 1, "ties", "把三个乡镇的分歧约到桌上", "先谈可共享的队伍，再定下互相代班的日程。", 1, 3),
    act("s1-support", 1, "ties", "县域协作的请托", "一个合作单位愿意在联合会上站出来，也想把自己的单位列进另一项试点。",
      pick("一起说明条件，公开列出候选单位", 2, { ties: 6, credit: 1 }),
      pick("违规保证入选以换取支持", 1, { ties: 9, ...risk(2, 2), follow: "favor" })),
    act("s1-rival", 1, "ties", "同一份拟任名单", "另一名拟任人选也做过救灾。你的熟人问，要不要借机会把对方排到名单外。",
      pick("认可对方贡献，争取下一次合作", 1, { ties: 3, credit: 2 }),
      pick("提交捏造材料排挤同僚", 1, { ties: 9, credit: 2, ...risk(4, 3) })),

    done("s2-fares", 2, "merit", "统筹市域公交换乘", "为几县试下统一换乘规则，先解决通勤跨度最大的路线。", 1, 3),
    act("s2-relief", 2, "merit", "两个县争同一批抢险设备", "一个险情较急，另一个地区一旦断路就难以再发运。",
      pick("按险情分批支援并留补调队", 2, { merit: 7, health: -5, follow: "work" }),
      pick("让设备先去交通更远的一边", 1, { merit: 4, health: -3 }),
      pick("违规挪用储备制造全线已到位的成绩", 1, { merit: 10, ...risk(4, 3) })),
    act("s2-transit", 2, "merit", "跨县路网连通", "两个县都能先办自己那一段，交界工期却相差三个月。",
      pick("锁定两地窗口，联合落实封路和绕行", 3, { merit: 10, ties: 1, health: -6, follow: "work" }),
      pick("先办能独立运行的一段", 1, { merit: 4, health: -3 })),
    act("s2-pilot", 2, "merit", "三类产业园共用同一个指标", "可简化考核，也可拿掉几个看似绿灯的园区重新验证实际就业。",
      pick("分组试点，再用共同指标评估", 2, { merit: 6, credit: 2, health: -4 }),
      pick("集中复查下滑最快的园区", 1, { merit: 4, health: -5 })),
    done("s2-trace", 2, "credit", "落实外地留任时的承诺", "给原先代理的项目一个完整交代，签字人可以追溯每个节点。", 1, 3),
    act("s2-discrepancy", 2, "credit", "通报里的统计口径", "两县的办结率排在一起，实地发现一个县多算了未核实的件数。",
      pick("承担更正责任并做同口径复核", 2, { credit: 7, health: -3 }),
      pick("签发明知失实的通报", 1, { credit: 9, ...risk(2, 2) })),
    act("s2-return", 2, "credit", "临到公布的整改期限", "整改记录只验证了部分问题。发布会已经排好时间。",
      pick("按实公开并明确补改责任", 2, { credit: 6, health: -4 }),
      pick("换一个口头期限先争取认同", 1, { credit: 4, follow: "promise" }),
      pick("隐瞒需要追责的缺项", 1, { credit: 9, ...risk(2, 2) })),
    done("s2-forum", 2, "ties", "搭建跨县联合协调小组", "把两地各自掌握的资源和办理期限摆在同一张表上。", 1, 3),
    act("s2-pool", 2, "ties", "上级急要一个推荐人选", "两位候选人都有基层实绩，几个单位对自己熟悉的人更愿意支持。",
      pick("让各地把实际贡献说明白", 2, { ties: 6, credit: 1 }),
      pick("违规交换用人支持", 1, { ties: 10, ...risk(4, 3), follow: "favor" })),
    act("s2-rival", 2, "ties", "联合工作名单的空位", "一位同僚不同意你的顺序，两边都有人能列出实际代价。",
      pick("以各自主张共同报送", 1, { ties: 4, credit: 1 }),
      pick("违规排除对方参与资格", 1, { ties: 8, ...risk(2, 2) })),

    done("s3-works", 3, "merit", "复盘全省重点试点", "汇总已经兑现的结果，为不同类型地区排下一批实施顺序。", 1, 3),
    act("s3-trials", 3, "merit", "只够一个省级试点名额", "一市急需周转，另一市配套齐全，推广效果可能更好。",
      pick("把名额给需求最急且能执行的地方", 2, { merit: 7, health: -4, follow: "work" }),
      pick("先验证成熟样板的可复制性", 1, { merit: 4, health: -2, follow: "work" }),
      pick("违规占用他地额度加码单一示范点", 1, { merit: 10, ...risk(4, 3) })),
    act("s3-industry", 3, "merit", "三市都要争主园区", "就业、物流和污染外溢都跨市，短期得分会把不同城市推向同一方案。",
      pick("确定跨市分工和后评估", 3, { merit: 10, ties: 2, health: -6, follow: "work" }),
      pick("先解决两市已具备条件的环节", 1, { merit: 4, health: -4 })),
    act("s3-disaster", 3, "merit", "跨省的防汛会商", "同一波洪水将先后过两省。地面调度要按小时接力，调蓄意见尚未统一。",
      pick("编排两省共同调度与备用计划", 2, { merit: 7, health: -6 }),
      pick("通宵主持紧急方案会签", 1, { merit: 5, health: -11 })),
    done("s3-handover", 3, "credit", "把省级决议交接到执行单位", "核实分工和约定完成的节点，再给出完整交接记录。", 1, 3),
    act("s3-verify", 3, "credit", "示范数字进入汇报材料", "两个地市把未达到终验的结果计进试点完成率。汇报材料正在定稿。",
      pick("承担修订责任，重新核定结果", 2, { credit: 7, health: -4 }),
      pick("以限期整改为由先报一半", 1, { credit: 4, follow: "promise" }),
      pick("带着已知失实数据签发汇报", 1, { credit: 10, ...risk(4, 3) })),
    act("s3-disclose", 3, "credit", "巡视前的跨地交接", "选入试点的一地迟迟没有落实任务，原来做的承诺还需要有人承担。",
      pick("按职责列出延期和负责事项", 2, { credit: 6, health: -3 }),
      pick("提交失实交接结论抢在巡视前通过", 1, { credit: 9, ...risk(2, 2) })),
    done("s3-convene", 3, "ties", "召开相关省份的联合协调会", "把地市的方案和外省实现过的经验整理成可讨论的共同文本。", 1, 3),
    act("s3-requests", 3, "ties", "另一个议题的请托", "两地代表都愿意配合重组方案，其中一位要求你对一项特定安排作承诺。",
      pick("接受平等协作，相关安排另议", 2, { ties: 6, health: -2 }),
      pick("违规承诺利益换取配合", 1, { ties: 10, ...risk(4, 3), follow: "favor" })),
    act("s3-contender", 3, "ties", "一场讨论中的竞争者", "一名潜在拟任人也主持过跨省协调。他与你在调拨原则上并不同意。",
      pick("把分歧和共同做成的事列清楚", 2, { ties: 6, credit: 1 }),
      pick("以失实材料违规阻止对方进入酝酿", 1, { ties: 9, ...risk(4, 3) })),

    done("s4-indicators", 4, "merit", "通过区域议题的共同指标", "把不同省份的执行效果纳入同口径评估，约定下一轮反馈节点。", 1, 3),
    act("s4-pilot", 4, "merit", "跨省政策是否统一铺开", "同一套政策在沿海、高地和老工业区得出了不同成效。相关部门都等着定下一步。",
      pick("分批推广，规定退出和反馈条件", 3, { merit: 11, credit: 1, health: -6, follow: "work" }),
      pick("先在条件接近的几个省验证", 1, { merit: 4, health: -3, follow: "work" }),
      pick("违规挪用专项额度保一批短期数字", 1, { merit: 10, ...risk(5, 4) })),
    act("s4-refine", 4, "merit", "两条全国资源布局方案", "一案覆盖更广，另一案能先补偏远地区短缺。首期只有一份投放额度。",
      pick("划定基础覆盖再按缺口分期加量", 2, { merit: 7, health: -5 }),
      pick("从紧急地区先开始，另列调整会期", 1, { merit: 4, health: -5 })),
    act("s4-rebuild", 4, "merit", "跨区域灾后恢复", "各地的恢复时间不一样。交通、医疗和企业复产对优先顺序各有意见。",
      pick("统筹各线的恢复阶段并留出调整机制", 2, { merit: 7, ties: 1, health: -6 }),
      pick("主持应急会商，先确立一项全国调拨", 1, { merit: 5, health: -8 })),
    done("s4-minute", 4, "credit", "兑现上一轮跨省协调承诺", "核对各地执行报告，把还要继续负责的事项带入下一轮。", 1, 3),
    act("s4-review", 4, "credit", "全会材料的异议", "几个部门对一项界定意见不同，旧稿却已按「一致通过」送审。",
      pick("把分歧和后续核对方案如实提交", 2, { credit: 7, health: -4 }),
      pick("承诺很快取得一致并先交摘要", 1, { credit: 4, follow: "promise" }),
      pick("提交明知不实的一致意见记录", 1, { credit: 10, ...risk(5, 4) })),
    act("s4-legacy", 4, "credit", "全国试点的失误归属", "旧的部署中有一个环节由你同意，分管单位也违反了约定时限。",
      pick("按实际经过说明各方责任", 2, { credit: 7, health: -4 }),
      pick("用虚假记录把责任推给执行部门", 1, { credit: 9, ties: -3, ...risk(4, 3) })),
    done("s4-meeting", 4, "ties", "召集跨地区议题协商", "分别核对相互冲突的省级诉求，形成可共同支持的文本。", 1, 3),
    act("s4-votes", 4, "ties", "同一份政策议案的支持", "几方都表示可以接受一部分内容。有人希望用另一项安排换这次的支持。",
      pick("组织公开协商，逐项确定可行共识", 2, { ties: 7, health: -4 }),
      pick("违规私下许诺利益换取支持", 1, { ties: 10, ...risk(5, 4), follow: "favor" })),
    act("s4-competition", 4, "ties", "同一批考察的两名人选", "一位同行对你的方案提出了专业异议。熟人给你递来一份来源有疑点的材料。",
      pick("按已核实的履历展开讨论", 1, { ties: 4, credit: 1 }),
      pick("借失实线索违规排挤竞争者", 1, { ties: 9, ...risk(4, 3) })),
    { ...act("s4-plenum-note", 4, "credit", "全会讨论稿的未决事项", "两项部署都已列入议程，执行期限仍在相互牵制。",
      pick("将兑现条件写成分期决定", 2, { credit: 7, health: -4, follow: "work" }),
      pick("如实保留一项分歧供下一轮讨论", 1, { credit: 4, health: -2 })), central: 2 },
    { ...act("s4-chair", 4, "ties", "主持跨部门议程会商", "两个领域都需要优先列入下一轮议程，代表希望知道你的取舍。",
      pick("按可完成的责任拆开两项议题", 2, { ties: 7, credit: 2, health: -4 }),
      pick("先协调最急议题的实施责任", 1, { ties: 4, health: -5 })), central: 3 },
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
    business, deployment, allocation, nextPositions, lateral, tasks, events, pick };
})();
