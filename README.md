# Abjad

Abjad is a desktop Arabic calligraphy learning and rendering studio. It combines Arabic shaping, canonical educational stroke data, authentic TrueType outlines, and progressive drawing animation in a focused Electron application.

## Features

- Interactive Arabic letter and word playback.
- Educational stroke order with animated brush movement.
- Arabic shaping through HarfBuzz, including contextual forms, ligatures, dots, and diacritics.
- Authentic Noto Sans Arabic TrueType outline geometry.
- Progressive shadow and ink rendering through the canonical SVG mask renderer.
- Word mode and letter mode with per-letter queues.
- Stroke weight, brush, color, playback, repeat, reset, and step controls.
- Responsive fullscreen Studio interface.
- SVG, HTML, and PNG snapshot export.
- Animated GIF and MP4 export with resolution and speed presets.
- Bundled FFmpeg for desktop media export; no system FFmpeg installation is required.
- Encrypted local license storage with device binding.

## License Protection

The application is protected by the standalone Abjad License API:

```text
https://abjad-licences.vercel.app
```

The Electron app stores its license cache and installation identity using the operating system secure storage. Lifetime licenses validate online once and can then be used offline. Two-hour licenses validate online whenever the application opens and expire two hours after first activation.

Each license is bound to the first device installation that activates it. The API stores only a hash of the installation identity. MAC addresses are not used.

The API is maintained separately from this repository and must never be given a Supabase service-role key. The Electron application only needs the public API URL.

## Requirements

- Node.js 22 or newer.
- npm.
- Windows 10/11 64-bit, Fedora/Linux 64-bit, or macOS for native builds.
- An active license key to use the application.

## Setup

```bash
npm install
```

The default license API URL is:

```text
https://abjad-licences.vercel.app
```

For development, it can be overridden with `LICENSE_API_URL` in a local `.env` file. Never commit `.env` files or service-role credentials.

## Development

Start the Electron development environment:

```bash
npm run dev
```

Run validation checks:

```bash
npm run typecheck
npm run build
```

Optional formatting and linting:

```bash
npm run format
npm run lint
```

## Packaging

Build the application for the current platform:

```bash
npm run build:win
npm run build:linux
npm run build:mac
```

Build an unpacked application directory:

```bash
npm run build:unpack
```

Windows builds are produced through `.github/workflows/windows-build.yml`. It uses a native Windows runner, bundles the correct FFmpeg binary, and uploads the installer as an artifact.

The main output names are:

```text
Abjad-1.0.0-setup.exe
Abjad-1.0.0.AppImage
```

## Export Formats

SVG, HTML, and PNG export the current rendered state. GIF and MP4 export the complete drawing animation, including the shadow, brush progression, final ink, dots, and diacritics.

Animated exports support:

- Compact, standard, and high resolutions.
- Speed presets from 0.5x to 2x.
- 15 FPS GIF output.
- 30 FPS MP4 output.
- A final hold so the completed drawing remains visible.
- Export progress, elapsed time, estimated time, and cancellation.

## Architecture

```text
Input text
    |
HarfBuzz shaping
    |
Glyph composer and canonical normalization
    |
Stroke registry and animation timeline
    |
AnimationEngine
    |
renderSvg()
    |
Studio board and export pipeline
```

Important application boundaries:

- `src/main/` contains Electron main-process functionality, licensing, secure storage, and media conversion.
- `src/preload/` exposes the restricted IPC API to the renderer.
- `src/renderer/src/engine/` contains shaping, stroke data, timeline, composition, and rendering logic.
- `src/renderer/src/components/StudioView.jsx` contains the user-facing Studio workflow.
- `electron-builder.yml` defines product identity, platform metadata, packaging, and bundled resources.

## Protected Data

Canonical and verified stroke assets are treated as protected project data. Do not regenerate or modify verified reference fixtures or candidate assets unless the change is explicitly part of the rendering-engine workflow.

## Project Identity

- Product: Abjad
- Publisher: Abdallah Wageeh
- Website: [zackriver.com](https://www.zackriver.com)
- Application ID: `com.zackriver.abjad`
