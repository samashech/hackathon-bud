#!/bin/sh
# Removes the systemd units that install-linux.sh added. Leaves ~/.config/hackathon-radar alone.
systemctl --user disable --now hackathon-radar.service hackathon-radar-daily.timer 2>/dev/null
rm -f "$HOME/.config/systemd/user/hackathon-radar.service" "$HOME/.config/systemd/user/hackathon-radar-daily.service" "$HOME/.config/systemd/user/hackathon-radar-daily.timer"
systemctl --user daemon-reload
echo "Removed. Your Gmail settings are still in ~/.config/hackathon-radar/."
