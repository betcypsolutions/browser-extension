#!/usr/bin/env bash
# Seçilen tarayıcı için manifest.json'u hazırlar (Load unpacked / Temporary Add-on
# kök dizinde manifest.json bekler).
# Kullanım:  ./build.sh chrome   |   ./build.sh firefox
set -e
target="${1:-chrome}"
src="manifest.${target}.json"
if [ ! -f "$src" ]; then
  echo "Bilinmeyen hedef: $target (chrome | firefox)"; exit 1
fi
cp "$src" manifest.json
echo "✓ manifest.json <- $src  (hedef: $target)"
