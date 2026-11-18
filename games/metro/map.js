function metroProjection(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const along = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
  return { along, distance: Math.hypot(point.x - start.x - along * dx, point.y - start.y - along * dy) };
}

class MetroMap {
  constructor(canvas, actions) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.actions = actions;
    this.view = { x: 0, y: 200, zoom: 0.9 };
    this.pointers = new Map();
    this.gesture = null;
    this.cursor = null;
    this.segments = [];

    new ResizeObserver(() => {
      this.resize();
      if (!this.fitted && this.width && this.height && this.sim) this.fit();
    }).observe(canvas);
    canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
    canvas.addEventListener("pointercancel", (event) => this.pointerUp(event, true));
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoom(Math.exp(-event.deltaY * 0.0016), this.eventPoint(event));
    }, { passive: false });
  }

  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(this.width * this.dpr);
    const height = Math.round(this.height * this.dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.lastDraw = null;
    }
  }

  attach(simulation, camera) {
    this.sim = simulation;
    this.resize();
    if (camera) {
      this.view = { ...camera };
      this.fitted = true;
    } else if (this.width && this.height) {
      this.fit();
    }
  }

  fit() {
    const areas = this.sim.state.areas;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    const size = MetroWorld.size;
    for (const area of areas) {
      left = Math.min(left, area.gx * size - 35);
      top = Math.min(top, area.gy * size - 35);
      right = Math.max(right, (area.gx + 1) * size + 35);
      bottom = Math.max(bottom, (area.gy + 1) * size + 35);
    }
    this.view = {
      x: (left + right) / 2, y: (top + bottom) / 2,
      zoom: Math.max(0.007, Math.min(1.36, (this.width - 86) / (right - left), (this.height - 60) / (bottom - top))),
    };
    this.fitted = true;
  }

  focusArea(area) {
    this.view.x = (area.gx + 0.5) * MetroWorld.size;
    this.view.y = (area.gy + 0.5) * MetroWorld.size;
    this.view.zoom = Math.max(0.38, Math.min(this.view.zoom, 1.1));
  }

  screen(point) {
    return {
      x: this.width / 2 + (point.x - this.view.x) * this.view.zoom,
      y: this.height / 2 + (point.y - this.view.y) * this.view.zoom,
    };
  }

  world(point) {
    return {
      x: this.view.x + (point.x - this.width / 2) / this.view.zoom,
      y: this.view.y + (point.y - this.height / 2) / this.view.zoom,
    };
  }

  zoom(factor, point = { x: this.width / 2, y: this.height / 2 }) {
    const original = this.world(point);
    this.view.zoom = Math.max(0.007, Math.min(2.65, this.view.zoom * factor));
    this.view.x = original.x - (point.x - this.width / 2) / this.view.zoom;
    this.view.y = original.y - (point.y - this.height / 2) / this.view.zoom;
  }

  eventPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  hitStation(point, radius = 19) {
    let closest = null;
    for (const station of this.sim.state.stations) {
      const position = this.screen(station);
      const distance = Math.hypot(position.x - point.x, position.y - point.y);
      if (distance >= radius) continue;
      radius = distance;
      closest = station;
    }
    return closest;
  }

  pointerDown(event) {
    if (!this.sim || event.button > 0) return;
    const point = this.eventPoint(event);
    this.pointers.set(event.pointerId, point);
    this.canvas.setPointerCapture(event.pointerId);
    if (this.pointers.size > 1) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = { kind: "pinch", center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, spread: MetroWorld.distance(a, b) };
      this.cursor = null;
      return;
    }
    const station = this.hitStation(point, event.pointerType === "touch" ? 23 : 17);
    const drawing = station && this.actions.begin(station.id);
    this.gesture = { kind: drawing ? "draw" : "pan", start: point, previous: point, moved: false };
    if (drawing) this.cursor = point;
  }

  pointerMove(event) {
    if (!this.pointers.has(event.pointerId) || !this.gesture) return;
    const point = this.eventPoint(event);
    this.pointers.set(event.pointerId, point);
    const gesture = this.gesture;
    if (gesture.kind === "pinch" && this.pointers.size > 1) {
      const [a, b] = [...this.pointers.values()];
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const spread = MetroWorld.distance(a, b);
      this.view.x -= (center.x - gesture.center.x) / this.view.zoom;
      this.view.y -= (center.y - gesture.center.y) / this.view.zoom;
      this.zoom(spread / Math.max(1, gesture.spread), center);
      Object.assign(gesture, { center, spread });
      return;
    }
    if (gesture.kind === "draw") {
      this.cursor = point;
      const hits = [];
      const radius = event.pointerType === "touch" ? 18 : 13;
      for (const station of this.sim.state.stations) {
        const hit = metroProjection(this.screen(station), gesture.previous, point);
        if (hit.distance <= radius) hits.push({ id: station.id, ...hit });
      }
      hits.sort((a, b) => a.along - b.along || a.distance - b.distance);
      for (const hit of hits) this.actions.trace(hit.id);
    } else if (gesture.kind === "pan") {
      if (MetroWorld.distance(gesture.start, point) > 5) gesture.moved = true;
      if (gesture.moved) {
        this.view.x -= (point.x - gesture.previous.x) / this.view.zoom;
        this.view.y -= (point.y - gesture.previous.y) / this.view.zoom;
      }
    }
    gesture.previous = point;
  }

  pointerUp(event, cancelled = false) {
    const gesture = this.gesture;
    if (!cancelled && gesture?.kind === "draw") this.pointerMove(event);
    if (!this.pointers.delete(event.pointerId)) return;
    if (!cancelled && gesture?.kind === "pan" && !gesture.moved) {
      const point = this.eventPoint(event);
      const station = this.hitStation(point, event.pointerType === "touch" ? 23 : 17);
      if (station) {
        this.actions.selectStation(station.id);
      } else {
        const segment = this.segments.findLast((item) => item.points.slice(1).some((end, i) =>
          metroProjection(point, item.points[i], end).distance < 10));
        if (segment) this.actions.selectLine(segment.line.id);
      }
    }
    if (!this.pointers.size) this.gesture = null;
    this.cursor = null;
  }

  path(points) {
    const ctx = this.context;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  }

  visible(x, y, margin = 30) {
    return x > -margin && y > -margin && x < this.width + margin && y < this.height + margin;
  }

  drawTerrain(state, proposalFocused) {
    const ctx = this.context;
    ctx.fillStyle = "#f4f4e9";
    ctx.fillRect(0, 0, this.width, this.height);
    const start = this.world({ x: 0, y: 0 });
    const end = this.world({ x: this.width, y: this.height });
    const spacing = this.view.zoom < 0.2 ? 24 : 21;
    const firstX = ((-start.x * this.view.zoom) % spacing + spacing) % spacing;
    const firstY = ((-start.y * this.view.zoom) % spacing + spacing) % spacing;
    ctx.fillStyle = "#8c92752c";
    for (let x = firstX; x < this.width; x += spacing) {
      for (let y = firstY; y < this.height; y += spacing) ctx.fillRect(x, y, 1.25, 1.25);
    }

    const areas = state.proposal ? [...state.areas, state.proposal] : state.areas;
    for (const area of areas) {
      const center = this.screen({ x: (area.gx + 0.5) * MetroWorld.size, y: (area.gy + 0.5) * MetroWorld.size });
      if (!this.visible(center.x, center.y, 285 * this.view.zoom + 20)) continue;
      const definition = MetroWorld.areas[area.kind];
      const pending = area.opened === null;
      this.path(MetroWorld.boundary(state.seed, area).map(([x, y]) => this.screen({ x, y })));
      ctx.closePath();
      ctx.fillStyle = pending ? "#f2e9d594" : definition.fill;
      ctx.fill();
      ctx.strokeStyle = pending ? "#a57b44" : definition.edge;
      ctx.lineWidth = pending && proposalFocused ? 2.5 : 1.4;
      if (pending) ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (pending || this.view.zoom < 0.26) continue;
      ctx.save();
      ctx.clip();
      // Pale street edges and blocks keep the map readable at much higher rail contrast.
      for (let index = 0; index < 15; index++) {
        const seed = MetroWorld.terrain(state.seed, area.gx, area.gy, index * 117);
        const fraction = MetroWorld.terrain(state.seed, area.gy, area.gx, index * 619 + 2);
        const x = (area.gx + 0.08 + seed * 0.85) * MetroWorld.size;
        const y = (area.gy + 0.06 + fraction * 0.88) * MetroWorld.size;
        const corner = this.screen({ x, y });
        if (Math.abs(x - MetroWorld.riverX(y)) < 54) continue;
        ctx.fillStyle = index % 5 === 0 ? "#969e7031" : "#fffdf08c";
        const w = (19 + (index % 4) * 9) * this.view.zoom;
        const h = (11 + (index % 3) * 8) * this.view.zoom;
        ctx.fillRect(corner.x, corner.y, w, h);
      }
      ctx.restore();
    }

    const step = Math.max(12, (end.y - start.y) / 120);
    const river = [];
    for (let y = start.y - step; y <= end.y + step; y += step) river.push(this.screen({ x: MetroWorld.riverX(y), y }));
    this.path(river);
    ctx.strokeStyle = "#adcdd1";
    ctx.lineWidth = Math.max(3, 69 * this.view.zoom);
    ctx.stroke();
    ctx.strokeStyle = "#c9dfe0";
    ctx.lineWidth = Math.max(2, 60 * this.view.zoom);
    ctx.stroke();

    ctx.font = "700 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const area of areas) {
      const point = this.screen({ x: (area.gx + 0.5) * MetroWorld.size, y: (area.gy + 0.11) * MetroWorld.size });
      if (!this.visible(point.x, point.y) || (this.view.zoom < 0.19 && area.opened !== null)) continue;
      const pending = area.opened === null;
      const text = pending ? area.name + " · 待开放" : area.name;
      ctx.lineWidth = 4;
      ctx.strokeStyle = pending ? "#f7eee0" : MetroWorld.areas[area.kind].fill;
      ctx.strokeText(text, point.x, point.y);
      ctx.fillStyle = pending ? "#86602e" : "#626a56";
      ctx.fillText(text, point.x, point.y);
    }
  }

  drawTracks(state, selected, draft) {
    const ctx = this.context;
    const shared = new Map();
    for (const line of state.lines) {
      const stops = line.loop ? [...line.stops, line.stops[0]] : line.stops;
      for (let i = 1; i < stops.length; i++) {
        const a = this.sim.stations.get(stops[i - 1]);
        const b = this.sim.stations.get(stops[i]);
        const first = a.id < b.id ? a : b;
        const last = first === a ? b : a;
        const key = first.id + ":" + last.id;
        if (!shared.has(key)) shared.set(key, []);
        shared.get(key).push({ first, last, line });
      }
    }
    this.segments = [];
    for (const lanes of shared.values()) {
      for (const [index, lane] of lanes.entries()) {
        const { first, last, line } = lane;
        const angle = Math.atan2(last.y - first.y, last.x - first.x);
        const offset = Math.max(-13, Math.min(13, (index - (lanes.length - 1) / 2) * 4.3));
        const points = MetroWorld.track(first, last).map((point) => {
          const screen = this.screen(point);
          return { x: screen.x - Math.sin(angle) * offset, y: screen.y + Math.cos(angle) * offset };
        });
        this.path(points);
        ctx.strokeStyle = "#f9f8ef";
        ctx.lineWidth = line.id === selected ? 9 : 7;
        ctx.stroke();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.id === selected ? 6.5 : 4.5;
        ctx.globalAlpha = line.pending ? 0.48 : line.count ? 1 : 0.66;
        if (!line.count || line.pending) ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        this.segments.push({ points, line });
      }
    }

    if (draft?.stops.length) {
      const path = [];
      const stops = draft.loop ? [...draft.stops, draft.stops[0]] : draft.stops;
      path.push(this.screen(this.sim.stations.get(stops[0])));
      for (let i = 1; i < stops.length; i++) {
        const points = MetroWorld.track(this.sim.stations.get(stops[i - 1]), this.sim.stations.get(stops[i]));
        for (const point of points.slice(1)) path.push(this.screen(point));
      }
      if (this.cursor && !draft.loop) path.push(this.cursor);
      if (path.length > 1) {
        this.path(path);
        ctx.strokeStyle = "#fdf8ed";
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.strokeStyle = draft.color;
        ctx.lineWidth = 5.5;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  drawTrains(state, time) {
    const ctx = this.context;
    for (const train of state.trains) {
      const at = this.sim.stations.get(train.at);
      const line = this.sim.lines.get(train.line);
      let position = this.screen(at);
      let angle = 0;
      if (train.to) {
        const points = MetroWorld.track(at, this.sim.stations.get(train.to));
        const segments = points.slice(1).map((point, i) => MetroWorld.distance(point, points[i]));
        const ratio = Math.max(0, Math.min(1, (time - train.departed) / (train.arrives - train.departed)));
        let remainder = ratio * segments.reduce((sum, length) => sum + length, 0);
        for (const [index, length] of segments.entries()) {
          if (remainder > length && index < segments.length - 1) {
            remainder -= length;
            continue;
          }
          const from = points[index];
          const to = points[index + 1];
          const part = remainder / (length || 1);
          angle = Math.atan2(to.y - from.y, to.x - from.x);
          position = this.screen({ x: from.x + (to.x - from.x) * part, y: from.y + (to.y - from.y) * part });
          break;
        }
      } else {
        position.y -= train.dir * 10;
      }
      if (!this.visible(position.x, position.y)) continue;
      ctx.save();
      ctx.translate(position.x, position.y);
      ctx.rotate(angle);
      const width = Math.min(27, 12 + line.cars * 1.8);
      ctx.fillStyle = "#fffdf6";
      ctx.beginPath();
      ctx.roundRect(-width / 2, -5, width, 10, 3);
      ctx.fill();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = train.wait ? "#ce6848" : line.color;
      const load = train.load / (line.cars * METRO_CAR_CAPACITY);
      ctx.fillRect(-width / 2 + 3, -1.5, (width - 6) * Math.max(0.13, load), 3);
      ctx.restore();
    }
  }

  drawStations(state, selected, draft) {
    const ctx = this.context;
    const draftStations = new Set(draft?.stops || []);
    const service = this.sim.getGraph().services;
    for (const station of state.stations) {
      const point = this.screen(station);
      if (!this.visible(point.x, point.y)) continue;
      const status = service.get(station.id);
      const isSelected = station.id === selected || draftStations.has(station.id);
      const high = station.waiting > 40;
      const ringColor = high ? (status.active ? "#bf543d" : "#b48a46") : "#749080";
      const scale = this.view.zoom < 0.25 ? 0.78 : 1;
      const radius = (status.active > 1 ? 7.8 : 6.1) * scale;
      if (station.waiting > 4) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + Math.min(12, Math.sqrt(station.waiting) * 0.8), 0, Math.PI * 2);
        ctx.fillStyle = ringColor + "29";
        ctx.fill();
        ctx.strokeStyle = ringColor + "a6";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.beginPath();
      if (["rail", "airport", "bus"].includes(station.type)) {
        ctx.roundRect(point.x - radius - 1, point.y - radius - 1, (radius + 1) * 2, (radius + 1) * 2, 3);
      } else {
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = isSelected ? "#235e57" : "#fffdf4";
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#183e39" : status.active ? "#253c36" : MetroWorld.types[station.type].color;
      ctx.lineWidth = isSelected ? 3 : 2.2;
      ctx.stroke();

      const showName = (state.labels && this.view.zoom >= 0.28) || isSelected;
      const showWaiting = station.waiting >= 8 && this.view.zoom >= 0.24;
      if (showName || showWaiting) {
        ctx.font = "700 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        const name = showName ? station.name + (showWaiting ? " · " + station.waiting : "") : String(station.waiting);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = "#f9f8ed";
        ctx.strokeText(name, point.x, point.y + radius + 17);
        ctx.fillStyle = high ? "#8a422e" : "#253c36";
        ctx.fillText(name, point.x, point.y + radius + 17);
      }
    }
  }

  draw(selection, time) {
    if (!this.sim || !this.width || !this.height) return;
    const state = this.sim.state;
    const key = [time, this.sim.revision, state.areas.length, state.proposal?.id, state.labels,
      this.width, this.height, this.view.x, this.view.y, this.view.zoom, selection.line, selection.station,
      selection.proposal, selection.draft?.loop, selection.draft?.stops.join(","), this.cursor?.x, this.cursor?.y].join("/");
    if (this.lastDraw === key) return;
    this.lastDraw = key;
    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    this.drawTerrain(state, selection.proposal);
    this.drawTracks(state, selection.line, selection.draft);
    this.drawTrains(state, time);
    this.drawStations(state, selection.station, selection.draft);
  }
}
