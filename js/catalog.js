const arcadeCategories = {
  relax: "解压",
  puzzle: "解谜",
  reaction: "反应",
};

// The ID also identifies this game's cover and save. Add an entry when the game is playable.
const arcadeGames = [
  {
    id: "pressure-wash",
    title: "高压水枪冲洗",
    category: "relax",
    summary: "把泥污一片片冲掉",
    description: "按住拖动喷嘴，清洗被泥巴盖住的球鞋、玩具和自行车。对准边角，把原来的颜色一点点洗出来。",
  },
  {
    id: "sand-dig",
    title: "挖沙寻宝",
    category: "relax",
    summary: "挖出沙子下面的东西",
    description: "滑动手指刷开沙子，从露出来的一角猜埋了什么。沿着轮廓清理，把贝壳和化石完整挖出来。",
  },
  {
    id: "screw-boards",
    title: "拧螺丝拆板",
    category: "puzzle",
    summary: "找对顺序，让板子掉下来",
    description: "把螺丝移动到空孔里，板子失去最后一个支点就会掉下。剩下的空孔有限，得想好每一步。",
  },
  {
    id: "suitcase",
    title: "行李箱收纳",
    category: "puzzle",
    summary: "把零碎物品装进一只箱子",
    description: "拖动和旋转鞋子、衣物、水壶，填满箱子里的空隙。所有东西都放进去，就能合上箱盖。",
  },
  {
    id: "sand-sort",
    title: "彩沙分瓶",
    category: "puzzle",
    summary: "让每个瓶子只剩一种颜色",
    description: "把最上层的彩沙倒进空瓶，或者顶层颜色相同的瓶子。用有限的空间腾挪，把每种颜色归到一起。",
  },
  {
    id: "pull-pins",
    title: "拔针引彩珠",
    category: "puzzle",
    summary: "拔开挡针，引珠子入杯",
    description: "想好顺序再拔掉挡针，让彩珠沿着槽滚进对应颜色的杯子。拉错一根，珠子就可能混在一起。",
  },
  {
    id: "parking",
    title: "挪车出库",
    category: "puzzle",
    summary: "在满车库里挪出一条路",
    description: "每辆车都只能沿自己的方向前后滑动。挪开挡道的车，让被堵在里面的小车一路开到出口。",
  },
  {
    id: "conveyor",
    title: "流水线分拣",
    category: "reaction",
    summary: "趁水果滑过去前把它分好",
    description: "把传送带上的水果或玩具拖进对应的筐里。连续分对时传送带会加速，留给你判断的时间也会缩短。",
  },
  {
    id: "gates",
    title: "倍增门跑酷",
    category: "reaction",
    summary: "穿过倍率门，把小球攒成一队",
    description: "左右滑动，引导小球队伍穿过加法门和倍增门。边跑边挑路线，攒够小球推开终点的挡板。",
  },
  {
    id: "water-flowers",
    title: "挖沟浇花",
    category: "puzzle",
    summary: "引水绕过石头，看花开起来",
    description: "在沙地上划出水沟，让水流绕过石头，到达不同的花盆。水量有限，得在合适的位置分流。",
  },
  {
    id: "pancake",
    title: "街边摊煎饼",
    category: "reaction",
    summary: "摊圆、翻面，再折起来装袋",
    description: "用刮板把面糊摊圆，看到边缘变色就翻面。掌握好厚度和火候，把煎饼折起来交给顾客。",
  },
  {
    id: "paper-fold",
    title: "折纸拼图",
    category: "relax",
    summary: "沿着折痕拼出图案",
    description: "沿折痕翻动彩纸，把不同位置的色块和线条叠起来，慢慢拼出清晰的小动物或图案。",
  },
];
