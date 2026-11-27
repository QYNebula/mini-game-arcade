import { copyFile, mkdir, writeFile } from "node:fs/promises";

const destination = new URL("./public/", import.meta.url);
const frontend = new URL("../../games/renmin/online/", import.meta.url);
const files = new Map([
  ...["index.html", "table.js", "table.css", "catalog.js"].map((name) => [name, new URL(name, frontend)]),
  ["cover.webp", new URL("../cover.webp", frontend)],
  ["room-client.js", new URL("../../js/room-client.js", import.meta.url)],
]);
await mkdir(destination, { recursive: true });
await Promise.all([...files].map(([name, source]) => copyFile(source, new URL(name, destination))));
await writeFile(new URL("_headers", destination), [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: no-referrer",
  "  Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'",
  "",
].join("\n"));
