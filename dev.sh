#!/usr/bin/env bash
# Geliştirme için tarayıcıya özel klasörler üretir: build/chrome ve build/firefox.
# Her klasör kaynak dosyaların GERÇEK KOPYASINI + o tarayıcının doğru manifest'ini
# içerir.
#
# Neden kopya (symlink değil): Chrome MV3'te service worker dosyası symlink olduğunda
# kaydı sessizce başarısız olabiliyor → uzantı yükleniyor görünür ama arka plan ölü
# (Alt+Shift+S / ikon tıklaması çalışmaz, "Receiving end does not exist" hataları).
# Gerçek dosya kopyası bu sorunu tamamen ortadan kaldırır.
#
# Neden ayrı klasör: kök manifest.json tek dosya ve build.sh/bump.sh onu sürekli
# Firefox'a çeviriyor. Bu klasörler kök manifest.json'a HİÇ dokunmaz → Chrome ve
# Firefox aynı anda yüklü kalır, çakışmaz.
#
# Kullanım:  ./dev.sh        (her ikisini de hazırlar)
# NOT: Kaynak dosyaları (background.js, crop.js, *.html ...) düzenledikten sonra
#      ./dev.sh'yi TEKRAR çalıştır, sonra tarayıcıda Reload.
set -e
cd "$(dirname "$0")"

FILES="background.js content.js collector.js crop.html crop.js options.html options.js README.md KULLANIM-KILAVUZU.md"

for target in chrome firefox; do
  out="build/$target"
  rm -rf "$out"
  mkdir -p "$out"
  for f in $FILES; do
    cp "$f" "$out/$f"
  done
  cp -r icons "$out/icons"
  cp "manifest.$target.json" "$out/manifest.json"
  echo "✓ $out/  (manifest.$target.json, gerçek dosya kopyaları)"
done

echo ""
echo "Chrome:  chrome://extensions → 'Load unpacked' → $(pwd)/build/chrome"
echo "Firefox: about:debugging#/runtime/this-firefox → 'Load Temporary Add-on'"
echo "         → $(pwd)/build/firefox/manifest.json"
