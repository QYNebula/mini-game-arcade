(() => {
  const id = "metro";
  const version = 2;
  const query = new URLSearchParams(window.location.search);
  const byId = (name) => document.getElementById(name);
  const text = (name, value) => { byId(name).textContent = value; };
  const canvas = byId("metro-map");
  const shell = byId("game-shell");
  const cityDialog = byId("city-dialog");
  const removeDialog = byId("remove-dialog");
  const fleetEditor = byId("fleet-editor");
  const platformInput = byId("platform-length");
  const speedButtons = [...document.querySelectorAll("[data-speed]")];
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const numbers = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
  const fmt = (value) => numbers.format(value);

  let sim;
  let speed = 1;
  let stationId = 0;
  let lineId = 0;
  let draft = null;
  let removing = 0;
  let removingBranch = false;
  let bottleneck = 0;
  let lastFrame = 0;
  let accumulator = 0;
  let lastUpdate = 0;
  let lastSaved = 0;
  let eventUntil = 0;
  let lineKey = "";
  let editorKey = "";
  let districtKey = "";
  let facilityKey = "";

  const map = new MetroMap(canvas, {
    begin: beginTrace,
    trace: traceStop,
    selectStation,
    selectLine,
  });

  function validCity(state, schema) {
    if (!state || typeof state.name !== "string" || !Number.isFinite(state.time) ||
        ![0, 1, 2, 4].includes(state.speed) || !Number.isInteger(state.random) ||
        !state.stats || !state.tracks || !Array.isArray(state.areas) || !state.areas.length ||
        !Array.isArray(state.lines) || !Array.isArray(state.trains) || !Array.isArray(state.stations)) return false;
    const stations = new Set(state.stations.map((station) => station?.id));
    const lines = new Set(state.lines.map((line) => line?.id));
    return stations.size > 1 && stations.size === state.stations.length && lines.size === state.lines.length &&
      state.stations.every((station) => station && MetroWorld.types[station.type] && Array.isArray(station.queue) &&
        (schema === 1 ? Array.isArray(station.platforms) : Number.isSafeInteger(station.length) &&
          Number.isSafeInteger(station.tracks) && station.platforms)) &&
      state.areas.every((area) => area && MetroWorld.areas[area.kind] && Array.isArray(area.plan)) &&
      state.lines.every((line) => line && Array.isArray(line.stops) && line.stops.length >= 2 && line.stops.every((stop) => stations.has(stop)) &&
        (schema === 1 || Array.isArray(line.fleet?.main) && Array.isArray(line.fleet?.branch))) &&
      state.trains.every((train) => train && lines.has(train.line) && stations.has(train.at) && (!train.to || stations.has(train.to)) &&
        Array.isArray(train.passengers) && (schema === 1 || Number.isSafeInteger(train.cars) && MetroNetwork.keys.includes(train.service)));
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

  function beginDraft(line = null, service = "main") {
    if (draft || line?.pending) return;
    const branch = service === "branch" ? line.branch : null;
    draft = {
      line: line?.id || 0,
      service,
      stops: service === "main" ? [...(line?.stops || [])] : branch ? [branch.fork, ...branch.tail] : [],
      loop: service === "main" && Boolean(line?.loop),
      leading: false,
      color: line?.color || METRO_LINE_COLORS[(sim.state.nextLine - 1) % METRO_LINE_COLORS.length],
    };
    byId("draft-expand-tracks").checked = false;
    byId("draft-length-choice").value = "";
    accumulator = 0;
    update();
    revealPanel("metro-map");
  }

  function beginTrace(value) {
    if (!draft || draft.loop) return false;
    draft.leading = false;
    if (!draft.stops.length) {
      const line = sim.lines.get(draft.line);
      if (draft.service === "branch" && !line.stops.slice(0, -1).includes(value)) return false;
      draft.stops.push(value);
      drawDraft();
      return true;
    }
    if (value === draft.stops.at(-1)) return true;
    if (value === draft.stops[0] && draft.service === "main") {
      draft.leading = true;
      drawDraft();
      return true;
    }
    return false;
  }

  function traceStop(value) {
    if (!draft || draft.loop) return;
    const end = draft.leading ? 0 : -1;
    if (draft.stops.at(end) === value) return;
    const line = sim.lines.get(draft.line);
    const otherEnd = draft.leading ? -1 : 0;
    if (draft.service === "branch" && line.stops.includes(value)) return;
    if (draft.service === "main" && value === draft.stops.at(otherEnd) && draft.stops.length >= 3) {
      draft.loop = true;
    } else if (!draft.stops.includes(value)) {
      if (draft.leading) draft.stops.unshift(value);
      else draft.stops.push(value);
    } else {
      return;
    }
    drawDraft();
  }

  function draftConfig() {
    const line = sim.lines.get(draft.line);
    if (draft.service === "branch") {
      return {
        name: line.name, stops: line.stops, loop: false,
        branch: { fork: draft.stops[0], tail: draft.stops.slice(1) },
        fleet: { main: line.fleet.main, branch: line.branch ? line.fleet.branch : [{ cars: 4, count: 1 }] },
      };
    }
    return {
      name: line?.name || "", stops: draft.stops, loop: draft.loop, branch: line?.branch || null,
      fleet: line?.fleet || { main: [{ cars: 4, count: 2 }], branch: [] },
    };
  }

  function drawDraft() {
    if (!draft) return;
    const line = sim.lines.get(draft.line);
    const branch = draft.service === "branch";
    const ready = draft.stops.length >= (draft.loop ? 3 : 2);
    const checked = ready ? sim.checkLayout(draftConfig(), line) : null;
    const tracks = checked?.tracks || [];
    const length = checked?.length || [];
    text("draft-title", branch ? (line.branch ? "改支线" : "添加支线") + " · " + MetroNetwork.name(line) :
      line ? "改线 · " + MetroNetwork.name(line) : "新建线路");
    let summary = branch ? "从主线上的分岔站，拖到支线要停靠的车站。" :
      line ? "从端点延长，或重画线路。" : "从起点站拖过要停靠的站。";
    if (draft.stops.length) {
      summary = branch ? "分岔站 " + sim.stations.get(draft.stops[0]).name + " · 新接 " + (draft.stops.length - 1) + " 站" :
        draft.stops.length + " 站 · " + (draft.loop ? "环线" : "往返线");
      if (!branch && !draft.loop && draft.stops.length >= 3) summary += " · 拖回起点可闭环";
    }
    text("draft-summary", checked?.error || summary);
    byId("draft-facilities").hidden = !tracks.length && !length.length;
    byId("draft-tracks").hidden = !tracks.length;
    byId("draft-length").hidden = !length.length;
    text("draft-track-note", tracks.map(({ station, desired }) => station.name + " 缺 " + (desired - station.tracks) + " 轨").join("、"));
    text("draft-length-note", length.map(({ station, desired }) => station.name + " 需 " + desired + " 节").join("、"));
    byId("confirm-draft").disabled = !ready || Boolean(checked?.error) ||
      Boolean(tracks.length && !byId("draft-expand-tracks").checked) ||
      Boolean(length.length && !byId("draft-length-choice").value);
    byId("undo-stop").disabled = !draft.stops.length;
    byId("reset-draft").disabled = !draft.stops.length;
  }

  function finishDraft(confirmed) {
    if (!draft) return;
    if (confirmed) {
      if (byId("confirm-draft").disabled) return;
      const old = sim.lines.get(draft.line);
      const result = sim.configure(old, draftConfig(), {
        tracks: byId("draft-expand-tracks").checked, length: byId("draft-length-choice").value,
      });
      if (result.error) {
        text("draft-summary", result.error);
        return;
      }
      const line = result.line;
      const name = MetroNetwork.name(line, draft.service);
      const message = line.pending ? "受影响的列车将在下一站清客，再切换走向。" :
        old && draft.service === "main" ? name + "已更新。" : name + "已接入。";
      draft = null;
      selectLine(line.id);
      announce(message);
    }
    draft = null;
    accumulator = 0;
    update();
    if (confirmed) save();
  }

  function describeDirection(station, group) {
    const line = sim.lines.get(group.plan.line);
    if (!line) return "";
    const route = MetroNetwork.route(line, group.plan.service || "main");
    if (!sim.routeActive(line, route)) return "";
    const index = route.stops.indexOf(station.id);
    const next = route.stops[(index + group.plan.dir + route.stops.length) % route.stops.length];
    const terminal = sim.stations.get(route.loop ? next : group.plan.dir > 0 ? route.stops.at(-1) : route.stops[0]);
    return terminal ? MetroNetwork.name(line, route.id) + "往 " + terminal.name : "";
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
    text("station-kind", MetroWorld.types[station.type].label + " · 最长 " + station.length + " 节");
    const occupancy = sim.reservations().get(station.id) || 0;
    text("station-tracks", station.tracks + " 条轨道 · " + occupancy + " / " + station.tracks / 2 + " 条线路已用");
    const facility = station.id + ":" + station.length;
    if (facility !== facilityKey) {
      facilityKey = facility;
      platformInput.min = String(station.length + 1);
      platformInput.value = String(station.length + 2);
    }
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

  function addFleetRow(section, cars, count) {
    const row = document.createElement("div");
    row.className = "fleet-row";
    for (const [field, caption, value, min] of [
      ["cars", "每列车厢", cars, 1], ["count", "列车数量", count, 0],
    ]) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      label.textContent = caption;
      input.type = "number";
      input.inputMode = "numeric";
      input.dataset.field = field;
      input.value = String(value);
      input.min = String(min);
      input.step = "1";
      input.max = field === "cars" ? section.dataset.limit : String(METRO_MAX_TRAINS);
      input.required = true;
      label.append(input);
      row.append(label);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-secondary";
    remove.textContent = "−";
    remove.setAttribute("aria-label", "移除这组列车");
    remove.addEventListener("click", () => row.remove());
    row.append(remove);
    section.insertBefore(row, section.querySelector(".add-fleet"));
  }

  function renderFleet(line) {
    byId("line-title").value = line.name;
    byId("line-title").placeholder = line.id + " 号线";
    byId("line-error").hidden = true;
    fleetEditor.replaceChildren(...MetroNetwork.routes(line).map((route) => {
      const section = document.createElement("section");
      section.className = "fleet-section";
      section.dataset.service = route.id;
      section.dataset.limit = String(sim.platformLimit(route.stops));
      const title = document.createElement("h3");
      title.textContent = route.loop ? "环线编组" : MetroNetwork.name(line, route.id) + " · 往 " + sim.stations.get(route.stops.at(-1)).name;
      const summary = document.createElement("p");
      summary.className = "muted fleet-limit";
      const add = document.createElement("button");
      add.type = "button";
      add.className = "button button-plain add-fleet";
      add.textContent = "＋ 添加编组";
      add.addEventListener("click", () => addFleetRow(section, Math.min(4, Number(section.dataset.limit)), 1));
      section.append(title, summary, add);
      const groups = route.fleet.length ? route.fleet : [{ cars: Math.min(4, Number(section.dataset.limit)), count: 0 }];
      for (const group of groups) addFleetRow(section, group.cars, group.count);
      return section;
    }));
  }

  function updateLines() {
    const lines = sim.state.lines;
    if (!sim.lines.has(lineId)) lineId = lines[0]?.id || 0;
    const key = JSON.stringify([lineId, lines.map(({ id, name }) => [id, name])]);
    if (key !== lineKey) {
      lineKey = key;
      byId("line-list").replaceChildren(...lines.map((line) => {
        const button = document.createElement("button");
        button.type = "button";
        button.style.setProperty("--line-color", line.color);
        button.textContent = MetroNetwork.name(line);
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
    const activeTrains = sim.state.trains.filter((train) => train.line === line.id);
    const delayed = activeTrains.filter((train) => train.wait).length;
    const full = activeTrains.filter((train) => train.load >= train.cars * METRO_CAR_CAPACITY).length;
    text("line-name", MetroNetwork.name(line));
    text("line-operation", line.pending ? "调整中" : line.loop ? "环线" : line.branch ? "带直通支线" : "往返线");
    text("line-stops", MetroNetwork.routes(line).map((route) => {
      const path = route.stops.map((id) => sim.stations.get(id).name).join(" → ");
      return route.id === "branch" ? MetroNetwork.name(line, "branch") + " · " + path : path + (route.loop ? " ↺" : "");
    }).join("\n"));
    const traffic = activeTrains.length
      ? activeTrains.length + " 列在网 · " + full + " 列满载 · " + delayed + " 列等区间或站台"
      : "待发车";
    text("line-traffic", traffic);
    const config = JSON.stringify([line.id, line.name, line.stops, line.branch, line.loop, line.fleet, Boolean(line.pending)]);
    if (config !== editorKey) {
      editorKey = config;
      renderFleet(line);
    }
    for (const section of fleetEditor.querySelectorAll("[data-service]")) {
      const route = MetroNetwork.route(line, section.dataset.service);
      const limit = sim.platformLimit(route.stops);
      section.dataset.limit = String(limit);
      section.querySelector(".fleet-limit").textContent = "沿途最多 " + limit + " 节 · 每节载客 " + METRO_CAR_CAPACITY + " 人";
      for (const input of section.querySelectorAll('[data-field="cars"]')) input.max = String(limit);
    }
    const controls = byId("line-form").querySelectorAll("input, button");
    for (const element of controls) {
      element.disabled = Boolean(line.pending || draft);
    }
    text("edit-branch", line.branch ? "改支线" : "添加支线");
    byId("edit-branch").disabled = Boolean(line.loop || line.pending || draft);
    byId("edit-branch").title = line.loop ? "往返线路可以添加支线" : "";
    byId("remove-branch").hidden = !line.branch;
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

  function updateFinance() {
    const ledger = sim.state.finance;
    const day = ledger.today;
    const total = ledger.income - ledger.running;
    const amounts = {
      "income-today": day.income, "running-today": day.running, "profit-today": day.income - day.running,
      "profit-total": total, "building-total": ledger.building, "balance-total": total - ledger.building,
    };
    text("finance-day", MetroWorld.dayLabel(sim.state.time));
    for (const [id, value] of Object.entries(amounts)) {
      text(id, (value < 0 ? "−" : "") + "¥" + fmt(Math.abs(value)));
      byId(id).classList.toggle("negative", value < 0);
    }
    text("finance-rule", "固定票价 ¥" + METRO_FARE + " / 趟。运行费按每列车的实际编组和行驶里程计入。");
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
    updateFinance();
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
      accumulator += elapsed * METRO_MINUTES_PER_SECOND * state.speed;
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
  byId("edit-branch").addEventListener("click", () => beginDraft(sim.lines.get(lineId), "branch"));
  byId("confirm-draft").addEventListener("click", () => finishDraft(true));
  byId("cancel-draft").addEventListener("click", () => finishDraft(false));
  byId("draft-expand-tracks").addEventListener("change", drawDraft);
  byId("draft-length-choice").addEventListener("change", drawDraft);
  byId("undo-stop").addEventListener("click", () => {
    if (draft.loop) draft.loop = false;
    else if (draft.leading) draft.stops.shift();
    else draft.stops.pop();
    drawDraft();
  });
  byId("reset-draft").addEventListener("click", () => {
    draft.stops = [];
    draft.loop = false;
    draft.leading = false;
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
  byId("platform-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const station = sim.stations.get(stationId);
    if (!sim.expand(station, platformInput.valueAsNumber, station.tracks)) return;
    update();
    save();
    announce(station.name + "现在可停靠 " + station.length + " 节编组。");
  });
  byId("expand-tracks").addEventListener("click", () => {
    const station = sim.stations.get(stationId);
    if (!sim.expand(station, station.length, station.tracks + 2)) return;
    update();
    save();
    announce(station.name + "增加了 2 条轨道。");
  });
  byId("line-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const line = sim.lines.get(lineId);
    if (!line || draft) return;
    const fleet = { main: [], branch: [] };
    for (const section of fleetEditor.querySelectorAll("[data-service]")) {
      fleet[section.dataset.service] = [...section.querySelectorAll(".fleet-row")].map((row) => ({
        cars: row.querySelector('[data-field="cars"]').valueAsNumber,
        count: row.querySelector('[data-field="count"]').valueAsNumber,
      }));
    }
    const result = sim.configure(line, {
      name: byId("line-title").value, stops: line.stops, loop: line.loop, branch: line.branch, fleet,
    });
    if (result.error) {
      text("line-error", result.error);
      byId("line-error").hidden = false;
      return;
    }
    byId("line-error").hidden = true;
    update();
    save();
    announce("调度已应用，在途撤下的列车会先前往下一站。");
  });
  function requestRemoval(branch) {
    removing = lineId;
    removingBranch = branch;
    removeDialog.returnValue = "";
    text("remove-title", branch ? "撤下这条支线？" : "撤下这条线路？");
    removeDialog.showModal();
  }
  byId("remove-line").addEventListener("click", () => requestRemoval(false));
  byId("remove-branch").addEventListener("click", () => requestRemoval(true));
  removeDialog.addEventListener("close", () => {
    const line = sim.lines.get(removing);
    if (removeDialog.returnValue !== "remove" || !line) return;
    const result = sim.configure(line, removingBranch
      ? { name: line.name, stops: line.stops, loop: line.loop, branch: null, fleet: { main: line.fleet.main, branch: [] } }
      : { remove: true });
    if (result.error) return announce(result.error);
    update();
    save();
    announce(line.pending ? "受影响的列车会先停靠下一站。" : removingBranch ? "支线已撤下。" : "线路已撤下。");
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
  if (query.get("mode") !== "new" && [1, version].includes(record?.version) && validCity(record.state, record.version)) {
    const state = record.version === 1 ? MetroNetwork.migrate(record.state) : record.state;
    launch(state);
    if (record.version === 1) save();
  } else {
    if (query.get("mode") === "resume") text("setup-title", "创建新的城市存档");
    cityDialog.showModal();
  }
})();
