#!/bin/sh
# Installs Hackathon radar as systemd user units:
#   hackathon-radar.service       the website, always on at http://localhost:4321
#   hackathon-radar-daily.timer   every day at 8:00, refresh the list and email the digest
# Undo with: deploy/uninstall-linux.sh
set -eu
D=$(cd "$(dirname "$0")/.." && pwd)
U="$HOME/.config/systemd/user"
CFG="$HOME/.config/hackathon-radar"
if [ -x "$HOME/.local/share/mise/shims/node" ]; then NODE="$HOME/.local/share/mise/shims/node"; else NODE=$(command -v node); fi
mkdir -p "$U" "$CFG"

if [ ! -f "$CFG/gmail.env" ]; then
  cat > "$CFG/gmail.env" <<EOF
# Gmail digest settings for Hackathon radar. Keep this file private.
# GMAIL_APP_PASSWORD is an app password from https://myaccount.google.com/apppasswords
GMAIL_USER=${GMAIL_USER:-}
GMAIL_APP_PASSWORD=
# DIGEST_TO=someone@example.com
RADAR_URL=http://localhost:4321/
EOF
  chmod 600 "$CFG/gmail.env"
fi

cat > "$U/hackathon-radar.service" <<EOF
[Unit]
Description=Hackathon radar website on http://localhost:4321

[Service]
WorkingDirectory=$D
ExecStartPre=$NODE scripts/sync-core.mjs
ExecStart=$NODE server.mjs
Restart=on-failure

[Install]
WantedBy=default.target
EOF

cat > "$U/hackathon-radar-daily.service" <<EOF
[Unit]
Description=Hackathon radar: refresh the list and email the digest
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$D
EnvironmentFile=-$CFG/gmail.env
ExecStart=$NODE scripts/refresh.mjs
ExecStart=/bin/sh -c 'if [ -n "\$\$GMAIL_APP_PASSWORD" ]; then exec $NODE scripts/digest.mjs --no-refresh; else echo "No GMAIL_APP_PASSWORD in $CFG/gmail.env, skipping the email."; fi'
EOF

cat > "$U/hackathon-radar-daily.timer" <<EOF
[Unit]
Description=Hackathon radar every morning at 8:00

[Timer]
OnCalendar=*-*-* 08:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

pkill -f "node server.mjs" 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user enable --now hackathon-radar.service hackathon-radar-daily.timer
echo
echo "Website: http://localhost:4321"
echo "Daily run: $(systemctl --user list-timers hackathon-radar-daily.timer --no-legend | awk '{print $1, $2, $3}')"
echo "Gmail settings: $CFG/gmail.env (add your app password there)"
