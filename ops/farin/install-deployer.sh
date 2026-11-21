#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$EUID" -ne 0 ]]; then
	printf 'Run this installer as root.\n' >&2
	exit 1
fi
if [[ $# -ne 1 || ! -f "$1" ]]; then
	printf 'Usage: install-deployer.sh /path/to/deploy-release.sh < deploy-public-key.pub\n' >&2
	exit 2
fi

deploy_script="$1"
public_key=''
IFS= read -r public_key || [[ -n "$public_key" ]]
if [[ ! "$public_key" =~ ^ssh-ed25519[[:space:]]+[A-Za-z0-9+/]+={0,3}([[:space:]].*)?$ ]]; then
	printf 'Expected one OpenSSH ed25519 public key on stdin.\n' >&2
	exit 2
fi

if ! id 3fp-deploy >/dev/null 2>&1; then
	useradd --system --create-home --home-dir /var/lib/3fp-deploy --shell /bin/bash 3fp-deploy
fi
if [[ "$(getent passwd 3fp-deploy | cut -d: -f6)" != '/var/lib/3fp-deploy' ]]; then
	printf 'The existing 3fp-deploy account uses an unexpected home directory.\n' >&2
	exit 1
fi

install -o root -g root -m 0755 "$deploy_script" /usr/local/sbin/deploy-3fp-release
install -d -o 3fp-deploy -g 3fp-deploy -m 0700 /var/lib/3fp-deploy/.ssh
printf 'restrict,command="/usr/bin/sudo -n /usr/local/sbin/deploy-3fp-release" %s\n' "$public_key" \
	> /var/lib/3fp-deploy/.ssh/authorized_keys
chown 3fp-deploy:3fp-deploy /var/lib/3fp-deploy/.ssh/authorized_keys
chmod 0600 /var/lib/3fp-deploy/.ssh/authorized_keys

printf '%s\n' '3fp-deploy ALL=(root) NOPASSWD: /usr/local/sbin/deploy-3fp-release' \
	> /etc/sudoers.d/3fp-deploy
chmod 0440 /etc/sudoers.d/3fp-deploy
visudo -cf /etc/sudoers.d/3fp-deploy
printf 'Installed the restricted Farin 3fp deploy account.\n'
