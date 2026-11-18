const METRO_LINE_COLORS = ["#167d71", "#cb5f41", "#6653a9", "#326fa5", "#a77a19", "#a34e73", "#698340", "#2e7f99"];
const METRO_CAR_CAPACITY = 18;
const METRO_STEP = 0.25;
const METRO_MAX_TRAINS = 240;

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
    return stops.reduce((limit, id) => Math.min(limit, MetroWorld.types[this.stations.get(id).type].platform), Infinity);
  }

  validate(stops, loop) {
    if (stops.length < (loop ? 3 : 2)) return loop ? "环线至少经过 3 个站。" : "线路至少经过 2 个站。";
    if (new Set(stops).size !== stops.length || stops.some((id) => !this.stations.has(id))) return "请选择不同的有效车站。";
    return "";
  }

  addLine(stops, loop) {
    if (this.validate(stops, loop)) return null;
    const id = this.state.nextLine++;
    const line = {
      id, stops: [...stops], loop, cars: Math.min(4, this.platformLimit(stops)), count: 2, pending: null,
      color: METRO_LINE_COLORS[(id - 1) % METRO_LINE_COLORS.length],
    };
    this.state.lines.push(line);
    this.lines.set(id, line);
    this.seedTrains(line);
    this.invalidate();
    return line;
  }

  seedTrains(line, first = 0) {
    const n = line.stops.length;
    for (let index = first; index < line.count; index++) {
      let at = 0;
      let dir = 1;
      if (line.loop) {
        dir = index % 2 === 0 ? 1 : -1;
        at = first ? 0 : Math.floor(index / line.count * n);
      } else if (!first) {
        const step = Math.floor(index / line.count * 2 * (n - 1));
        dir = step < n - 1 ? 1 : -1;
        at = dir === 1 ? step : 2 * (n - 1) - step;
      }
      this.state.trains.push({
        id: this.state.nextTrain++, line: line.id, at: line.stops[at], to: 0, dir,
        phase: "arrive", ready: this.state.time + (first ? (index - first) * 0.75 : 0),
        passengers: [], load: 0, retiring: false, wait: "",
      });
    }
  }

  changeLine(line, config) {
    if (line.pending) return false;
    if (!config.remove && (
      this.validate(config.stops, config.loop) ||
      !Number.isInteger(config.cars) || config.cars < 1 || config.cars > this.platformLimit(config.stops) ||
      !Number.isSafeInteger(config.count) || config.count < 0 || config.count > METRO_MAX_TRAINS
    )) return false;

    const sameRoute = !config.remove && config.loop === line.loop && config.cars === line.cars &&
      config.stops.length === line.stops.length && config.stops.every((id, index) => id === line.stops[index]);
    const active = this.state.trains.filter((train) => train.line === line.id && !train.retiring);
    if (sameRoute) {
      line.count = config.count;
      if (line.count > active.length) this.seedTrains(line, active.length);
      for (const train of active.slice(line.count)) this.retire(train);
    } else {
      line.pending = config;
      for (const train of this.state.trains) if (train.line === line.id) this.retire(train);
    }
    this.invalidate();
    this.finishChanges();
    return true;
  }

  retire(train) {
    train.retiring = true;
    if (!train.to) this.unloadAndRetire(train);
  }

  unloadAndRetire(train) {
    const station = this.stations.get(train.at);
    for (const group of train.passengers) this.leaveTrain(station, group);
    train.passengers = [];
    train.load = 0;
    train.retired = true;
  }

  finishChanges() {
    this.state.trains = this.state.trains.filter((train) => !train.retired);
    let changed = false;
    for (const line of this.state.lines) {
      if (!line.pending || this.state.trains.some((train) => train.line === line.id)) continue;
      const config = line.pending;
      if (config.remove) {
        this.lines.delete(line.id);
      } else {
        Object.assign(line, config, { pending: null });
        this.seedTrains(line);
      }
      changed = true;
    }
    if (changed) {
      this.state.lines = this.state.lines.filter((line) => this.lines.has(line.id));
      this.invalidate();
    }
  }

  lineActive(line) {
    return line.count > 0 && !line.pending;
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
      const active = this.lineActive(line);
      for (const id of line.stops) {
        services.get(id).drawn++;
        if (active) services.get(id).active++;
      }
      if (!active) continue;
      let trip = 0;
      for (let i = 1; i < line.stops.length; i++) {
        trip += MetroWorld.travelTime(this.stations.get(line.stops[i - 1]), this.stations.get(line.stops[i])) + 1;
      }
      if (line.loop) {
        trip += MetroWorld.travelTime(this.stations.get(line.stops.at(-1)), this.stations.get(line.stops[0])) + 1;
      }
      const delayed = this.state.trains.filter((train) => train.line === line.id && train.wait).length;
      const congestion = Math.min(5, delayed * 1.1);
      for (const dir of [1, -1]) {
        if (line.loop && line.count === 1 && dir === -1) continue;
        const stops = dir === 1 ? line.stops : [...line.stops].reverse();
        const rides = stops.map(addNode);
        const fleet = line.loop ? (dir === 1 ? Math.ceil(line.count / 2) : Math.floor(line.count / 2)) : line.count;
        const wait = (line.loop ? trip : 2 * trip + 3) / fleet / 2 + congestion;
        for (let i = 0; i < stops.length; i++) {
          const station = this.stations.get(stops[i]);
          const platform = platforms.get(station.id);
          connect(rides[i], platform, 0.65 + Math.min(2.4, station.waiting / 190), null, station.id);
          if (i === stops.length - 1 && !line.loop) continue;
          const next = (i + 1) % stops.length;
          const nextStation = this.stations.get(stops[next]);
          const platformPressure = Math.min(9, station.waiting / (line.cars * METRO_CAR_CAPACITY) * 2.05);
          connect(platform, rides[i], Math.max(1.2, wait) + platformPressure, { line: line.id, dir });
          connect(rides[i], rides[next], MetroWorld.travelTime(station, nextStation) + 1.1);
          links.get(station.id).add(nextStation.id);
          links.get(nextStation.id).add(station.id);
        }
      }
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
      const volume = this.rates.get(station.id) * 2;
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
    } else if (group.plan?.goal === station.id) {
      this.state.stats.nearby += group.n;
    } else {
      this.enqueue(station, group);
    }
  }

  nextStop(line, train) {
    const index = line.stops.indexOf(train.at);
    if (line.loop) return line.stops[(index + train.dir + line.stops.length) % line.stops.length];
    return line.stops[index + train.dir];
  }

  stop(train, line) {
    const station = this.stations.get(train.at);
    const bays = ["rail", "airport", "bus"].includes(station.type) ? 3 : 2;
    if (!station.platforms.length) station.platforms = Array(bays).fill(0);
    let bay = 0;
    for (let index = 1; index < bays; index++) if (station.platforms[index] < station.platforms[bay]) bay = index;
    if (station.platforms[bay] > this.state.time) {
      train.wait = "站台";
      return;
    }

    let flow = 0;
    train.passengers = train.passengers.filter((group) => {
      if (group.plan.exit !== station.id) return true;
      this.leaveTrain(station, group);
      flow += group.n;
      train.load -= group.n;
      return false;
    });
    let terminalDelay = 0;
    if (!this.nextStop(line, train)) {
      train.dir *= -1;
      terminalDelay = 1.25;
    }

    const graph = this.getGraph();
    const capacity = line.cars * METRO_CAR_CAPACITY;
    const waiting = station.queue.filter((group) => {
      if (this.state.time >= group.until) return true;
      this.refreshGroup(station, group, graph);
      if (group.plan?.line !== line.id || group.plan.dir !== train.dir) return true;
      const board = Math.min(group.n, capacity - train.load);
      if (board < group.n) station.missed += group.n - board;
      if (!board) return true;
      const wait = this.state.time - group.queued;
      this.state.stats.wait += wait * board;
      this.state.stats.boarded += board;
      train.passengers.push({ ...group, n: board });
      group.n -= board;
      train.load += board;
      station.waiting -= board;
      flow += board;
      return group.n > 0;
    });
    station.queue = waiting;
    const dwell = 0.78 + flow / (line.cars * 19) + terminalDelay + Math.min(1.4, station.waiting / 215);
    train.phase = "stop";
    train.ready = this.state.time + dwell;
    train.wait = "";
    station.platforms[bay] = train.ready;
  }

  advanceTrain(train) {
    const time = this.state.time;
    const line = this.lines.get(train.line);
    if (train.to) {
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
    if (train.phase === "arrive") {
      this.stop(train, line);
      return;
    }
    const next = this.nextStop(line, train);
    const key = train.at + ">" + next;
    if ((this.state.tracks[key] || 0) > time) {
      train.wait = "区间";
      return;
    }
    const ride = MetroWorld.travelTime(this.stations.get(train.at), this.stations.get(next));
    this.state.tracks[key] = time + Math.max(1.65, ride * 0.62);
    train.to = next;
    train.departed = time;
    train.arrives = time + ride;
    train.wait = "";
  }

  step() {
    this.state.time += METRO_STEP;
    if (this.state.time >= this.state.nextDemand) {
      this.state.nextDemand += 2;
      this.demand();
    }
    for (const train of this.state.trains) if (!train.retired) this.advanceTrain(train);
    if (this.state.trains.some((train) => train.retired)) this.finishChanges();
  }

  stationService(station) {
    return this.getGraph().services.get(station.id);
  }
}
