#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# build.sh - builds Murmuration.saver: the murmuration as a macOS screen saver.
#
#   ./build.sh              build into build/Murmuration.saver, for this Mac
#   ./build.sh --install    build, then install for this user and reload the host
#   ./build.sh --uninstall  remove it from ~/Library/Screen Savers
#   ./build.sh --release    build a universal (Apple silicon + Intel) bundle to
#                           share, zipped in build/; signed and notarized when
#                           the two variables below are set (see README.md)
#
# Needs the Xcode Command Line Tools (xcode-select --install), not Xcode. A
# plain build is signed ad hoc, which is all a saver built on the Mac that
# runs it needs.
#
# Environment:
#   MURMURATION_QUERY="n=2500&rs=0.75"  URL query the page is opened with. ?n=
#                                       fixes the bird count and ?rs= the render
#                                       scale (0.4-1); see ../murmuration.
#   MURMURATION_EXIT_ON_STOP=1          also quit Apple's saver host when the
#                                       saver is dismissed (see README.md).
#   MURMURATION_SIGN_ID="Developer ID Application: Name (TEAMID)"
#                                       --release: sign with this identity
#                                       instead of ad hoc
#   MURMURATION_NOTARY_PROFILE=name     --release: notarize with the notarytool
#                                       keychain profile of this name and staple
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

NAME=Murmuration
IDENT=io.github.worldbyjoe.murmuration-saver
DEPLOY=14.0                                  # Sonoma: where the host workarounds begin
BUILD="build/$NAME.saver"
DEST="$HOME/Library/Screen Savers/$NAME.saver"
PAGE=../murmuration
MODE=${1:-}

reload_host() {
  # The host keeps the old bundle mapped; a rebuilt one is not seen until it goes.
  killall legacyScreenSaver 2>/dev/null || true
  killall ScreenSaverEngine 2>/dev/null || true
}

compile() {                                  # compile ARCH OUTPUT
  xcrun swiftc \
    -target "$1-apple-macos$DEPLOY" -sdk "$SDK" \
    -framework ScreenSaver -framework WebKit -framework AppKit \
    -emit-library -Xlinker -bundle \
    -module-name "$NAME" -swift-version 5 -O \
    -o "$2" \
    Sources/*.swift
}

case "$MODE" in
  ""|--install|--release) ;;
  --uninstall)
    rm -rf "$DEST"
    reload_host
    echo "Removed $DEST"
    exit 0 ;;
  *) echo "usage: $0 [--install | --uninstall | --release]" >&2; exit 2 ;;
esac

[[ -f "$PAGE/index.html" ]] || { echo "error: $PAGE/index.html not found; run this inside the tv-art-display checkout" >&2; exit 1; }
command -v xcrun >/dev/null || { echo "error: no xcrun. Install the Xcode Command Line Tools first: xcode-select --install" >&2; exit 1; }
SDK=$(xcrun --sdk macosx --show-sdk-path)

# The version is the date the page last changed, so you can tell which
# murmuration a bundle carries.
VERSION=$(git -C .. log -1 --format=%cd --date=format:%Y.%m.%d -- murmuration 2>/dev/null || true)
VERSION=${VERSION:-1.0}

QUERY_XML=${MURMURATION_QUERY:-}
QUERY_XML=${QUERY_XML//&/&amp;}
QUERY_XML=${QUERY_XML//</&lt;}
EXIT_XML=false; [[ "${MURMURATION_EXIT_ON_STOP:-0}" == "1" ]] && EXIT_XML=true

rm -rf "$BUILD"
mkdir -p "$BUILD/Contents/MacOS" "$BUILD/Contents/Resources"

# the page, whole, so the saver needs no network
cp -R "$PAGE" "$BUILD/Contents/Resources/murmuration"

cat > "$BUILD/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>$NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$IDENT</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$NAME</string>
  <key>CFBundlePackageType</key>
  <string>BNDL</string>
  <key>CFBundleShortVersionString</key>
  <string>$VERSION</string>
  <key>CFBundleVersion</key>
  <string>$VERSION</string>
  <key>LSMinimumSystemVersion</key>
  <string>$DEPLOY</string>
  <key>NSPrincipalClass</key>
  <string>MurmurationSaverView</string>
  <key>MurmurationQuery</key>
  <string>$QUERY_XML</string>
  <key>MurmurationPreviewQuery</key>
  <string>n=600&amp;rs=0.6</string>
  <key>MurmurationExitOnStop</key>
  <$EXIT_XML/>
</dict>
</plist>
PLIST

BIN="$BUILD/Contents/MacOS/$NAME"
if [[ "$MODE" == "--release" ]]; then
  echo "compiling for arm64 and x86_64 (macOS $DEPLOY+) ..."
  compile arm64  "$BIN.arm64"
  compile x86_64 "$BIN.x86_64"
  lipo -create "$BIN.arm64" "$BIN.x86_64" -output "$BIN"
  rm "$BIN.arm64" "$BIN.x86_64"
else
  ARCH=$(uname -m)                           # arm64 or x86_64: built for this Mac
  echo "compiling for $ARCH (macOS $DEPLOY+) ..."
  compile "$ARCH" "$BIN"
fi

if [[ "$MODE" == "--release" && -n "${MURMURATION_SIGN_ID:-}" ]]; then
  # Developer ID, hardened runtime and a timestamp: what notarization requires.
  codesign --force --options runtime --timestamp --sign "$MURMURATION_SIGN_ID" "$BUILD"
  SIGNED=developer-id
else
  codesign --force --sign - --timestamp=none "$BUILD"
  SIGNED=ad-hoc
fi
echo "built $BUILD (murmuration of $VERSION, signed $SIGNED)"

if [[ "$MODE" == "--install" ]]; then
  mkdir -p "$(dirname "$DEST")"
  rm -rf "$DEST"
  cp -R "$BUILD" "$DEST"
  reload_host
  cat <<MSG

Installed $DEST

To choose it:  System Settings > Wallpaper > Screen Saver (macOS 26) or
               System Settings > Screen Saver (macOS 14-15), then scroll to the
               Other section at the bottom and pick Murmuration.
To try it now: open -a ScreenSaverEngine
MSG
fi

if [[ "$MODE" == "--release" ]]; then
  ZIP="build/$NAME-$VERSION.zip"
  rm -f "$ZIP"
  # ditto keeps the bundle's structure and attributes the way Finder would
  ditto -c -k --keepParent "$BUILD" "$ZIP"
  if [[ "$SIGNED" == "developer-id" && -n "${MURMURATION_NOTARY_PROFILE:-}" ]]; then
    echo "notarizing (this waits for Apple, usually a minute or two) ..."
    xcrun notarytool submit "$ZIP" --keychain-profile "$MURMURATION_NOTARY_PROFILE" --wait
    xcrun stapler staple "$BUILD"
    rm -f "$ZIP"
    ditto -c -k --keepParent "$BUILD" "$ZIP"
    echo "notarized and stapled: $ZIP - installs on any Mac with a double-click"
  elif [[ "$SIGNED" == "developer-id" ]]; then
    echo "signed but not notarized: $ZIP - set MURMURATION_NOTARY_PROFILE to notarize (README.md)"
  else
    cat <<MSG
ad-hoc signed: $ZIP
Other Macs will refuse to run it until its owner allows it under
System Settings > Privacy & Security; see README.md, "Sharing it".
MSG
  fi
fi
