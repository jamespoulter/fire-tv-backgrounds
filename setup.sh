#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.fire-tv-backgrounds"
PLIST_TEMPLATE="$DIR/$PLIST_NAME.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "=== Fire TV Background Server Setup ==="
echo ""

# Find Node.js
NODE_PATH=$(which node 2>/dev/null || echo "")
if [ -z "$NODE_PATH" ]; then
    echo "Error: Node.js not found. Install it from https://nodejs.org"
    exit 1
fi
NODE_DIR=$(dirname "$NODE_PATH")
echo "Using Node.js: $NODE_PATH"

# Create directories
mkdir -p "$DIR/logs"
mkdir -p "$DIR/backgrounds"

# Install dependencies
echo "Installing dependencies..."
cd "$DIR"
npm install --omit=dev

# Generate plist with correct paths
echo "Generating launchd plist..."
sed \
    -e "s|__NODE_PATH__|$NODE_PATH|g" \
    -e "s|__NODE_DIR__|$NODE_DIR|g" \
    -e "s|__PROJECT_DIR__|$DIR|g" \
    "$PLIST_TEMPLATE" > "$PLIST_DST.tmp"

# Unload existing if present
if launchctl list 2>/dev/null | grep -q "$PLIST_NAME"; then
    echo "Stopping existing service..."
    launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
fi

# Install and load
mv "$PLIST_DST.tmp" "$PLIST_DST"
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"

echo ""
echo "=== Done ==="
echo ""

# Get local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "YOUR_MAC_IP")

echo "Server running on port 3100"
echo ""
echo "Fire TV display URL:  http://$LOCAL_IP:3100"
echo "Control panel:        http://$LOCAL_IP:3100/control.html"
echo ""
echo "Stream Deck buttons (use System > Website with 'Access in background'):"
echo "  Next:       http://$LOCAL_IP:3100/api/next"
echo "  Previous:   http://$LOCAL_IP:3100/api/prev"
echo "  Blank:      http://$LOCAL_IP:3100/api/blank"
echo "  Set image:  http://$LOCAL_IP:3100/api/set?image=FILENAME.jpg"
echo ""
echo "Drop your background images/videos into: $DIR/backgrounds/"
echo ""
echo "To stop:    launchctl bootout gui/$(id -u)/$PLIST_NAME"
echo "To restart: launchctl kickstart -k gui/$(id -u)/$PLIST_NAME"
echo "Logs:       tail -f $DIR/logs/stdout.log"
