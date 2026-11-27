// The final value is the public Worker address. The loopback address is for local development.
globalThis.arcadeRoomEndpoint = location.protocol === "http:" && ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "http://127.0.0.1:8787"
  : "https://rooms.hmarcade.dpdns.org";
