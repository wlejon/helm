# helm

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Helm** is the standalone desktop environment shell application for the [bro ecosystem](https://github.com/wlejon/bro).

Built on top of `bro_engine`, `bro_bronze_host`, and `bronze`, Helm provides the primary human interface to the desktop operating system:
a slim top bar (workspaces, focused app, clock, media, tray, status), a quick settings panel (volume and outputs, network and Wi-Fi, Bluetooth, Do Not Disturb, power), a calendar with the notification center, toasts and on-screen display, a launcher with app grid, search, calculator, actions and clipboard history, an auto-hiding dock with running indicators, an Alt+Tab window switcher, and a lock screen with credential verification.

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
│   ├── index.html          # Shell DOM: wallpaper, bar, popovers, dock, overlays
│   ├── css/
│   │   ├── tokens.css      # Palette (accent hue knob), glass, radii, z-scale
│   │   ├── base.css        # Reset and shared controls: buttons, sliders, tiles, menus, popovers
│   │   ├── bar.css         # Top bar
│   │   ├── popovers.css    # Quick settings, calendar + notification center, toasts, OSD
│   │   ├── launcher.css    # Launcher overlay
│   │   ├── dock.css        # Dock and window switcher
│   │   ├── settings.css    # Settings window, cards, rows, controls
│   │   ├── settings-views.css # Layout inside the settings pages
│   │   └── lock.css        # Lock screen
│   └── js/
│       ├── shell.js        # Builds every surface, global hotkeys, window.helm
│       ├── util.js         # DOM builder, app icons, popover manager, time formatting
│       ├── icons.js        # Inline SVG icon set
│       ├── settings.js     # Shell preferences (bro.conf, helm.shell.*)
│       ├── wallpaper.js    # Gradient presets or an image
│       ├── controls.js     # Slider and switch widgets
│       ├── system.js       # Audio, network, Bluetooth, power, display (bro.sys / pulse)
│       ├── windows.js      # Windows and workspaces (bro.compositor)
│       ├── appdb.js        # App catalog, window-to-app matching, launching (bro.apps)
│       ├── media.js        # MPRIS controller
│       ├── menus.js        # Context menus and tray DBusMenu menus
│       ├── bar.js          # Top bar
│       ├── quicksettings.js# Quick settings panel
│       ├── notify.js       # Notification server, toasts, history (bro.sys.notifications)
│       ├── calendar.js     # Calendar and notification center popover
│       ├── osd.js          # Volume / brightness on-screen display
│       ├── launcher.js     # Launcher: grid, search, calculator, actions, clipboard
│       ├── calc.js         # Arithmetic evaluator for the launcher
│       ├── dock.js         # Dock: pinned + running apps, intellihide
│       ├── switcher.js     # Alt+Tab window switcher
│       ├── lock.js         # Lock screen and password auth (bro.cred)
│       ├── dom.js          # DOM builder used by the Settings app
│       └── settings/       # Settings app: controller, shared components, one view per page
│                           # (sound, displays, network, power, appearance, keyboard, about)
└── tests/
    ├── test_shell_boot.js      # Boot, bar, popovers, launcher, hotkeys, lock fails closed
    ├── test_notifications.js   # Toasts, history, actions, Do Not Disturb
    ├── test_dock.js            # Dock, intellihide, Alt+Tab over stand-in windows
    ├── test_settings.js        # Settings pages, search, entry points
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
| `Super+,` / `Ctrl+,` | Settings |
| `Super+1`..`9` | Switch workspace |
| `Super+Q` | Close the focused window |
| `Alt+Tab` / `Super+Tab` | Window switcher (release to switch) |
| Volume, media and brightness keys | Adjust, with an on-screen display |
| `Escape` | Close the open menu, launcher or popover |

Under DRM, bro routes only some of these chords to the shell today; the rest reach the focused window.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
