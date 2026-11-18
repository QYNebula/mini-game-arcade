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
    summary: "考进来，把每个月用在想做的事上",
    description: "完成模拟考试，按成绩分配单位。每半年安排工作、协作和休养，在符合资格时争取任用。做过的选择会留在履历里。",
    saveKey: "progress-v2",
    entry: "games/progress/index.html",
  },
];
