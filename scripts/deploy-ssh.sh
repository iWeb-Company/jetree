#!/bin/bash
# Root-owned forced-command entry point; never evaluate SSH_ORIGINAL_COMMAND.
set -euo pipefail
read -r target revision extra <<< "${SSH_ORIGINAL_COMMAND:-}"
[[ -z ${extra:-} && $target =~ ^(dev|production)$ && $revision =~ ^[a-f0-9]{40}$ ]] || exit 64
[[ $# = 1 && $target = "$1" ]] || exit 64
exec sudo -n /usr/local/sbin/jetree-deploy "$target" "$revision"
