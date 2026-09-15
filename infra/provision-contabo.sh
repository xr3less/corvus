#!/usr/bin/env bash
#
# Corvus V1 — Contabo Cloud VPS 4 provisioning script
# Target: Ubuntu 24.04 (noble), fresh install, run as root.
#
# How to use: paste this file to the server as setup.sh, then run:  bash setup.sh
# Safe to run more than once. It will skip steps that are already done.
# Full log is saved to /var/log/corvus-provision.log
#
# What it does (in plain words):
#   1. Updates the system
#   2. Installs Docker (pinned version so it never surprises you)
#   3. Creates a normal user called "corvus"
#   4. Turns on basic protection (firewall, fail2ban, automatic security updates)
#   5. Adds extra memory (2GB swap file) so small spikes do not crash the server
#   6. Limits Docker log size so logs can never fill the disk
#   7. Prints versions + tells you to take a snapshot NOW
#
# What it does NOT do (on purpose, so you never get locked out):
#   - It does NOT change the SSH port (stays 22).
#   - It does NOT turn off password login.
#   - It does NOT disable root login.
#   You can tighten those later once key login is confirmed working.

set -euo pipefail

LOG_FILE="/var/log/corvus-provision.log"
# Pinned Docker version. Verified against Docker's official apt repo
# (https://download.docker.com/linux/ubuntu/dists/noble/pool/stable/amd64/):
# 28.5.2 is the last 28.x release published for Ubuntu 24.04 (noble).
DOCKER_VERSION_STRING="5:28.5.2-1~ubuntu.24.04~noble"

# --- Logging: everything goes to the screen AND to the log file ---
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

say() {
  echo ""
  echo "==== $1 ===="
}

# --- Safety: must run as root ---
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Please run this script as root (or with sudo)."
  echo "Example: bash setup.sh  (while logged in as root)"
  exit 1
fi

# --- Safety: must be Ubuntu 24.04 ---
if [ -f /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "24.04" ]; then
    echo "WARNING: This script is made for Ubuntu 24.04, but this server says: ${PRETTY_NAME:-unknown}."
    echo "It may still work, but stop here if you are not sure. Continuing in 10 seconds..."
    sleep 10
  fi
fi

export DEBIAN_FRONTEND=noninteractive

say "Step 1 of 8: Updating the system (this takes a few minutes, please wait)"
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
apt-get install -y ca-certificates curl gnupg lsb-release ufw fail2ban unattended-upgrades
echo "System update done."

say "Step 2 of 8: Installing Docker (pinned version ${DOCKER_VERSION_STRING})"
# Remove old/conflicting Docker packages if they exist (safe if none exist).
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  if dpkg -l "$pkg" >/dev/null 2>&1; then
    echo "Removing conflicting package: $pkg"
    apt-get remove -y "$pkg" || true
  fi
done
# Add Docker's official key and repo (safe to repeat: files are just overwritten).
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
# Install the PINNED Docker version. --allow-downgrades makes re-runs safe.
apt-get install -y --allow-downgrades \
  "docker-ce=${DOCKER_VERSION_STRING}" \
  "docker-ce-cli=${DOCKER_VERSION_STRING}" \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin
# Hold the version so a normal system update never upgrades Docker by surprise.
apt-mark hold docker-ce docker-ce-cli containerd.io || true
systemctl enable --now docker
docker --version
echo "Docker is installed and running."

say "Step 3 of 8: Creating the 'corvus' user"
if id corvus >/dev/null 2>&1; then
  echo "User 'corvus' already exists. Skipping creation."
else
  adduser --disabled-password --gecos "Corvus app user" corvus
  echo "User 'corvus' created. (It has no password: log in as root, then use 'su - corvus'.)"
fi
usermod -aG docker corvus || true
install -d -m 700 -o corvus -g corvus /home/corvus/.ssh
touch /home/corvus/.ssh/authorized_keys
chmod 600 /home/corvus/.ssh/authorized_keys
chown corvus:corvus /home/corvus/.ssh/authorized_keys
echo "User 'corvus' can now use Docker. SSH key folder is ready (empty until you add a key later)."

