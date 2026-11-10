// 5 SIG BN — Unit Systems Portal: one command starts everything on the office LAN.
//
//   node portal/serve.mjs              start the portal and every system in config.js
//   node portal/serve.mjs --rebuild    rebuild the systems first (after copying in a new version)
//
// - the portal page                     → port 8080 (config.js: portalPort)
// - systems with  serve: { folder }     → their built web pages, served from that folder
// - systems with  run: { folder, script } → their own server ("npm run <script>") is started
// The first time, each system is installed ("npm ci") and built automatically — that one
// time needs internet (or a copied node_modules folder). After that everything is offline.
// Keep this window open while people use the systems. Ctrl+C stops all of them.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer, get as httpGet } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(join(here, "config.js"), "utf8"), sandbox);
const C = sandbox.window.PORTAL_CONFIG;
const REBUILD = process.argv.includes("--rebuild");
const isWin = process.platform === "win32";
const children = [];

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".map": "application/json", ".pdf": "application/pdf",
};

// ------------------------------------------------------------------ helpers
// npm runs in the background, so the portal page already answers while the systems are being built.
function npm(args, cwd, label) {
  console.log(`\n  ▸ ${label}: npm ${args.join(" ")}  (in ${cwd})`);
  return new Promise((resolve) => {
    const child = spawn("npm", args, { cwd, stdio: "inherit", shell: isWin });
    children.push(child);
    const done = (ok) => {
      const i = children.indexOf(child);
      if (i >= 0) children.splice(i, 1);
      if (!ok) console.log(`  ✗ ${label}: "npm ${args.join(" ")}" failed. Fix the message above, then start again.`);
      resolve(ok);
    };
    child.on("exit", (code) => done(code === 0));
    child.on("error", () => done(false));
  });
}
async function install(dir, label) {
  // first time, or the package list changed with a new version → (re)install
  const lock = join(dir, "package-lock.json");
  const want = existsSync(lock) ? fingerprint(dir, ["package-lock.json"]) : "";
  const stampFile = join(dir, "node_modules", ".portal-lock");
  const have = existsSync(stampFile) ? readFileSync(stampFile, "utf8") : null;
  if (existsSync(join(dir, "node_modules")) && (have === want || have === null)) {
    if (have === null) try { writeFileSync(stampFile, want); } catch { /* read-only */ }
    return true;
  }
  const ok = await npm(existsSync(lock) ? ["ci"] : ["install"], dir, `${label} — ${have === null ? "first-time install" : "new packages"}`);
  if (ok) try { writeFileSync(stampFile, want); } catch { /* read-only */ }
  return ok;
}

// Fingerprint of a system's program files (not its data), to see when new code was copied in.
const CODE = ["app", "components", "lib", "public", "scripts", "package.json", "package-lock.json", "next.config.ts", "next.config.js", "next.config.mjs", "proxy.ts", "middleware.ts", "tsconfig.json"];
const SKIP = new Set(["node_modules", ".next", "out", "data", "uploads"]);
function fingerprint(dir, parts = CODE) {
  const h = createHash("sha1");
  const walk = (p, rel) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p).sort()) if (!SKIP.has(name)) walk(join(p, name), rel + "/" + name);
    } else { h.update(rel + "\0" + st.size + "\0"); h.update(readFileSync(p)); }
  };
  for (const part of parts) walk(join(dir, part), part);
  return h.digest("hex");
}
const BUILD_STAMP = ".portal-build";
function needsBuild(dir, builtMarker, label) {
  if (REBUILD || !existsSync(builtMarker)) return true;
  const stamp = join(dir, BUILD_STAMP);
  const now = fingerprint(dir);
  if (!existsSync(stamp)) { writeFileSync(stamp, now); return false; }  // built before stamps existed — see version check below
  if (readFileSync(stamp, "utf8") !== now) { console.log(`\n  ▸ ${label}: new program files found — building again (a few minutes)…`); return true; }
  return false;
}
async function build(dir, label) {
  const ok = await npm(["run", "build"], dir, `${label} — build`);
  if (ok) writeFileSync(join(dir, BUILD_STAMP), fingerprint(dir));
  return ok;
}
function ensureEnv(dir, label) {
  const env = join(dir, ".env.local"), example = join(dir, ".env.example");
  if (!existsSync(env) && existsSync(example)) {
    copyFileSync(example, env);
    console.log(`\n  ! ${label}: created ${env}`);
    console.log(`    Login for now: admin / change-me-to-a-strong-password`);
    console.log(`    Open that file in Notepad, set your own INVENTORY_USERNAME / INVENTORY_PASSWORD, save, and start again.`);
  }
}

