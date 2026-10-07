#!/usr/bin/env bash
# ==============================================================================
# setup-helm-arch.sh
# Automated setup of Helm as the bare-metal desktop environment on Arch Linux.
# ==============================================================================
set -euo pipefail

echo "========================================================"
echo " Setting up Helm Desktop Environment (DRM/KMS bare-metal)"
echo "========================================================"

if [[ $EUID -ne 0 ]]; then
   echo "Error: This script must be run as root (or with sudo)."
   exit 1
fi

echo "[1/6] Updating Arch Linux keyring and packages..."
pacman -Sy --noconfirm archlinux-keyring
pacman -Syu --noconfirm

echo "[2/6] Installing required build tools and libraries..."
pacman -S --noconfirm --needed \
    base-devel git cmake ninja clang gcc \
    libdrm libinput libxkbcommon seatd systemd polkit \
    mesa vulkan-swrast vulkan-icd-loader vulkan-headers \
    pipewire wireplumber pipewire-pulse \
    ttf-dejavu ttf-liberation noto-fonts \
    pulseaudio-alsa alsa-utils htop curl wget

echo "[3/6] Enabling seat management & audio services..."
systemctl enable --now seatd.service || true
systemctl enable --now systemd-logind.service || true

# Enable Hyper-V guest integration daemons if available
pacman -S --noconfirm --needed hyperv || true
systemctl enable hv_fcopy_daemon.service || true
systemctl enable hv_kvp_daemon.service || true
systemctl enable hv_vss_daemon.service || true

echo "[4/6] Creating 'helm' session user..."
if ! id -u helm &>/dev/null; then
    useradd -m -G video,input,audio,wheel,seat -s /bin/bash helm
    echo "helm:helm" | chpasswd
    echo "%wheel ALL=(ALL:ALL) NOPASSWD: ALL" >> /etc/sudoers.d/wheel_nopasswd
fi

echo "[5/6] Building Helm from source..."
HELM_SRC_DIR="/home/helm/helm"
BRO_SRC_DIR="/home/helm/bro"

# If repository doesn't exist locally, clone or copy
if [[ ! -d "$BRO_SRC_DIR" ]]; then
    echo "Cloning bro into $BRO_SRC_DIR..."
    sudo -u helm git clone --recursive https://github.com/wlejon/bro.git "$BRO_SRC_DIR" || true
fi

if [[ ! -d "$HELM_SRC_DIR" ]]; then
    echo "Cloning helm into $HELM_SRC_DIR..."
    sudo -u helm git clone --recursive https://github.com/wlejon/helm.git "$HELM_SRC_DIR" || true
fi

if [[ -d "$HELM_SRC_DIR" ]]; then
    echo "Compiling Helm..."
    cd "$HELM_SRC_DIR"
    sudo -u helm cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
    sudo -u helm ninja -C build
    cmake --install build || true
fi

echo "[6/6] Configuring bare-metal DRM/KMS systemd service..."
cat << 'EOF' > /etc/systemd/system/helm-drm.service
[Unit]
Description=Helm Bare-Metal Desktop Environment Shell
After=systemd-user-sessions.service plymouth-quit-wait.service systemd-logind.service seatd.service
Conflicts=getty@tty1.service

[Service]
Type=simple
User=helm
WorkingDirectory=/home/helm
Environment="BRO_TRUSTED_APP_DIR=/home/helm/helm/ui"
Environment="WLR_RENDERER=pixman"
Environment="LIBGL_ALWAYS_SOFTWARE=1"
ExecStart=/usr/local/bin/helm --drm --no-gpu
Restart=on-failure
RestartSec=2
StandardInput=tty
StandardOutput=journal
StandardError=journal
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes

[Install]
WantedBy=graphical.target
EOF

systemctl daemon-reload
systemctl set-default graphical.target
systemctl enable helm-drm.service

echo "========================================================"
echo " Helm Bare-Metal Desktop Environment Setup Complete!"
echo " Rebooting or starting helm-drm.service will launch Helm."
echo "========================================================"
