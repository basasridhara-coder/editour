#!/usr/bin/env bash

# PostCard Web Feed Launcher
# Starts a local web server or bridges to the connected Android device

PORT=8080
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$SCRIPT_DIR/web_feed"

echo "=================================================="
echo "📰 PostCard • Instagram-Style Editorial Web Feed"
echo "=================================================="

# Check if ADB device is connected
if command -v adb &> /dev/null; then
  DEVICE=$(adb devices | grep -w "device" | head -n 1 | awk '{print $1}')
  if [ -n "$DEVICE" ]; then
    echo "📱 Found connected Android device: $DEVICE"
    echo "🔗 Establishing ADB port forwarding (tcp:$PORT -> tcp:$PORT)..."
    adb -s "$DEVICE" reverse tcp:$PORT tcp:$PORT 2>/dev/null || true

    echo "🔄 Syncing latest posts from connected phone..."
    python3 -c "
import json, subprocess
try:
    cmd = 'adb -s $DEVICE shell \"run-as com.postcard.app cat app_flutter/postcards_v2.json\"'
    raw = subprocess.check_output(cmd, shell=True).decode('utf-8').strip()
    phone_items = json.loads(raw)
    with open('$WEB_DIR/postcards_data.json', 'r') as f:
        existing = json.load(f)
    existing_ids = {p['id'] for p in existing}
    added = 0
    for p in phone_items:
        if p['id'] not in existing_ids:
            existing.insert(0, p)
            added += 1
    with open('$WEB_DIR/postcards_data.json', 'w') as f:
        json.dump(existing, f, indent=2)
    print(f'✅ Synced {len(phone_items)} posts from phone into web feed!')
except Exception as e:
    pass
"
  fi
fi

# Check if port 8080 is already in use (e.g. by the app's embedded WebFeedServer)
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
  echo "🟢 Port $PORT is active (App Web Server or local server detected)."
else
  echo "🚀 Launching local web server for PostCard Feed on port $PORT..."
  cd "$WEB_DIR"
  python3 -m http.server $PORT > /dev/null 2>&1 &
  SERVER_PID=$!
  echo "⚡ Server running with PID $SERVER_PID"
fi

# Open Chrome or default browser
URL="http://localhost:$PORT"
echo "🌐 Opening PostCard Web Feed in browser: $URL"
if [[ "$OSTYPE" == "darwin"* ]]; then
  open "$URL"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  xdg-open "$URL" || sensible-browser "$URL"
fi

echo "=================================================="
echo "✨ PostCard Web Feed is live at: $URL"
echo "=================================================="
