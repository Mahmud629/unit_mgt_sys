// Serves the built app (the "out" folder) to every computer and phone on the office LAN.
//   npm run lan          -> builds, then serves on port 8080
//   npm run serve        -> serves the last build
//   PORT=80 npm run serve (Linux) / set PORT=80 && npm run serve (Windows) to change the port
// No internet needed. Keep the window open while people use the system.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { networkInterfaces } from "node:os";

const root = join(process.cwd(), "out");
const port = Number(process.env.PORT || 8080);
if (!existsSync(root)) {
  console.error('No "out" folder yet. Run:  npm run lan   (it builds first)');
  process.exit(1);
}
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".map": "application/json",
};
function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const p = join(root, clean);
  if (!p.startsWith(root)) return null;
  if (existsSync(p) && statSync(p).isFile()) return p;
  if (existsSync(join(p, "index.html"))) return join(p, "index.html");
  if (existsSync(p + ".html")) return p + ".html";
  return null;
}
createServer((req, res) => {
  let file = resolve(req.url || "/");
  let status = 200;
  if (!file) { file = join(root, "404.html"); status = 404; }
  const type = TYPES[extname(file)] || "application/octet-stream";
  const immutable = file.includes(`${join("_next", "static")}`);
  res.writeHead(status, { "Content-Type": type, "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
  res.end(readFileSync(file));
}).listen(port, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);
  console.log("\n  5 SIG BN — Unit Management System is running\n");
  console.log(`  On this computer : http://localhost:${port}`);
  for (const ip of ips) console.log(`  On the LAN       : http://${ip}:${port}`);
  console.log("\n  Keep this window open. Press Ctrl+C to stop.\n");
});
