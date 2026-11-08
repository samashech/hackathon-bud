#!/bin/sh
# Runs Hackathon-bud on this machine as a systemd user service: the website at
# http://localhost:4321, the signup flow, and the 8:00 digest to every subscriber.
# Undo with: deploy/uninstall-linux.sh
set -eu
D=$(cd "$(dirname "$0")/.." && pwd)
U="$HOME/.config/systemd/user"
CFG="$HOME/.config/hackathon-bud"
if [ -x "$HOME/.local/share/mise/shims/node" ]; then NODE="$HOME/.local/share/mise/shims/node"; else NODE=$(command -v node); fi
mkdir -p "$U" "$CFG"

# Earlier versions were called hackathon-radar: keep their Gmail settings, drop their units.
if [ -f "$HOME/.config/hackathon-radar/gmail.env" ] && [ ! -f "$CFG/gmail.env" ]; then
  cp "$HOME/.config/hackathon-radar/gmail.env" "$CFG/gmail.env"
fi
if [ -f "$U/hackathon-radar.service" ] || [ -f "$U/hackathon-radar-daily.timer" ]; then
  systemctl --user disable --now hackathon-radar.service hackathon-radar-daily.timer 2>/dev/null || true
  rm -f "$U/hackathon-radar.service" "$U/hackathon-radar-daily.service" "$U/hackathon-radar-daily.timer"
fi

if [ ! -f "$CFG/gmail.env" ]; then
  cat > "$CFG/gmail.env" <<EOF
# Gmail settings for Hackathon-bud. Keep this file private.
# GMAIL_APP_PASSWORD is an app password from https://myaccount.google.com/apppasswords, typed without spaces.
GMAIL_USER=
GMAIL_APP_PASSWORD=
EOF
fi
chmod 600 "$CFG/gmail.env"

cat > "$U/hackathon-bud.service" <<EOF
[Unit]
Description=Hackathon-bud on http://localhost:4321
After=network-online.target

[Service]
WorkingDirectory=$D
EnvironmentFile=-$CFG/gmail.env
Environment=DATA_DIR=$CFG/data
ExecStartPre=$NODE scripts/sync-core.mjs
ExecStart=$NODE server.mjs
Restart=on-failure

[Install]
WantedBy=default.target
EOF

pkill -f "node server.mjs" 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user enable --now hackathon-bud.service
echo
echo "Website: http://localhost:4321"
echo "Gmail settings: $CFG/gmail.env"
echo "Logs: journalctl --user -u hackathon-bud -f"
