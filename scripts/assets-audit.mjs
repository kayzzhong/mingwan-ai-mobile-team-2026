import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const budgetPath = path.join(root, "asset-budget.json");
const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
const sourceDirs = budget.sourceDirectories.map((dir) => path.join(root, dir));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function normalized(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function readPng(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  const colorType = buffer[25];
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    hasAlpha: colorType === 4 || colorType === 6,
  };
}

function readJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
        hasAlpha: false,
      };
    }
    if (!length || length < 2) break;
    offset += 2 + length;
  }
  return null;
}

function findBox(buffer, type) {
  const needle = Buffer.from(type, "ascii");
  let index = buffer.indexOf(needle);
  while (index >= 4) {
    const start = index - 4;
    const size = buffer.readUInt32BE(start);
    if (size >= 8 && start + size <= buffer.length) return { start, typeOffset: index, size, end: start + size };
    index = buffer.indexOf(needle, index + 4);
  }
  return null;
}

function readMp4(buffer) {
  const mvhd = findBox(buffer, "mvhd");
  const tkhd = findBox(buffer, "tkhd");
  let durationSeconds = null;
  if (mvhd) {
    const version = buffer[mvhd.typeOffset + 4];
    if (version === 0 && mvhd.typeOffset + 24 <= buffer.length) {
      const timescale = buffer.readUInt32BE(mvhd.typeOffset + 16);
      const duration = buffer.readUInt32BE(mvhd.typeOffset + 20);
      if (timescale) durationSeconds = duration / timescale;
    } else if (version === 1 && mvhd.typeOffset + 36 <= buffer.length) {
      const timescale = buffer.readUInt32BE(mvhd.typeOffset + 24);
      const duration = Number(buffer.readBigUInt64BE(mvhd.typeOffset + 28));
      if (timescale) durationSeconds = duration / timescale;
    }
  }
  let width = null;
  let height = null;
  if (tkhd && tkhd.end >= 8) {
    width = Math.round(buffer.readUInt32BE(tkhd.end - 8) / 65536);
    height = Math.round(buffer.readUInt32BE(tkhd.end - 4) / 65536);
  }
  return { width, height, durationSeconds, container: "MP4" };
}

function mediaInfo(file, ext) {
  const buffer = fs.readFileSync(file);
  if ([".jpg", ".jpeg"].includes(ext)) return readJpeg(buffer);
  if (ext === ".png") return readPng(buffer);
  if (ext === ".mp4") return readMp4(buffer);
  return null;
}

function expandReferenceFiles() {
  const files = [path.join(root, "index.html"), path.join(root, "README.md")];
  const resources = path.join(root, "resources");
  if (fs.existsSync(resources)) files.push(...walk(resources).filter((file) => file.endsWith(".html")));
  return files.filter(fs.existsSync);
}

const referenceSources = expandReferenceFiles().map((file) => ({
  file,
  relative: normalized(file),
  text: fs.readFileSync(file, "utf8"),
}));

