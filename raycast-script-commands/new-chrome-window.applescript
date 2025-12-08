#!/usr/bin/osascript

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title New Chrome Window
# @raycast.mode silent

# Optional parameters:
# @raycast.icon ⚡️

# Documentation:
# @raycast.author marcklingen
# @raycast.authorURL https://github.com/marcklingen

tell application "Google Chrome"
  make new window
end tell
