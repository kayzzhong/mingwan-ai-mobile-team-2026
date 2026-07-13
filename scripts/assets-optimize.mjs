import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const root = process.cwd();
const version = "2026-07-12-v1";
const assetBaseUrl = "https://assets.lighthouseisland.online";
const cosPrefix = `platform/${version}/mingwan-ai-mobile-team-2026`;
const stagingRoot = path.join(root, "asset-staging", "optimized");
const workRoot = path.join(root, "asset-staging", ".work");

const approved = [
  "assets/image-16.mp4",
  "assets/image-17.mp4",
  "assets/image-20.mp4",
  "assets/image-26.mp4",
  "assets/image-27.mp4",
  "assets/image-29.mp4",
  "assets/image-31.png",
  "assets/image-32.png",
  "assets/image-33.jpg",
  "assets/image-34.jpg",
];

fs.mkdirSync(stagingRoot, { recursive: true });
fs.mkdirSync(workRoot, { recursive: true });

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function optimizeImage(source, relative) {
  const stem = path.basename(relative, path.extname(relative));
  const metadata = await sharp(source).metadata();
  const cardPhoto = ["image-33", "image-34"].includes(stem);
  const maxLongEdge = cardPhoto ? 1200 : 1600;
  const resize = metadata.width && metadata.height && Math.max(metadata.width, metadata.height) > maxLongEdge
    ? { width: metadata.width >= metadata.height ? maxLongEdge : undefined, height: metadata.height > metadata.width ? maxLongEdge : undefined, fit: "inside", withoutEnlargement: true }
    : null;
  let pipeline = sharp(source, { failOn: "warning" }).rotate();
  if (resize) pipeline = pipeline.resize(resize);
  const lossless = relative.endsWith("image-31.png") && Boolean(metadata.hasAlpha);
  const temp = path.join(workRoot, `${stem}.webp`);
  await pipeline.webp(lossless ? { lossless: true, effort: 6 } : { quality: cardPhoto ? 82 : 88, effort: 6, smartSubsample: true }).toFile(temp);
  return {
    temp,
    extension: ".webp",
    strategy: lossless ? "lossless WebP; max long edge 1600px" : `quality ${cardPhoto ? 82 : 88} WebP; max long edge ${maxLongEdge}px`,
    sourceInfo: metadata,
    outputInfo: await sharp(temp).metadata(),
  };
}

function optimizeVideo(source, relative) {
  const stem = path.basename(relative, path.extname(relative));
  const temp = path.join(workRoot, `${stem}.mp4`);
  fs.copyFileSync(source, temp);
  return {
    temp,
    extension: ".mp4",
    strategy: "audited pass-through: existing 720×1280 compressed MP4 is already only 0.38–1.33 MiB for 5–17 seconds; avoid quality loss from unnecessary re-encoding",
    sourceInfo: { container: "MP4", auditReport: "reports/asset-audit.json" },
    outputInfo: { container: "MP4", bytesPreserved: true },
  };
}

const manifest = {
  schemaVersion: 1,
  version,
  generatedAt: new Date().toISOString(),
  assetBaseUrl,
  cosPrefix,
  cacheControl: "public, max-age=31536000, immutable",
  status: "staged-not-uploaded",
  assets: {},
};

for (const relative of approved) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source)) throw new Error(`Approved source missing: ${relative}`);
  const result = path.extname(relative).toLowerCase() === ".mp4"
    ? optimizeVideo(source, relative)
    : await optimizeImage(source, relative);
  const hash = sha256(result.temp).slice(0, 12);
  const stem = path.basename(relative, path.extname(relative));
  const filename = `${stem}.${hash}${result.extension}`;
  const staged = path.join(stagingRoot, filename);
  if (fs.existsSync(staged)) throw new Error(`Refusing to overwrite staged asset: ${staged}`);
  fs.renameSync(result.temp, staged);
  const cdnPath = `${cosPrefix}/${filename}`;
  manifest.assets[relative] = {
    source: relative,
    sourceSizeBytes: fs.statSync(source).size,
    stagedPath: path.relative(root, staged).split(path.sep).join("/"),
    stagedSizeBytes: fs.statSync(staged).size,
    sha256: sha256(staged),
    strategy: result.strategy,
    sourceInfo: result.sourceInfo,
    outputInfo: result.outputInfo,
    cdnPath,
    cdnUrl: `${assetBaseUrl}/${cdnPath}`,
    localFallback: `./${relative}`,
    cacheControl: manifest.cacheControl,
    uploadStatus: "pending",
  };
}

fs.rmSync(workRoot, { recursive: true, force: true });
const manifestPath = path.join(root, "asset-staging", "asset-manifest.proposed.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const sourceTotal = Object.values(manifest.assets).reduce((sum, item) => sum + item.sourceSizeBytes, 0);
const stagedTotal = Object.values(manifest.assets).reduce((sum, item) => sum + item.stagedSizeBytes, 0);
console.log(`Staged ${Object.keys(manifest.assets).length} approved assets.`);
console.log(`Source: ${(sourceTotal / 1024 / 1024).toFixed(3)} MiB; staged: ${(stagedTotal / 1024 / 1024).toFixed(3)} MiB; reduction: ${((1 - stagedTotal / sourceTotal) * 100).toFixed(1)}%`);
console.log(`Proposed manifest: ${path.relative(root, manifestPath)}`);
console.log("No upload or source-reference replacement was performed.");
