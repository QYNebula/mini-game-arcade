const METRO_LINE_COLORS = ["#167d71", "#cb5f41", "#6653a9", "#326fa5", "#a77a19", "#a34e73", "#698340", "#2e7f99"];
const METRO_CAR_CAPACITY = 18;
const METRO_STEP = 0.25;
const METRO_MAX_TRAINS = 240;
const METRO_MINUTES_PER_SECOND = 0.75;
const METRO_DEMAND_INTERVAL = 1;

class MetroMinQueue {
  items = [];

  push(id, cost) {
    const item = { id, cost };
    let index = this.items.length;
    this.items.push(item);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].cost <= cost) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop() {
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length) {
      let index = 0;
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (this.items[child + 1]?.cost < this.items[child].cost) child++;
        if (this.items[child].cost >= last.cost) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}

class MetroSimulation {
  constructor(state) {
    this.state = state;
    state.finance ??= MetroNetwork.newLedger(state.time);
    state.rails ??= {};
    this.stations = new Map(state.stations.map((station) => [station.id, station]));
    this.lines = new Map(state.lines.map((line) => [line.id, line]));
    this.rates = MetroWorld.demandRates(state);
    this.revision = (state.revision || 0) + 1;
    state.revision = this.revision;
    this.graph = null;
    this.paths = new Map();
    for (const station of state.stations) {
      station.waiting = station.queue.reduce((sum, group) => sum + group.n, 0);
    }
  }

  invalidate() {
    this.state.revision = ++this.revision;
    this.graph = null;
  }

  platformLimit(stops) {
    return stops.reduce((limit, id) => Math.min(limit, this.stations.get(id).length), Infinity);
  }

  validate(stops, loop) {
    if (stops.length < (loop ? 3 : 2)) return loop ? "环线至少经过 3 个站。" : "线路至少经过 2 个站。";
    if (new Set(stops).size !== stops.length || stops.some((id) => !this.stations.has(id))) return "请选择不同的有效车站。";
    return "";
  }

  reservations(omit = null) {
    const usage = new Map();
    for (const line of this.state.lines) {
      if (line === omit) continue;
      const reserved = MetroNetwork.stops(line);
      if (line.pending?.config.stops) {
        for (const id of MetroNetwork.stops(line.pending.config)) reserved.add(id);
      }
      for (const id of reserved) usage.set(id, (usage.get(id) || 0) + 1);
    }
    return usage;
  }

  checkLayout(config, previous) {
    const error = this.validate(config.stops, config.loop);
    if (error) return { error };
    const branch = config.branch;
    if (branch) {
      const index = config.stops.indexOf(branch.fork);
      if (config.loop || index < 0 || index >= config.stops.length - 1) {
        return { error: "支线从往返线上的分岔站出发，主线还需继续到另一个终点。" };
      }
      if (!branch.tail.length || new Set(branch.tail).size !== branch.tail.length ||
          branch.tail.some((id) => !this.stations.has(id) || config.stops.includes(id))) {
        return { error: "请从分岔站拖到主线以外的车站。" };
      }
    }
    const fleet = {
      main: MetroNetwork.normalize(config.fleet.main),
      branch: MetroNetwork.normalize(config.fleet.branch),
    };
    if (!fleet.main || !fleet.branch) return { error: "编组和列车数量需要是整数。" };
    if (MetroNetwork.fleetTotal(fleet.main) + MetroNetwork.fleetTotal(fleet.branch) > METRO_MAX_TRAINS) {
      return { error: "每条线最多配置 " + METRO_MAX_TRAINS + " 列车。" };
    }
    const required = new Map();
    for (const route of MetroNetwork.routes({ ...config, fleet })) {
      const longest = route.fleet.at(-1)?.cars || 0;
      for (const id of route.stops) required.set(id, Math.max(longest, required.get(id) || 0));
    }
    const already = this.reservations(previous);
    const tracks = [];
    const length = [];
    for (const [id, cars] of required) {
      const station = this.stations.get(id);
      const desired = ((already.get(id) || 0) + 1) * 2;
      if (station.tracks < desired) tracks.push({ station, desired });
      if (station.length < cars) length.push({ station, desired: cars });
    }
    return { error: "", tracks, length, fleet };
  }

