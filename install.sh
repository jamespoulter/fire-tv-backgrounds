#!/bin/bash
set -e

REPO="https://github.com/jamespoulter/fire-tv-backgrounds.git"
INSTALL_DIR="$HOME/fire-tv-backgrounds"
PLIST_NAME="com.fire-tv-backgrounds"

echo ""
echo "  Fire TV Background Server — One-Step Install"
echo "  ============================================="
echo ""

# Check Node.js
NODE_PATH=$(which node 2>/dev/null || echo "")
if [ -z "$NODE_PATH" ]; then
    echo "Error: Node.js is required but not installed."
    echo ""
    echo "Install it from https://nodejs.org or run:"
    echo "  brew install node"
    echo ""
    exit 1
fi
NODE_DIR=$(dirname "$NODE_PATH")
NODE_VERSION=$(node --version)
echo "  Node.js:  $NODE_PATH ($NODE_VERSION)"

# Check git
if ! command -v git &>/dev/null; then
    echo "Error: git is required but not installed."
    exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "  Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull --ff-only
else
    echo "  Cloning repo..."
    git clone "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies
echo "  Installing dependencies..."
npm install --omit=dev --silent

# Create directories
mkdir -p "$INSTALL_DIR/logs"
mkdir -p "$INSTALL_DIR/backgrounds"

# Stop existing service if running
if launchctl list 2>/dev/null | grep -q "$PLIST_NAME"; then
    echo "  Stopping existing service..."
    launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
    sleep 1
fi

# Generate plist with correct paths
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
mkdir -p "$HOME/Library/LaunchAgents"

sed \
    -e "s|__NODE_PATH__|$NODE_PATH|g" \
    -e "s|__NODE_DIR__|$NODE_DIR|g" \
    -e "s|__PROJECT_DIR__|$INSTALL_DIR|g" \
    "$INSTALL_DIR/$PLIST_NAME.plist" > "$PLIST_DST"

# Start service
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
sleep 2

# Verify
if launchctl list 2>/dev/null | grep -q "$PLIST_NAME"; then
    echo "  Service started successfully."
else
    echo "  Warning: Service may not have started. Check logs at $INSTALL_DIR/logs/"
fi

# Get local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "YOUR_MAC_IP")

echo ""
echo "  ✓ Installed to $INSTALL_DIR"
echo "  ✓ Running as persistent service (auto-starts on login)"
echo ""
echo "  ┌──────────────────────────────────────────────────────┐"
echo "  │  Fire TV display:  http://$LOCAL_IP:3100              "
echo "  │  Control panel:    http://$LOCAL_IP:3100/control.html "
echo "  └──────────────────────────────────────────────────────┘"
echo ""
echo "  Next steps:"
echo "  1. Drop images/videos into $INSTALL_DIR/backgrounds/"
echo "  2. Open http://$LOCAL_IP:3100 in Silk browser on your Fire TV"
echo "  3. Add Stream Deck buttons with URL: http://$LOCAL_IP:3100/api/next"
echo ""
echo "  Service commands:"
echo "    Restart:  launchctl kickstart -k gui/\$(id -u)/$PLIST_NAME"
echo "    Stop:     launchctl bootout gui/\$(id -u)/$PLIST_NAME"
echo "    Logs:     tail -f $INSTALL_DIR/logs/stdout.log"
echo ""
