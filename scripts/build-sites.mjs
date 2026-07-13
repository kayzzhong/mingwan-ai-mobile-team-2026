import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const client = path.join(dist, "client");
const assetsOut = path.join(client, "assets");
const manifestPath = path.join(root, "assets", "asset-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.status !== "production") {
  throw new Error("The CDN asset manifest must be promoted to production before a Sites build.");
}

const externalized = new Set(
  Object.entries(manifest.assets ?? {})
    .filter(([, item]) => item.uploadStatus === "uploaded" && item.cdnUrl)
    .map(([source]) => source.replace(/^assets\//, "")),
);

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "server"), { recursive: true });
await mkdir(assetsOut, { recursive: true });

await cp(path.join(root, "index.html"), path.join(client, "index.html"));
await cp(manifestPath, path.join(assetsOut, "asset-manifest.json"));

const { readdir } = await import("node:fs/promises");
for (const entry of await readdir(path.join(root, "assets"), { withFileTypes: true })) {
  if (!entry.isFile() || entry.name === "asset-manifest.json" || externalized.has(entry.name)) continue;
  await cp(path.join(root, "assets", entry.name), path.join(assetsOut, entry.name));
}

await cp(path.join(root, "resources"), path.join(client, "resources"), { recursive: true });

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/index.html";
    if (!env.ASSETS) return new Response("Static asset binding unavailable", { status: 500 });
    return env.ASSETS.fetch(new Request(url, request));
  }
};\n`;

await writeFile(path.join(dist, "server", "index.js"), worker);

const copiedMiB = (await Promise.all(
  (await readdir(assetsOut, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map(async (entry) => (await import("node:fs/promises")).stat(path.join(assetsOut, entry.name))),
)).reduce((sum, stat) => sum + stat.size, 0) / 1024 / 1024;

console.log(`Sites build ready: ${externalized.size} heavy assets use CDN; local fallback bundle ${copiedMiB.toFixed(2)} MiB.`);