  expand(station, length, tracks) {
    if (!Number.isSafeInteger(length) || length < station.length ||
        !Number.isSafeInteger(tracks) || tracks < station.tracks || tracks % 2 !== 0) return false;
    const cost = (tracks - station.tracks) * 600 + (length - station.length) * tracks * 120;
    Object.assign(station, { length, tracks });
    MetroNetwork.post(this.state, "building", cost);
    this.invalidate();
    return true;
  }

  configure(line, config, fix = {}) {
    if (line?.pending) return { error: "请等在途列车停靠后再调整这条线。" };
    if (!config.remove) {
      const checked = this.checkLayout(config, line);
      if (checked.error) return { error: checked.error };
      if (checked.tracks.length && !fix.tracks) return { error: "请先为沿线车站补足轨道。" };
      if (checked.length.length && !["extend", "trim"].includes(fix.length)) return { error: "请选择延长站台或缩编。" };
      config = { ...config, fleet: checked.fleet, name: (config.name || "").trim().slice(0, 22) };
      if (!config.branch) config.fleet.branch = [];
      if (fix.length === "trim") {
        for (const route of MetroNetwork.routes(config)) {
          const limit = this.platformLimit(route.stops);
          config.fleet[route.id] = MetroNetwork.normalize(route.fleet.map((group) => ({
            ...group, cars: Math.min(limit, group.cars),
          })));
        }
      }
      // Combine the changes at each station so extending and adding tracks charges once.
      const changes = new Map(checked.tracks.map(({ station, desired }) => [station, { tracks: desired, length: station.length }]));
      if (fix.length === "extend") {
        for (const { station, desired } of checked.length) {
          changes.set(station, { tracks: changes.get(station)?.tracks || station.tracks, length: desired });
        }
      }
      for (const [station, next] of changes) this.expand(station, next.length, next.tracks);
      this.bookConstruction(config, line);
    }
    if (!line) {
      const id = this.state.nextLine++;
      line = { id, ...config, pending: null, color: METRO_LINE_COLORS[(id - 1) % METRO_LINE_COLORS.length] };
      this.state.lines.push(line);
      this.lines.set(id, line);
      this.syncFleet(line);
    } else {
      const draining = MetroNetwork.routes(line).filter((old) => {
        const next = config.remove ? null : MetroNetwork.route(config, old.id);
        return !next || old.loop !== next.loop || old.stops.join(",") !== next.stops.join(",");
      }).map((route) => route.id);
      if (draining.length) {
        line.pending = { config, draining };
        for (const train of this.state.trains) {
          if (train.line === line.id && draining.includes(train.service)) this.retire(train);
        }
      } else {
        Object.assign(line, config);
        this.syncFleet(line);
      }
    }
    this.invalidate();
    this.finishChanges();
    return { line };
  }

  bookConstruction(config, previous) {
    for (const [key, [a, b]] of MetroNetwork.pairs(config)) {
      if (this.state.rails[key]) continue;
      this.state.rails[key] = true;
      this.book("building", MetroWorld.trackLength(this.stations.get(a), this.stations.get(b)) * 5);
    }
    const vehicles = (line) => MetroNetwork.routes(line)
      .reduce((sum, route) => sum + MetroNetwork.fleetTotal(route.fleet, true), 0);
    this.book("building", Math.max(0, vehicles(config) - (previous ? vehicles(previous) : 0)) * METRO_NEW_CAR_COST);
  }

  book(entry, value) {
    if (value) MetroNetwork.post(this.state, entry, value);
  }

