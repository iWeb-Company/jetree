#!/bin/bash
# Install a reviewed copy as root-owned /usr/local/sbin/jetree-deploy.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077
[[ $# = 2 && $1 =~ ^(dev|production)$ && $2 =~ ^[a-f0-9]{40}$ ]] || exit 64
target=$1
revision=$2
root=/opt/jetree/environments/$target
image=jetree:$target-$revision
[[ $(id -u) = 0 && -f $root/enabled && -f $root/runtime.env && -f $root/schema.sha256 ]] || { echo 'Environment not enabled or configuration missing'; exit 78; }
exec 9>"$root/deploy.lock"
flock -n 9 || { echo 'Another deployment is running'; exit 75; }
if [[ $target = production ]]; then project=jetree; port=3028; else project=jetree-dev; port=3030; fi
candidate=jetree-$target-candidate
compose=$root/compose.yml
[[ -f $compose ]] || exit 78
export JETREE_RUNTIME_FILE=$root/runtime.env JETREE_HOST_PORT=$port JETREE_IMAGE=$image
export JETREE_WORKER_FILE=$root/worker.env
worker_enabled=false
previous_worker=
if [[ -f $root/worker-enabled ]]; then
  [[ -f $root/worker.env ]] || exit 78
  # The old standalone scheduler must be drained by the operator before adoption.
  [[ $(docker inspect "$project-worker" --format '{{.State.Running}}' 2>/dev/null || true) != true ]] || { echo 'Drain standalone worker before enabling coordinated deployments'; exit 78; }
  worker_enabled=true
  previous_worker=$(docker inspect "$project-worker-1" --format '{{.Config.Image}}' 2>/dev/null || true)
fi
export JETREE_WORKER_IMAGE=$image
previous=$(docker inspect "$project-app-1" --format '{{.Config.Image}}' 2>/dev/null || true)
cleanup() { docker rm -f "$candidate" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# No uploaded scripts, Compose files, environment files or database migrations run here.
gzip -dc | docker load >/dev/null
[[ $(docker image inspect "$image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}') = "$revision" ]] || exit 65
[[ $(docker image inspect "$image" --format '{{ index .Config.Labels "jetree.environment" }}') = "$target" ]] || exit 65
[[ $(docker image inspect "$image" --format '{{ index .Config.Labels "jetree.schema" }}') = "$(cat "$root/schema.sha256")" ]] || { echo 'Schema needs a separately reviewed migration'; exit 65; }
if [[ $target = dev ]]; then
  ! grep -q 'lgimqhuohkjtwfxbaecb.supabase.co' "$root/runtime.env" || { echo 'Production database forbidden in dev'; exit 78; }
fi
cleanup
docker run -d --name "$candidate" --env-file "$root/runtime.env" --init --cpus 2 --memory 1g --pids-limit 150 --cap-drop ALL --security-opt no-new-privileges:true "$image" >/dev/null
ready() {
  for attempt in {1..45}; do
    if docker exec "$1" node -e 'Promise.all([fetch("http://127.0.0.1:3000/api/health"),fetch("http://127.0.0.1:3000/api/agents")]).then(async ([h,a])=>process.exit(h.status===200&&(await h.json()).status==="ok"&&a.status===401?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
ready "$candidate" || { echo 'Candidate rejected; active release unchanged'; exit 1; }
cleanup
export JETREE_IMAGE=$image
worker_ready() {
  for attempt in {1..150}; do
    if docker exec "$1" node scripts/telegram-scheduler-health.mjs >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
worker_stop() { docker compose -p "$project" -f "$compose" --profile telegram stop -t 250 worker >/dev/null; }
rollback() {
  trap - INT TERM
  if $worker_enabled; then worker_stop || { echo 'Rollback failed: could not drain worker'; exit 1; }; fi
  if [[ -n $previous ]]; then
    export JETREE_IMAGE=$previous
    docker compose -p "$project" -f "$compose" up -d --no-build app >/dev/null
    old=$(docker compose -p "$project" -f "$compose" ps -q app)
    ready "$old" || { echo 'Rollback failed: operator action required'; exit 1; }
    if $worker_enabled && [[ -n $previous_worker ]]; then
      export JETREE_WORKER_IMAGE=$previous_worker
      docker compose -p "$project" -f "$compose" --profile telegram up -d --no-build worker >/dev/null || { echo 'Rollback failed: worker restore failed'; exit 1; }
      old_worker=$(docker compose -p "$project" -f "$compose" --profile telegram ps -q worker)
      worker_ready "$old_worker" || { echo 'Rollback failed: worker is not authenticated'; exit 1; }
    fi
    echo 'Previous release restored'
  else
    docker compose -p "$project" -f "$compose" stop app >/dev/null
    echo 'First release failed; app stopped'
  fi
  exit 1
}
trap rollback INT TERM
if $worker_enabled; then worker_stop || rollback; fi
docker compose -p "$project" -f "$compose" up -d --no-build app >/dev/null || rollback
active=$(docker compose -p "$project" -f "$compose" ps -q app)
ready "$active" || rollback
[[ $(curl --silent --show-error --max-time 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/agents") = 401 ]] || rollback
if $worker_enabled; then
  docker compose -p "$project" -f "$compose" --profile telegram up -d --no-build worker >/dev/null || rollback
  active_worker=$(docker compose -p "$project" -f "$compose" --profile telegram ps -q worker)
  worker_ready "$active_worker" || rollback
fi
printf '%s\n' "$revision" > "$root/current.tmp"
mv "$root/current.tmp" "$root/current"
echo "Verified $target revision $revision"
