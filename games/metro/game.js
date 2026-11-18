(() => {
  const id = "metro";
  const version = 1;
  const query = new URLSearchParams(window.location.search);
  const byId = (name) => document.getElementById(name);
  const text = (name, value) => { byId(name).textContent = value; };
  const canvas = byId("metro-map");
  const shell = byId("game-shell");
  const cityDialog = byId("city-dialog");
  const removeDialog = byId("remove-dialog");
  const trainInput = byId("train-count");
  const carInput = byId("car-count");
  const speedButtons = [...document.querySelectorAll("[data-speed]")];
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const numbers = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
  const fmt = (value) => numbers.format(value);
  trainInput.max = String(METRO_MAX_TRAINS);

  let sim;
  let speed = 1;
  let stationId = 0;
  let lineId = 0;
  let draft = null;
  let removing = 0;
  let bottleneck = 0;
  let lastFrame = 0;
  let accumulator = 0;
  let lastUpdate = 0;
  let lastSaved = 0;
  let eventUntil = 0;
  let lineKey = "";
  let editorKey = "";
  let districtKey = "";

  const map = new MetroMap(canvas, {
    begin: beginTrace,
    trace: traceStop,
    selectStation,
    selectLine,
  });

  function validCity(state) {
    if (!state || typeof state.name !== "string" || !Number.isFinite(state.time) ||
        ![0, 1, 2, 4].includes(state.speed) || !Number.isInteger(state.random) ||
        !state.stats || !state.tracks || !Array.isArray(state.areas) || !state.areas.length ||
        !Array.isArray(state.lines) || !Array.isArray(state.trains) || !Array.isArray(state.stations)) return false;
    const stations = new Set(state.stations.map((station) => station?.id));
    const lines = new Set(state.lines.map((line) => line?.id));
    return stations.size > 1 && stations.size === state.stations.length && lines.size === state.lines.length &&
      state.stations.every((station) => station && MetroWorld.types[station.type] && Array.isArray(station.queue) && Array.isArray(station.platforms)) &&
      state.areas.every((area) => area && MetroWorld.areas[area.kind] && Array.isArray(area.plan)) &&
      state.lines.every((line) => line && Array.isArray(line.stops) && line.stops.length >= 2 && line.stops.every((stop) => stations.has(stop))) &&
      state.trains.every((train) => train && lines.has(train.line) && stations.has(train.at) && (!train.to || stations.has(train.to)) && Array.isArray(train.passengers));
  }

  function save() {
    if (!sim) return;
    sim.state.camera = { ...map.view };
    sim.state.rate = speed;
    const { name, time } = sim.state;
    const saved = arcadeSaves.write(id, {
      version, summary: name + " · " + MetroWorld.dayLabel(time) + " " + MetroWorld.timeLabel(time), state: sim.state,
    });
    const indicator = byId("save-indicator");
    indicator.hidden = false;
    indicator.classList.toggle("storage-error", !saved);
    indicator.textContent = saved ? "已存本机" : "本机存档不可用";
    lastSaved = performance.now();
    if (saved && query.has("mode")) {
      query.delete("mode");
      history.replaceState(null, "", location.pathname + (query.size ? "?" + query.toString() : "") + location.hash);
    }
  }

  function launch(state) {
    sim = new MetroSimulation(state);
    speed = state.rate || state.speed || 1;
    shell.hidden = false;
    text("city-name", state.name);
    document.title = state.name + " · 城市地铁";
    map.attach(sim, state.camera);
    if (cityDialog.open) cityDialog.close();
    update();
    byId("save-indicator").hidden = false;
    lastSaved = performance.now();
    requestAnimationFrame(frame);
  }

  function announce(message) {
    eventUntil = performance.now() + 4800;
    const area = byId("event-message");
    area.textContent = message;
    area.hidden = false;
  }

  function showTab(name) {
    for (const button of tabs) {
      const active = button.dataset.tab === name;
      button.setAttribute("aria-pressed", String(active));
      byId(button.dataset.tab + "-pane").hidden = !active;
    }
  }

  function revealPanel(id) {
    if (matchMedia("(max-width: 720px)").matches) byId(id).scrollIntoView({ block: "nearest" });
  }

  function selectStation(value) {
    stationId = value;
    showTab("operations");
    update();
    if (!draft) revealPanel("station-info");
  }

  function selectLine(value) {
    lineId = value;
    showTab("lines");
    update();
  }

  function beginDraft(line = null) {
    if (draft || line?.pending) return;
    draft = {
      line: line?.id || 0,
      stops: line ? [...line.stops] : [],
      loop: line?.loop || false,
      color: line?.color || METRO_LINE_COLORS[(sim.state.nextLine - 1) % METRO_LINE_COLORS.length],
    };
    accumulator = 0;
    update();
    revealPanel("draft-actions");
  }

  function beginTrace(value) {
    if (!draft || draft.loop) return false;
    if (!draft.stops.length) {
      draft.stops.push(value);
      drawDraft();
      return true;
    }
    if (value === draft.stops.at(-1)) return true;
    if (value === draft.stops[0]) {
      draft.stops.reverse();
      drawDraft();
      return true;
    }
    return false;
  }

  function traceStop(value) {
    if (!draft || draft.loop || draft.stops.at(-1) === value) return;
    if (value === draft.stops[0] && draft.stops.length >= 3) {
      draft.loop = true;
    } else if (!draft.stops.includes(value)) {
      draft.stops.push(value);
    } else {
      return;
    }
    drawDraft();
  }

  function drawDraft() {
    if (!draft) return;
    const line = sim.lines.get(draft.line);
    const valid = !sim.validate(draft.stops, draft.loop);
    const limit = valid ? sim.platformLimit(draft.stops) : 0;
    text("draft-title", line ? "改线 · " + line.id + " 号线" : "新建线路");
    let summary = line ? "从端点延长，或重画线路。" : "从起点站拖过要停靠的站。";
    if (draft.stops.length) {
      summary = draft.stops.length + " 站 · " + (draft.loop ? "环线" : "往返线");
      if (!draft.loop && draft.stops.length >= 3) summary += " · 拖回起点可闭环";
      if (line && valid && limit < line.cars) summary += " · 确认后缩为 " + limit + " 编";
    }
    text("draft-summary", summary);
    byId("confirm-draft").disabled = !valid;
    byId("undo-stop").disabled = !draft.stops.length;
    byId("reset-draft").disabled = !draft.stops.length;
  }

  function finishDraft(confirmed) {
    if (!draft) return;
    if (confirmed) {
      const { stops, loop, line: existing } = draft;
      if (sim.validate(stops, loop)) return;
      if (existing) {
        const line = sim.lines.get(existing);
        const applied = sim.changeLine(line, {
          stops, loop, cars: Math.min(line.cars, sim.platformLimit(stops)), count: line.count,
        });
        if (!applied) return;
        selectLine(existing);
        announce(line.pending ? "列车将先在下一站清客，再切换线路。" : "线路已更新。");
      } else {
        const line = sim.addLine(stops, loop);
        selectLine(line.id);
        announce(line.id + " 号线已建成，配有 " + line.count + " 列 " + line.cars + " 编组列车。");
      }
    }
    draft = null;
    accumulator = 0;
    update();
    if (confirmed) save();
  }

  function describeDirection(station, group) {
    const line = sim.lines.get(group.plan.line);
    if (!line || !sim.lineActive(line)) return "";
    const index = line.stops.indexOf(station.id);
    const next = line.loop
      ? line.stops[(index + group.plan.dir + line.stops.length) % line.stops.length]
      : line.stops[index + group.plan.dir];
    const terminal = sim.stations.get(line.loop ? next : group.plan.dir > 0 ? line.stops.at(-1) : line.stops[0]);
    return terminal ? line.id + " 号线往 " + terminal.name : "";
  }

  function updateOperations(graph) {
    const state = sim.state;
    const { stats } = state;
    const finished = stats.delivered + stats.nearby + stats.lost;
    text("waiting-total", fmt(state.stations.reduce((sum, station) => sum + station.waiting, 0)));
    text("mean-wait", stats.boarded ? (stats.wait / stats.boarded).toFixed(1) + " 分" : "—");
    text("arrival-rate", finished ? Math.round(stats.delivered / finished * 100) + "%" : "—");
    text("trains-running", fmt(state.trains.length) + " 列车");
    text("outcomes", "已送达 " + fmt(stats.delivered) + " · 就近下车 " + fmt(stats.nearby) + " · 流失 " + fmt(stats.lost));
    const busiest = state.stations.reduce((largest, station) =>
      graph.services.get(station.id).active && station.waiting > (largest?.waiting || 0) ? station : largest, null);
    const button = byId("focus-bottleneck");
    bottleneck = busiest?.waiting >= 22 ? busiest.id : 0;
    button.hidden = !bottleneck;
    if (bottleneck) button.textContent = "拥堵 · " + busiest.name + " · " + fmt(busiest.waiting) + " 人候车";

    const station = sim.stations.get(stationId);
    byId("station-empty").hidden = Boolean(station);
    byId("station-info").hidden = !station;
    if (!station) return;
    const service = graph.services.get(station.id);
    text("station-name", station.name);
    text("station-state", service.active ? (service.active > 1 ? "换乘站" : "已运营") : service.drawn ? "待发车" : "待接入");
    text("station-kind", MetroWorld.types[station.type].label + " · 最长 " + MetroWorld.types[station.type].platform + " 节");
    text("station-waiting", fmt(station.waiting) + " 人");
    text("station-demand", fmt((sim.rates.get(station.id) || 0) * 60) + " 人/时");
    const age = station.queue.reduce((sum, group) => sum + (state.time - group.queued) * group.n, 0);
    text("station-age", station.waiting ? (age / station.waiting).toFixed(1) + " 分" : "—");

    const directions = new Map();
    const destinations = new Map();
    for (const group of station.queue) {
      if (group.plan) {
        const direction = describeDirection(station, group);
        if (direction) directions.set(direction, (directions.get(direction) || 0) + group.n);
      }
      if (group.target) {
        const name = sim.stations.get(group.target)?.name;
        if (name) destinations.set(name, (destinations.get(name) || 0) + group.n);
      }
    }
    const primaryDirection = [...directions.entries()].sort((a, b) => b[1] - a[1])[0];
    const primaryDestination = [...destinations.entries()].sort((a, b) => b[1] - a[1])[0];
    text("station-direction", primaryDirection
      ? primaryDirection[0] + " · " + fmt(primaryDirection[1]) + " 人候车"
      : service.active ? "目前无集中候车方向" : "接入运营线路后，乘客开始选路。");
    text("station-destination", primaryDestination ? "主要去向 · " + primaryDestination[0] + " · " + fmt(primaryDestination[1]) + " 人" : "");
    text("station-missed", station.missed >= 1 ? "近期满车未上 · " + fmt(station.missed) + " 人次" : "");
  }

  function updateLines() {
    const lines = sim.state.lines;
    if (!sim.lines.has(lineId)) lineId = lines[0]?.id || 0;
    const key = lines.map((line) => line.id).join(",") + ":" + lineId;
    if (key !== lineKey) {
      lineKey = key;
      byId("line-list").replaceChildren(...lines.map((line) => {
        const button = document.createElement("button");
        button.type = "button";
        button.style.setProperty("--line-color", line.color);
        button.textContent = line.id + " 号线";
        button.setAttribute("aria-pressed", String(line.id === lineId));
        button.addEventListener("click", () => selectLine(line.id));
        return button;
      }));
    }
    text("line-count", lines.length + " 条线路");
    const line = sim.lines.get(lineId);
    byId("line-info").hidden = !line;
    byId("lines-empty").hidden = Boolean(line);
    if (!line) return;
    const limit = sim.platformLimit(line.stops);
    const activeTrains = sim.state.trains.filter((train) => train.line === line.id);
    const delayed = activeTrains.filter((train) => train.wait).length;
    const full = activeTrains.filter((train) => train.load >= line.cars * METRO_CAR_CAPACITY).length;
    text("line-name", line.id + " 号线");
    text("line-operation", line.pending ? "调整中" : line.loop ? "环线" : "往返线");
    text("line-stops", line.stops.map((id) => sim.stations.get(id).name).join(" → ") + (line.loop ? " ↺" : ""));
    const traffic = activeTrains.length
      ? activeTrains.length + " 列在网 · " + full + " 列满载 · " + delayed + " 列等区间或站台"
      : "待发车";
    text("line-traffic", traffic);
    text("line-limit", "沿线站台最多 " + limit + " 节 · 每节载客 " + METRO_CAR_CAPACITY + " 人");
    carInput.max = String(limit);
    const config = [line.id, line.count, line.cars, limit, Boolean(line.pending)].join(":");
    if (config !== editorKey) {
      editorKey = config;
      trainInput.value = String(line.count);
      carInput.value = String(line.cars);
    }
    for (const element of [trainInput, carInput, byId("apply-line"), byId("remove-line"), byId("edit-line")]) {
      element.disabled = Boolean(line.pending || draft);
    }
  }

  function updateDistricts() {
    const state = sim.state;
    const area = state.proposal;
    text("district-count", state.areas.length + " 个城区");
    byId("district-proposal").hidden = !area;
    byId("district-next").hidden = Boolean(area);
    if (area) {
      text("district-name", area.name);
      text("district-estimate", MetroWorld.areas[area.kind].label + " · 预计 " + area.plan.length + " 站");
    } else {
      text("district-next", "下一片城区约在 " + Math.max(0, Math.ceil(state.nextProposal - state.time)) + " 游戏分钟后预告。");
    }
    const key = state.areas.map((item) => item.id + ":" + item.built).join(";");
    if (districtKey === key) return;
    districtKey = key;
    byId("district-list").replaceChildren(...[...state.areas].reverse().map((item) => {
      const row = document.createElement("li");
      const name = document.createElement("strong");
      const state = document.createElement("span");
      name.textContent = item.name;
      state.textContent = item.built + " / " + item.plan.length + " 站";
      row.append(name, state);
      return row;
    }));
  }

  function update() {
    const { state } = sim;
    text("day-label", MetroWorld.dayLabel(state.time));
    text("clock-label", MetroWorld.timeLabel(state.time));
    text("period-label", MetroWorld.period(state.time));
    text("map-caption", state.areas.length + " 个城区 · " + state.stations.length + " 个站");
    text("play-toggle", draft ? "建线暂停" : state.speed ? "暂停" : "开始运行");
    byId("play-toggle").disabled = Boolean(draft);
    for (const button of speedButtons) {
      button.disabled = Boolean(draft);
      button.setAttribute("aria-pressed", String(Number(button.dataset.speed) === speed));
    }
    byId("station-labels").setAttribute("aria-pressed", String(state.labels));
    byId("normal-map-actions").hidden = Boolean(draft);
    byId("draft-actions").hidden = !draft;
    text("map-hint", state.lines.length ? "点站看客流，点线路调度。" : "新建线路后，用手指拖过要停靠的站。");
    drawDraft();
    const graph = sim.getGraph();
    updateOperations(graph);
    updateLines();
    updateDistricts();
  }

  function playback(rate) {
    if (!sim || draft || cityDialog.open || removeDialog.open) return;
    if (rate) speed = rate;
    sim.state.speed = rate;
    accumulator = 0;
    update();
    save();
  }

  function frame(now) {
    const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, 0.14) : 0;
    lastFrame = now;
    const state = sim.state;
    const playing = state.speed && !draft && !removeDialog.open && !document.hidden;
    if (playing) {
      accumulator += elapsed * 5.2 * state.speed;
      const before = state.stations.length;
      while (accumulator >= METRO_STEP) {
        sim.step();
        accumulator -= METRO_STEP;
      }
      if (state.stations.length > before) announce(state.stations.at(-1).name + " 出现了。");
      if (now - lastSaved >= 5200) save();
    }
    if (now - lastUpdate >= 250) {
      update();
      lastUpdate = now;
    }
    if (now > eventUntil) byId("event-message").hidden = true;
    map.draw({ line: lineId, station: stationId, draft, proposal: !byId("districts-pane").hidden }, state.time + accumulator);
    requestAnimationFrame(frame);
  }

  for (const tab of tabs) tab.addEventListener("click", () => showTab(tab.dataset.tab));
  for (const button of speedButtons) button.addEventListener("click", () => playback(Number(button.dataset.speed)));
  byId("play-toggle").addEventListener("click", () => playback(sim.state.speed ? 0 : speed));
  byId("build-line").addEventListener("click", () => beginDraft());
  byId("edit-line").addEventListener("click", () => beginDraft(sim.lines.get(lineId)));
  byId("confirm-draft").addEventListener("click", () => finishDraft(true));
  byId("cancel-draft").addEventListener("click", () => finishDraft(false));
  byId("undo-stop").addEventListener("click", () => {
    if (draft.loop) draft.loop = false;
    else draft.stops.pop();
    drawDraft();
  });
  byId("reset-draft").addEventListener("click", () => {
    draft.stops = [];
    draft.loop = false;
    drawDraft();
  });
  byId("station-labels").addEventListener("click", () => {
    sim.state.labels = !sim.state.labels;
    update();
    save();
  });
  byId("zoom-in").addEventListener("click", () => map.zoom(1.3));
  byId("zoom-out").addEventListener("click", () => map.zoom(1 / 1.3));
  byId("fit-map").addEventListener("click", () => map.fit());
  byId("focus-bottleneck").addEventListener("click", () => {
    const station = sim.stations.get(bottleneck);
    if (!station) return;
    Object.assign(map.view, { x: station.x, y: station.y, zoom: Math.max(map.view.zoom, 0.55) });
    selectStation(station.id);
    revealPanel("metro-map");
  });
  byId("locate-district").addEventListener("click", () => {
    if (!sim.state.proposal) return;
    map.focusArea(sim.state.proposal);
    revealPanel("metro-map");
  });
  byId("open-district").addEventListener("click", () => {
    const area = MetroWorld.openArea(sim.state);
    if (!area) return;
    map.focusArea(area);
    update();
    save();
    announce(area.name + " 已开放，车站会随开发逐个出现。");
    revealPanel("metro-map");
  });
  byId("line-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const line = sim.lines.get(lineId);
    if (!line || draft) return;
    if (!sim.changeLine(line, { stops: line.stops, loop: line.loop, cars: carInput.valueAsNumber, count: trainInput.valueAsNumber })) return;
    update();
    save();
    announce(line.pending ? "编组将在车辆停靠后统一切换。" : "调度已应用。");
  });
  byId("remove-line").addEventListener("click", () => {
    removing = lineId;
    removeDialog.returnValue = "";
    removeDialog.showModal();
  });
  removeDialog.addEventListener("close", () => {
    const line = sim.lines.get(removing);
    if (removeDialog.returnValue === "remove" && line && sim.changeLine(line, { remove: true })) {
      update();
      save();
      announce(line.pending ? "撤线处理中，在途列车会先停靠下一站。" : "线路已撤下。");
    }
  });
  byId("city-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const seed = window.crypto.getRandomValues(new Uint32Array(1))[0];
    launch(MetroWorld.createCity(byId("city-input").value, seed));
    save();
  });
  cityDialog.addEventListener("cancel", (event) => event.preventDefault());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && draft && !removeDialog.open) finishDraft(false);
    if (event.code !== "Space" || event.repeat || !sim || draft || removeDialog.open ||
        event.target.closest("input, button, a, select, textarea")) return;
    event.preventDefault();
    playback(sim.state.speed ? 0 : speed);
  });
  document.addEventListener("visibilitychange", () => {
    lastFrame = 0;
    accumulator = 0;
    if (document.hidden) save();
  });
  window.addEventListener("pagehide", save);

  const record = arcadeSaves.read(id);
  if (query.get("mode") !== "new" && record?.version === version && validCity(record.state)) {
    launch(record.state);
  } else {
    if (query.get("mode") === "resume") text("setup-title", "创建新的城市存档");
    cityDialog.showModal();
  }
})();
