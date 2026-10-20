#!/bin/zsh
set -e
cd -- "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22 or newer, then run this launcher again.'
  read -r '?Press Enter to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm install --cache "${TMPDIR:-/tmp}/gameonrunner-npm-cache" --no-audit --no-fund
fi
if [[ ! -f server/.env ]]; then
  cp server/.env.example server/.env
  echo 'Open server/.env, add MONGODB_URI, then run this launcher again.'
  read -r '?Press Enter to close.'
  exit 1
fi
if [[ ! -f client/assets/pose/pose_landmarker_lite.task || ! -f client/vendor/mediapipe/vision_bundle.js ]]; then
  npm run setup:pose
fi
echo 'GameOn Runner: open http://localhost:3000'
echo 'Keep this window open. Press Control+C to stop.'
npm start