  syncFleet(line) {
    const all = this.state.trains.filter((train) => train.line === line.id && !train.retiring && !train.retired);
    for (const route of MetroNetwork.routes(line)) {
      const existing = all.filter((train) => train.service === route.id);
      const used = new Set();
      const count = MetroNetwork.fleetTotal(route.fleet);
      let index = 0;
      let additions = 0;
      for (const group of route.fleet) {
        for (let quantity = 0; quantity < group.count; quantity++, index++) {
          let dir = route.loop && index % 2 ? -1 : 1;
          const match = existing.find((train) => !used.has(train) && train.cars === group.cars && (!route.loop || train.dir === dir));
          if (match) {
            used.add(match);
            continue;
          }
          let at = 0;
          if (!existing.length) {
            if (route.loop) at = Math.floor(index / count * route.stops.length);
            else {
              const end = route.stops.length - 1;
              const step = Math.floor(index / count * 2 * end);
              dir = step < end ? 1 : -1;
              at = dir === 1 ? step : 2 * end - step;
            }
          }
          this.state.trains.push({
            id: this.state.nextTrain++, line: line.id, service: route.id, cars: group.cars,
            at: route.stops[at], to: 0, dir, phase: "arrive",
            ready: this.state.time + additions++ * 0.65,
            passengers: [], load: 0, retiring: false, wait: "",
          });
        }
      }
      for (const train of existing) if (!used.has(train)) this.retire(train);
    }
  }

  retire(train) {
    train.retiring = true;
    if (!train.to) this.unloadAndRetire(train);
  }

  unloadAndRetire(train) {
    const station = this.stations.get(train.at);
    this.releaseBay(station, train);
    for (const group of train.passengers) this.leaveTrain(station, group);
    train.passengers = [];
    train.load = 0;
    train.retired = true;
  }

  finishChanges() {
    this.state.trains = this.state.trains.filter((train) => !train.retired);
    let changed = false;
    for (const line of this.state.lines) {
      if (!line.pending) continue;
      const { config, draining } = line.pending;
      if (this.state.trains.some((train) => train.line === line.id && draining.includes(train.service))) continue;
      if (config.remove) {
        this.lines.delete(line.id);
      } else {
        Object.assign(line, config, { pending: null });
        this.syncFleet(line);
      }
      changed = true;
    }
    if (changed) {
      this.state.trains = this.state.trains.filter((train) => !train.retired);
      this.state.lines = this.state.lines.filter((line) => this.lines.has(line.id));
      this.invalidate();
    }
  }

  routeActive(line, route) {
    return route && route.fleet.length && !line.pending?.draining.includes(route.id);
  }

