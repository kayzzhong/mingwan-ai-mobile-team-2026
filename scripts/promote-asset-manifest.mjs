import fs from "node:fs";

const proposedPath = "asset-staging/asset-manifest.proposed.json";
const productionPath = "assets/asset-manifest.json";
const verificationPath = "reports/cdn-verification.json";
const manifest = JSON.parse(fs.readFileSync(proposedPath, "utf8"));
const verification = JSON.parse(fs.readFileSync(verificationPath, "utf8"));

if (!verification.passed) throw new Error("CDN verification did not pass");
if (Object.values(manifest.assets).some(asset => asset.uploadStatus !== "uploaded")) {
  throw new Error("Manifest still contains non-uploaded assets");
}

manifest.status = "production";
manifest.verifiedAt = verification.checkedAt;
manifest.verificationReport = verificationPath;
fs.writeFileSync(proposedPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(productionPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Production manifest written to ${productionPath}`);
