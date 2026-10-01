#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Ensure brew and node are in PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Check if server is already running on port 5151
if ! lsof -i :5151 >/dev/null 2>&1; then
  echo "Starting ADB Wireless GUI server..."
  nohup node server.js > "$DIR/server.log" 2>&1 &
  sleep 1
else
  echo "ADB Wireless GUI server is already running."
fi

# Open in default browser
open "http://localhost:5151"
