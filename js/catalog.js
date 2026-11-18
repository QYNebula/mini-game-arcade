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
    summary: "从第一天报到，走完一段干部生涯",
    description: "选择学历和招录岗位，安排手头的工作，经历年度考核、交流和换届。多年前的项目会再找上门，每一段履历都有不同的去向。",
    entry: "games/progress/index.html",
  },
];
