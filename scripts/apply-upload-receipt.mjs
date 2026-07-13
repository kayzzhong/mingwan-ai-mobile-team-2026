import fs from "node:fs";

const manifestPath = "asset-staging/asset-manifest.proposed.json";
const uploads = {
  "assets/image-16.mp4": ["uploads/video/mingwan-ai-mobile-team-2026/2026-07-12-v1/image-16.5f8ab2fe18ac-489f5c6f.mp4", 705444, false],
  "assets/image-17.mp4": ["uploads/video/mingwan-ai-mobile-team-2026/2026-07-12-v1/image-17.45be541398a0-0a5d2208.mp4", 1393634, false],
  "assets/image-20.mp4": ["uploads/video/mingwan-ai-mobile-team-2026/2026-07-12-v1/image-20.9fa3a46b57aa-9e7f1627.mp4", 580912, false],
  "assets/image-26.mp4": ["uploads/video/mingwan-ai-mobile-team-2026/2026-07-12-v1/image-26.c7ae58fd6b69-d2aebb0b.mp4", 598895, false],
  "assets/image-27.mp4": ["uploads/video/mingwan-ai-mobile-team-2026/2026-07-12-v1/image-27.7f15d43baf36-cda51da4.mp4", 395299, false],
  "assets/image-29.mp4": ["uploads/video/mingwan-ai-mobile-team-2026/2026-07-12-v1/image-29.d3aafa58aefb-eab00681.mp4", 648227, false],
  "assets/image-31.png": ["uploads/image/mingwan-ai-mobile-team-2026/2026-07-12-v1/image-31.e973f0626fda-38cc1e3e.webp", 53138, true],
  "assets/image-32.png": ["uploads/image/mingwan-ai-mobile-team-2026/2026-07-12-v1/image-32.ac324949e3e7-61dad63e.webp", 29554, true],
  "assets/image-33.jpg": ["uploads/image/mingwan-ai-mobile-team-2026/2026-07-12-v1/image-33.c6c919503732-08e25751.webp", 133716, true],
  "assets/image-34.jpg": ["uploads/image/mingwan-ai-mobile-team-2026/2026-07-12-v1/image-34.990464c3cdfd-183d6b02.webp", 50126, true]
};

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const uploadedAt = new Date().toISOString();
for (const [source, [key, uploadedSizeBytes, optimizedByUploadTool]] of Object.entries(uploads)) {
  const asset = manifest.assets[source];
  if (!asset) throw new Error(`Manifest entry missing: ${source}`);
  asset.cdnPath = key;
  asset.cdnUrl = `${manifest.assetBaseUrl}/${key}`;
  asset.uploadStatus = "uploaded";
  asset.uploadedAt = uploadedAt;
  asset.uploadedSizeBytes = uploadedSizeBytes;
  asset.optimizedByUploadTool = optimizedByUploadTool;
}
manifest.cosPrefix = "uploads/{category}/mingwan-ai-mobile-team-2026/2026-07-12-v1";
manifest.status = "uploaded-pending-verification";
manifest.uploadedAt = uploadedAt;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Applied ${Object.keys(uploads).length} upload receipts to ${manifestPath}`);
