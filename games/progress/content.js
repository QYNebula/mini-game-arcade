const ProgressContent = (() => {
  const province = "云岬省";
  const regions = [
    { county: "鹤汀县", town: "白芦镇", village: "长埠村", city: "泊桥市", focus: "water", description: "沿河片区每到汛期就积水，县里的排水账已经记了三年。" },
    { county: "岑炉县", town: "松埠镇", village: "望炉村", city: "栖川市", focus: "industry", description: "老工业县腾出一块地想办新园区，原来的工人工资还没结清。" },
    { county: "栖岭县", town: "石梨镇", village: "背岭村", city: "沐川市", focus: "services", description: "山里的年轻人去了外地，村里的接驳车常常只剩司机一个人。" },
  ];
  const channels = { ordinary: "普通招录", rural: "常规选调", targeted: "定向选调" };
  const allDegrees = ["bachelor", "master", "doctor"];
  const openings = [
    { id: "county", channel: "ordinary", region: 0, unit: "鹤汀县住房和城乡建设局", title: "工程管理岗", topic: "water", scope: 0, cap: 8, first: "跟同事跑现场，跟进老街的排水工程。", degrees: allDegrees },
    { id: "labor", channel: "ordinary", region: 1, unit: "岑炉县人力资源和社会保障局", title: "劳动保障岗", topic: "industry", scope: 0, cap: 8, first: "在服务窗口登记园区工人的欠薪诉求。", degrees: allDegrees },
    { id: "town", channel: "ordinary", region: 2, unit: "石梨镇人民政府", title: "综合事务岗", topic: "services", scope: 0, cap: 8, first: "接手几个山村的公交站和便民服务。", degrees: allDegrees },
    { id: "riverside", channel: "rural", region: 0, unit: "鹤汀县基层选调", title: "综合管理岗", topic: "water", scope: 0, cap: 8, first: "报到后到长埠村任职两年，考核合格后回录用单位。", degrees: allDegrees },
    { id: "hillside", channel: "rural", region: 2, unit: "栖岭县基层选调", title: "综合管理岗", topic: "services", scope: 0, cap: 8, first: "报到后到背岭村任职两年，考核合格后回录用单位。", degrees: allDegrees },
    { id: "planning", channel: "targeted", region: 1, unit: "云岬省发展和改革委员会", title: "区域规划研究岗", topic: "industry", scope: 3, cap: 11, first: "在录用单位试用一年，转正后到基层锻炼两年，再回省直。", degrees: ["master", "doctor"] },
    { id: "water-office", channel: "targeted", region: 0, unit: "泊桥市水利局", title: "水利规划岗", topic: "water", scope: 2, cap: 10, first: "在录用单位试用一年，转正后到基层锻炼两年，再回市直。", degrees: allDegrees },
  ];
  const job = (key, title, level, scope, topic, path, local, rankCap) => ({ key, title, level, scope, topic, path, local, rankCap });

  function roles(level, region) {
    const { county, city, town } = regions[region];
    return ({
      1: [
        job("town-deputy", town + "副镇长", 1, 0, "services", "people", true, 8),
        job("county-works-deputy", county + "住建局副局长", 1, 0, "water", "appointment", true, 8),
        job("county-labor-deputy", county + "人社局副局长", 1, 0, "industry", "appointment", true, 8),
      ],
      2: [
        job("town-head", town + "镇长", 2, 0, "services", "people", true, 8),
        job("county-works-head", county + "住建局局长", 2, 0, "water", "appointment", true, 8),
        job("county-development-head", county + "发改局局长", 2, 0, "industry", "appointment", true, 8),
      ],
      3: [
        job("county-deputy", county + "副县长", 3, 1, "all", "people", true, 10),
        job("county-committee", county + "委常委", 3, 1, "all", "party", true, 10),
        job("city-water-deputy", city + "水利局副局长", 3, 2, "water", "appointment", false, 10),
      ],
      4: [
        job("county-head", county + "县长", 4, 1, "all", "people", true, 10),
        job("county-party-head", county + "委书记", 4, 1, "all", "party", true, 10),
        job("city-development-head", city + "发改委主任", 4, 2, "industry", "appointment", false, 10),
      ],
      5: [
        job("city-deputy", city + "副市长", 5, 2, "all", "people", false, 11),
        job("city-committee", city + "委常委", 5, 2, "all", "party", false, 11),
        job("province-water-deputy", province + "水利厅副厅长", 5, 3, "water", "appointment", false, 11),
      ],
      6: [
        job("city-head", city + "市长", 6, 2, "all", "people", false, 11),
        job("city-party-head", city + "委书记", 6, 2, "all", "party", false, 11),
        job("province-development-head", province + "发展和改革委员会主任", 6, 3, "industry", "appointment", false, 11),
      ],
      7: [
        job("province-deputy", province + "副省长", 7, 3, "all", "people", false, 11),
        job("province-committee", province + "委常委", 7, 3, "all", "party", false, 11),
        job("other-province-deputy", "岚泽省副省长", 7, 3, "services", "people", false, 11),
      ],
      8: [
        job("province-head", province + "省长", 8, 3, "all", "people", false, 11),
        job("province-party-head", province + "委书记", 8, 3, "all", "party", false, 11),
        job("other-province-head", "岚泽省省长", 8, 3, "all", "people", false, 11),
      ],
    })[level] || [];
  }

  const people = [
    { name: "温荻", job: "业务科同事", strength: "执行", note: "熟悉现场，答应的事能在雨起来之前做完。" },
    { name: "周映岚", job: "综合办同事", strength: "协调", note: "串得起部门之间的电话，也记得谁答应了什么。" },
    { name: "陈闻安", job: "财务科同事", strength: "核查", note: "看票据仔细。遇到日期对不上的单子会反复问。" },
    { name: "何既明", job: "业务骨干", strength: "执行", note: "愿意接棘手项目，也会参加适合自己的岗位考察。" },
    { name: "乔及秋", job: "乡镇干部", strength: "协调", note: "认识各村的人，知道哪条路在大雨后最难走。" },
    { name: "叶穗", job: "项目联络员", strength: "核查", note: "习惯把走访、电话和回执都记在本子里。" },
    { name: "林泊羽", job: "综合科同事", strength: "执行", note: "强调每个负责人和期限，只接自己能做完的活。" },
    { name: "白梦棠", job: "政策研究同事", strength: "核查", note: "看得出材料里哪两个数字用的口径不同。" },
    { name: "郑南舟", job: "部门联络员", strength: "协调", note: "平时不多说，跨部门僵住的时候能约齐人。" },
    { name: "许观澜", job: "乡镇干部", strength: "执行", note: "会带着图纸去问当地人，不在会议室猜水往哪流。" },
  ];

  function project(id, topic, min, max, name, briefing, target, months, cost, legacy) {
    return { id, topic, min, max, name, briefing, target, months, cost, legacy };
  }
  const projects = [
    project("drain", "water", 0, 1, "老街排水", "三处倒灌点等着复核，汛期前至少要把最容易积水的两段接通。", 6, 9, 2, "老街雨季"),
    project("bridge", "water", 0, 2, "白石桥巡检", "桥面昨晚多了一条裂纹。查清承载风险，给接送孩子的居民留出绕行办法。", 5, 9, 2, "白石桥"),
    project("ditch", "water", 0, 1, "灌渠清淤", "水进了上游田，尾段两村还在等。清淤方案要把交界处一起算上。", 6, 12, 2, "两村灌渠"),
    project("wall", "water", 0, 2, "坡地挡墙", "老房后侧冒出渗水点。临时疏散和挡墙加固有各自的时限。", 7, 15, 3, "坡地安全"),
    project("river", "water", 1, 3, "沿河流域防洪", "上游想加高堤坝，下游要求留足泄洪通道，需要定下一套联合方案。", 9, 21, 4, "联合防洪"),
    project("reservoir", "water", 2, 4, "跨县水源调配", "枯水期的供水名单谈了三周。农业、居民和工业都要留出可核查的水量。", 10, 24, 5, "水源分配"),
    project("wages", "industry", 0, 1, "园区欠薪核对", "有人只带来一张考勤照片。逐一确认分包关系和欠付清单。", 6, 9, 2, "欠薪专班"),
    project("market", "industry", 0, 2, "农贸市场改造", "工程开工就得挪摊。卖菜的希望留下早市，消防通道也要空出来。", 7, 15, 3, "市场回迁"),
    project("retrain", "industry", 0, 2, "转岗技能班", "旧厂停了两条线。把培训名额、实际用工和下岗职工的时间一起排出来。", 6, 12, 2, "转岗就业"),
    project("permits", "industry", 0, 2, "小店证照联办", "开早餐铺的人被三张表卡了一个月。把能并联的环节找出来做一次试点。", 6, 15, 2, "小店联办"),
    project("relocation", "industry", 1, 3, "老厂搬迁安置", "区里希望尽快腾地，老工人希望有交通和连续就业保障。", 9, 21, 4, "安置承诺"),
    project("land", "industry", 2, 4, "产业用地清查", "几座城市的申报表写得一样漂亮。查清真正的闲置地和可改造空间。", 10, 24, 5, "用地清查"),
    project("bus", "services", 0, 2, "村镇接驳车", "看病的人想赶上午号，司机说晚班一直空跑。路线和班次都可以重排。", 6, 9, 2, "山村接驳"),
    project("canteen", "services", 0, 2, "长者助餐点", "收集到的第一份菜单只有面条。想办法让老人走得到，也让经营方撑得住。", 6, 12, 2, "老人助餐"),
    project("school", "services", 0, 2, "校门交通调整", "家长要接送区，公交司机要畅通。要先量清高峰的排队长度。", 6, 12, 2, "校园周边"),
    project("records", "services", 0, 2, "便民窗口联办", "居民把同一份材料复印了四次。查清哪些证明可以共享。", 7, 15, 2, "便民联办"),
    project("clinic", "services", 1, 3, "县域诊疗协作", "小院区缺人，市医院的号排到下月。两层医院都在争取试点资源。", 9, 21, 4, "诊疗协作"),
    project("schoolbus", "services", 1, 3, "乡村校车共用", "几处乡镇都买了车，有的每天满载，有的每周只跑两趟。", 8, 18, 4, "校车联运"),
    project("supply", "services", 2, 4, "跨地区应急储备", "一县的仓库堆满物资，邻县却借不到车。把轮换、储运和责任人落实。", 10, 24, 5, "应急储备"),
    project("facilities", "water", 3, 4, "老城韧性改造试点", "有三个城市希望率先试点。预算只能完整支持一处，另外两处需明确后续安排。", 12, 24, 6, "韧性试点"),
    project("regions", "industry", 3, 4, "区域产业协作", "几地都想把主园区设在自家。协调物流、就业和收益，形成可以执行的分工。", 12, 24, 6, "区域分工"),
    project("inspection", "all", 2, 4, "专项拨款复核", "同类型项目在各市申报的预算差了一倍。要确定复核重点和整改时限。", 9, 18, 4, "拨款复核"),
    project("coverage", "services", 3, 4, "公共服务一体化", "流动人口的服务记录分散在三个系统。先挑能办成的跨区事项，留足实施周期。", 11, 24, 5, "服务同办"),
    project("pilots", "all", 4, 4, "跨省政策评估", "同一份试点方案在沿海、山地和工业地区得出不同效果，评估报告必须说明原因。", 12, 24, 6, "政策评估"),
    project("balance", "all", 4, 4, "全国专项资金复盘", "大项目争取追加投入，小项目反映结算周期太长。先找出影响兑现的环节。", 12, 27, 6, "资金复盘"),
  ];

  const choose = (title, note, effect, cost = 1) => ({ title, note, effect, cost });
  const story = (id, topic, min, max, title, body, choices) => ({ id, topic, min, max, title, body, choices });
  const stories = [
    story("ordinary-report", "all", 0, 4, "第一天报到", "办公室给你腾出一张靠窗的桌。{person} 把在办事项放在桌上，末尾几页夹着去年没有办结的记录。", [
      choose("跟同事去现场", "先看问题出在哪，再接下这一摊工作。", { progress: 1, quality: 1, trust: 2 }),
      choose("先翻一遍交接清单", "补上去年的记录和今年的期限。", { merit: 2, quality: 1 }),
      choose("见见窗口和村里的联系人", "知道消息该找谁核实。", { trust: 3, public: 1 }),
    ]),
    story("rural-report", "all", 0, 4, "到村里报到", "{person} 骑车来接你。村里的工作室和会议室共用一张桌，桌边压着两份乡亲签过字的申请。", [
      choose("跟着村干部走一遍", "把最急的那一件记下来。", { progress: 1, public: 3 }),
      choose("先核实收上来的材料", "把空缺的记录补齐。", { quality: 1, merit: 2 }),
      choose("约几位村民碰面", "听听他们为什么提了两种不同的方案。", { trust: 2, public: 2 }),
    ]),
    story("targeted-report", "all", 0, 4, "在录用机关报到", "桌上有一张铺开的区域图。{person} 在几个地名旁画了圈，请你先弄清报告上那些数字怎么来的。", [
      choose("约一个基层回访", "从原始情况着手核对规划。", { quality: 2, public: 1 }),
      choose("梳理近三年的项目", "找出已经有条件推进的工作。", { progress: 1, merit: 3 }),
      choose("和各处室对一遍口径", "把不同部门的时间表写到一起。", { trust: 3, merit: 1 }),
    ]),
    story("congress", "all", 0, 4, "换届年度的交接", "{person} 要各处室核清几年来在办的事项。一份清册要留给接手的人，剩下的项目还要按期办下去。", [
      choose("把历年事项和去向都核清", "把责任人和原始记录一并保留。", { quality: 2, integrity: 2, merit: 1 }),
      choose("集中完成即将到期的工作", "先把能留下结果的一段做完。", { progress: 2, merit: 2 }),
      choose("按现有台账交接", "剩余精力留给本期其他安排。", { trust: 1 }, 0),
    ]),
    story("rain-road", "water", 0, 2, "水漫过路口", "夜里一阵急雨，原来留作绕行的那条巷也积了水。有人把丈量水深的木尺直接摆到了办公桌上。", [
      choose("先疏通两处最急的点", "今天就做临时处置，保住进度。", { progress: 2, public: 2, budget: -1 }),
      choose("组织联合踏勘", "用掉半天，重新检查排水出口。", { quality: 2, public: 2 }),
      choose("先按原计划办完", "保留这期精力处理其他工作。", { public: -2 }, 0),
    ]),
    story("bridge", "water", 0, 2, "一纸限行建议", "桥面测量和居民通行意见同时送到。老桥一封，要绕十二公里，校车今天还在按老路线跑。", [
      choose("限行并安排绕行接驳", "先把人送得到，也留出安全余量。", { quality: 2, public: 3, budget: -1 }),
      choose("复测后分时放行", "压缩其他工作时间核实承载。", { quality: 2, merit: 2 }, 2),
      choose("临时限重", "快速响应，留待下一轮评估。", { progress: 1, public: -1 }),
    ]),
    story("upper-river", "water", 1, 4, "上游的一封来函", "上游想利用汛前一段空档改造闸站。下游的预案却假设上游工程一切如旧。", [
      choose("把两地预案放在一起核算", "占用本期一项工作，换来一份可执行的调度表。", { quality: 2, trust: 2, merit: 1 }),
      choose("优先安排下游临时储排", "用一笔预算保住本地的节点。", { progress: 2, budget: -1, public: 2 }),
      choose("留待下次联席会", "两地按原安排备汛。", { trust: -1 }, 0),
    ]),
    story("water-meter", "water", 0, 3, "两个口径的水量", "纸面报表上的用水量比泵站记录少了一截。{person} 问，两张表到底拿哪张报。", [
      choose("再对一次原始记录", "延后报表，留下可查的测量依据。", { quality: 2, merit: 1 }),
      choose("把差异一并列出", "按时提交，说明还在核对。", { trust: 2, public: 1 }),
      choose("先报口径较小的一栏", "报表先过，核对留到以后。", { merit: 3, quality: -1 }),
    ]),
    story("payday", "industry", 0, 2, "发薪日刚过", "三位工人带来的合同属于两家分包单位，领工的人却是同一个。窗口快关的时候又来了五个人。", [
      choose("逐人核对考勤和欠付", "留下一份能跟进的清单。", { progress: 1, quality: 2, public: 2 }),
      choose("约齐企业和工人代表", "先确定最急的一批款项。", { progress: 2, trust: 2 }),
      choose("今天收件，下期再补", "留下窗口记录。", { public: -2 }, 0),
    ]),
    story("factory", "industry", 1, 4, "厂区围墙外", "旧厂搬迁公告贴出后，工人问班车和换岗，接手地块的人在问交地日期。双方带着完全不同的清单。", [
      choose("把安置进度和交地挂钩", "增加协调工作，给工人留出过渡期。", { quality: 2, public: 3, trust: -1 }),
      choose("先完成可交付的半块地", "腾出施工窗口，保留另外半块。", { progress: 2, merit: 2, public: 1 }),
      choose("先按交地节点推进", "腾地的进度好看，安置问题留到下一轮。", { progress: 2, merit: 3, public: -3 }),
    ]),
    story("shops", "industry", 0, 3, "盖章的早餐铺", "早餐铺的老板上次跑了四趟。今天他带来一个文件夹，封面写着「第四份、别丢」。", [
      choose("把几个窗口约在一起", "找出可以共用的材料。", { progress: 1, quality: 1, public: 3 }),
      choose("先给明确的受理期限", "把责任人写在回执上。", { trust: 2, public: 1 }),
      choose("按原有顺序办理", "留出时间给手头事项。", { public: -1 }, 0),
    ]),
    story("tender", "industry", 1, 4, "过于整齐的报价", "三份报名材料都用了同一处错别字。承包商很热心，承诺帮你保住节点，还提到一笔私人好处。", [
      choose("留下疑点并复核", "可能慢一轮，材料能够经得起回查。", { progress: -1, quality: 3, trust: 1, integrity: 2 }),
      choose("换人交叉核验", "多调一点人手来核对报价。", { quality: 2, merit: 1, budget: -1 }),
      choose("收下好处，按原方案推进", "现在就能报进度，往来会留在这次事项里。", { progress: 3, merit: 3, quality: -2, illicit: 4 }),
    ]),
    story("bus-schedule", "services", 0, 2, "末班车提前了", "村里希望车能再晚一点，承运人说晚班连油钱都挣不回来。上周有两位老人走了七公里回家。", [
      choose("试行预约接驳", "加一份调度工作，照顾零散需求。", { progress: 1, quality: 1, public: 3 }),
      choose("用额度补贴晚班", "这期马上恢复班次。", { progress: 2, budget: -1, public: 3 }),
      choose("先保留白天班次", "预算留给其他事项，晚班再观察。", { public: -2 }, 0),
    ]),
    story("canteen", "services", 0, 3, "两张助餐名单", "两份名单差了十七个人。{person} 发现，村里把在外地的老人也算进了需求。", [
      choose("按实际就餐重新走访", "一户一户确认，白忙的饭能少做一些。", { quality: 2, public: 2 }),
      choose("先做前两周小范围试行", "拿到餐单和出席的数据再扩展。", { progress: 2, merit: 2 }),
      choose("维持原上报规模", "方案照常推进，供给有错配风险。", { merit: 1, quality: -1 }, 0),
    ]),
    story("clinic", "services", 1, 4, "排队的两家医院", "市医院希望接住重症，县院担心专家都集中到市里。看病的人只问下周能不能约上。", [
      choose("先出转诊和回转的名单", "让双方都有能核对的工作量。", { quality: 2, trust: 2, public: 2 }),
      choose("投一轮巡诊经费", "先解决眼前的排队。", { progress: 3, budget: -2, public: 3 }),
      choose("延后联席会", "让当下两个院区按原有办法运行。", { public: -2 }, 0),
    ]),
    story("class", "services", 0, 2, "学校门前七分钟", "散学后，路口从畅通到堵住只用了七分钟。交警、家长和校方各自拿着一张示意图。", [
      choose("实地量一遍人车流", "调整排队位置，再对外公示。", { quality: 2, public: 3 }),
      choose("先试一天错峰", "尽快验证能不能疏通。", { progress: 2, merit: 1 }),
      choose("下一期再评估", "先完成本期别的事项。", { public: -1 }, 0),
    ]),
    story("survey", "all", 0, 4, "同一个问题，两份回答", "工作群里说事项已经办结，现场的人却说还没见过施工队。{person} 建议再看一次回执。", [
      choose("带着回执当场核对", "把可以落实的步骤重新列出来。", { quality: 2, public: 3, integrity: 1 }),
      choose("请部门补充说明", "留下书面记录，留出时间看别的事项。", { trust: 1, merit: 2 }),
      choose("照着已有记录归档", "这期节省时间。", { public: -2, quality: -1 }, 0),
    ]),
    story("meeting", "all", 0, 4, "开了三次的协调会", "会议纪要每次都以「请相关单位抓紧」收尾。{person} 在散会前问，明早到底哪一个人去现场。", [
      choose("明确每步的责任人", "写明期限，再同步各方。", { progress: 2, trust: 2 }),
      choose("约齐人直接去一次", "把分歧放到现场谈。", { quality: 2, public: 2 }),
      choose("先维持原来分工", "别人也都在赶本期节点。", { trust: -2 }, 0),
    ]),
    story("new-colleague", "all", 0, 2, "新人接到了旧活", "{person} 刚接一摞档案，不知道那条「改过一次」的记录改的是线路还是预算。你能腾出一点时间。", [
      choose("带着逐份对完交接", "培养可靠的搭档，旧项目也少一处漏洞。", { trust: 3, quality: 1 }),
      choose("给一张明确的交接清单", "解释哪几件事情急。", { trust: 2, merit: 2 }),
      choose("先忙手上项目", "之后再找机会交流。", { trust: -1 }, 0),
    ]),
    story("inspect", "all", 0, 4, "检查提前", "原定下期的检查提前了。墙上的进度图是昨天画的，缺的几份工程记录还在外头。", [
      choose("按实际进度汇报", "注明后续动作，把时间留给现场。", { integrity: 2, quality: 1, public: 1 }),
      choose("先把凭证补齐", "搬出档案逐项和项目核对。", { merit: 3, quality: 1 }),
      choose("填上计划完成的数字", "短期顺利交差，实际进度不会跟上。", { merit: 4, quality: -2, integrity: -2 }),
    ]),
    story("favor", "all", 0, 4, "来访的人记得你", "一位办项目的人在下班前等在楼下，说能把工程往前赶，还提到给你留了一份私人谢礼。", [
      choose("拒绝并完整记下来往", "把沟通还原到工作事项上。", { integrity: 3, trust: 1 }),
      choose("请同事共同听取方案", "多占一点时间核对真正能赶的进度。", { quality: 2, progress: 1 }),
      choose("接受好处", "抢到一段进度，日后有人会记得这次往来。", { illicit: 3, progress: 2, merit: 2, quality: -1 }),
    ]),
    story("training", "all", 0, 4, "集中培训调训单", "组织通知下来了，培训日期正占着你原来留给现场的那一格。{person} 提议先把手头事项列清。", [
      choose("安排交接，正常参加", "增加集中培训记录，别的事项需要重新排期。", { training: 180, trust: 1 }),
      choose("参加并带上一个实务案例", "把手里项目的问题拿到课堂上讨论。", { training: 180, quality: 2 }, 2),
      choose("说明本期冲突，另行排课", "把精力留给眼前的节点。", {}, 0),
    ]),
    story("petition", "all", 0, 4, "周五下午的来信", "来信里夹着一叠公交票和一张画得歪歪扭扭的路线。上面画了三个往返办公楼的箭头。", [
      choose("约见并梳理实情", "把群众反映的事项加入这期工作。", { public: 3, quality: 1, trust: 1 }),
      choose("追踪已有办理记录", "查清人在哪一步被退回。", { progress: 1, merit: 2 }),
      choose("先登记到下一期", "让当前事项继续按原计划。", { public: -2 }, 0),
    ]),
    story("budget", "all", 1, 4, "只够一边的经费", "两份申请同时送来，{person} 把账面余额放在你面前。任何一个完整批下来，另一份都要动计划。", [
      choose("集中支持先到期的工作", "结一个节点，另一份等追加。", { progress: 3, budget: -2 }),
      choose("核查后分两段批复", "让双方先启动核心工作。", { progress: 1, quality: 2, public: 2 }),
      choose("留一部分应急周转", "当前进度少一点，后续预算更充裕。", { budget: 2, merit: 1 }),
    ]),
    story("transfer", "all", 0, 4, "合影少了一个人", "走廊刚拍完集体照，{person} 把还没办完的事项交给你，说明下个月就要去别的单位。", [
      choose("一起把旧项目理清", "离开前把责任和材料对齐。", { quality: 2, trust: 3 }),
      choose("顺手补完一个节点", "新接手的人少跑一次。", { progress: 2, merit: 2 }),
      choose("按交接表签收", "先维持各自安排。", { trust: -1 }, 0),
    ]),
    story("bars", "all", 2, 4, "三座城的排名表", "汇总表一列全是数字。排名靠后的地方想要复核，原来这个指标把山区和城市都按同一口径算了。", [
      choose("复核口径后再排", "用两期材料核实结果，对外说明差异。", { quality: 3, trust: 1 }),
      choose("同时发布原值和分组值", "赶上节点，也保留更细的比较。", { merit: 3, quality: 1 }),
      choose("先用原表谈进度", "几家地方部门有意见。", { merit: 2, public: -2 }, 0),
    ]),
    story("trial", "all", 2, 4, "试点只有一个名额", "大城市已经写好申报材料，小县拿出了两页手写记录。这个名额会决定接下来一年从哪套经验起步。", [
      choose("到两处看看能否落地", "少做一期别的工作，换取可核查的取舍。", { quality: 3, public: 2 }),
      choose("先批能快速启动的一处", "先跑出第一轮结果。", { progress: 3, merit: 2, budget: -1 }),
      choose("协调共用一个试点周期", "多磨合几家部门，两个方案都保留一部分。", { progress: 1, trust: 3, quality: 1 }),
    ]),
    story("correction", "all", 2, 4, "由谁承担整改费用", "两地都同意要整改，轮到写承担金额时却没人签字。上一轮开工留下的责任记录还在。", [
      choose("按职责复核并公开节点", "把后续拨款和工程记录衔接。", { quality: 3, public: 2 }),
      choose("先集中投一笔整改经费", "尽快减少居民承受的影响。", { progress: 3, budget: -2, public: 2 }),
      choose("要求带着书面意见再议", "暂时保留额度。", { trust: -1, budget: 1 }, 0),
    ]),
    story("storm-supply", "all", 1, 4, "借调物资的电话", "邻县临时缺一批物资，自己这边也刚进雨季。{person} 把两边的使用记录发给你。", [
      choose("按需求分批调拨", "多做一次跟踪，两边都留余量。", { quality: 2, trust: 2, public: 1 }),
      choose("调拨一批并补库", "尽快出库，本期额度要少一笔。", { trust: 3, budget: -1, merit: 1 }),
      choose("先保留本地储备", "请邻县另作安排。", { trust: -2, public: 1 }, 0),
    ]),
    story("agenda", "all", 4, 4, "同一政策的三地结果", "几地回报的效果差异很大。统一推进能省协调成本，先补薄弱地区则需要重新排专项经费。", [
      choose("保留差异，分地区试行", "再跟一轮落实，形成可比结果。", { quality: 3, trust: 2 }),
      choose("先在执行条件成熟地推广", "先落地一批，再追加薄弱地区准备工作。", { progress: 3, merit: 3 }),
      choose("先处理薄弱地区缺口", "集中出一笔额度，等待下一轮。", { budget: -2, public: 3, quality: 2 }),
    ]),
    story("review-policy", "all", 3, 4, "两种项目评价", "一个地方着重看了投入金额，另一个跟访了实际使用。结果根本排不成一张表，可本期还需要定下一轮方案。", [
      choose("统一追加实地跟访", "用掉人力，把效果放到可比范围。", { quality: 3, public: 2 }),
      choose("先发布分项结果", "保留两种看法，让地方自己对照。", { merit: 3, trust: 1 }),
      choose("延后一季发布", "给原方案留一次补查机会。", { trust: -1, budget: 1 }, 0),
    ]),
    story("window", "all", 0, 2, "三个窗口，两个答复", "旧规定的复印件还贴在窗边。来办事的人早上被告诉可以办，到了下午又被告知要回去补材料。", [
      choose("对照清单逐项确认", "给窗口和居民同一份能照着办的答复。", { quality: 2, public: 3 }),
      choose("先把已受理的单子办完", "压掉一批积压，下期再统一口径。", { progress: 2, public: 1 }),
      choose("登记后等业务科回复", "按原来的顺序办理。", { public: -1 }, 0),
    ]),
    story("joint-list", "all", 0, 3, "名单上没有签名", "下期就要公开的名单还缺两处签名。{person} 见过这批材料，说有一户的情况跟表里写的可能不同。", [
      choose("上门核实那一户", "推迟一份材料的报送。", { quality: 2, public: 2, integrity: 1 }),
      choose("先公布已核实的部分", "留出补正时间，保住一部分进度。", { progress: 2, trust: 1 }),
      choose("注明缺项并按期报送", "按现在的进度交表。", { merit: 2 }, 0),
    ]),
    story("winding-road", "services", 0, 2, "去镇上的半天", "一条机耕路突然施工。绕行路线需要经过一段长坡，早上去镇上的人已经在村口等了快一小时。", [
      choose("临时增加一班车", "用一笔额度接送往返的人。", { progress: 2, public: 3, budget: -1 }),
      choose("跟驾驶员确认绕行条件", "下期按实测时间排班。", { quality: 2, public: 1 }),
      choose("先发出绕行通知", "大家能按自己的时间调整。", { merit: 1, public: -1 }, 0),
    ]),
    story("wait-rain", "water", 0, 2, "雨还没下", "预报说周末雨势有变。工地希望多留两天开挖，社区想今天把围挡和临时排水都恢复好。", [
      choose("留出应急工作时间", "暂停一处开挖，先把备用排水布好。", { quality: 3, progress: -1, public: 2 }),
      choose("集中队伍抢完本段", "抢进度同时追加现场看守。", { progress: 3, budget: -1 }),
      choose("等下一次预报", "施工队照常干活。", { quality: -1, merit: 1 }, 0),
    ]),
    story("paper-dry", "water", 0, 3, "图里没有那条沟", "新老两版图纸在一座桥下面对不上。沿河住了几十年的居民说，那条沟是下过大雨才看得到的。", [
      choose("看图也去看现场", "查过落差再改图。", { quality: 3, public: 1 }, 2),
      choose("约两方共同确认", "先校核有争议的一段。", { quality: 2, trust: 1 }),
      choose("按新图完成下个节点", "工期容易保住，记录仍有疑点。", { progress: 2, quality: -1 }),
    ]),
    story("small-loans", "industry", 0, 3, "谁够得上补助", "一份补助名单里，多数是填表熟练的大企业。几家小作坊拿着手写清单排在门外。", [
      choose("组织一次公开讲解", "让符合条件的小店也能完整申报。", { quality: 2, public: 3 }),
      choose("把首批成熟申请先办", "让钱尽快到符合条件的单位。", { progress: 2, merit: 2 }),
      choose("把本期交回原窗口", "给手里的工作留时间。", { public: -1 }, 0),
    ]),
    story("occupancy", "industry", 1, 4, "亮灯的厂房", "调研车在主路转了一圈，园区里都亮着灯。绕到背面时，你看见好几道门还贴着上季度的封条。", [
      choose("看入驻数据和用电记录", "花一轮时间核实实际经营。", { quality: 3, integrity: 2 }),
      choose("区分筹备与正式投产", "用两种标注把情况如实交出去。", { merit: 2, quality: 1 }),
      choose("维持原来的总结", "汇报照常上交，细节等下期补。", { merit: 3, quality: -1 }, 0),
    ]),
    story("staffing", "all", 1, 4, "大家都在一个专班", "{person} 把各组名单并排贴在墙上。同一个人出现了四次，最需要到现场的那组只剩他的名字。", [
      choose("拆开重复人手，给出先后", "部分项目慢一点，责任落实到人。", { quality: 2, trust: 3 }),
      choose("优先完成最急的部分", "集中处理一轮，再换下一组。", { progress: 3, merit: 1 }),
      choose("各组先自行协调", "这期继续使用原来的分工。", { trust: -2 }, 0),
    ]),
    story("pension-line", "services", 0, 3, "在表格里找不到的名字", "来问补发的人把退休证放在窗口，系统说没有这条记录。负责转档的人已经退休。", [
      choose("查清原始档案和转入批次", "一起排查可能有相同问题的记录。", { progress: 1, quality: 2, public: 2 }),
      choose("先按已核实的个案协调", "这户能先收到答复。", { public: 3, trust: 1 }),
      choose("给一张查询回执", "等待档案部门反馈。", { merit: 1 }, 0),
    ]),
    story("showcase", "all", 1, 4, "示范点的合影", "镜头到了，热闹的示范点就在主路旁。{person} 提醒，另一个同批项目到现在还没开门。", [
      choose("把第二处一起放进汇报", "展示成绩，也交代它为什么慢。", { quality: 2, integrity: 2, public: 1 }),
      choose("先去解决第二处的问题", "少一段接待，多跑一处现场。", { progress: 3, public: 2 }),
      choose("按接待路线走", "示范点能按时间完成展示。", { merit: 3 }, 0),
    ]),
    story("end-year", "all", 0, 4, "材料还有一页空白", "年度汇报只剩一页。这一年推进了很多事项，最难办的那件偏偏还缺最后一道验收。", [
      choose("把未完成事项和去向都写进去", "接手的人也知道该做什么。", { merit: 2, integrity: 2, quality: 1 }),
      choose("再核一次能不能按期验收", "多花一点精力补齐现场记录。", { progress: 2, quality: 2 }),
      choose("先交已经办完的部分", "留下空位等下期补。", { merit: 1 }, 0),
    ]),
    story("neighbor", "all", 2, 4, "边界另一侧", "一条工程线跨了行政边界。拨款各归各，工地却必须在同一天封路，两边的公告错开了整整一周。", [
      choose("约定两地共同停工的时间", "调整一边的原计划，统一告知。", { quality: 2, trust: 3 }),
      choose("先完成各自能施工的部分", "按经费节点推进，交界段暂缓。", { progress: 3, merit: 1 }),
      choose("等联合方案成稿", "本期保留资金。", { budget: 1, public: -1 }, 0),
    ]),
    story("source-data", "all", 2, 4, "分母为什么变了", "有一列分母从上年换成了今年的数。两地的差距突然消失，编表的人说只是资料上传晚了。", [
      choose("按同一时期重新计算", "查清差别后再定政策。", { quality: 3, integrity: 2 }),
      choose("把两套数据同时交代", "本期先发布已有情况。", { merit: 2, quality: 1 }),
      choose("先用当前汇总表", "下次数据更新再核实。", { merit: 1, quality: -1 }, 0),
    ]),
    story("emergency-lanes", "all", 1, 4, "物资送到一半", "调拨表显示物资都出了仓，路却封在最后一段。接收点已经有居民排队。", [
      choose("改走已核实的备用路线", "加一点运输额度，尽快把人和物资接上。", { progress: 3, public: 3, budget: -2 }),
      choose("核实需求，分批发放", "多一次点验，先保住急用的一批。", { progress: 1, quality: 2, public: 2 }),
      choose("等原路恢复", "先通报预计时间。", { trust: -1 }, 0),
    ]),
    story("adoption", "all", 3, 4, "试点准备扩大", "试点县报来的材料写着「可复制」。另一个地方把预算表翻到背面，指出试点差了一笔基础投入。", [
      choose("把实施条件也写进方案", "允许地方先补上缺口，再分批推进。", { quality: 3, trust: 1 }),
      choose("先扩大到条件接近的地区", "先形成一组可比较的结果。", { progress: 3, merit: 2, quality: 1 }),
      choose("先把推广节点交上去", "进度很快，后续还要补做评估。", { progress: 2, merit: 3, quality: -1 }),
    ]),
    story("interview", "all", 0, 4, "一封匿名来信", "来信把几件事混在一起，有些连时间都写反了。一条关于在办项目的描述，{person} 却能找到对应的记录。", [
      choose("就能核实的事实回复", "理清已有事实和待调查的内容。", { integrity: 3, quality: 1 }),
      choose("调取已有的备案记录", "把时间和责任核对清楚。", { merit: 2, quality: 1 }),
      choose("先看临近截止的事项", "来信转经相应渠道办理。", { trust: -1 }, 0),
    ]),
    story("allocation", "all", 3, 4, "一份经费，两种算法", "按人头分，人口多的地方能先启动。按缺口分，小地方更有机会把急事办了。两边这周都在等通知。", [
      choose("确定基础额再按缺口调剂", "保留一轮公开复核。", { quality: 3, public: 3, budget: -1 }),
      choose("先保最紧急的几个地方", "集中额度，缩短一部分地方的等待。", { progress: 3, public: 2, budget: -2 }),
      choose("先沿用上一轮口径", "本期可以按时报送。", { merit: 2, public: -2 }),
    ]),
    story("return-proposal", "all", 4, 4, "讨论稿退回来了", "几个地区对同一条要求提出了不同意见。{person} 手里的批注很多，却集中在实施责任的同一句话。", [
      choose("把意见写进职责和时限", "重新出一份执行责任表。", { quality: 3, trust: 2, merit: 1 }),
      choose("先用附件解决争议", "先跑出本期能执行的部分。", { progress: 3, merit: 2 }),
      choose("保留争议，再作一轮调研", "多留出核实时间。", { integrity: 2, quality: 2 }),
    ]),
  ];

  return { province, regions, channels, openings, roles, people, projects, stories, job, choose };
})();
