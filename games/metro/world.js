const MetroWorld = (() => {
  const size = 400;
  const types = {
    home: { label: "住宅站", platform: 4, weight: 2.7, color: "#74845e" },
    work: { label: "办公站", platform: 6, weight: 3.5, color: "#406d80" },
    shops: { label: "商业站", platform: 6, weight: 4.4, color: "#ac724b" },
    rail: { label: "铁路枢纽", platform: 8, weight: 7.8, color: "#3f6474" },
    airport: { label: "机场枢纽", platform: 8, weight: 8.3, color: "#526b85" },
    bus: { label: "客运枢纽", platform: 6, weight: 4.5, color: "#82694a" },
  };
  const areas = {
    home: { label: "住宅区", fill: "#e9eddb", edge: "#c6cfb3", min: 3, max: 5, gap: 89, demand: 10, suffix: "新城" },
    center: { label: "商业中心", fill: "#f4e7d5", edge: "#dfc7a9", min: 5, max: 8, gap: 58, demand: 27, suffix: "中心区" },
    industry: { label: "开发区", fill: "#e4ecdf", edge: "#bdcfbe", min: 2, max: 3, gap: 124, demand: 10, suffix: "开发区" },
    outer: { label: "郊区", fill: "#edf0de", edge: "#ced5b5", min: 1, max: 2, gap: 151, demand: 4.8, suffix: "镇" },
    hub: { label: "交通枢纽区", fill: "#e4e9ee", edge: "#bccbd7", min: 1, max: 2, gap: 143, demand: 21, suffix: "枢纽区" },
  };
  const townNames = ["青岚市", "临溪市", "嘉宁市", "云江市", "鹤洲市", "安澜市"];
  const areaNames = ["河东", "青桥", "南溪", "临港", "银杏", "望江", "金石", "东谷", "北塘", "晴川", "雨花", "云浦", "白沙", "柳湾", "安和", "望春", "松桥", "新湾", "清溪", "晴港"];
  const stationNames = {
    home: ["柳岸新村", "槐安路", "云栖花园", "杏花里", "翠湖小区", "曙光新村", "荷花街", "长青路"],
    work: ["科创园", "创业大道", "金融街", "软件园", "智造园", "博览大道", "文教园", "总部基地"],
    shops: ["人民广场", "红桥广场", "万和商场", "钟楼街", "文化中心", "环城广场", "南门街", "市民中心"],
  };

  function random(state) {
    state.random = (state.random + 0x6d2b79f5) >>> 0;
    let value = state.random;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function pick(state, options, weight) {
    let total = 0;
    for (const option of options) total += weight(option);
    let roll = random(state) * total;
    for (const option of options) {
      roll -= weight(option);
      if (roll < 0) return option;
    }
    return options.at(-1);
  }

  function terrain(seed, x, y, salt = 0) {
    let hash = (seed ^ Math.imul(x, 1597334677) ^ Math.imul(y, 3812015801) ^ salt) >>> 0;
    hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
    hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
    return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
  }

  function riverX(y) {
    return 432 + Math.sin(y / 260) * 61 + Math.sin(y / 95) * 22;
  }

  function boundary(seed, area) {
    const corner = (gx, gy) => [
      gx * size + (terrain(seed, gx, gy, 21) - 0.5) * 61,
      gy * size + (terrain(seed, gx, gy, 47) - 0.5) * 61,
    ];
    const points = [
      corner(area.gx, area.gy), corner(area.gx + 1, area.gy),
      corner(area.gx + 1, area.gy + 1), corner(area.gx, area.gy + 1),
    ];
    const result = [];
    for (let index = 0; index < points.length; index++) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const x = Math.round((start[0] + end[0]) / 2);
      const y = Math.round((start[1] + end[1]) / 2);
      result.push(start, [x + (terrain(seed, x, y, 84) - 0.5) * 42, y + (terrain(seed, x, y, 117) - 0.5) * 42]);
    }
    return result;
  }

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  // A single geometry describes a track in both directions.
  function track(a, b) {
    if (a.id > b.id) return track(b, a).reverse();
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const excess = (Math.abs(dx) - Math.abs(dy)) / 2;
    if (Math.abs(excess) < 6 || Math.abs(dx) < 6 || Math.abs(dy) < 6) return [a, b];
    const offsetX = excess > 0 ? Math.sign(dx) * excess : 0;
    const offsetY = excess < 0 ? Math.sign(dy) * -excess : 0;
    return [a, { x: a.x + offsetX, y: a.y + offsetY }, { x: b.x - offsetX, y: b.y - offsetY }, b];
  }

  function travelTime(a, b) {
    const diagonal = Math.min(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const straight = Math.abs(Math.abs(a.x - b.x) - Math.abs(a.y - b.y));
    return Math.max(1.55, (diagonal * Math.SQRT2 + straight) / 72);
  }

  function timeLabel(time) {
    const minute = Math.floor(time) % 1440;
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  }

  function dayLabel(time) {
    return `第 ${Math.floor(time / 1440) + 1} 天`;
  }

  function period(time) {
    const minute = time % 1440;
    if (minute >= 420 && minute < 570) return "早高峰";
    if (minute >= 990 && minute < 1170) return "晚高峰";
    if (minute < 360 || minute >= 1320) return "夜间";
    return "平峰";
  }

  function activity(station, time) {
    const phase = period(time);
    if (phase === "夜间") return station.type === "airport" ? 0.36 : 0.17;
    switch (station.type) {
      case "home": return phase === "早高峰" ? 2.05 : phase === "晚高峰" ? 1.05 : 0.86;
      case "work": return phase === "晚高峰" ? 2.12 : phase === "早高峰" ? 0.61 : 0.91;
      case "shops": return time % 1440 > 660 ? 1.23 : 0.72;
      case "rail": return (time + station.id * 7) % 48 < 10 ? 1.95 : 0.85;
      case "airport": return (time + station.id * 13) % 92 < 19 ? 2.13 : 0.85;
      default: return phase.endsWith("高峰") ? 1.54 : 0.9;
    }
  }

  function uniqueName(base, used, alternatives) {
    if (!used.has(base)) return base;
    for (const name of alternatives) if (!used.has(name)) return name;
    let index = 2;
    while (used.has(`${base}·${index}`)) index++;
    return `${base}·${index}`;
  }

  function activate(state, area, spot) {
    const used = new Set(state.stations.map((station) => station.name));
    const stem = state.name.replace(/市$/, "") || state.name;
    const district = area.name.replace(/(开发区|中心区|枢纽区|新城|镇)$/, "");
    const direction = Math.abs(spot.x) > Math.abs(spot.y - 200)
      ? (spot.x < 0 ? "西" : "东") : (spot.y < 200 ? "北" : "南");
    const roll = random(state);
    let name;
    if (stationNames[spot.type]) {
      const names = stationNames[spot.type];
      const start = Math.floor(roll * names.length);
      const suffix = spot.type === "home" ? "花园" : spot.type === "work" ? "园区" : "广场";
      const local = area.opened < 0 ? names[start] : district + suffix;
      name = uniqueName(local, used, [...names.slice(start), ...names.slice(0, start), district + "路"]);
    } else {
      const suffix = { rail: "站", airport: "机场", bus: "客运站" }[spot.type];
      const primary = area.opened < 0 ? stem + suffix : stem + direction + suffix;
      name = uniqueName(primary, used, [stem + direction + suffix, stem + district + suffix]);
    }
    const station = {
      id: state.nextStation++, area: area.id, x: spot.x, y: spot.y, type: spot.type, name,
      factor: 0.84 + random(state) * 0.32, queue: [], waiting: 0, platforms: [],
      missed: 0, lost: 0,
    };
    state.stations.push(station);
    area.built++;
    return station;
  }

  function proposal(state) {
    const occupied = new Set(state.areas.map((area) => area.id));
    const edges = new Map();
    for (const area of state.areas) {
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const gx = area.gx + dx;
        const gy = area.gy + dy;
        const id = gx + "," + gy;
        if (occupied.has(id)) continue;
        if (!edges.has(id)) edges.set(id, { id, gx, gy, neighbors: 0 });
        edges.get(id).neighbors++;
      }
    }
    const last = state.areas.at(-1);
    const edge = pick(state, [...edges.values()], (item) => {
      const distance = Math.abs(item.gx - last.gx) + Math.abs(item.gy - last.gy);
      return 1 + item.neighbors * 0.45 + (distance === 1 ? 2.1 : 0);
    });
    const radius = Math.abs(edge.gx) + Math.abs(edge.gy);
    const kind = state.areas.length === 2 ? "industry" : pick(state, [
      ["home", 3.4], ["center", radius < 4 ? 2.4 : 1.6], ["industry", 2.1],
      ["outer", radius < 2 ? 0.4 : 2.8], ["hub", radius > 1 ? 1.25 : 0.45],
    ], (entry) => entry[1])[0];
    const definition = areas[kind];
    const used = new Set(state.areas.map((area) => area.name));
    const names = areaNames.map((name) => name + definition.suffix);
    const name = uniqueName(pick(state, names, () => 1), used, names);
    const area = { ...edge, kind, name, built: 0, plan: [], opened: null };
    const target = definition.min + Math.floor(random(state) * (definition.max - definition.min + 1));
    const nearby = state.areas.filter((item) => Math.abs(item.gx - edge.gx) <= 1 && Math.abs(item.gy - edge.gy) <= 1);
    const otherSpots = nearby.flatMap((item) => item.plan);
    let delay = 32;
    for (let index = 0; index < target; index++) {
      let type;
      if (kind === "hub" && index === 0) {
        type = pick(state, ["rail", "airport", "bus"], (item) => item === "airport" && radius < 3 ? 0.15 : 1);
      } else {
        const choices = {
          home: ["home", "home", "home", "shops", "work"],
          center: ["shops", "work", "shops", "work", "bus", "home"],
          industry: ["work", "work", "work", "bus", "home"],
          outer: ["home", "home", "bus"],
          hub: ["bus", "shops", "work"],
        };
        type = index === 0 ? choices[kind][0] : pick(state, choices[kind], () => 1);
      }
      for (let attempt = 0; attempt < 120; attempt++) {
        const point = { x: edge.gx * size + 58 + random(state) * 284, y: edge.gy * size + 58 + random(state) * 284 };
        if (Math.abs(point.x - riverX(point.y)) < 40) continue;
        if (area.plan.some((spot) => distance(point, spot) < definition.gap)) continue;
        if (otherSpots.some((spot) => distance(point, spot) < 74)) continue;
        area.plan.push({ ...point, type, delay });
        delay += 47 + 20 * index + Math.floor(random(state) * 21);
        break;
      }
    }
    return area;
  }

  function createCity(name, seed) {
    const state = {
      name: name.trim().slice(0, 16) || townNames[seed % townNames.length],
      seed, random: seed, time: 390, speed: 0, labels: true, camera: null,
      nextStation: 1, nextLine: 1, nextTrain: 1, nextDemand: 390, nextProposal: 390,
      areas: [], stations: [], lines: [], trains: [], tracks: {},
      stats: { delivered: 0, nearby: 0, lost: 0, boarded: 0, wait: 0 },
    };
    const beginnings = [
      {
        id: "-1,0", gx: -1, gy: 0, kind: "home", name: "柳岸片区", opened: -1360, built: 0,
        plan: [{ x: -293, y: 99, type: "home" }, { x: -89, y: 203, type: "home" }, { x: -241, y: 314, type: "home" }],
      },
      {
        id: "0,0", gx: 0, gy: 0, kind: "center", name: "中心城区", opened: -1360, built: 0,
        plan: [{ x: 75, y: 98, type: "work" }, { x: 283, y: 155, type: "rail" }, { x: 157, y: 297, type: "shops" }],
      },
    ];
    state.areas.push(...beginnings);
    for (const area of beginnings) {
      for (const spot of area.plan) {
        spot.x += (random(state) - 0.5) * 45;
        spot.y += (random(state) - 0.5) * 48;
        activate(state, area, spot);
      }
    }
    state.proposal = proposal(state);
    return state;
  }

  function openArea(state) {
    if (!state.proposal) return null;
    const area = state.proposal;
    area.opened = state.time;
    state.areas.push(area);
    state.proposal = null;
    state.nextProposal = state.time + 185 + Math.min(110, state.areas.length * 4);
    return area;
  }

  function advance(state) {
    const added = [];
    for (const area of state.areas) {
      while (area.built < area.plan.length && area.opened + area.plan[area.built].delay <= state.time) {
        added.push(activate(state, area, area.plan[area.built]));
      }
    }
    if (!state.proposal && state.time >= state.nextProposal) state.proposal = proposal(state);
    return added;
  }

  function demandRates(state) {
    const weights = new Map();
    for (const station of state.stations) {
      weights.set(station.area, (weights.get(station.area) || 0) + types[station.type].weight * station.factor);
    }
    const budgets = new Map();
    for (const area of state.areas) {
      const maturity = 0.35 + 0.65 * (1 - Math.exp(-(state.time - area.opened) / 510));
      budgets.set(area.id, areas[area.kind].demand * maturity / (weights.get(area.id) || 1));
    }
    return new Map(state.stations.map((station) => [
      station.id, budgets.get(station.area) * types[station.type].weight * station.factor * activity(station, state.time),
    ]));
  }

  function destination(state, origin, served) {
    const candidates = served.filter((station) => station.id !== origin.id);
    if (!candidates.length) return 0;
    const phase = period(state.time);
    return pick(state, candidates, (station) => {
      let appeal = types[station.type].weight;
      if (phase === "早高峰" && origin.type === "home" && station.type === "work") appeal *= 3.4;
      if (phase === "晚高峰" && origin.type !== "home" && station.type === "home") appeal *= 3.6;
      if (origin.type === "home" && state.time % 1440 >= 660 && station.type === "shops") appeal *= 1.65;
      return appeal / Math.pow(1 + distance(origin, station) / 440, 1.38);
    }).id;
  }

  return { size, types, areas, townNames, random, pick, terrain, riverX, boundary, track, distance, travelTime,
    timeLabel, dayLabel, period, createCity, openArea, advance, demandRates, destination };
})();
