globalThis.arcadeRooms = (() => {
  const codePattern = /^[2-9A-HJ-NP-Z]{6}$/;
  const protocol = "arcade-room-v1";

  function normalizeCode(value) {
    const code = typeof value === "string" ? value.trim().toUpperCase() : "";
    return codePattern.test(code) ? code : null;
  }

  async function request(endpoint, path, data) {
    const response = await fetch(endpoint + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.message || "暂时无法进入房间。");
      error.status = response.status;
      throw error;
    }
    if (!normalizeCode(result.code) || typeof result.token !== "string") throw new Error("暂时无法进入房间。");
    return result;
  }

  function join(endpoint, game, code) {
    return request(endpoint, "/api/rooms/" + code + "/join", { game });
  }

  function connect(endpoint, game, session, receive) {
    const path = "/api/rooms/" + session.code;
    const url = endpoint.replace(/^http/, "ws") + path + "/socket";
    let socket;
    let timer;
    let heartbeat;
    let stopped = false;
    let attempts = 0;
    let lastMessage = 0;

    function close() {
      stopped = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
      if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) socket.close();
    }

    function start() {
      if (stopped) return;
      const connection = new WebSocket(url, [protocol, session.token]);
      socket = connection;
      connection.addEventListener("open", () => {
        if (stopped || socket !== connection) return;
        attempts = 0;
        lastMessage = Date.now();
        heartbeat = setInterval(() => {
          if (socket !== connection || stopped || connection.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastMessage > 45000) connection.close();
          else connection.send("ping");
        }, 15000);
      });
      connection.addEventListener("message", (event) => {
        if (stopped || socket !== connection) return;
        lastMessage = Date.now();
        if (event.data === "pong") return;
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === "closed") close();
        receive(data);
      });
      connection.addEventListener("close", async (event) => {
        if (stopped || socket !== connection) return;
        clearInterval(heartbeat);
        if (event.code === 4404) {
          close();
          receive({ type: "closed", message: "房间或座位已关闭。" });
          return;
        }
        attempts++;
        receive({ type: "offline" });
        if (attempts === 2 || attempts % 5 === 0) {
          try {
            await request(endpoint, path + "/join", { game, token: session.token });
          } catch (error) {
            if (error.status === 404 || error.status === 410) {
              if (stopped || socket !== connection) return;
              close();
              receive({ type: "closed", message: "房间或座位已关闭，请重新加入。" });
              return;
            }
          }
        }
        if (!stopped && socket === connection) timer = setTimeout(start, Math.min(5000, 400 * 2 ** attempts));
      });
    }

    function send(action) {
      if (stopped || socket?.readyState !== WebSocket.OPEN) return false;
      try {
        socket.send(JSON.stringify(action));
        return true;
      } catch {
        return false;
      }
    }

    start();
    return { send, close };
  }

  return Object.freeze({
    normalizeCode,
    create: (endpoint, game) => request(endpoint, "/api/rooms", { game }),
    join,
    connect,
  });
})();
