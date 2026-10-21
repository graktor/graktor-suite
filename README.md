# Graktor Complete Suite

One installer that merges [Graktor Desktop](https://github.com/graktor/graktor-desktop) (a thin
window around your live cloud account) and [Graktor Offline](https://github.com/graktor/graktor-offline)
(a standalone, license-key-activated local install) into a single app. The first time you open it,
it asks how you want to run it:

- **Sign in with my Graktor account** — same as Graktor Desktop: loads your live cloud account,
  needs an internet connection.
- **Activate with a license key** — same as Graktor Offline: runs entirely on this machine, no
  ongoing internet needed.

Switch between the two later any time with **Ctrl+Shift+M** (**Cmd+Shift+M** on Mac) — your data
in the mode you're leaving isn't touched.

This repo holds the thin desktop wrapper (an [Electron](https://www.electronjs.org/) app); the
local server the offline choice spawns is closed source — see
[graktor-offline](https://github.com/graktor/graktor-offline) for what it is.

## Downloads

The [latest release](https://github.com/graktor/graktor-suite/releases/tag/latest) has an
installer for each platform:

- **Windows** — `Graktor-Setup-*.exe` (NSIS installer, 64-bit). Unsigned, so SmartScreen will show
  an "unrecognized app" warning on first run — click "More info" → "Run anyway".
- **Linux** — `Graktor-*.AppImage` (x86_64). Make it executable
  (`chmod +x Graktor-*.AppImage`) and run it directly.
- **macOS** — `Graktor-*.dmg` (universal, Intel + Apple Silicon). Unsigned, so Gatekeeper will say
  it's from an unidentified developer — right-click the app and choose "Open" to bypass that the
  first time.