  getGraph() {
    if (this.graph && this.graph.until > this.state.time) return this.graph;

    const nodes = [];
    const forward = [];
    const backward = [];
    const platforms = new Map();
    const links = new Map();
    const services = new Map();
    const addNode = (station) => {
      const index = nodes.length;
      nodes.push(station);
      forward.push([]);
      backward.push([]);
      return index;
    };
    const connect = (from, to, cost, board = null, exit = 0) => {
      const edge = { from, to, cost, board, exit };
      forward[from].push(edge);
      backward[to].push(edge);
    };
    for (const station of this.state.stations) {
      platforms.set(station.id, addNode(station.id));
      links.set(station.id, new Set());
      services.set(station.id, { drawn: 0, active: 0 });
    }

    for (const line of this.state.lines) {
      for (const id of MetroNetwork.stops(line)) services.get(id).drawn++;
      const active = new Set();
      for (const route of MetroNetwork.routes(line)) {
        if (!this.routeActive(line, route)) continue;
        for (const id of route.stops) active.add(id);
        const count = MetroNetwork.fleetTotal(route.fleet);
        const seats = MetroNetwork.fleetTotal(route.fleet, true) * METRO_CAR_CAPACITY / count;
        const trip = MetroNetwork.segments(route).reduce((duration, [a, b]) =>
          duration + MetroWorld.travelTime(this.stations.get(a), this.stations.get(b)) + 1.3, 0);
        const delayed = this.state.trains.filter((train) => train.line === line.id && train.service === route.id && train.wait).length;
        const congestion = Math.min(5, delayed * 1.15);
        for (const dir of [1, -1]) {
          const fleet = route.loop ? (dir === 1 ? Math.ceil(count / 2) : Math.floor(count / 2)) : count;
          if (!fleet) continue;
          const stops = dir === 1 ? route.stops : [...route.stops].reverse();
          const rides = stops.map(addNode);
          const wait = (route.loop ? trip : 2 * trip + 3) / fleet / 2 + congestion;
          for (let i = 0; i < stops.length; i++) {
            const station = this.stations.get(stops[i]);
            const platform = platforms.get(station.id);
            connect(rides[i], platform, 0.65 + Math.min(2.4, station.waiting / 190), null, station.id);
            if (i === stops.length - 1 && !route.loop) continue;
            const next = (i + 1) % stops.length;
            const nextStation = this.stations.get(stops[next]);
            const platformPressure = Math.min(9, station.waiting / seats * 2.05);
            connect(platform, rides[i], Math.max(1.2, wait) + platformPressure, { line: line.id, service: route.id, dir });
            connect(rides[i], rides[next], MetroWorld.travelTime(station, nextStation) + 1.3);
            links.get(station.id).add(nextStation.id);
            links.get(nextStation.id).add(station.id);
          }
        }
      }
      for (const id of active) services.get(id).active++;
    }
    const served = this.state.stations.filter((station) => services.get(station.id).active > 0);
    const components = new Map();
    for (const station of served) {
      if (components.has(station.id)) continue;
      const group = [station.id];
      components.set(station.id, group);
      for (let i = 0; i < group.length; i++) {
        for (const neighbor of links.get(group[i])) {
          if (components.has(neighbor)) continue;
          components.set(neighbor, group);
          group.push(neighbor);
        }
      }
    }
    this.paths.clear();
    this.graph = { platforms, nodes, forward, backward, served, services, components, until: this.state.time + 9 };
    return this.graph;
  }

  pathsTo(goal, graph) {
    const known = this.paths.get(goal);
    if (known) return known;
    const distances = new Float64Array(graph.nodes.length).fill(Infinity);
    const next = new Array(graph.nodes.length);
    const end = graph.platforms.get(goal);
    const queue = new MetroMinQueue();
    distances[end] = 0;
    queue.push(end, 0);
    while (queue.items.length) {
      const { id, cost } = queue.pop();
      if (cost !== distances[id]) continue;
      for (const edge of graph.backward[id]) {
        const proposed = cost + edge.cost;
        if (proposed >= distances[edge.from]) continue;
        distances[edge.from] = proposed;
        next[edge.from] = edge;
        queue.push(edge.from, proposed);
      }
    }
    const entry = { distances, next };
    if (this.paths.size >= 40) this.paths.delete(this.paths.keys().next().value);
    this.paths.set(goal, entry);
    return entry;
  }

  plan(station, goal, graph) {
    const reachable = graph.components.get(station.id);
    const target = this.stations.get(goal);
    if (!target || !reachable || goal === station.id) return null;
    if (graph.components.get(goal) !== reachable) {
      let closest = MetroWorld.distance(station, target);
      goal = station.id;
      for (const id of reachable) {
        const distance = MetroWorld.distance(this.stations.get(id), target);
        if (distance + 0.01 >= closest) continue;
        closest = distance;
        goal = id;
      }
      if (goal === station.id) return null;
    }
    const { distances, next } = this.pathsTo(goal, graph);
    const candidates = [];
    for (const edge of graph.forward[graph.platforms.get(station.id)]) {
      const cost = edge.cost + distances[edge.to];
      if (!Number.isFinite(cost)) continue;
      let middle = next[edge.to];
      while (middle && !middle.exit) middle = next[middle.to];
      if (middle && middle.exit !== station.id) candidates.push({ ...edge.board, exit: middle.exit, goal, cost });
    }
    if (!candidates.length) return null;
    let fastest = Infinity;
    for (const option of candidates) fastest = Math.min(fastest, option.cost);
    const reasonable = candidates.filter((option) => option.cost <= fastest + 2.6);
    return MetroWorld.pick(this.state, reasonable, (option) => Math.exp((fastest - option.cost) * 1.05));
  }

