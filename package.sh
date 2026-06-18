#!/usr/bin/env bash
# Dağıtılabilir paketler üretir: dist/livechat-screenshot-{chrome,firefox}.zip
# Chrome: zip'i "Load unpacked" yerine paketlenmiş yüklemek / Web Store / policy için.
# Firefox: imzalama (web-ext sign) ve AMO yüklemesi için kaynak zip.
set -e
cd "$(dirname "$0")"

FILES="background.js content.js collector.js crop.html crop.js options.html options.js icons README.md KULLANIM-KILAVUZU.md"

rm -rf dist
mkdir -p dist

# --- Chrome paketi ---
cp manifest.chrome.json manifest.json
zip -rqX dist/livechat-screenshot-chrome.zip $FILES manifest.json
echo "✓ dist/livechat-screenshot-chrome.zip"

# --- Firefox paketi ---
cp manifest.firefox.json manifest.json
zip -rqX dist/livechat-screenshot-firefox.zip $FILES manifest.json
echo "✓ dist/livechat-screenshot-firefox.zip"

echo ""
echo "Firefox imzalama (kalıcı .xpi):"
echo "  cp manifest.firefox.json manifest.json"
echo "  npx web-ext sign --channel=unlisted --api-key=<AMO_JWT_ISSUER> --api-secret=<AMO_JWT_SECRET>"
echo "  → imzalı .xpi 'web-ext-artifacts/' altında oluşur, kalıcı yüklenebilir."