// Daily activities pictures: the files in portal/activities, newest first.
// "2026-10-25 Annual Firing.jpg" → { title: "Annual Firing", date: "2026-10-25" }
const PICTURE = /\.(jpe?g|png|webp|gif|svg)$/i;
function activities() {
  const a = C.activities || {};
  const dir = join(here, a.folder || "activities");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => PICTURE.test(f) && statSync(join(dir, f)).isFile())
    .map((f) => {
      const base = f.replace(PICTURE, "");
      const m = base.match(/^(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})[\s_-]*(.*)$/);
      const words = (m ? m[4] : base).replace(/^sample-\d+\s*/i, "").replace(/[_]+/g, " ").replace(/\s+-\s+|\s{2,}/g, " ").trim();
      return { src: `${a.folder || "activities"}/${encodeURIComponent(f)}`, title: words, date: m ? `${m[1]}-${m[2]}-${m[3]}` : null, sample: /^sample-/i.test(f), t: Math.floor(statSync(join(dir, f)).mtimeMs / 1000), f };
    })
    .sort((x, y) => (y.date || "").localeCompare(x.date || "") || y.t - x.t || x.f.localeCompare(y.f))
    .slice(0, a.max || 40)
    .map(({ t, f, ...rest }) => rest);
}

function serveFolder(root, port, label, api = {}) {
  if (!existsSync(root)) { console.log(`  ✗ ${label}: folder not found — ${root}`); return; }
  const find = (urlPath) => {
    let clean;
    try { clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, ""); } catch { return null; }
    const p = join(root, clean);
    if (!p.startsWith(root)) return null;
    if (existsSync(p) && statSync(p).isFile()) return p;
    if (existsSync(join(p, "index.html"))) return join(p, "index.html");
    if (existsSync(p + ".html")) return p + ".html";
    return null;
  };
  createServer((req, res) => {
    const handler = api[(req.url || "/").split("?")[0]];
    if (handler) {
      return Promise.resolve(handler()).then((data) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(JSON.stringify(data));
      }, () => { res.writeHead(500); res.end("{}"); });
    }
    let file = find(req.url || "/");
    let status = 200;
    if (!file) { file = existsSync(join(root, "404.html")) ? join(root, "404.html") : join(root, "index.html"); status = 404; }
    const immutable = file.includes(join("_next", "static"));
    res.writeHead(status, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
    res.end(readFileSync(file));
  })
    .on("error", (e) => console.log(`  ✗ ${label}: port ${port} — ${e.code === "EADDRINUSE" ? "already in use (is it running already?)" : e.message}`))
    .listen(port, "0.0.0.0", () => console.log(`  ✓ ${label.padEnd(38)} port ${port}`));
}

function runServer(dir, script, port, label) {
  const child = spawn("npm", ["run", script], { cwd: dir, shell: isWin, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PORT: String(port) } });
  children.push(child);
  const tag = `  [${label.split(" ").map((w) => w[0]).join("")}] `;
  const relay = (buf) => String(buf).split(/\r?\n/).filter((l) => l.trim() && !/^>/.test(l.trim())).forEach((l) => console.log(tag + l));
  child.stdout.on("data", relay);
  child.stderr.on("data", relay);
  child.on("exit", (code) => console.log(`  ✗ ${label} stopped (exit ${code}). Close this window and start again.`));
  console.log(`  ✓ ${label.padEnd(38)} port ${port}`);
}

