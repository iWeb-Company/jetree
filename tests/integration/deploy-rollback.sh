#!/bin/bash
# Fault injection only on a disposable GitHub runner, without a real Docker/VPS.
set -euo pipefail
[[ ${CI:-} = true && ${GITHUB_ACTIONS:-} = true ]] || exit 78
root=/opt/jetree/environments/dev
[[ ! -e $root ]] || exit 78
mkdir -p "$root"
tmp=$(mktemp -d)
trap 'rm -rf "$root" "$tmp"' EXIT
touch "$root/enabled" "$root/compose.yml"
printf 'synthetic-schema\n' > "$root/schema.sha256"
printf 'NEXT_PUBLIC_SUPABASE_URL=https://synthetic-dev.supabase.co\n' > "$root/runtime.env"
export MOCK_DIR=$tmp REVISION=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
docker() {
  printf '%s\n' "$*" >> "$MOCK_DIR/calls"
  case "$1 ${2:-}" in
    'load '*) cat >/dev/null ;;
    'image inspect')
      case "$*" in
        *org.opencontainers.image.revision*) echo "$REVISION" ;;
        *jetree.environment*) echo dev ;;
        *jetree.schema*) echo synthetic-schema ;;
      esac ;;
    'inspect jetree-dev-app-1') echo jetree:previous ;;
    'inspect jetree-dev-worker') echo false ;;
    'inspect jetree-dev-worker-1') echo jetree:previous-worker ;;
    'run -d') echo candidate ;;
    'exec '*)
      case "$2" in
        jetree-dev-candidate) [[ $FAULT != candidate ]] ;;
        active) [[ $FAULT != replacement && $FAULT != rollback ]] ;;
        previous) [[ $FAULT != rollback ]] ;;
        active-worker) [[ $FAULT != worker && $FAULT != worker-rollback ]] ;;
        previous-worker) [[ $FAULT != worker-rollback ]] ;;
      esac ;;
    'compose -p')
      case "$*" in
        *'up -d'*worker) printf '%s\n' "$JETREE_WORKER_IMAGE" > "$MOCK_DIR/worker-image" ;;
        *'up -d'*) printf '%s\n' "$JETREE_IMAGE" > "$MOCK_DIR/image" ;;
        *'ps -q worker') if [[ $(cat "$MOCK_DIR/worker-image") = jetree:previous-worker ]]; then echo previous-worker; else echo active-worker; fi ;;
        *'ps -q'*) if [[ $(cat "$MOCK_DIR/image") = jetree:previous ]]; then echo previous; else echo active; fi ;;
      esac ;;
  esac
  return ${?}
}
curl() { printf 401; }
sleep() { :; }
export -f docker curl sleep
for FAULT in candidate replacement rollback none; do
  export FAULT
  : > "$tmp/calls"
  echo jetree:previous > "$tmp/image"
  if printf fixture | gzip | bash scripts/deploy-vps.sh dev "$REVISION" > "$tmp/result" 2>&1; then
    [[ $FAULT = none ]]
    [[ $(cat "$tmp/image") = jetree:dev-$REVISION ]]
    [[ $(cat "$root/current") = "$REVISION" ]]
  else
    [[ $FAULT != none ]]
    [[ $(cat "$tmp/image") = jetree:previous ]]
    if [[ $FAULT = candidate ]]; then ! grep -q 'up -d' "$tmp/calls"; fi
    if [[ $FAULT = replacement ]]; then grep -q 'Previous release restored' "$tmp/result"; fi
    if [[ $FAULT = rollback ]]; then grep -q 'Rollback failed' "$tmp/result"; fi
    [[ ! -f $root/current ]]
  fi
  echo "PASS deployment fault: $FAULT"
done
rm "$root/current"
touch "$root/worker-enabled" "$root/worker.env"
for FAULT in candidate replacement worker worker-rollback none; do
  export FAULT
  : > "$tmp/calls"
  echo jetree:previous > "$tmp/image"
  echo jetree:previous-worker > "$tmp/worker-image"
  if printf fixture | gzip | bash scripts/deploy-vps.sh dev "$REVISION" > "$tmp/result" 2>&1; then
    [[ $FAULT = none ]]
    [[ $(cat "$tmp/image") = jetree:dev-$REVISION ]]
    [[ $(cat "$tmp/worker-image") = jetree:dev-$REVISION ]]
    [[ $(cat "$root/current") = "$REVISION" ]]
  else
    [[ $FAULT != none ]]
    [[ $(cat "$tmp/image") = jetree:previous ]]
    [[ $(cat "$tmp/worker-image") = jetree:previous-worker ]]
    [[ ! -f $root/current ]]
    if [[ $FAULT = candidate ]]; then ! grep -q 'stop -t' "$tmp/calls"; fi
    if [[ $FAULT = worker-rollback ]]; then grep -q 'Rollback failed: worker' "$tmp/result"; fi
    if [[ $FAULT = replacement || $FAULT = worker ]]; then grep -q 'Previous release restored' "$tmp/result"; fi
  fi
  echo "PASS coordinated deployment fault: $FAULT"
done
if bash scripts/deploy-vps.sh dev 'bad;command'; then exit 1; fi
if bash scripts/deploy-vps.sh other "$REVISION"; then exit 1; fi
SSH_ORIGINAL_COMMAND="production $REVISION" bash scripts/deploy-ssh.sh dev && exit 1
echo 'PASS invalid commands and cross-environment SSH blocked'
