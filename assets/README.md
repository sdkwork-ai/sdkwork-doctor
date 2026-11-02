# Application Assets

Store and catalog media roots follow `APP_ASSETS_SPEC.md`. The manifest currently references placeholder CDN URLs marked `generatedPlaceholder: true`; replace them with captured media before a store submission.

Layout when assets are captured:

```text
assets/
  icon/            # ICON roles (1024x1024 primary)
  cover/           # COVER
  screenshots/     # SCREENSHOT per platform and locale
  preview/         # PREVIEW_IMAGE and PREVIEW_VIDEO
```

Capture is performed against a running surface; do not hand-compose screenshots. See `../sdkwork-specs/APP_ASSETS_SPEC.md` section 6.
