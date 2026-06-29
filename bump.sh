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
#   ./bump.sh patch --release      # HER ŞEY OTOMATİK: imzala + publish + commit/push
#                                  #   + GitHub release olustur + xpi yukle (tek komut)
#
# --release icin (birini sec):
#   - gh CLI:   sudo apt install gh && gh auth login   (onerilen, token env'de tutulmaz)
#   - ya da:    export GH_TOKEN="<contents:write yetkili PAT>"
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
DO_SIGN=0; DO_PUB=0; DO_REL=0
for a in "$@"; do
  [ "$a" = "--sign" ] && DO_SIGN=1
  [ "$a" = "--publish" ] && DO_PUB=1
  [ "$a" = "--release" ] && DO_REL=1
done
# --release, imzalı yayın dosyalarını gerektirir → otomatik sign+publish.
if [ "$DO_REL" = "1" ]; then DO_SIGN=1; DO_PUB=1; fi

# --release ÖN KONTROL: GitHub yetkisi yoksa sürümü ARTIRMADAN en başta dur
# (yoksa updates.json olmayan bir release'e işaret eden kırık durum oluşuyordu).
if [ "$DO_REL" = "1" ]; then
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    : # gh hazır
  elif [ -n "${GH_TOKEN:-}" ]; then
    : # token hazır
  else
    echo "DURDURULDU (sürüm artırılmadı): --release için GitHub yetkisi yok."
    echo "  gh auth login        (önerilen)"
    echo "  ya da: export GH_TOKEN=<contents:write yetkili PAT>"
    exit 1
  fi
fi

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
    --ignore-files build.sh package.sh bump.sh dev.sh \
      manifest.chrome.json manifest.firefox.json updates.json \
      install.html DOKUMANTASYON.md DEPLOY.txt .gitignore .amo-upload-uuid \
      "build/**" "dist/**" "publish/**" "web-ext-artifacts/**"
  XPI=$(ls -t web-ext-artifacts/*.xpi | head -1)
  echo "✓ imzalandi: $XPI"

  if [ "$DO_PUB" = "1" ]; then
    mkdir -p publish
    XPI_NAME="ulak-ekran-goruntusu-$NEWVER.xpi"
    cp "$XPI" "publish/$XPI_NAME"
    cp "$XPI" "publish/ulak-ekran-goruntusu.xpi"   # sabit "latest" isim (Firefox tek-tik link)
    # Chrome paketi (install sayfasinda "indir + load unpacked" icin)
    ./package.sh >/dev/null 2>&1 || true
    [ -f dist/livechat-screenshot-chrome.zip ] && cp dist/livechat-screenshot-chrome.zip "publish/ulak-chrome.zip"
    ./build.sh firefox >/dev/null 2>&1 || true     # package.sh sonrasi manifest.json'u firefox'a geri al
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
    if [ "$DO_REL" != "1" ]; then
      echo "  1) updates.json'u commit + push et (main)."
      echo "  2) GitHub'da 'v$NEWVER' release'i olustur, publish/$XPI_NAME dosyasini ekle."
    fi
  fi
fi

# --- Otomatik GitHub release (--release): commit+push + release + xpi yukle ---
if [ "$DO_REL" = "1" ]; then
  : "${GH_REPO:?--release icin GH_REPO gerekli (ornek: export GH_REPO=kullanici/repo)}"
  TAG="v$NEWVER"
  XPI_NAME="ulak-ekran-goruntusu-$NEWVER.xpi"
  XPI_PATH="publish/$XPI_NAME"
  [ -f "$XPI_PATH" ] || { echo "HATA: $XPI_PATH yok (sign/publish basarisiz?)"; exit 1; }

  echo "→ commit + push (updates.json main'e gitsin)"
  git add -A
  git commit -m "$TAG" || echo "  (commit edilecek yeni degisiklik yok)"
  git push

  echo "→ GitHub release $TAG olusturuluyor + dosyalar yukleniyor"
  # Yuklenecek dosyalar (var olanlar): versiyonlu xpi + sabit xpi + chrome zip
  ASSETS=()
  [ -f "$XPI_PATH" ] && ASSETS+=("$XPI_PATH")
  [ -f "publish/ulak-ekran-goruntusu.xpi" ] && ASSETS+=("publish/ulak-ekran-goruntusu.xpi")
  [ -f "publish/ulak-chrome.zip" ] && ASSETS+=("publish/ulak-chrome.zip")

  if command -v gh >/dev/null 2>&1; then
    gh release create "$TAG" "${ASSETS[@]}" -t "Ulak $NEWVER" -n "Otomatik yayin $TAG" \
      || { echo "HATA: gh release create basarisiz"; exit 1; }
    echo "✓ Release $TAG yayinda (gh) — ${#ASSETS[@]} dosya"
  elif [ -n "${GH_TOKEN:-}" ]; then
    REL=$(curl -s -X POST \
      -H "Authorization: token $GH_TOKEN" -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$GH_REPO/releases" \
      -d "{\"tag_name\":\"$TAG\",\"target_commitish\":\"main\",\"name\":\"Ulak $NEWVER\",\"body\":\"Otomatik yayin $TAG\"}")
    REL_ID=$(printf '%s' "$REL" | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("id",""))
except Exception:
    print("")')
    if [ -z "$REL_ID" ]; then echo "HATA: release olusturulamadi: $REL"; exit 1; fi
    for f in "${ASSETS[@]}"; do
      n=$(basename "$f")
      curl -s -X POST -H "Authorization: token $GH_TOKEN" -H "Content-Type: application/octet-stream" \
        --data-binary @"$f" \
        "https://uploads.github.com/repos/$GH_REPO/releases/$REL_ID/assets?name=$n" >/dev/null \
        || { echo "HATA: $n yuklenemedi"; exit 1; }
    done
    echo "✓ Release $TAG yayinda + ${#ASSETS[@]} dosya yuklendi (API)"
  else
    echo "HATA: --release icin 'gh' CLI ya da GH_TOKEN gerekli."
    echo "  Kur:   sudo apt install gh && gh auth login"
    echo "  Ya da: export GH_TOKEN=<contents:write yetkili PAT>"
    exit 1
  fi
  echo ""
  echo "Kontrol / paylasilacak linkler:"
  echo "  Kurulum sayfasi:  https://betcypsolutions.github.io/browser-extension/install.html"
  echo "  Firefox (sabit):  https://github.com/$GH_REPO/releases/latest/download/ulak-ekran-goruntusu.xpi"
  echo "  Chrome zip:       https://github.com/$GH_REPO/releases/latest/download/ulak-chrome.zip"
  echo "  updates.json:     https://raw.githubusercontent.com/$GH_REPO/main/updates.json"
fi
