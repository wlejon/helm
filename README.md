# helm

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Helm** is the standalone desktop environment shell application for the [bro ecosystem](https://github.com/wlejon/bro).

Built on top of `bro_engine`, `bro_bronze_host`, and `bronze`, Helm provides the primary human interface to the desktop operating system:
floating glass islands instead of a bar. The left island holds the launcher mark, the workspaces and the focused app, and grows into **Spaces** (a miniature of every workspace and the windows on this one). The center island holds the clock, the unread count and a **live activity** (what is playing, or a recording and its running time), and grows into the calendar and notification center. The right island holds the tray and status, grows into quick settings (volume and outputs, brightness, network and Wi-Fi, Bluetooth, night light, Focus / Do Not Disturb, now playing, power with confirm), and stretches into the volume and brightness OSD. Toasts fall out of the clock island. There is a launcher with app grid, search, calculator, actions and clipboard history that grows out of whatever opened it, a floating auto-hiding dock, an Alt+Tab window switcher, and a lock screen with credential verification.

### Design: deep glass
- **Material.** Dark, heavily blurred glass tinted toward the accent hue, in three depths: islands, panels, modal (`css/tokens.css`). Edges are a 1px rim with a top highlight; depth comes from long soft shadows; emphasis from glows.
- **Accent.** One hue setting (`accentHue`) drives a two-stop gradient (the second stop 48° round the wheel) used for the lit states: active toggles, the current workspace, sliders, today, focus rings.
- **Motion.** Panels never pop in beside their island: `js/morph.js` animates the island's own box (left/top/width/height/radius) into the panel on a sampled damped spring, with the body pinned to the island's edge so the glass uncovers it; closing runs the same path back on a quicker, non-bouncing curve. Exits are always faster than entrances.
- **Type.** Adwaita Sans throughout; JetBrains Mono for figures that tick (percentages, timers, the calculator) and for small-caps section labels.
- **States.** Every control: hover lifts the well, press sinks and scales to 0.97, `:focus-visible` draws the gradient ring, disabled drops to 38%. Empty states get a glyph, a line and a hint.

### Settings
The Settings app is being rebuilt. Every entry point (the quick settings gear, the launcher's Settings action, `Super+,`) calls `helm.openSettings(page)`; until an app registers with `helm.registerSettingsApp({ open(page), close(), isOpen })` it shows a "coming soon" hint. Shell preferences (`js/settings.js`, bro.conf path `helm.shell`) still work: the wallpaper cycles from quick settings or the launcher, and the accent from the launcher's *Accent Colour* action.

### Live activities and edges
Anything can put a live activity in the clock island with `helm.activities.start({ id, kind: 'recording' | 'media', title, since })` and `helm.activities.end(id)`. Screen edges are reserved in one place, `Shell.reserveEdges()`, which calls `bro.compositor.reserveEdge` once the compositor provides it.

---

## Architecture

Helm is structured as a standalone executable linking `bro_engine` with its UI authored in modern HTML5, CSS (Level 5 Cascade, Oklch tokens, Flexbox/Grid via htmlayout), and JavaScript (Bronze runtime):

```
helm/
├── CMakeLists.txt          # Build configuration (resolves bro, links bro_engine/bronze)
├── README.md               # Architecture and usage documentation
├── .gitignore              # Git ignore patterns
├── src/
│   ├── main.cpp            # Windowed/DRM application entry point and CLI parser
│   ├── headless_main.cpp   # Headless test runner driver
│   ├── paths.h             # Filesystem & config path resolution
│   └── paths.cpp
├── ui/
│   ├── bro.json            # Desktop shell manifest (asks for "shell": true)
│   ├── index.html          # Shell DOM: wallpaper, islands, panels, dock, overlays
│   ├── css/
│   │   ├── tokens.css      # Deep glass: accent gradient, glass depths, type, space, motion
│   │   ├── base.css        # Reset and shared controls: buttons, sliders, switches, rows, menus
│   │   ├── islands.css     # Top islands, live activity, hint pill, wallpaper layer
│   │   ├── panels.css      # Morphing panels: quick settings, clock panel, spaces, now playing
│   │   ├── notify.css      # Toasts, notification cards, OSD
│   │   ├── launcher.css    # Launcher
│   │   ├── dock.css        # Dock and window switcher
│   │   └── lock.css        # Lock screen
│   └── js/
│       ├── shell.js        # Builds every surface, hotkeys, Settings hook, edges, window.helm
│       ├── morph.js        # Shared-element morphs and the one-open-panel manager
│       ├── islands.js      # The three top islands
│       ├── activities.js   # Live activities shown in the clock island
│       ├── spaces.js       # Workspaces overview (left island's panel)
│       ├── quicksettings.js# Quick settings (right island's panel)
│       ├── calendar.js     # Calendar and notification center (center island's panel)
│       ├── notify.js       # Notification server, toasts, history (bro.sys.notifications)
│       ├── osd.js          # Volume / brightness OSD, stretched out of the status island
│       ├── launcher.js     # Launcher: grid, search, calculator, actions, clipboard
│       ├── dock.js         # Dock: pinned + running apps, intellihide
│       ├── switcher.js     # Alt+Tab window switcher
│       ├── lock.js         # Lock screen and password auth (bro.cred)
│       ├── util.js         # DOM builder, app icons, time formatting
│       ├── icons.js        # Inline SVG icon set
│       ├── settings.js     # Shell preferences (bro.conf, helm.shell.*)
│       ├── wallpaper.js    # Gradient presets or an image
│       ├── controls.js     # Slider and switch widgets
│       ├── system.js       # Audio, network, Bluetooth, power, display (bro.sys / pulse)
│       ├── windows.js      # Windows and workspaces (bro.compositor)
│       ├── appdb.js        # App catalog, window-to-app matching, launching (bro.apps)
│       ├── media.js        # MPRIS controller and the now-playing card
│       ├── menus.js        # Context menus and tray DBusMenu menus
│       └── calc.js         # Arithmetic evaluator for the launcher
└── tests/
    ├── test_shell_boot.js      # Boot, islands, panels, launcher, Settings hook, hotkeys, live activities, lock fails closed
    ├── test_notifications.js   # Toasts, history, actions, Do Not Disturb, center panel
    ├── test_dock.js            # Dock, menus, intellihide, spaces, Alt+Tab over stand-in windows
    └── test_shell_broker.js    # Windows shell broker bindings (skips elsewhere)
```

### Trusted Desktop Permissions
Helm is a privileged desktop shell. Its `ui/bro.json` asks for `"shell": true`, and bro grants it only because of where the UI is installed: `system/helm` beside the `helm` executable, a location bro trusts (see bro's `docs/desktop-trust.md`). The manifest alone grants nothing. Run from a build tree, the UI is the source `ui/` folder, which you name in `BRO_TRUSTED_APP_DIR`; without it Helm boots with the privileged namespaces unavailable. With trust, Helm gets:
- `bro.compositor`: Foreign toplevel management, window manipulation, and workspace policy.
- `bro.sys`: Power management, audio control, network configuration, notification server, and system tray host.
- `bro.displays`: Output topology, resolution, refresh rate, and night light.
- `bro.apps`: Application catalog discovery, MIME handlers, and process launching.
- `bro.cred`: Lock screen authentication and password verification.

---

## Building and Running

### Prerequisites
- CMake 3.24+
- Ninja build system
- C++20 compliant compiler (GCC 12+, Clang 16+, MSVC 2022)
- Sibling repositories cloned beside `helm/` (primarily `bro` at `../bro`)

### Build
```bash
cmake -B build -G Ninja
ninja -C build
```

### Run
Launch in windowed mode (from a build tree, naming the source UI as trusted):
```bash
BRO_TRUSTED_APP_DIR="$PWD/ui" ./build/helm --windowed
```

Launch bare-metal on Linux DRM/KMS:
```bash
./build/helm --drm
```

Launch with software rendering (CPU only):
```bash
./build/helm --no-gpu
```

### Testing
Run headless UI integration tests:
```bash
ctest --test-dir build --output-on-failure
```

Or run the test script directly with `helm-headless`:
```bash
BRO_TRUSTED_APP_DIR="$PWD/ui" ./build/helm-headless ui/ tests/test_shell_boot.js
```
Use a scratch `XDG_CONFIG_HOME` and `HELM_CONFIG_DIR` when running by hand, so the run does not write your real settings (ctest sets both).

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Super` / `Ctrl+Space` / `Alt+Space` | Toggle the launcher |
| `Super+V` / `Ctrl+Alt+V` | Clipboard history |
| `Super+L` / `Ctrl+Alt+L` | Lock |
| `Super+N` / `Ctrl+Shift+N` | Calendar and notification center |
| `Super+S` | Quick settings |
| `Super+W` | Spaces (workspaces overview) |
| `Super+,` / `Ctrl+,` | Settings (a hint until the new app lands) |
| `Super+1`..`9` | Switch workspace |
| `Super+Q` | Close the focused window |
| `Alt+Tab` / `Super+Tab` | Window switcher (release to switch) |
| Volume, media and brightness keys | Adjust, with an on-screen display |
| `Escape` | Close the open menu, launcher or panel |

Under DRM, bro routes only some of these chords to the shell today; the rest reach the focused window.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
