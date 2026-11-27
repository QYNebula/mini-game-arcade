export const factions = { audit: "纪检方", corrupt: "腐败方", middle: "中间人" };

export const roles = {
  director: { name: "反贪局长", character: "侯亮平", voice: "直接、稳，先说结论再给依据", faction: "audit", mark: "局", skill: "突袭", key: "raid", target: true,
    detail: "白天选定一名非纪检目标，当晚入账后优先拘捕。无需证据。误抓没有【违法】的人后，纪检两个白天只可查情报。整局一次。" },
  investigator: { name: "侦查处长", character: "陆亦可", voice: "细致务实，偏好具体的证据和时间", faction: "audit", mark: "侦", skill: "黑客", key: "listen", target: true,
    detail: "白天选择监听目标，可以选择纪检成员。该人当晚违法时，你会收到行为详情，以及分别指向发起人和涉及玩家的证据。同一席每晚最多一张。整局一次。" },
  secretary: { name: "省委书记", character: "沙瑞金", voice: "沉稳，遇到分歧先问最重要的一点", faction: "audit", mark: "书", skill: "破晓", key: "dawn",
    detail: "白天发动。次日的拘捕跳过指示、群众围堵、误抓限制、保护伞和营救。证据门槛照算。整局一次。" },
  political: { name: "政法委书记", character: "高育良", voice: "克制，一句话里把判断和事实说清楚", faction: "corrupt", mark: "政", cash: 100, skill: "指示", key: "order", passive: "高官",
    detail: "拘捕你的执行人本人须持有两张针对你的有效证据。夜间前置窗口可发动一次指示，封锁次日纪检行动，算作你当晚的违法行为。" },
  chair: { name: "集团董事", character: "高小琴", voice: "圆融，会追问具体问题，少下结论", faction: "corrupt", mark: "董", cash: 500, skill: "人脉", key: "favor", passive: "回扣",
    detail: "当晚有腐败角色实际支付栽赃或除掉费用，次晚你仍在场时领 100 万回扣，每晚最多一笔。整局一次人脉，免除自己当晚的常规行动费用。" },
  police: { name: "公安厅长", character: "祁同伟", voice: "谨慎而果断，措辞简洁", faction: "corrupt", mark: "警", cash: 100, skill: "营救", passive: "边境",
    detail: "你出逃时无视跟踪造成的口岸封锁。一次普通拘捕中，你可以亮牌营救，取消这次拘捕并获得【违法】。" },
  judge: { name: "法院院长", character: "陈清泉", voice: "先听后答，常要求说清条件", faction: "middle", mark: "法", skill: "保护伞",
    detail: "夜里安置一次保护伞。纪检目标免疫一次栽赃或除掉，你随纪检结算。给腐败方可挡普通拘捕，你随之转边。放给中间人时效果落空。" },
  worker: { name: "职工代表", character: "郑西坡", voice: "朴实直白，关心每个决定的后果", faction: "middle", mark: "工", skill: "煽动者",
    detail: "夜里在群众围堵和群众调查中选一次。围堵次日封锁拘捕与跟踪并使你转边。调查取得随机反派的证据。实际移交后随纪检结算。" },
  executive: { name: "国企总裁", character: "刘新建", voice: "谨慎试探，追问对方能确认的部分", faction: "middle", mark: "企", skill: "告密者",
    detail: "开局持有一张针对随机反派的证据，对方知道这张牌在你手中。第二晚起可移交给纪检并随纪检结算，或销毁并转边。" },
};

export const dayActions = {
  intel: { label: "情报", time: "过去", detail: "查目标上一夜结束时是否持有【违法】，结果发给在场纪检。" },
  arrest: { label: "拘捕", time: "现在", detail: "拘捕一名非纪检玩家，结算时核验执行人本人持有的证据。" },
  follow: { label: "跟踪", time: "将来", detail: "封锁当晚口岸，夜末向指定成员发放取证结果。" },
};

export const nightActions = {
  frame: { label: "栽赃", cost: 300, target: true },
  remove: { label: "除掉", cost: 500, target: true },
  escape: { label: "出逃", cost: 300 },
  hold: { label: "跳过", cost: 0 },
};

export const skillActions = {
  order: { label: "指示" },
  favor: { label: "人脉" },
  umbrella: { label: "安置保护伞", target: true },
  blockade: { label: "群众围堵" },
  survey: { label: "群众调查" },
  transfer: { label: "移交证据" },
  destroy: { label: "销毁证据" },
  hold: { label: "跳过" },
};

export const playerAlias = (id) => "玩家" + id;
export const botNames = Array.from({ length: 9 }, (_, index) => playerAlias(index + 1));
export const statusLabels = { active: "在场", arrested: "被拘捕", dead: "身亡", escaped: "出逃" };
export const goal = 1000;
export const timing = { opening: 120_000, discussion: 300_000, extension: 60_000, prelude: 30_000, night: 90_000, rescue: 8_200 };

export function auditTargetAllowed(kind, seat) {
  if (seat?.status !== "active") return false;
  return !["arrest", "raid", "follow"].includes(kind) || roles[seat.role]?.faction !== "audit";
}