  refreshGroup(station, group, graph) {
    if (group.revision === this.revision && group.review > this.state.time) return;
    if (!group.target) group.target = MetroWorld.destination(this.state, station, graph.served);
    group.plan = this.plan(station, group.target, graph);
    if (group.plan) group.eligible = true;
    group.revision = this.revision;
    group.review = this.state.time + (group.plan ? 11 : 5);
  }

  enqueue(station, group) {
    group.queued = this.state.time;
    group.until = this.state.time + 40 + MetroWorld.random(this.state) * 27;
    group.review = 0;
    group.plan = null;
    station.queue.push(group);
    station.waiting += group.n;
  }

  demand() {
    const added = MetroWorld.advance(this.state);
    for (const station of added) this.stations.set(station.id, station);
    if (added.length) this.invalidate();
    this.rates = MetroWorld.demandRates(this.state);
    const graph = this.getGraph();
    for (const station of this.state.stations) {
      station.queue = station.queue.filter((group) => {
        if (this.state.time < group.until) {
          this.refreshGroup(station, group, graph);
          return true;
        }
        station.waiting -= group.n;
        station.lost += group.n;
        if (group.eligible) this.state.stats.lost += group.n;
        return false;
      });
      station.missed *= 0.86;
      const volume = this.rates.get(station.id) * METRO_DEMAND_INTERVAL;
      const count = Math.floor(volume + MetroWorld.random(this.state));
      const batches = Math.min(count, 3);
      for (let i = 0; i < batches; i++) {
        const n = Math.ceil((count - i) / batches);
        const group = { n, target: MetroWorld.destination(this.state, station, graph.served), eligible: false };
        this.enqueue(station, group);
        this.refreshGroup(station, group, graph);
      }
    }
    for (const key of Object.keys(this.state.tracks)) {
      if (this.state.tracks[key] < this.state.time - 8) delete this.state.tracks[key];
    }
  }

  leaveTrain(station, group) {
    if (group.target === station.id) {
      this.state.stats.delivered += group.n;
      this.book("income", group.n * METRO_FARE);
    } else if (group.plan?.goal === station.id) {
      this.state.stats.nearby += group.n;
      this.book("income", group.n * METRO_FARE);
    } else {
      this.enqueue(station, group);
    }
  }

  nextStop(route, train) {
    const index = route.stops.indexOf(train.at);
    if (route.loop) return route.stops[(index + train.dir + route.stops.length) % route.stops.length];
    return route.stops[index + train.dir];
  }

  canBoard(group, train, route) {
    if (group.until <= this.state.time || group.plan?.line !== train.line || group.plan.dir !== train.dir) return false;
    // Either service can carry passengers along the common trunk in the same direction.
    const start = route.stops.indexOf(train.at);
    const end = route.stops.indexOf(group.plan.exit);
    return end >= 0 && end !== start && (route.loop || (end - start) * train.dir > 0);
  }

  releaseBay(station, train) {
    if (train.bay && station.platforms[train.bay] === train.id) delete station.platforms[train.bay];
    delete train.bay;
  }

  stop(train, route) {
    const station = this.stations.get(train.at);
    const turning = !this.nextStop(route, train);
    const direction = turning ? -train.dir : train.dir;
    const bay = train.line + ":" + direction;
    if (station.platforms[bay] && station.platforms[bay] !== train.id) {
      train.wait = "站台";
      return;
    }

    train.dir = direction;
    train.bay = bay;
    station.platforms[bay] = train.id;
    let leaving = 0;
    for (const group of train.passengers) if (group.plan.exit === station.id) leaving += group.n;
    const graph = this.getGraph();
    let waiting = 0;
    for (const group of station.queue) {
      this.refreshGroup(station, group, graph);
      if (this.canBoard(group, train, route)) waiting += group.n;
    }
    const seats = train.cars * METRO_CAR_CAPACITY;
    const boarding = Math.min(waiting, seats - train.load + leaving);
    const flow = train.cars * 8.5;
    train.doors = {
      boarding, credit: 0,
      close: this.state.time + 0.85 + (leaving + boarding) / flow + Math.min(1.35, station.waiting / 205),
      turn: turning ? 1.25 : 0,
    };
    train.phase = "doors";
    train.wait = "";
  }

