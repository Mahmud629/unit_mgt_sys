// Runs automatically before "npm run dev" and "npm run build".
// If a package listed in package.json is missing (for example after unzipping a
// new version without running "npm install"), it installs them first, so the app
// never stops with "Module not found".
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = wanted.filter((name) => !existsSync(join(root, "node_modules", ...name.split("/"), "package.json")));

if (missing.length) {
  console.log(`\n[5 SIG BN UMS] Installing missing packages: ${missing.join(", ")}\n`);
  try {
    execSync("npm install --no-audit --no-fund", { stdio: "inherit", cwd: root });
  } catch {
    console.error("\n[5 SIG BN UMS] Could not install packages automatically. Check the internet connection and run:  npm install\n");
    process.exit(1);
  }
} else {
  console.log("[5 SIG BN UMS] All packages present.");
}