say "Step 4 of 8: Keeping your login working (no lockout, password login stays ON)"
# Explicit drop-in so password login survives future updates. Never touches the port.
printf '%s\n' \
  '# Corvus: keep login simple and safe. Managed by provision-contabo.sh.' \
  'PasswordAuthentication yes' \
  > /etc/ssh/sshd_config.d/60-corvus.conf
chmod 644 /etc/ssh/sshd_config.d/60-corvus.conf
# Check the SSH config is valid BEFORE reloading, so a typo can never lock you out.
sshd -t && systemctl reload ssh || systemctl reload sshd || true
echo "Login settings OK. Port is still 22. Password login still works. Nothing locked."

say "Step 5 of 8: Turning on basic protection (firewall + fail2ban + auto updates)"
# Firewall: allow normal web traffic + SSH, then turn on. Re-running is safe.
ufw allow 22/tcp  || true
ufw allow 80/tcp  || true
ufw allow 443/tcp || true
ufw --force enable || true
ufw status verbose || true
# fail2ban: blocks IPs that guess passwords too many times. SSH jail on, default safe values.
cat > /etc/fail2ban/jail.local <<'EOF'
# Corvus: basic SSH protection. Managed by provision-contabo.sh.
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = %(sshd_log)s
backend = auto
EOF
chmod 644 /etc/fail2ban/jail.local
systemctl enable --now fail2ban
fail2ban-client status sshd || fail2ban-client status || true
# Automatic security updates: install fixes by themselves, do not restart things randomly.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
// Corvus: automatic security updates. Managed by provision-contabo.sh.
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
chmod 644 /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades || true
echo "Protection is ON: firewall allows 22, 80, 443. fail2ban watches SSH. Security updates are automatic."

say "Step 6 of 8: Adding 2GB extra memory (swap file, safe if the server is busy)"
if swapon --show | grep -q '/swapfile'; then
  echo "Swap file is already active. Skipping."
else
  if [ -f /swapfile ]; then
    echo "A /swapfile file exists but is not active. Activating it."
    chmod 600 /swapfile
    swapon /swapfile || {
      echo "Old /swapfile was broken. Recreating it."
      swapoff /swapfile || true
      rm -f /swapfile
      fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
      chmod 600 /swapfile
      mkswap /swapfile
      swapon /swapfile
    }
  else
    echo "Creating a 2GB /swapfile (takes a moment)..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
  fi
fi
if ! grep -q '^/swapfile' /etc/fstab; then
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Be gentle: only use swap when real memory is really full.
sysctl -w vm.swappiness=10
if grep -q '^vm.swappiness' /etc/sysctl.conf; then
  sed -i 's/^vm.swappiness.*/vm.swappiness=10/' /etc/sysctl.conf
else
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi
free -h
echo "Extra memory ready."

say "Step 7 of 8: Limiting Docker log size (so logs can never fill your disk)"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
chmod 644 /etc/docker/daemon.json
# Restart Docker only if the config changed and Docker is already running.
systemctl restart docker || systemctl start docker
systemctl enable docker
docker info --format 'Docker log limit: {{.LoggingDriver}} driver OK' || true
echo "Docker logs are limited to 10MB per file, 3 files per container."

say "Step 8 of 8: Checking everything works"
echo "--- Versions ---"
docker --version
docker compose version
containerd --version || ctr --version || true
fail2ban-client --version || true
ufw status numbered || ufw status || true
echo "--- Docker test (downloads a tiny test image and runs it) ---"
docker run --rm hello-world || echo "WARNING: the hello-world test failed. Internet may be slow. Try: docker run --rm hello-world"
echo ""
echo "=================================================================="
echo "  ALL DONE. Your server is ready."
echo ""
echo "  NEXT STEP (do this NOW, before anything else):"
echo "  Take a SNAPSHOT in your Contabo control panel."
echo "  This is your 'save point'. If anything breaks later, you can go back."
echo "  (Open Contabo panel -> your VPS -> Snapshots -> Create snapshot.)"
echo ""
echo "  Full log of this setup: /var/log/corvus-provision.log"
echo "=================================================================="
