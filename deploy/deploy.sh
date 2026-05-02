#!/usr/bin/env bash
# Deploy the BG3 Builds site to 10.0.0.16.
#
#  usage: deploy/deploy.sh
#
# Idempotent: rsyncs site/, installs the systemd unit, restarts the service.

set -euo pipefail

HOST="10.0.0.16"
DEST="/home/jbaker/bg3-builds-site"
UNIT="bg3-builds.service"

REPO="$(cd "$(dirname "$0")/.." && pwd)"
echo "==> repo:    $REPO"
echo "==> target:  $HOST:$DEST"

# 1) cache-bust: stamp index.html with the current epoch so browsers always
#    fetch fresh styles.css / app.js after every deploy
VER=$(date +%s)
TMPDIR=$(mktemp -d)
cp -r "$REPO/site/." "$TMPDIR/"
sed -i "s/__VER__/$VER/g" "$TMPDIR/index.html"
echo "==> cache-bust version: $VER"

# 2) sync site files
rsync -av --delete \
  "$TMPDIR/" \
  "$HOST:$DEST/"
rm -rf "$TMPDIR"

# 2) install / refresh systemd unit
scp "$REPO/deploy/$UNIT" "$HOST:/tmp/$UNIT"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
sudo install -m 0644 /tmp/$UNIT /etc/systemd/system/$UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now $UNIT
sudo systemctl restart $UNIT
sleep 1
systemctl status $UNIT --no-pager | head -12
echo '--- listening ---'
ss -tln | grep ':8891' || echo '(not listening yet)'
EOF
echo "==> done. open http://$HOST:8891/"
