(() => {
  const R = globalThis.GomokuRules;
  const Computer = globalThis.GomokuComputer;
  const Rooms = globalThis.arcadeRooms;
  const endpoint = globalThis.arcadeRoomEndpoint;
  const saveId = "gomoku";
  const roomKey = "mini-game-arcade:room:gomoku";
  const center = Math.floor(R.area / 2);
  const byId = (id) => document.getElementById(id);
  const board = byId("board");
  const panels = ["modes", "solo-setup", "online-setup", "room-panel", "play-panel"];
  const nameOf = (color) => color === R.black ? "黑棋" : "白棋";
  const nameOfLevel = (level) => level === "advanced" ? "进阶" : "普通";
  let panel;
  let solo;
  let match;
  let selected = -1;
  let focusPoint = center;
  let computerTimer;
  let savedOkay = true;
  let session;
  let connection;
  let room;
  let connected = false;
  let connecting = false;
  let requestPending = false;
  let movePending = false;
  let clockOffset = 0;
  let confirmation;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(text, className, action) {
    const node = element("button", className, text);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }

  function show(id, focus = true) {
    if (panel === id) return;
    panel = id;
    for (const key of panels) byId(key).hidden = key !== id;
    byId("go-modes").hidden = id === "modes";
    if (focus) byId(id).querySelector("h1[tabindex]")?.focus({ preventScroll: true });
  }

  function route(key, value) {
    const url = new URL(location.href);
    url.search = "";
    if (key && value) url.searchParams.set(key, value);
    try { history.replaceState({}, "", url); } catch { /* File URLs may restrict history changes. */ }
  }

  function ask(title, explanation, label, action) {
    byId("confirm-title").textContent = title;
    byId("confirm-detail").textContent = explanation;
    byId("confirm-action").textContent = label;
    confirmation = action;
    byId("confirm-dialog").returnValue = "";
    byId("confirm-dialog").showModal();
  }

  function readSave() {
    const save = arcadeSaves.read(saveId);
    const entry = save?.state;
    if (save?.version !== 1 || ![R.black, R.white].includes(entry?.human) ||
        !["normal", "advanced"].includes(entry?.level)) return null;
    const game = R.restore(entry.moves);
    return game ? { human: entry.human, level: entry.level, game } : null;
  }

  function save() {
    const result = match.result;
    const score = result ? (result.winner ? nameOf(result.winner) + "获胜" : "和棋") : "轮到" + nameOf(match.turn);
    savedOkay = arcadeSaves.write(saveId, {
      version: 1, summary: match.moves.length + " 手 · " + score,
      state: { human: solo.human, level: solo.level, moves: match.moves },
    });
    if (savedOkay) route("mode", "resume");
  }

  function stopComputer() {
    clearTimeout(computerTimer);
    computerTimer = undefined;
  }

  function scheduleComputer() {
    stopComputer();
    if (!solo || match.result || match.turn === solo.human) return;
    const current = match;
    computerTimer = setTimeout(() => {
      if (!solo || match !== current) return;
      const position = Computer.choose(match, solo.level);
      const next = R.play(match, position);
      if (next) playSolo(next);
    }, 380);
  }

  function playSolo(next) {
    match = next;
    selected = -1;
    save();
    drawMatch();
    scheduleComputer();
  }

  function startSolo(human, level, game = R.fresh()) {
    disconnect();
    solo = { human, level };
    room = null;
    match = game;
    focusPoint = center;
    show("play-panel");
    playSolo(game);
  }

  function soloSetup() {
    show("solo-setup");
    const existing = readSave();
    byId("resume-solo").hidden = !existing;
    if (existing) {
      const form = byId("solo-form");
      form.elements.color.value = existing.human;
      form.elements.difficulty.value = existing.level;
    }
  }

  function lastHumanMove() {
    for (let index = match.moves.length - 1; index >= 0; index--) {
      if (index % 2 + 1 === solo.human) return index;
    }
    return -1;
  }

  function undo() {
    if (!solo) return;
    const index = lastHumanMove();
    if (index < 0) return;
    stopComputer();
    focusPoint = match.moves[index];
    playSolo(R.restore(match.moves.slice(0, index)));
  }

  function getSession() {
    try {
      const value = JSON.parse(localStorage.getItem(roomKey));
      if (Rooms.normalizeCode(value?.code) && typeof value.token === "string") {
        return { code: value.code, token: value.token };
      }
    } catch { /* The room remains usable in the current tab. */ }
    return null;
  }

  function setSession(next) {
    session = next;
    try {
      if (session) localStorage.setItem(roomKey, JSON.stringify(session));
      else localStorage.removeItem(roomKey);
    } catch { /* The room remains usable in the current tab. */ }
  }

  function disconnect() {
    connection?.close();
    connection = null;
    connected = false;
    connecting = false;
    movePending = false;
  }

  function onlineMessage(text, error = false) {
    const node = byId("online-message");
    node.textContent = text;
    node.hidden = !text;
    node.classList.toggle("error", error);
  }

  function setupControls() {
    const resume = getSession();
    const unavailable = !endpoint || requestPending || connecting;
    byId("resume-room").hidden = !resume;
    byId("resume-room").disabled = unavailable;
    byId("create-room").disabled = unavailable;
    byId("join-room").disabled = unavailable;
  }

  function onlineSetup(code = "", message = "", error = false) {
    show("online-setup");
    byId("room-code").value = code;
    setupControls();
    onlineMessage(message || (!endpoint ? "联机服务尚未上线。可以先玩单人对弈。" : ""), error);
  }

  function receive(data) {
    if (data.type === "closed") {
      const lastCode = session?.code || "";
      disconnect();
      setSession(null);
      room = null;
      match = null;
      route(null, null);
      onlineSetup(lastCode, data.message, true);
      return;
    }
    if (data.type === "offline") {
      connected = false;
      movePending = false;
      if (panel === "play-panel") drawMatch();
      else if (panel === "room-panel") drawRoom();
      else onlineMessage("正在重连房间…");
      return;
    }
    if ((data.type !== "state" && data.type !== "error") || !data.room) return;
    const same = data.room.match?.id === room?.match?.id && data.room.match?.revision === room?.match?.revision;
    room = data.room;
    connected = true;
    connecting = false;
    movePending = false;
    clockOffset = room.clock - Date.now();
    if (!same) selected = -1;
    if (room.phase === "lobby") {
      match = null;
      show("room-panel");
      drawRoom(data.type === "error" ? data.message : "");
      return;
    }
    if (!same || !match) match = R.restore(room.match.moves);
    show("play-panel");
    drawMatch(data.type === "error" ? data.message : "");
  }

  function openSession(next) {
    stopComputer();
    disconnect();
    solo = null;
    match = null;
    room = null;
    selected = -1;
    byId("invite-url").hidden = true;
    setSession(next);
    route("room", next.code);
    connecting = true;
    onlineSetup(next.code, "正在连接房间…");
    connection = Rooms.connect(endpoint, saveId, next, receive);
  }

  async function enterRoom(code) {
    if (!endpoint || requestPending || connecting) return;
    requestPending = true;
    setupControls();
    onlineMessage(code ? "正在加入房间…" : "正在创建房间…");
    try {
      const next = code ? await Rooms.join(endpoint, saveId, code) : await Rooms.create(endpoint, saveId);
      if (panel === "online-setup") openSession(next);
    } catch (error) {
      if (panel === "online-setup") onlineMessage(error.status ? error.message : "房间服务暂时连不上，请稍后再试。", true);
    } finally {
      requestPending = false;
      setupControls();
    }
  }

  function send(action) {
    if (connected && connection?.send(action)) return true;
    if (panel === "room-panel") drawRoom("正在连接，请稍后再试。");
    if (panel === "play-panel") drawMatch("正在连接，请稍后再试。");
    return false;
  }

  function boardPoint(position) {
    return "第 " + (Math.floor(position / R.size) + 1) + " 行，第 " + (position % R.size + 1) + " 列";
  }

  function canMove() {
    if (!match || match.result) return false;
    if (solo) return match.turn === solo.human;
    return connected && !movePending && room.phase === "playing" && !room.pauseUntil &&
      room.seats[match.turn - 1]?.id === room.you;
  }

  function choosePoint(position) {
    focusPoint = position;
    if (canMove() && !match.board[position]) selected = position;
    paintBoard();
    drawStatus();
  }

  function confirmMove() {
    if (!canMove() || selected < 0) return;
    if (solo) {
      const next = R.play(match, selected);
      if (next) playSolo(next);
      return;
    }
    if (send({ type: "move", position: selected, match: room.match.id, revision: room.match.revision })) {
      movePending = true;
      drawStatus();
    }
  }

  const points = [];
  for (let row = 0; row < R.size; row++) {
    const line = element("div", "board-row");
    line.setAttribute("role", "row");
    for (let column = 0; column < R.size; column++) {
      const position = R.point(row, column);
      const control = button("", "point", () => choosePoint(position));
      control.setAttribute("role", "gridcell");
      if (row === 7 && column === 7 || [3, 11].includes(row) && [3, 11].includes(column)) control.classList.add("star");
      control.dataset.position = position;
      line.append(control);
      points.push(control);
    }
    board.append(line);
  }

  function paintBoard() {
    if (!match) return;
    const moving = canMove();
    const winning = match.result?.line || [];
    const last = match.moves.at(-1);
    for (const [position, point] of points.entries()) {
      const value = match.board[position];
      const preview = position === selected && !value && !match.result;
      point.classList.toggle("last", position === last);
      point.classList.toggle("winning", winning.includes(position));
      point.tabIndex = position === focusPoint ? 0 : -1;
      if (value) point.dataset.piece = value;
      else delete point.dataset.piece;
      if (preview) point.dataset.ghost = match.turn;
      else delete point.dataset.ghost;
      point.setAttribute("aria-label", boardPoint(position) + "，" + (value ? nameOf(value) : preview ? "预落点" : "空位"));
      point.setAttribute("aria-disabled", String(Boolean(value || !moving)));
      point.setAttribute("aria-selected", String(preview));
    }
  }

  function stone(color) {
    return element("span", "piece-icon " + (color === R.black ? "black" : "white"));
  }

  function drawPlayers() {
    const cards = [R.black, R.white].map((color) => {
      const card = element("div", "player");
      card.classList.toggle("current", match.turn === color && !match.result && (solo || room.phase === "playing"));
      const unit = element("div");
      const seat = room?.seats[color - 1];
      let info;
      if (solo) info = solo.human === color ? "你" : "电脑 · " + nameOfLevel(solo.level);
      else if (seat?.kind === "computer") info = "电脑 · " + nameOfLevel(seat.level);
      else if (seat?.id === room.you) info = "你";
      else info = seat?.name || "已离开";
      unit.append(element("strong", "", nameOf(color)), element("small", "", info));
      card.append(stone(color), unit);
      return card;
    });
    byId("players").replaceChildren(...cards);
  }

  function drawStatus(error = "") {
    if (!match) return;
    let message = error;
    if (!message) {
      if (!solo && !connected) message = "连接中断，正在重连…";
      else if (!solo && room.pauseUntil) message = "玩家掉线，本局暂停。";
      else if (!solo && room.match.resigned !== null) message = nameOf(room.match.resigned + 1) + "认输。" + nameOf(R.other(room.match.resigned + 1)) + "获胜。";
      else if (match.result?.winner === 0) message = "和棋";
      else if (match.result) message = nameOf(match.result.winner) + "连成 " + match.result.line.length + " 子，获胜。";
      else if (movePending) message = "正在同步落子…";
      else if (canMove()) message = selected < 0 ? "轮到你。点选交点，再确认落子。" : "已选择" + boardPoint(selected) + "。";
      else if (solo || room.seats[match.turn - 1]?.kind === "computer") message = "电脑正在思考…";
      else message = "等待" + nameOf(match.turn) + "落子。";
    }
    const status = byId("match-status");
    if (status.textContent !== message) status.textContent = message;
    status.parentElement.classList.toggle("error", Boolean(error));
    byId("confirm-move").disabled = selected < 0 || !canMove();
    byId("confirm-move").hidden = Boolean(match.result || room?.phase === "finished");
    const undoMove = byId("undo-move");
    undoMove.hidden = !solo;
    undoMove.disabled = !solo || lastHumanMove() < 0;
    const newRound = byId("new-round");
    newRound.hidden = solo ? !match.result : room.phase !== "finished" || room.you !== room.host;
    newRound.disabled = !solo && !connected;
    const leave = byId("leave-match");
    leave.hidden = Boolean(solo);
    leave.disabled = !connected;
    leave.textContent = !solo && room.phase === "playing" ? "认输并离开" : "离开房间";
    updateCountdown();
  }

  function drawMatch(error = "") {
    if (!match) return;
    byId("mode-name").textContent = solo
      ? "单人对弈 · " + nameOfLevel(solo.level)
      : "多人联机 · " + room.code;
    byId("move-count").textContent = match.moves.length + " 手" + (solo && !savedOkay ? " · 本机未保存" : "");
    paintBoard();
    drawPlayers();
    drawStatus(error);
  }

  function updateCountdown() {
    const remaining = byId("pause-remaining");
    let text = "";
    if (panel === "play-panel" && room?.pauseUntil && connected) {
      const seconds = Math.ceil(Math.max(0, room.pauseUntil - Date.now() - clockOffset) / 1000);
      text = " 剩余 " + Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
    }
    if (remaining.textContent !== text) remaining.textContent = text;
  }

  function drawRoom(error = "") {
    byId("show-code").textContent = room.code;
    const host = room.you === room.host;
    const seats = room.seats.map((seat, index) => {
      const name = nameOf(index + 1);
      const card = element("section", seat ? "seat" : "seat empty");
      const title = element("h2", "seat-title");
      title.append(stone(index + 1), name);
      card.append(title);
      if (seat?.kind === "human") {
        const labels = [seat.name];
        if (seat.id === room.you) labels.push("你");
        if (seat.id === room.host) labels.push("房主");
        if (!seat.online) labels.push("暂离");
        card.append(element("p", "", labels.join(" · ")));
      } else {
        card.append(element("p", "", seat ? "电脑 · " + nameOfLevel(seat.level) : "空位"));
        const actions = element("div", "actions");
        if (seat && host) {
          const swap = seat.level === "normal" ? "advanced" : "normal";
          actions.append(button("改为" + nameOfLevel(swap), "secondary", () => send({ type: "computer", seat: index, level: swap })),
            button("移除电脑", "quiet", () => send({ type: "computer", seat: index, level: null })));
        } else if (!seat) {
          actions.append(button("坐" + name, "secondary", () => send({ type: "seat", seat: index })));
          if (host) actions.append(button("添加电脑", "quiet", () => send({ type: "computer", seat: index, level: "normal" })));
        }
        for (const control of actions.querySelectorAll("button")) control.disabled = !connected;
        card.append(actions);
      }
      return card;
    });
    byId("seats").replaceChildren(...seats);
    const start = byId("start-room");
    start.hidden = !host;
    start.disabled = !connected || !room.ready;
    byId("leave-room").disabled = !connected;
    const status = byId("room-message");
    status.textContent = error || (!connected ? "正在重连房间…" :
      room.notice || (room.ready ? (host ? "两边就绪，可以开始。" : "两边就绪，等待房主开始。") : "等两边都就座后开始。"));
    status.classList.toggle("error", Boolean(error));
  }

  function modes() {
    stopComputer();
    disconnect();
    solo = null;
    room = null;
    match = null;
    selected = -1;
    route(null, null);
    show("modes");
    byId("select-solo").focus({ preventScroll: true });
  }

  function selectOnline() {
    if (location.protocol === "file:" && endpoint) {
      location.assign("https://qynebula.github.io/mini-game-arcade/games/gomoku/?mode=online");
      return;
    }
    onlineSetup();
  }

  board.addEventListener("keydown", (event) => {
    const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const position = Number(event.target.dataset.position);
    if (!Number.isInteger(position)) return;
    const next = R.point(Math.floor(position / R.size) + delta[0], position % R.size + delta[1]);
    if (next < 0) return;
    points[focusPoint].tabIndex = -1;
    focusPoint = next;
    points[next].tabIndex = 0;
    points[next].focus();
  });

  byId("go-modes").addEventListener("click", modes);
  byId("select-solo").addEventListener("click", soloSetup);
  byId("select-online").addEventListener("click", selectOnline);
  byId("show-rules").addEventListener("click", () => byId("rules-dialog").showModal());
  byId("confirm-dialog").addEventListener("close", (event) => {
    const action = confirmation;
    confirmation = null;
    if (event.target.returnValue === "confirm") action?.();
  });
  byId("solo-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const action = () => startSolo(Number(data.get("color")), data.get("difficulty"));
    const existing = readSave();
    if (existing && !existing.game.result && existing.game.moves.length) ask("开始新局？", "新的单人棋局会覆盖之前的本地进度。", "开始新局", action);
    else action();
  });
  byId("resume-solo").addEventListener("click", () => {
    const existing = readSave();
    if (existing) startSolo(existing.human, existing.level, existing.game);
  });
  byId("create-room").addEventListener("click", () => enterRoom(null));
  byId("resume-room").addEventListener("click", () => {
    const next = getSession();
    if (next && endpoint) openSession(next);
  });
  byId("join-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const code = Rooms.normalizeCode(byId("room-code").value);
    if (!code) return onlineMessage("请输入有效的 6 位房间码。", true);
    const prior = getSession();
    if (prior?.code === code && endpoint) openSession(prior);
    else enterRoom(code);
  });
  byId("copy-invite").addEventListener("click", async () => {
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("room", session.code);
    try {
      await navigator.clipboard.writeText(url.href);
      byId("room-message").textContent = "邀请链接已复制。";
      byId("room-message").classList.remove("error");
    } catch {
      const input = byId("invite-url");
      input.value = url.href;
      input.hidden = false;
      input.select();
    }
  });
  byId("start-room").addEventListener("click", () => send({ type: "start" }));
  byId("leave-room").addEventListener("click", () => send({ type: "leave" }));
  byId("confirm-move").addEventListener("click", confirmMove);
  byId("undo-move").addEventListener("click", undo);
  byId("new-round").addEventListener("click", () => {
    if (solo) startSolo(solo.human, solo.level);
    else send({ type: "restart" });
  });
  byId("leave-match").addEventListener("click", () => {
    if (room.phase === "playing") ask("认输并离开？", "本局将立即结束。", "认输并离开", () => send({ type: "leave" }));
    else send({ type: "leave" });
  });

  window.addEventListener("pagehide", disconnect);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && session && !solo && ["room-panel", "play-panel", "online-setup"].includes(panel)) openSession(session);
  });
  setInterval(updateCountdown, 250);

  const query = new URLSearchParams(location.search);
  const code = Rooms.normalizeCode(query.get("room"));
  const previous = getSession();
  if (code) {
    if (previous?.code === code && endpoint) openSession(previous);
    else onlineSetup(code);
  } else if (query.get("mode") === "online") {
    onlineSetup();
  } else if (query.get("mode") === "resume") {
    const stored = readSave();
    if (stored) startSolo(stored.human, stored.level, stored.game);
    else soloSetup();
  } else {
    show("modes", false);
  }
})();
