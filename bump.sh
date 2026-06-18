#!/usr/bin/env bash
# Sürüm artır (+ opsiyonel imzala + updates.json üret) — tek komut.
#
# Kullanım:
#   ./bump.sh                      # yama sürümü artır (1.0.0 -> 1.0.1), imzalamaz
#   ./bump.sh minor                # 1.0.0 -> 1.1.0
#   ./bump.sh major                # 1.0.0 -> 2.0.0
#   ./bump.sh 1.4.2                # tam sürüm ver
#   ./bump.sh patch --sign         # artır + AMO'da imzala (anahtarlar env'den)
#   ./bump.sh patch --sign --publish   # + publish/ klasörüne xpi + updates.json üret
#
# İmza için ortam değişkenleri (önce export et):
#   export AMO_JWT_ISSUER="user:....."
#   export AMO_JWT_SECRET="...."
# Oto-güncelleme (updates.json) için — GitHub Releases:
#   export GH_REPO="kullanici/repo"     # ör. hasantadk/ulak-extension
#   (Alternatif düz barındırma:  export UPDATE_BASE="https://host/ext")
#
# Tipik sürüm akışı:
#   export AMO_JWT_ISSUER=... AMO_JWT_SECRET=... GH_REPO=kullanici/repo
#   ./bump.sh patch --sign --publish
#   git add updates.json manifest.*.json && git commit -m "vX.Y.Z" && git push
#   # sonra GitHub'da vX.Y.Z release'i aç, publish/*.xpi dosyasını ekle
set -e
cd "$(dirname "$0")"

ARG="${1:-patch}"
DO_SIGN=0; DO_PUB=0
for a in "$@"; do
  [ "$a" = "--sign" ] && DO_SIGN=1
  [ "$a" = "--publish" ] && DO_PUB=1
done

GECKO_ID="livechat-screenshot@cyp.world"

# --- yeni sürümü hesapla ---
NEWVER=$(python3 - "$ARG" <<'PY'
import json, re, sys
arg = sys.argv[1]
cur = json.load(open("manifest.firefox.json"))["version"]
a, b, c = (list(map(int, cur.split("."))) + [0, 0, 0])[:3]
if re.match(r'^\d+\.\d+\.\d+$', arg): new = arg
elif arg == "major": new = f"{a+1}.0.0"
elif arg == "minor": new = f"{a}.{b+1}.0"
else: new = f"{a}.{b}.{c+1}"   # patch (varsayılan)
print(new)
PY
)
echo "Sürüm -> $NEWVER"

# --- iki manifest'te version güncelle ---
for m in manifest.firefox.json manifest.chrome.json; do
  python3 - "$m" "$NEWVER" <<'PY'
import json, sys
p, v = sys.argv[1], sys.argv[2]
d = json.load(open(p)); d["version"] = v
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
PY
done

./build.sh firefox >/dev/null
echo "✓ manifest.json (firefox) $NEWVER"

if [ "$DO_SIGN" = "1" ]; then
  : "${AMO_JWT_ISSUER:?AMO_JWT_ISSUER gerekli — once 'export AMO_JWT_ISSUER=...' yap}"
  : "${AMO_JWT_SECRET:?AMO_JWT_SECRET gerekli — once 'export AMO_JWT_SECRET=...' yap}"
  npx --yes web-ext sign --channel=unlisted \
    --api-key="$AMO_JWT_ISSUER" --api-secret="$AMO_JWT_SECRET" \
    --ignore-files build.sh package.sh bump.sh manifest.chrome.json manifest.firefox.json updates.json "dist/**" "publish/**"
  XPI=$(ls -t web-ext-artifacts/*.xpi | head -1)
  echo "✓ imzalandi: $XPI"

  if [ "$DO_PUB" = "1" ]; then
    mkdir -p publish
    XPI_NAME="ulak-ekran-goruntusu-$NEWVER.xpi"
    cp "$XPI" "publish/$XPI_NAME"
    # update_link: GitHub Releases (GH_REPO) ya da duz UPDATE_BASE
    if [ -n "${GH_REPO:-}" ]; then
      LINK="https://github.com/$GH_REPO/releases/download/v$NEWVER/$XPI_NAME"
    elif [ -n "${UPDATE_BASE:-}" ]; then
      LINK="${UPDATE_BASE%/}/$XPI_NAME"
    else
      echo "HATA: publish icin GH_REPO (ornek: export GH_REPO=kullanici/repo) ya da UPDATE_BASE gerekli"; exit 1
    fi
    # updates.json repo KOKUNDE durur (raw URL sabit kalsin); xpi Release asset olur.
    python3 - "$NEWVER" "$LINK" "$GECKO_ID" <<'PY'
import json, sys
ver, link, gid = sys.argv[1:4]
data = {"addons": {gid: {"updates": [{"version": ver, "update_link": link}]}}}
json.dump(data, open("updates.json", "w"), indent=2); open("updates.json","a").write("\n")
PY
    echo "✓ updates.json guncellendi  (link: $LINK)"
    echo "✓ publish/$XPI_NAME hazir"
    echo "  1) updates.json'u commit + push et (main)."
    echo "  2) GitHub'da 'v$NEWVER' release'i olustur, publish/$XPI_NAME dosyasini ekle."
  fi
fi