function referencesFor(assetPath) {
  const basename = path.basename(assetPath);
  const refs = [];
  for (const source of referenceSources) {
    let cursor = 0;
    while ((cursor = source.text.indexOf(basename, cursor)) >= 0) {
      const line = source.text.slice(0, cursor).split("\n").length;
      const context = source.text.slice(Math.max(0, cursor - 350), Math.min(source.text.length, cursor + basename.length + 350));
      const attribute = context.match(/(?:src|poster|srcset|href):?\s*["']?[^"']*$/)?.[0]?.split(":")[0] ?? "string/path";
      refs.push({ file: source.relative, line, attribute });
      cursor += basename.length;
    }
  }
  return refs;
}

function isCardReference(assetPath) {
  const basename = path.basename(assetPath);
  return referenceSources.some((source) => {
    const index = source.text.indexOf(basename);
    if (index < 0) return false;
    const context = source.text.slice(Math.max(0, index - 900), index + 250);
    return /md:grid-cols-[23]/.test(context);
  });
}

function optimizationFor({ ext, size, info, card, referenced }) {
  const longEdge = info?.width && info?.height ? Math.max(info.width, info.height) : null;
  if ([".jpg", ".jpeg"].includes(ext)) {
    const target = card ? budget.budgets.maxCardPhotoLongEdge : budget.budgets.maxPhotoLongEdge;
    const resize = longEdge && longEdge > target ? `resize long edge to about ${target}px` : "keep current dimensions unless visual review supports a smaller rendition";
    return `${resize}; convert photographic content to quality-reviewed WebP; preserve original`;
  }
  if (ext === ".png") {
    const alpha = info?.hasAlpha;
    return `${longEdge && longEdge > budget.budgets.maxPhotoLongEdge ? `resize long edge to about ${budget.budgets.maxPhotoLongEdge}px; ` : ""}${alpha ? "test lossless WebP against optimized PNG" : "convert screenshot/photo PNG to WebP"}; preserve original`;
  }
  if (ext === ".mp4") {
    return "transcode a reviewed web delivery rendition (H.264/AAC MP4, resolution and bitrate matched to the 16:9 content player); keep preload=metadata; preserve original";
  }
  if ([".mp3", ".wav", ".m4a", ".aac", ".ogg"].includes(ext)) {
    return "encode a reviewed web delivery rendition at a content-appropriate bitrate; preserve original; stage loading";
  }
  return referenced ? "review format and delivery; preserve original" : "unreferenced: verify whether it is still needed before optimization";
}

const supported = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg", ".mp4", ".webm", ".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
const assets = sourceDirs.flatMap(walk).filter((file) => supported.has(path.extname(file).toLowerCase())).sort();

const records = assets.map((file) => {
  const stat = fs.statSync(file);
  const relativePath = normalized(file);
  const ext = path.extname(file).toLowerCase();
  const type = [".mp4", ".webm"].includes(ext) ? "video" : [".mp3", ".wav", ".m4a", ".aac", ".ogg"].includes(ext) ? "audio" : "image";
  const info = mediaInfo(file, ext);
  const references = referencesFor(relativePath);
  const card = isCardReference(relativePath);
  const longEdge = info?.width && info?.height ? Math.max(info.width, info.height) : null;
  const overBudget = type === "video"
    ? stat.size > budget.budgets.videoBytes
    : type === "audio"
      ? stat.size > budget.budgets.audioBytes
      : stat.size > (info?.hasAlpha ? budget.budgets.transparentImageBytes : budget.budgets.photoBytes) || (longEdge && longEdge > budget.budgets.maxPhotoLongEdge);
  const shouldExternalize = references.length > 0 && (type === "video" ? budget.externalization.recommendVideo : type === "audio" ? budget.externalization.recommendAudio : overBudget);
  const lazyLoading = type === "image" ? referenceSources.some((source) => {
    const index = source.text.indexOf(path.basename(relativePath));
    return index >= 0 && /loading:["']lazy["']|loading=["']lazy["']/.test(source.text.slice(index, index + 500));
  }) : type === "video" ? referenceSources.some((source) => {
    const index = source.text.indexOf(path.basename(relativePath));
    return index >= 0 && /preload:["']metadata["']|preload=["']metadata["']/.test(source.text.slice(index, index + 500));
  }) : null;
  return {
    path: relativePath,
    type,
    extension: ext,
    sizeBytes: stat.size,
    sizeMiB: Number((stat.size / 1024 / 1024).toFixed(3)),
    mediaInfo: info,
    references,
    referenced: references.length > 0,
    inferredDisplay: card ? "responsive card/grid; approximately 500px wide on desktop" : "full content canvas or standalone media; up to approximately 1024px wide",
    loadingOptimized: lazyLoading,
    overBudget: Boolean(overBudget),
    recommendExternalize: Boolean(shouldExternalize),
    optimization: optimizationFor({ ext, size: stat.size, info, card, referenced: references.length > 0 }),
    proposedStagingPath: `${budget.stagingDirectory}/${path.basename(relativePath, ext)}${[".jpg", ".jpeg", ".png"].includes(ext) ? ".webp" : ext}`,
  };
});

const totals = {
  assetCount: records.length,
  totalBytes: records.reduce((sum, item) => sum + item.sizeBytes, 0),
  totalMiB: Number((records.reduce((sum, item) => sum + item.sizeBytes, 0) / 1024 / 1024).toFixed(3)),
  referencedCount: records.filter((item) => item.referenced).length,
  unreferencedCount: records.filter((item) => !item.referenced).length,
  overBudgetCount: records.filter((item) => item.overBudget).length,
  recommendedExternalCount: records.filter((item) => item.recommendExternalize).length,
  localBundleBudgetBytes: budget.budgets.localBundleTotalBytes,
  localBundleOverBudget: records.reduce((sum, item) => sum + item.sizeBytes, 0) > budget.budgets.localBundleTotalBytes,
};

let ffprobeAvailable = false;
try {
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
  ffprobeAvailable = true;
} catch {}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  projectRoot: root,
  assetBaseUrl: budget.assetBaseUrl,
  mode: "audit-only",
  uploadAuthorized: false,
  notes: [
    "No files were optimized, uploaded, deleted, or replaced by this audit.",
    "Recommendations require user confirmation before staging or COS upload.",
    ffprobeAvailable ? "ffprobe is available." : "ffprobe is unavailable; MP4 duration and dimensions are read from container boxes when present, and codec/bitrate should be confirmed before transcoding.",
  ],
  budget,
  totals,
  assets: records,
};

const reportPath = path.join(root, budget.reportPath);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const markdownPath = path.join(path.dirname(reportPath), "asset-audit.md");
const markdownRows = records.map((item) => {
  const info = item.mediaInfo ?? {};
  const dimensions = info.width && info.height ? `${info.width}×${info.height}` : "—";
  const duration = info.durationSeconds ? `${info.durationSeconds.toFixed(2)}s` : "—";
  const references = item.references.length ? item.references.map((ref) => `${ref.file}:${ref.line} (${ref.attribute})`).join("<br>") : "未引用";
  const recommendation = item.recommendExternalize ? "建议外置" : "暂留本地";
  return `| \`${item.path}\` | ${item.type} | ${item.sizeMiB} MiB | ${dimensions} | ${duration} | ${references} | ${recommendation} | ${item.optimization.replaceAll("|", "\\|")} |`;
});
const markdown = `# Asset Audit\n\n` +
  `- Generated: ${report.generatedAt}\n` +
  `- Mode: audit-only; no optimization, upload, deletion, or reference replacement performed\n` +
  `- Asset base: ${report.assetBaseUrl}\n` +
  `- Assets: ${totals.assetCount}\n` +
  `- Total: ${totals.totalMiB} MiB\n` +
  `- Local bundle budget: ${(totals.localBundleBudgetBytes / 1024 / 1024).toFixed(2)} MiB\n` +
  `- Priority externalization candidates: ${totals.recommendedExternalCount}\n` +
  `- Over individual budget: ${totals.overBudgetCount}\n\n` +
  `| 文件 | 类型 | 大小 | 尺寸 | 时长 | 当前引用 | 建议 | 优化方式 |\n` +
  `|---|---:|---:|---:|---:|---|---|---|\n` +
  `${markdownRows.join("\n")}\n\n` +
  `## Approval boundary\n\n` +
  `This report is a proposal only. Confirm the exact files and versioned COS prefix before generating optimized files or uploading.\n`;
fs.writeFileSync(markdownPath, markdown);

console.log(`Asset audit written to ${normalized(reportPath)}`);
console.log(`Human-readable audit written to ${normalized(markdownPath)}`);
console.log(`Assets: ${totals.assetCount}; total: ${totals.totalMiB} MiB; over budget: ${totals.overBudgetCount}; recommended external: ${totals.recommendedExternalCount}`);
console.log("Audit-only: no assets were optimized, uploaded, deleted, or replaced.");
