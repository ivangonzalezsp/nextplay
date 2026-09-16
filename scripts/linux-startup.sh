#!/usr/bin/env bash

set -e

SERVICE_NAME="what-should-i-play-next"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install_service() {
    echo "Installing startup service..."

    sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=What Should I Play Next
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/npm run start:production
Restart=on-failure
User=$USER
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME"
    sudo systemctl start "$SERVICE_NAME"

    echo "Service installed and started."
}

uninstall_service() {
    echo "Uninstalling startup service..."

    sudo systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    sudo systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    sudo rm -f "$SERVICE_FILE"

    sudo systemctl daemon-reload

    echo "Service removed."
}

case "$1" in
    install)
        install_service
        ;;
    uninstall)
        uninstall_service
        ;;
    *)
        echo "Usage: $0 {install|uninstall}"
        exit 1
        ;;
esac