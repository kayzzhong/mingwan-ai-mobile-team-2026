# Project Agent Instructions

## Mandatory asset workflow

Before handling any image, audio, video, game asset, poster, background, sprite, font, Canvas resource, or externally hosted media in this repository, read and follow [docs/cos-cdn-assets.md](docs/cos-cdn-assets.md).

This requirement applies to adding, replacing, optimizing, auditing, uploading, externalizing, referencing, building, and deploying assets.

## Non-negotiable rules

- Run `npm run assets:audit` before proposing a resource migration.
- Do not upload, delete, overwrite, or replace production resources before the user confirms the audited resource list and versioned COS target.
- Keep original local assets untouched. Optimized candidates must go to the staging directory defined in the COS/CDN guide.
- Use `ASSET_BASE_URL=https://assets.lighthouseisland.online` through a central manifest or helper; do not scatter full CDN URLs through application code.
- Version COS keys. Never overwrite an already published key.
- Deployment may verify the audit report and public CDN URLs, but must not recompress assets or upload to COS.

