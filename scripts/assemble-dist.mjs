import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");

if (existsSync(dist)) rmSync(dist, { recursive: true });
mkdirSync(dist, { recursive: true });

const playSrc = resolve(root, "packages/player/dist");
const adminSrc = resolve(root, "packages/admin/dist");
const reportSrc = resolve(root, "packages/report/dist");

if (existsSync(playSrc)) cpSync(playSrc, resolve(dist, "play"), { recursive: true });
if (existsSync(adminSrc)) cpSync(adminSrc, resolve(dist, "admin"), { recursive: true });
if (existsSync(reportSrc)) cpSync(reportSrc, resolve(dist, "report"), { recursive: true });

const branding = resolve(
  root,
  "Assets/App Branding/Real Nation Logo noTagline/PNG/RN_Logo_RGB_Reverse@2x.png",
);
if (existsSync(branding)) {
  mkdirSync(resolve(dist, "admin"), { recursive: true });
  copyFileSync(branding, resolve(dist, "admin/rn-logo.png"));
}

console.log("dist assembled:", dist);
