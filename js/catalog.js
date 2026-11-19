const arcadeCategories = {
  relax: "解压",
  puzzle: "解谜",
  reaction: "反应",
  simulation: "经营",
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
    description: "按模拟考试成绩入职。安排半年、一年或两年的工作，办成重点项目，再带着成果争取任用。走捷径会把风险留在履历里。",
    saveKey: "progress-v3",
    priorSaveKey: "progress-v2",
    entry: "games/progress/index.html",
  },
];