// ------------------------------------------------------- prepare and start
// The portal page starts first; each system shows "Updating…" on it while it is installed / built,
// then "Online" when its server answers. /status.json is checked from this computer, so the dots are right
// on every browser of the LAN.
const state = {}; // id → "building" | "ready" | "failed"
const portOf = (s) => s.serve?.port ?? s.run?.port ?? (Number(new URL(String(s.url).replace("{host}", "localhost")).port) || 80);
const answers = (port) => new Promise((resolve) => {
  const req = httpGet({ host: "127.0.0.1", port, path: "/", timeout: 2500 }, (r) => { r.resume(); resolve(true); });
  req.on("timeout", () => { req.destroy(); resolve(false); });
  req.on("error", () => resolve(false));
});
async function status() {
  const out = {};
  await Promise.all(C.systems.map(async (s) => {
    out[s.id] = state[s.id] === "building" ? "building" : (await answers(portOf(s))) ? "up" : "down";
  }));
  return { systems: out };
}

console.log(`\n  ${C.unit.short} — Unit Systems Portal\n`);
serveFolder(here, C.portalPort || 8080, "Portal (choose a system)", { "/activities.json": activities, "/status.json": status });

async function prepare(s) {
  if (s.serve?.build) {
    const dir = resolvePath(here, s.serve.build);
    const out = resolvePath(here, s.serve.folder);
    if (!existsSync(dir)) { console.log(`  ✗ ${s.name}: folder not found — ${dir}`); return false; }
    state[s.id] = "building";
    if (!(await install(dir, s.name))) return false;
    // a build from before the module pages (v3.3) has no /go page: build again
    const stale = s.tiles?.some((t) => String(t.path || "").startsWith("go/")) && existsSync(out) && !existsSync(join(out, "go", "index.html"));
    if ((stale || needsBuild(dir, join(out, "index.html"), s.name)) && !(await build(dir, s.name))) return false;
  }
  if (s.run?.folder) {
    const dir = resolvePath(here, s.run.folder);
    if (!existsSync(dir)) { console.log(`  ✗ ${s.name}: folder not found — ${dir}`); return false; }
    state[s.id] = "building";
    ensureEnv(dir, s.name);
    if (!(await install(dir, s.name))) return false;
    if (needsBuild(dir, join(dir, ".next", "BUILD_ID"), s.name) && !(await build(dir, s.name))) return false;
  }
  return true;
}
for (const s of C.systems) {
  const ok = await prepare(s);
  state[s.id] = ok ? "ready" : "failed";
  if (!ok) continue;
  if (s.serve?.folder) serveFolder(resolvePath(here, s.serve.folder), s.serve.port, s.name);
  else if (s.run?.folder && existsSync(join(resolvePath(here, s.run.folder), ".next", "BUILD_ID"))) runServer(resolvePath(here, s.run.folder), s.run.script || "start", s.run.port, s.name);
  else if (!s.run) console.log(`  • ${s.name.padEnd(38)} ${s.url} (started separately)`);
}

const ips = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address);
setTimeout(() => {
  console.log(`\n  Give everyone this address (the portal):`);
  console.log(`    on this computer : http://localhost:${C.portalPort || 8080}`);
  for (const ip of ips) console.log(`    on the LAN       : http://${ip}:${C.portalPort || 8080}`);
  console.log("\n  Keep this window open. Press Ctrl+C to stop everything.\n");
}, 1500);

const stop = () => { for (const c of children) { try { isWin ? spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"]) : c.kill("SIGTERM"); } catch { /* already stopped */ } } process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
