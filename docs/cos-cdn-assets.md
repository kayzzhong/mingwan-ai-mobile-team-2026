# COS/CDN Asset Workflow

This document is mandatory reading before any work involving images, audio, video, game resources, posters, backgrounds, sprites, fonts, Canvas resources, or external media.

## Stable production configuration

```text
ASSET_BASE_URL=https://assets.lighthouseisland.online
Active backing bucket=island-home-meditation-audio-1390765163
Reserved, not active=lighthouse-assets-1390765163
```

Do not switch the stable CDN domain to another bucket unless the user explicitly accepts the cutover risk. Do not assume the reserved bucket is active.

## Project locations

- Project root: repository root containing `index.html`.
- Source assets: `assets/`.
- Audit script: `scripts/assets-audit.mjs`.
- Budget: `asset-budget.json`.
- Audit report: `reports/asset-audit.json`.
- Optimized staging root: `asset-staging/optimized/`.
- Proposed CDN manifest: `asset-staging/asset-manifest.proposed.json`.
- Approved production manifest: `assets/asset-manifest.json` or another single central manifest selected during implementation.

Never overwrite or delete originals in `assets/`. Staging output must preserve a clear mapping back to each original file.

## Required workflow

Follow this sequence without skipping steps:

1. Run `npm run assets:audit`.
2. Review every resource with its size, dimensions or media metadata, references, externalization recommendation, and optimization proposal.
3. Present the proposed resource list and COS version target to the user.
4. Wait for explicit confirmation.
5. Generate optimized files in `asset-staging/optimized/`; do not edit originals.
6. Review optimized sizes and visual/media quality.
7. Upload only approved files to versioned COS keys.
8. Verify public HTTPS CDN URLs, response codes, CORS, and cache headers.
9. Generate or update a central asset manifest with local fallback paths and public CDN URLs.
10. Replace code references through the manifest or a shared helper.
11. Add lazy or staged loading to non-critical assets.
12. Test the page, existing behavior, and rollback path.
13. Deployment only reads reports and verifies URLs; it does not optimize or upload assets again.

## Optimization rules

### Images

- Size images for their rendered use. A card shown near 500–600px wide normally needs no more than roughly 960–1200px for high-density displays.
- Full content images inside the current 1024px content canvas normally need no more than roughly 1600–2000px unless zoom/detail is required.
- Convert photographic JPEG/PNG backgrounds and photos to WebP first; consider AVIF only after compatibility and visual review.
- Preserve transparency with lossless WebP or an optimized PNG according to visual quality.
- Keep small SVGs, icons, favicons, and genuinely first-screen critical resources local when that improves startup reliability.
- Do not ship 3000–4000px originals for card-sized rendering.

### Audio and video

- Inspect duration, dimensions, codecs, and bitrate before optimization.
- Compress before staging or upload. Keep resolution and bitrate proportional to the actual player size and content.
- Preserve an original local file and record the optimized encoding settings in the manifest/report.
- Add `preload="metadata"` or staged loading to non-first-screen video and audio.

## COS key rules

Use a new immutable path for every changed resource. Supported layouts:

```text
games/<game-id>/<version>/<filename>
platform/<version>/<filename>
uploads/games/<game-id>/<filename>
```

For this activity archive, the proposed default is a versioned platform path unless the user confirms a game ID:

```text
platform/<version>/mingwan-ai-mobile-team-2026/<filename>
```

Use version directories or content-hashed filenames. Never overwrite an existing published key. Set uploaded versioned resources to:

```text
Cache-Control: public, max-age=31536000, immutable
```

## Reference architecture

Do not paste repeated complete CDN domains into HTML or JavaScript. Use a central manifest such as:

```json
{
  "version": "2026-07-12-v1",
  "assetBaseUrl": "https://assets.lighthouseisland.online",
  "assets": {
    "assets/image-33.jpg": {
      "cdnPath": "platform/2026-07-12-v1/mingwan-ai-mobile-team-2026/image-33.webp",
      "localFallback": "./assets/image-33.jpg"
    }
  }
}
```

The runtime should resolve an asset through `ASSET_BASE_URL` plus `cdnPath`, with an explicit local fallback strategy. Preserve the old local-reference mapping so rollback is a manifest/config change, not a reconstruction task.

## Places that must be checked

- HTML `src`, `srcset`, and `poster`.
- CSS `url()`.
- JavaScript or TypeScript imports and string paths.
- Dynamic loaders and media configuration.
- Canvas, game engines, and asset manifests.
- Fonts, audio, video, background images, and generated content paths.

## Verification checklist

- Page and game load successfully over HTTPS.
- No mixed content.
- No CORS errors.
- No CDN 403 or 404 responses.
- CDN responses are healthy and versioned resources have immutable cache headers.
- First screen is not noticeably slower.
- Non-critical media is lazy or staged.
- Existing behavior and build checks pass.
- Local originals and the old mapping remain available for rollback.

## Upload authorization boundary

COS credentials/config being available does not authorize an upload. Before uploading, the user must confirm both:

1. the exact audited files to externalize; and
2. the exact versioned COS destination prefix.

Until both are confirmed, do not upload, delete, replace production references, or publish a production manifest.

