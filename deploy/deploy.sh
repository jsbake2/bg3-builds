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

# 1) sync site files
rsync -av --delete \
  "$REPO/site/" \
  "$HOST:$DEST/"

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
