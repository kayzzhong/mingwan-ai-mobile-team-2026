import fs from "node:fs";

const manifestPath = "asset-staging/asset-manifest.proposed.json";
const reportPath = "reports/cdn-verification.json";
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const results = [];

for (const [source, asset] of Object.entries(manifest.assets)) {
  const head = await fetch(asset.cdnUrl, { method: "HEAD" });
  const contentType = head.headers.get("content-type") || "";
  const cacheControl = head.headers.get("cache-control") || "";
  const expectedType = source.endsWith(".mp4") ? "video/" : "image/";
  const item = {
    source,
    url: asset.cdnUrl,
    https: asset.cdnUrl.startsWith("https://"),
    headStatus: head.status,
    contentType,
    cacheControl,
    contentTypeValid: contentType.startsWith(expectedType),
    immutableCacheValid: cacheControl.includes("max-age=31536000") && cacheControl.includes("immutable")
  };
  if (source.endsWith(".mp4")) {
    const range = await fetch(asset.cdnUrl, { headers: { Range: "bytes=0-1023" } });
    item.rangeStatus = range.status;
    item.acceptRanges = range.headers.get("accept-ranges") || "";
    item.contentRange = range.headers.get("content-range") || "";
    item.rangeValid = range.status === 206 && item.contentRange.startsWith("bytes 0-1023/");
    await range.body?.cancel();
  }
  item.valid = item.https && item.headStatus === 200 && item.contentTypeValid && item.immutableCacheValid && (item.rangeValid ?? true);
  results.push(item);
}

const passed = results.every(item => item.valid);
const report = { checkedAt: new Date().toISOString(), passed, count: results.length, results };
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
