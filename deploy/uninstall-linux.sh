#!/bin/sh
# Removes the systemd service that install-linux.sh added. Leaves ~/.config/hackathon-bud alone.
systemctl --user disable --now hackathon-bud.service 2>/dev/null
rm -f "$HOME/.config/systemd/user/hackathon-bud.service"
systemctl --user daemon-reload
echo "Removed. Your Gmail settings and subscribers are still in ~/.config/hackathon-bud/."
