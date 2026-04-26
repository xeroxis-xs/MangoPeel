# Custom Build & Deploy Guide

This guide covers building and deploying customized MangoHud (C++ overlay) and MangoPeel (Decky plugin) on Bazzite OS (ROG Ally X or Steam Deck).

## Architecture

```
Steam Game Mode
  └── Gamescope (compositor)
       └── mangoapp (MangoHud binary, renders the HUD overlay)
            └── reads config from /tmp/mangohud.<id>
                 └── MangoPeel (Decky plugin) overwrites this config
```

- **MangoHud / mangoapp**: C++ binary that renders the on-screen overlay. Changes here affect rendering logic (labels, layout, sizing, new parameters).
- **MangoPeel**: TypeScript/React frontend + Python backend Decky plugin. Changes here affect the UI controls and config generation.

---

## Prerequisites

### On Windows (development machine)
- [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) with Ubuntu (`wsl --install`)
- [Node.js](https://nodejs.org/) (LTS) with `pnpm` (`npm install -g pnpm`)
- Git

### On Bazzite (target device)
- [Decky Loader](https://decky.xyz/) installed (with Developer Mode enabled for zip installs)
- SSH access enabled (`sudo systemctl enable --now sshd`)

---

## Building MangoHud (mangoapp)

MangoHud is C++ and must be compiled for Linux. Use WSL2 on your Windows machine.

### First-time setup (in WSL2)

```bash
# Enter WSL
wsl

# Install build dependencies
sudo apt update
sudo apt install -y build-essential cmake git python3 python3-pip \
  meson ninja-build glslang-tools libx11-dev libxrandr-dev \
  libdbus-1-dev pkg-config unzip wget

# Clone MangoHud into WSL's native filesystem (NOT /mnt/c/)
cd ~
git clone --recurse-submodules https://github.com/xeroxis-xs/MangoHud.git
cd MangoHud
git checkout custom-hud

# Initial build
./build.sh build -Dmangoapp=true
```

### Subsequent builds (after code changes)

When you edit source files on Windows (`C:\Users\cheryl\GitHub\Mangohud\src\`), copy them into WSL and rebuild:

```bash
wsl

# Copy modified source files from Windows into WSL
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/overlay.cpp ~/MangoHud/src/
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/overlay.h ~/MangoHud/src/
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/hud_elements.cpp ~/MangoHud/src/
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/gpu.cpp ~/MangoHud/src/
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/overlay_params.h ~/MangoHud/src/
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/overlay_params.cpp ~/MangoHud/src/

# Rebuild (incremental, fast)
cd ~/MangoHud
ninja -C build/meson64

# Strip debug symbols to reduce binary size
strip build/meson64/src/mangoapp
```

The built binary is at `~/MangoHud/build/meson64/src/mangoapp`.

### Deploy MangoHud to Bazzite

```bash
# From WSL, copy to Bazzite via SCP (replace BAZZITE_IP)
scp ~/MangoHud/build/meson64/src/mangoapp xeroxis@BAZZITE_IP:~/mangoapp
```

Then on Bazzite:

```bash
# Store in persistent location
sudo mkdir -p /var/lib/mangohud-custom
sudo cp ~/mangoapp /var/lib/mangohud-custom/mangoapp

# Unlock the immutable filesystem and replace
sudo ostree admin unlock 2>/dev/null || true
sudo cp /var/lib/mangohud-custom/mangoapp /usr/bin/mangoapp

# Restart mangoapp to apply
sudo killall mangoapp
```

### Persist across reboots (systemd service)

Bazzite's `/usr` resets on every reboot. Create a systemd service to auto-apply:

```bash
sudo tee /etc/systemd/system/mangohud-custom.service > /dev/null << 'EOF'
[Unit]
Description=Apply custom MangoHud binary
DefaultDependencies=no
Before=display-manager.service graphical.target
After=local-fs.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c 'ostree admin unlock 2>/dev/null || true; cp /var/lib/mangohud-custom/mangoapp /usr/bin/mangoapp'

[Install]
WantedBy=graphical.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mangohud-custom.service
```

After a system update (`rpm-ostree upgrade`), the stock binary gets restored on reboot, but the service replaces it again automatically.

---

## Building MangoPeel (Decky Plugin)

MangoPeel is a TypeScript/React project. Build uses WSL since `build.sh` requires bash.

### First-time setup (in WSL2)

```bash
wsl

# Install Node.js and pnpm if not already installed
sudo apt update
sudo apt install -y nodejs npm
npm install -g pnpm

# Navigate to MangoPeel on Windows filesystem
cd /mnt/c/Users/cheryl/GitHub/MangoPeel
pnpm install
```

### Build

```bash
wsl
cd /mnt/c/Users/cheryl/GitHub/MangoPeel

# Build the plugin (compiles all TypeScript/React into a single dist/index.js)
pnpm run build

# Optional: create deployable tar.gz for Decky zip install
bash build.sh
```

`pnpm run build` compiles all source files (`config_main.ts`, `perfStore.ts`, `pluginMain.ts`, `ParamItem.tsx`, etc.) into a single **`dist/index.js`** bundle. That is the only file the plugin loads at runtime.

### Deploy MangoPeel to Bazzite

**Option A: Via Decky Developer Mode (recommended for first install)**

1. In Game Mode, open Decky Loader settings
2. Enable **Developer Mode**
3. Go to the Decky menu > Developer > Install Plugin from ZIP
4. Transfer `MangoPeel.tar.gz` to Bazzite and select it

**Option B: Manual file copy (fastest for iterating)**

Only one file needs to be copied -- the compiled `dist/index.js`:

```bash
# From WSL, copy to Bazzite via SCP (replace BAZZITE_IP)
scp /mnt/c/Users/cheryl/GitHub/MangoPeel/dist/index.js xeroxis@BAZZITE_IP:~/index.js
```

Then on Bazzite:

```bash
# Replace the plugin's index.js
cp ~/index.js ~/homebrew/plugins/MangoPeel/dist/index.js

# Restart Decky Loader to pick up changes
sudo systemctl restart plugin_loader.service
```

---

## What Files to Copy: Summary

| Project | You edit (on Windows) | You build (in WSL) | You deploy to Bazzite |
|---|---|---|---|
| **MangoHud** | `src/*.cpp`, `src/*.h` | `~/MangoHud/build/meson64/src/mangoapp` | `/usr/bin/mangoapp` |
| **MangoPeel** | `src/**/*.ts`, `src/**/*.tsx` | `dist/index.js` | `~/homebrew/plugins/MangoPeel/dist/index.js` |

- **MangoHud**: 6 source files in, 1 binary out (`mangoapp`)
- **MangoPeel**: All TypeScript/React compiles into 1 file (`dist/index.js`)

---

## Quick Reference: Full Rebuild & Deploy

All steps run in WSL. Replace `BAZZITE_IP` with your device's IP address.

```bash
wsl

# --- MangoHud ---
# Copy source files from Windows into WSL build tree
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/overlay.cpp ~/MangoHud/src/
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/overlay.h ~/MangoHud/src/
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/hud_elements.cpp ~/MangoHud/src/
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/gpu.cpp ~/MangoHud/src/
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/overlay_params.h ~/MangoHud/src/
cp /mnt/c/Users/cheryl/GitHub/Mangohud/src/overlay_params.cpp ~/MangoHud/src/

# Build and strip
cd ~/MangoHud
ninja -C build/meson64
strip build/meson64/src/mangoapp

# Send to Bazzite
scp build/meson64/src/mangoapp xeroxis@BAZZITE_IP:~/mangoapp

# --- MangoPeel ---
cd /mnt/c/Users/cheryl/GitHub/MangoPeel
pnpm run build

# Send to Bazzite
scp dist/index.js xeroxis@BAZZITE_IP:~/index.js
```

Then SSH into Bazzite and apply:

```bash
ssh xeroxis@BAZZITE_IP

# Apply MangoHud
sudo ostree admin unlock 2>/dev/null || true
sudo cp ~/mangoapp /usr/bin/mangoapp
sudo cp ~/mangoapp /var/lib/mangohud-custom/mangoapp
sudo killall mangoapp

# Apply MangoPeel
cp ~/index.js ~/homebrew/plugins/MangoPeel/dist/index.js
sudo systemctl restart plugin_loader.service
```

---

## After a Bazzite OS Update

Bazzite OS updates (`rpm-ostree upgrade`) replace `/usr/bin/mangoapp` with the stock version. However:

- **MangoHud**: The `mangohud-custom.service` systemd service automatically restores your custom binary on every boot. **No action needed.** Just reboot after the update and verify:
  ```bash
  sudo systemctl status mangohud-custom.service
  ls -la /usr/bin/mangoapp /var/lib/mangohud-custom/mangoapp  # sizes should match
  ```

- **MangoPeel**: Lives in `~/homebrew/plugins/MangoPeel/` which is in your home directory. **OS updates don't touch it.** Your `index.js`, `main.py`, and saved settings (`~/homebrew/settings/MangoPeel/config.json`) all persist.

If something looks wrong after an OS update (e.g. stock HUD appears), run this on Bazzite to manually re-apply:

```bash
sudo ostree admin unlock 2>/dev/null || true
sudo killall mangoapp
sudo cp /var/lib/mangohud-custom/mangoapp /usr/bin/mangoapp
# mangoapp auto-restarts via gamescope
```

### If you need to update the custom binary

Only necessary if upstream MangoHud changes break compatibility with your custom build. From your Windows machine in WSL:

```bash
wsl
cd ~/MangoHud
git fetch origin
git merge origin/master

# Re-apply your custom branch changes
git checkout custom-hud
git rebase master

# Rebuild
ninja -C build/meson64
strip build/meson64/src/mangoapp

# Deploy
scp build/meson64/src/mangoapp xeroxis@BAZZITE_IP:~/mangoapp
```

Then on Bazzite:
```bash
sudo killall mangoapp
sudo cp ~/mangoapp /usr/bin/mangoapp
sudo cp ~/mangoapp /var/lib/mangohud-custom/mangoapp
```

---

## Can I Build Directly on Bazzite?

**MangoPeel (TypeScript):** Yes, but requires installing Node.js:
```bash
# Install Node.js via distrobox (recommended for immutable OS)
distrobox create --name dev --image fedora:latest
distrobox enter dev
sudo dnf install -y nodejs npm
npm install -g pnpm
cd ~/MangoPeel  # clone your fork here
pnpm install && pnpm run build
cp dist/index.js ~/homebrew/plugins/MangoPeel/dist/index.js
```

**MangoHud (C++):** Not practical on Bazzite. The build requires ~2GB of development libraries (`meson`, `ninja`, `glslang-tools`, X11 headers, etc.) that can't be permanently installed on the immutable `/usr` filesystem. Use WSL2 or a Linux VM instead.

---

## Verifying Changes

- **MangoHud binary**: `ls -la /usr/bin/mangoapp /var/lib/mangohud-custom/mangoapp` (sizes should match)
- **MangoHud service**: `sudo systemctl status mangohud-custom.service` (should show `active (exited)`)
- **MangoPeel config**: `cat /tmp/mangohud.*` (should show your custom params, not `preset=2`)
- **MangoPeel settings**: `cat ~/homebrew/settings/MangoPeel/config.json | head -5` (should exist with data)
- **MangoPeel logs**: `cat /tmp/MangoPeel.log` for debug output
- **MangoPeel UI**: In Game Mode, Decky > MangoPeel should show your custom parameters
