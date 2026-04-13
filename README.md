# Fire TV Background Server

A lightweight Node.js server that lets you remotely control background images and looping videos on an Amazon Fire TV, triggered from a Stream Deck, API call, or web control panel.

Built for offices, studios, streaming setups, and digital signage — anywhere you want a TV displaying branded backgrounds that you can switch on the fly.

## How It Works

```
┌─────────────┐         HTTP API         ┌─────────────┐
│  Stream Deck │ ───────────────────────► │  Node.js    │
│  (any device)│  /api/next, /api/set    │  Server     │
└─────────────┘                          │  (your Mac) │
                                          └──────┬──────┘
┌─────────────┐         SSE (real-time)          │
│  Fire TV     │ ◄───────────────────────────────┘
│  (Silk)      │  Instant background updates
└─────────────┘
```

1. A Node.js server runs on your Mac (or any machine on the same network)
2. The Fire TV opens a fullscreen display page in Silk browser
3. Stream Deck buttons (or any HTTP client) hit the API to change what's shown
4. The display page updates instantly via Server-Sent Events — no polling, no refresh

## Features

- **Images**: JPG, PNG, WebP, GIF, SVG, BMP
- **Video**: MP4, WebM, MOV — loops automatically, muted, fills the screen
- **Solid colours**: Set any hex colour as the background
- **Crossfade transitions**: Smooth transitions between backgrounds
- **Cycle through media**: Next/previous endpoints for Stream Deck buttons
- **State persistence**: Remembers the last background across server restarts
- **Screen wake lock**: Prevents the Fire TV from going to screensaver
- **ADB integration**: Wake, sleep, and launch the Fire TV remotely
- **Control panel**: Web UI with thumbnails, colour swatches, and generated curl commands
- **macOS launchd service**: Auto-starts on login, auto-restarts on crash

## Requirements

- **Mac** (or Linux — adjust the launchd setup) with Node.js 18+
- **Amazon Fire TV** (TV or Stick) on the same network
- **Stream Deck** (optional) — any device that can make HTTP requests works

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/jamespoulter/fire-tv-backgrounds.git
cd fire-tv-backgrounds
npm install
```

### 2. Add your backgrounds

Drop images and videos into the `backgrounds/` folder:

```bash
cp ~/Desktop/my-background.jpg backgrounds/
cp ~/Desktop/my-loop.mp4 backgrounds/
```

Supported formats: `.jpg` `.jpeg` `.png` `.webp` `.gif` `.bmp` `.svg` `.mp4` `.webm` `.mov`

### 3. Start the server

```bash
npm start
```

The server runs on port `3100`. You'll see:

```
Fire TV Background Server running on http://0.0.0.0:3100
```

### 4. Open on Fire TV

On your Fire TV, open **Silk Browser** and navigate to:

```
http://YOUR_MAC_IP:3100
```

Find your Mac's IP with:

```bash
ipconfig getifaddr en0
```

This is the fullscreen display page. It will show a black screen until you set a background.

### 5. Set a background

From any device on the network:

```bash
# Set a specific image
curl "http://YOUR_MAC_IP:3100/api/set?image=my-background.jpg"

# Cycle to next
curl "http://YOUR_MAC_IP:3100/api/next"

# Set a colour
curl "http://YOUR_MAC_IP:3100/api/color?hex=0f171f"
```

## API Reference

All endpoints accept GET requests, making them easy to use with Stream Deck "Website" actions.

Replace `YOUR_MAC_IP` with your Mac's local IP address (e.g. `192.168.1.100`).

### Media Control

| Endpoint | Description |
|---|---|
| `GET /api/next` | Cycle to next image/video |
| `GET /api/prev` | Cycle to previous image/video |
| `GET /api/set?image=FILENAME` | Set a specific file |
| `GET /api/blank` | Black screen |
| `GET /api/color?hex=RRGGBB` | Solid colour background |
| `GET /api/transition?duration=1.5` | Set crossfade duration (seconds) |

### Info

| Endpoint | Description |
|---|---|
| `GET /api/current` | Current state (mode, file, colour) |
| `GET /api/images` | List all media files in backgrounds/ |
| `GET /api/health` | Server status and connected client count |

### Fire TV ADB Control (optional)

| Endpoint | Description |
|---|---|
| `GET /api/firetv/setup?ip=FIRE_TV_IP` | Save Fire TV IP and connect via ADB |
| `GET /api/firetv/launch` | Wake TV and open display page in Silk |
| `GET /api/firetv/wake` | Wake the Fire TV |
| `GET /api/firetv/sleep` | Put the Fire TV to sleep |

### Web Control Panel

Open `http://YOUR_MAC_IP:3100/control.html` for a visual control panel with thumbnails, colour swatches, and auto-generated curl commands.

