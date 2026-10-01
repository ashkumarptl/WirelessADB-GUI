#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "Building native ADB Wireless.app..."
rm -rf "/tmp/adb-app-build"
mkdir -p "/tmp/adb-app-build/ADB Wireless.app/Contents/MacOS" "/tmp/adb-app-build/ADB Wireless.app/Contents/Resources"

swiftc -O "$DIR/app-wrapper/main.swift" -o "/tmp/adb-app-build/ADBWireless"
cp "/tmp/adb-app-build/ADBWireless" "/tmp/adb-app-build/ADB Wireless.app/Contents/MacOS/ADBWireless"
cp "$DIR/app-wrapper/Info.plist" "/tmp/adb-app-build/ADB Wireless.app/Contents/Info.plist"
echo -n "APPL????" > "/tmp/adb-app-build/ADB Wireless.app/Contents/PkgInfo"

rm -rf "$DIR/ADB Wireless.app"
cp -R "/tmp/adb-app-build/ADB Wireless.app" "$DIR/ADB Wireless.app"
xattr -cr "$DIR/ADB Wireless.app"
codesign -s - --force "$DIR/ADB Wireless.app"
rm -rf "/tmp/adb-app-build"

echo "Successfully built and signed ADB Wireless.app!"
