# helm

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Helm** is the standalone desktop environment shell application for the [bro ecosystem](https://github.com/wlejon/bro).

Built on top of `bro_engine`, `bro_bronze_host`, and `bronze`, Helm provides the primary human interface to the desktop operating system:
a status bar panel with hardware status and tray integrations, a centered spotlight fuzzy application launcher, a rich notification toast/drawer center, and a session lock screen with credential verification.

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
│   ├── bro.json            # Desktop shell manifest (declares "trusted": true)
│   ├── index.html          # Desktop shell DOM structure
│   ├── css/
│   │   ├── tokens.css      # Design system tokens (Oklch palette, typography, spacing)
│   │   └── shell.css       # Panel, launcher, popups, toasts, and lock screen styles
│   └── js/
│       ├── shell.js        # Main desktop controller orchestrating subsystems
│       ├── panel.js        # Top status bar, clock, audio/network/power popups, tray
│       ├── launcher.js     # Centered spotlight runner (bro.apps + bro.search)
│       ├── notify.js       # Toast notifications & drawer (bro.sys.notifications)
│       └── lock.js         # Session lock screen & password auth (bro.cred)
└── tests/
    └── test_shell_boot.js  # Headless integration test suite
```

### Trusted Desktop Permissions
Helm is a privileged desktop shell. In `ui/bro.json`, Helm declares `"trusted": true` and `"shell": true`, granting access to privileged system namespaces:
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
Launch in windowed mode:
```bash
./build/helm --windowed
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
./build/helm-headless ui/ tests/test_shell_boot.js
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Space` / `Alt+Space` / `Super` | Toggle Spotlight Application Launcher |
| `Ctrl+Alt+L` / `Meta+L` | Lock Session |
| `Ctrl+Shift+N` | Toggle Notification Drawer |
| `Escape` | Dismiss active popup, launcher, or notification drawer |
| `ArrowUp` / `ArrowDown` | Navigate results in Launcher |
| `Enter` | Launch selected application or action in Launcher |

---

## License

MIT License. See [LICENSE](LICENSE) for details.
