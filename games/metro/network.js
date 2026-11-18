const METRO_FARE = 4;
const METRO_CAR_KM_COST = 5;
const METRO_NEW_CAR_COST = 300;

const MetroNetwork = (() => {
  const keys = ["main", "branch"];

  function name(line, service = "main") {
    const title = line.name || line.id + " 号线";
    if (service === "main") return title;
    return line.name ? title + "支线" : line.id + " 号支线";
  }

  function route(line, service) {
    if (service === "main") {
      return { id: "main", stops: line.stops, loop: line.loop, fleet: line.fleet.main };
    }
    if (!line.branch) return null;
    const { fork, tail } = line.branch;
    return {
      id: "branch", stops: [...line.stops.slice(0, line.stops.indexOf(fork) + 1), ...tail],
      loop: false, fleet: line.fleet.branch,
    };
  }

  function routes(line) {
    return keys.map((key) => route(line, key)).filter(Boolean);
  }

  function segments(route) {
    const result = [];
    for (let index = 1; index < route.stops.length; index++) {
      result.push([route.stops[index - 1], route.stops[index]]);
    }
    if (route.loop) result.push([route.stops.at(-1), route.stops[0]]);
    return result;
  }

  function pairs(line) {
    const result = new Map();
    for (const service of routes(line)) {
      for (const [a, b] of segments(service)) {
        const key = Math.min(a, b) + ":" + Math.max(a, b);
        result.set(key, [a, b]);
      }
    }
    return result;
  }

  function stops(line) {
    const ids = new Set(line.stops);
    for (const id of line.branch?.tail || []) ids.add(id);
    return ids;
  }

  function fleetTotal(fleet, cars = false) {
    return fleet.reduce((sum, group) => sum + group.count * (cars ? group.cars : 1), 0);
  }

  function normalize(fleet) {
    if (!Array.isArray(fleet)) return null;
    const counts = new Map();
    for (const group of fleet) {
      if (!group || !Number.isSafeInteger(group.cars) || group.cars < 1 ||
          !Number.isSafeInteger(group.count) || group.count < 0) return null;
      if (group.count) counts.set(group.cars, (counts.get(group.cars) || 0) + group.count);
    }
    return [...counts].sort((a, b) => a[0] - b[0]).map(([cars, count]) => ({ cars, count }));
  }

  function newLedger(time) {
    return { income: 0, running: 0, building: 0, today: { day: Math.floor(time / 1440), income: 0, running: 0, building: 0 } };
  }

  function currentDay(state) {
    const day = Math.floor(state.time / 1440);
    if (state.finance.today.day !== day) state.finance.today = { day, income: 0, running: 0, building: 0 };
    return state.finance.today;
  }

  function post(state, entry, value) {
    state.finance[entry] += value;
    currentDay(state)[entry] += value;
  }

  function legacyConfig(line) {
    return {
      stops: line.stops, loop: line.loop, branch: null,
      fleet: { main: line.count ? [{ cars: line.cars, count: line.count }] : [], branch: [] },
    };
  }

  function migrate(state) {
    const legacy = new Map(state.lines.map((line) => [line.id, line.cars]));
    state.finance = newLedger(state.time);
    state.rails = {};
    state.nextDemand = Math.max(state.time, state.nextDemand);
    const capacity = new Map(state.stations.map((station) => [station.id, 0]));
    for (const line of state.lines) {
      const pending = line.pending;
      Object.assign(line, legacyConfig(line), { name: "" });
      line.pending = pending
        ? { config: pending.remove ? { remove: true } : legacyConfig(pending), draining: ["main"] }
        : null;
      delete line.cars;
      delete line.count;
      const reserved = stops(line);
      for (const key of pairs(line).keys()) state.rails[key] = true;
      if (line.pending?.config.stops) {
        for (const id of stops(line.pending.config)) reserved.add(id);
        for (const key of pairs(line.pending.config).keys()) state.rails[key] = true;
      }
      for (const id of reserved) capacity.set(id, (capacity.get(id) || 0) + 2);
    }
    const byStation = new Map();
    for (const station of state.stations) {
      station.length = MetroWorld.types[station.type].platform;
      station.tracks = Math.max(2, capacity.get(station.id));
      station.platforms = {};
      byStation.set(station.id, station);
    }
    for (const train of state.trains) {
      train.service = "main";
      train.cars = legacy.get(train.line);
      if (!train.to && train.phase === "stop") {
        const station = byStation.get(train.at);
        const track = train.line + ":" + train.dir;
        if (!station.platforms[track]) {
          station.platforms[track] = train.id;
          train.bay = track;
        }
      }
    }
    return state;
  }

  return { keys, name, route, routes, segments, pairs, stops, fleetTotal, normalize, newLedger, currentDay, post, migrate };
})();
