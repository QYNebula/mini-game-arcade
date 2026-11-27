const arcadeCategories = {
  relax: "解压",
  puzzle: "解谜",
  reaction: "反应",
  simulation: "经营",
  board: "棋牌",
};

// The ID also identifies each game's cover and save.
const arcadeGames = [
  {
    id: "metro",
    category: "simulation",
    title: "城市地铁",
    summary: "拖线调车，疏通高峰客流",
    description: "画出往返线或环线，按站台长度配置列车，给满载的线路增车或分流。按自己的节奏开放新区，一直经营这座城市。",
    entry: "games/metro/index.html",
  },
  {
    id: "progress",
    category: "simulation",
    title: "进步模拟器",
    summary: "考进来，安排工作，争取任用机会",
    description: "按模拟考试成绩入职，安排工作，处理任期里遇到的大事，再带着成果争取任用。走捷径会把风险留在履历里。",
    saveKey: "progress-v4",
    priorSaveKeys: ["progress-v3", "progress-v2"],
    entry: "games/progress/index.html",
  },
  {
    id: "gomoku",
    category: "board",
    title: "五子棋",
    summary: "挑战电脑，或凭房间码与朋友对弈",
    entry: "games/gomoku/index.html",
    directEntry: true,
  },
  {
    id: "renmin",
    category: "board",
    title: "人民的名义",
    summary: "九席身份桌游，白天交换线索，夜里各自行动",
    cover: "games/renmin/cover.webp",
    entry: "https://renmin.hmarcade.dpdns.org/",
    directEntry: true,
  },
];
