#!/bin/bash
# Fresh ranked-eligible identity on the device: wipe → onboard → promote → relaunch.
set -e
NAME="$1"
node scripts/rc1-device.mjs reset >/dev/null
node scripts/rc1-device.mjs launch >/dev/null
sleep 42
node scripts/rc1-device.mjs onboard "$NAME" >/dev/null 2>&1 || true
sleep 3
node scripts/rc1-device.mjs text "United Arab Emirates" >/dev/null 2>&1 || true
sleep 2
node scripts/rc1-device.mjs text "Continue" >/dev/null 2>&1 || true
sleep 10
PLAYER_ID=$(node scripts/db/with-secrets.mjs node scripts/db/rc1-newest.mjs 2>/dev/null | tail -1)
echo "uid: $PLAYER_ID"
npm run rc1:promote "$PLAYER_ID" "$NAME" >/dev/null 2>&1
node scripts/rc1-device.mjs kill >/dev/null
node scripts/rc1-device.mjs launch >/dev/null
sleep 45
echo "$PLAYER_ID"
