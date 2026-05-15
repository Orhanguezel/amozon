#!/usr/bin/env bash
# Sets up HTTP basic auth for the /amozon panel path in nginx.
# Run as root on the VPS: sudo bash scripts/setup-demo-auth.sh

set -euo pipefail

HTPASSWD_FILE="/etc/nginx/.htpasswd-amozon"
DEMO_USER="demo"
DEMO_PASS="demo2026"

# Create htpasswd file (requires apache2-utils or httpd-tools)
if ! command -v htpasswd &>/dev/null; then
  echo "[setup] Installing apache2-utils..."
  apt-get install -y apache2-utils 2>/dev/null || yum install -y httpd-tools 2>/dev/null
fi

htpasswd -cb "$HTPASSWD_FILE" "$DEMO_USER" "$DEMO_PASS"
echo "[setup] Created $HTPASSWD_FILE (user: $DEMO_USER / pass: $DEMO_PASS)"

# Print the nginx location block to add
cat <<'NGINX'

[setup] Add the following inside your nginx server block for the /amozon location:

    location /amozon {
        auth_basic "Amozon Demo";
        auth_basic_user_file /etc/nginx/.htpasswd-amozon;

        # existing proxy_pass / alias config goes here unchanged
    }

Then reload nginx:
    sudo nginx -t && sudo systemctl reload nginx

NGINX
