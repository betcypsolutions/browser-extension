#!/usr/bin/env bash
# Geliştirme için tarayıcıya özel klasörler üretir: build/chrome ve build/firefox.
# Her klasör kaynak dosyalara SYMLINK + o tarayıcının doğru manifest'ini içerir.
#
# Neden: kök manifest.json tek dosya ve Chrome/Firefox arasında paylaşılıyordu;
# build.sh/bump.sh onu sürekli Firefox'a çevirdiği için Chrome'da yüklü uzantı
# bozuluyordu. Bu klasörler kök manifest.json'a HİÇ dokunmaz → ikisi aynı anda
# yüklü kalır, çakışmaz.
#
# Symlink olduğu için background.js / crop.js / *.html düzenlemelerin anında
# yansır; sadece "Reload" yeter, yeniden build gerekmez.
#
# Kullanım:  ./dev.sh        (her ikisini de hazırlar)
set -e
cd "$(dirname "$0")"

FILES="background.js content.js collector.js crop.html crop.js options.html options.js icons README.md KULLANIM-KILAVUZU.md"

for target in chrome firefox; do
  out="build/$target"
  rm -rf "$out"
  mkdir -p "$out"
  for f in $FILES; do
    ln -s "../../$f" "$out/$f"
  done
  ln -s "../../manifest.$target.json" "$out/manifest.json"
  echo "✓ $out/  (manifest.$target.json)"
done

echo ""
echo "Chrome:  chrome://extensions → 'Load unpacked' → $(pwd)/build/chrome"
echo "Firefox: about:debugging#/runtime/this-firefox → 'Load Temporary Add-on'"
echo "         → $(pwd)/build/firefox/manifest.json"