## Stream Deck Setup

Add **System > Website** buttons with these URLs. Tick **"Access in background"** so it doesn't open a browser window each time.

| Button | URL |
|---|---|
| Next Background | `http://YOUR_MAC_IP:3100/api/next` |
| Previous Background | `http://YOUR_MAC_IP:3100/api/prev` |
| Go Black | `http://YOUR_MAC_IP:3100/api/blank` |
| Specific Image | `http://YOUR_MAC_IP:3100/api/set?image=my-bg.jpg` |
| Wake + Launch TV | `http://YOUR_MAC_IP:3100/api/firetv/launch` |
| Sleep TV | `http://YOUR_MAC_IP:3100/api/firetv/sleep` |

> **Note:** The Stream Deck does not need to be connected to the same machine running the server — it just needs to be on the same network.

## Run as a Persistent macOS Service

The included setup script installs a `launchd` service that starts the server on login and restarts it if it crashes.

### Before running setup

Edit `com.fire-tv-backgrounds.plist` and replace the placeholder paths with your actual paths:

- Replace `/path/to/node` with the output of `which node`
- Replace `/path/to/fire-tv-backgrounds` with the absolute path to this folder

### Run setup

```bash
chmod +x setup.sh
./setup.sh
```

### Manage the service

```bash
# Restart
launchctl kickstart -k gui/$(id -u)/com.fire-tv-backgrounds

# Stop
launchctl bootout gui/$(id -u)/com.fire-tv-backgrounds

# View logs
tail -f logs/stdout.log
```

## Fire TV ADB Setup (Optional)

ADB lets the server wake, sleep, and launch the browser on your Fire TV remotely. This is optional — you can use the display page without it.

### 1. Install ADB

```bash
# macOS — download directly from Google
curl -L -o /tmp/platform-tools.zip \
  https://dl.google.com/android/repository/platform-tools-latest-darwin.zip
unzip /tmp/platform-tools.zip -d .
```

This creates a `platform-tools/` directory with `adb` inside. The server expects it at `./platform-tools/adb`.

### 2. Enable Developer Options on Fire TV

The menu path depends on your Fire TV model:

**Fire TV Stick / Cube:**
1. Settings > My Fire TV > About
2. Click "Fire TV Stick" (or device name) **7 times**
3. Go back — "Developer Options" now appears under My Fire TV

**Fire TV (the actual TV / Fire TV Edition):**
1. Settings > Device & Software > About
2. Click your TV name **7 times**
3. Go back — "Developer Options" now appears under Device & Software

Then:
1. Open **Developer Options**
2. Turn on **ADB Debugging**
3. Accept the warning

### 3. Connect

```bash
# Tell the server your Fire TV's IP
curl "http://localhost:3100/api/firetv/setup?ip=FIRE_TV_IP"
```

The Fire TV will show an authorisation popup — select **"Always allow from this computer"** and **Allow**.

Find your Fire TV's IP at: Settings > Device & Software (or My Fire TV) > About > Network.

### 4. Test

```bash
# Launch display page on Fire TV
curl "http://localhost:3100/api/firetv/launch"

# Sleep
curl "http://localhost:3100/api/firetv/sleep"

# Wake
curl "http://localhost:3100/api/firetv/wake"
```

## Fire TV Display Tips

- **Fullscreen:** In Silk browser, press the **menu button** on the remote and select **Full Screen** to hide the URL bar
- **Prevent screensaver:** The display page includes a Wake Lock API call and a hidden video fallback to keep the screen on. As a belt-and-braces measure, set the Fire TV screensaver to "Never": Settings > Display & Sounds > Screen Saver > Start Time > Never
- **Kiosk mode:** For a truly clean setup, consider sideloading [Fully Kiosk Browser](https://www.fully-kiosk.com/) via ADB — it provides true fullscreen with no browser chrome

## Project Structure

```
fire-tv-backgrounds/
├── server.js                  # Express server with API and SSE
├── package.json
├── setup.sh                   # macOS launchd installer
├── com.fire-tv-backgrounds.plist  # launchd service definition (template)
├── public/
│   ├── index.html             # Fullscreen display page (Fire TV shows this)
│   ├── control.html           # Web control panel
│   └── manifest.json          # Web app manifest
├── backgrounds/               # Drop your images and videos here
│   └── demo.svg               # Placeholder demo image
├── platform-tools/            # ADB (not committed — download separately)
├── logs/                      # Server logs (created by setup.sh)
└── config.json                # Runtime state (auto-generated, not committed)
```

## Licence

MIT