  exchangePassengers(train, route) {
    const station = this.stations.get(train.at);
    const doors = train.doors;
    doors.credit += train.cars * 8.5 * METRO_STEP;
    let budget = Math.floor(doors.credit);
    let stillLeaving = false;
    train.passengers = train.passengers.filter((group) => {
      if (group.plan.exit !== station.id) return true;
      const off = Math.min(budget, group.n);
      if (off) {
        this.leaveTrain(station, { ...group, n: off });
        group.n -= off;
        train.load -= off;
        budget -= off;
        doors.credit -= off;
      }
      if (group.n) stillLeaving = true;
      return group.n > 0;
    });
    const graph = this.getGraph();
    const capacity = train.cars * METRO_CAR_CAPACITY;
    if (!stillLeaving && budget && doors.boarding && train.load < capacity) {
      station.queue = station.queue.filter((group) => {
        this.refreshGroup(station, group, graph);
        if (!this.canBoard(group, train, route)) return true;
        const board = Math.min(group.n, capacity - train.load, doors.boarding, budget);
        if (!board) return true;
        this.state.stats.wait += (this.state.time - group.queued) * board;
        this.state.stats.boarded += board;
        train.passengers.push({ ...group, n: board });
        group.n -= board;
        train.load += board;
        station.waiting -= board;
        budget -= board;
        doors.credit -= board;
        doors.boarding -= board;
        return group.n > 0;
      });
    }
    // Keep only the fractional boarding rate between simulation steps.
    doors.credit %= 1;
    if (this.state.time < doors.close || stillLeaving) return;
    if (train.load >= capacity) {
      for (const group of station.queue) {
        if (this.canBoard(group, train, route)) station.missed += group.n;
      }
    }
    train.phase = "stop";
    train.ready = this.state.time + doors.turn;
    delete train.doors;
  }

  advanceTrain(train) {
    const time = this.state.time;
    const line = this.lines.get(train.line);
    if (train.to) {
      const elapsed = Math.min(time, train.arrives) - Math.max(time - METRO_STEP, train.departed);
      const length = MetroWorld.trackLength(this.stations.get(train.at), this.stations.get(train.to));
      this.book("running", Math.max(0, elapsed) / (train.arrives - train.departed) * length / 100 * train.cars * METRO_CAR_KM_COST);
      if (time < train.arrives) return;
      train.at = train.to;
      train.to = 0;
      train.phase = "arrive";
    }
    if (train.retiring) {
      this.unloadAndRetire(train);
      return;
    }
    if (time < train.ready) return;
    const route = MetroNetwork.route(line, train.service);
    if (train.phase === "arrive") {
      this.stop(train, route);
      return;
    }
    if (train.phase === "doors") {
      this.exchangePassengers(train, route);
      return;
    }
    const next = this.nextStop(route, train);
    const key = train.at + ">" + next;
    if ((this.state.tracks[key] || 0) > time) {
      train.wait = "区间";
      return;
    }
    const ride = MetroWorld.travelTime(this.stations.get(train.at), this.stations.get(next));
    this.state.tracks[key] = time + Math.max(1.65, ride * 0.62);
    this.releaseBay(this.stations.get(train.at), train);
    train.to = next;
    train.departed = time;
    train.arrives = time + ride;
    train.wait = "";
  }

  step() {
    this.state.time += METRO_STEP;
    MetroNetwork.currentDay(this.state);
    if (this.state.time >= this.state.nextDemand) {
      this.state.nextDemand += METRO_DEMAND_INTERVAL;
      this.demand();
    }
    for (const train of this.state.trains) if (!train.retired) this.advanceTrain(train);
    if (this.state.trains.some((train) => train.retired)) this.finishChanges();
  }

  stationService(station) {
    return this.getGraph().services.get(station.id);
  }
}
