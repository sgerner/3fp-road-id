#!/usr/bin/env bash
set -Eeuo pipefail

readonly repository_url='https://github.com/sgerner/3fp-road-id.git'
readonly repository_path='/opt/3fp-farin-release'
readonly compose_directory="$repository_path/ops/farin"
readonly compose_file="$compose_directory/compose.yaml"
readonly state_directory='/var/lib/3fp-farin-release-deploy'
readonly state_file="$state_directory/last-successful-commit"
readonly image_name='3fp-road-id:farin'

deploy_ref=''
expected_commit=''
IFS= read -r deploy_ref || true
IFS= read -r expected_commit || true
case "$deploy_ref" in
	refs/heads/main) ;;
	refs/tags/*) ;;
	*)
		printf 'Rejected deployment ref.\n' >&2
		exit 2
		;;
esac
git check-ref-format "$deploy_ref" >/dev/null
if [[ ! "$expected_commit" =~ ^[a-f0-9]{40}$ ]]; then
	printf 'Rejected deployment commit.\n' >&2
	exit 2
fi

exec 9>/run/lock/3fp-farin-release-deploy.lock
if ! flock -n 9; then
	printf 'A Farin 3fp deployment is already running.\n' >&2
	exit 1
fi

if [[ ! -d "$repository_path/.git" ]]; then
	if [[ -e "$repository_path" ]] && [[ -n "$(find "$repository_path" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
		printf 'Deployment checkout path exists and is not empty.\n' >&2
		exit 1
	fi
	git clone --quiet --no-checkout "$repository_url" "$repository_path"
fi

git -C "$repository_path" remote set-url origin "$repository_url"
git -C "$repository_path" fetch --quiet --force --prune --tags origin "$deploy_ref"
target_commit="$(git -C "$repository_path" rev-parse --verify 'FETCH_HEAD^{commit}')"
if [[ "$target_commit" != "$expected_commit" ]]; then
	printf 'Fetched ref does not match the commit that passed CI.\n' >&2
	exit 1
fi
previous_commit=''
if [[ -f "$state_file" ]]; then
	previous_commit="$(cat "$state_file")"
	if [[ ! "$previous_commit" =~ ^[a-f0-9]{40}$ ]]; then
		printf 'Stored deployment commit is invalid; refusing automatic deploy.\n' >&2
		exit 1
	fi
	if [[ "$previous_commit" != "$target_commit" ]] &&
		! git -C "$repository_path" merge-base --is-ancestor "$previous_commit" "$target_commit"; then
		printf 'New deployment is not a fast-forward from the last successful version.\n' >&2
		exit 1
	fi
fi
if [[ "$previous_commit" == "$target_commit" ]]; then
	printf 'Commit %s is already deployed.\n' "$target_commit"
	exit 0
fi

git -C "$repository_path" checkout --detach --force "$target_commit" >/dev/null
git -C "$repository_path" clean -fdx >/dev/null
if [[ -n "$(git -C "$repository_path" status --porcelain --untracked-files=all)" ]]; then
	printf 'Deployment checkout is not clean after checkout.\n' >&2
	exit 1
fi
if [[ ! -f "$compose_file" || ! -r /etc/3fp/build.env || ! -r /etc/3fp/production.env ]]; then
	printf 'Farin deployment files or environment files are missing.\n' >&2
	exit 1
fi

compose=(
	docker compose
	--project-name farin
	--project-directory "$compose_directory"
	-f "$compose_file"
)
previous_image="$(docker inspect --format '{{.Image}}' 3fp-web 2>/dev/null || true)"

rollback() {
	if [[ -n "$previous_image" ]]; then
		printf 'Deployment health check failed; restoring the previous image.\n' >&2
		docker image tag "$previous_image" "$image_name"
		"${compose[@]}" up -d --no-deps web
	fi
	exit 1
}

"${compose[@]}" build web
if ! "${compose[@]}" up -d --no-deps web; then
	rollback
fi

healthy=false
for _ in {1..90}; do
	health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 3fp-web 2>/dev/null || true)"
	if [[ "$health" == 'healthy' ]]; then
		healthy=true
		break
	fi
	if [[ "$health" == 'unhealthy' || "$health" == 'exited' ]]; then break; fi
	sleep 2
done
[[ "$healthy" == 'true' ]] || rollback

if ! docker exec 3fp-web node -e 'fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(10000) }).then((response) => { if (!response.ok) process.exitCode = 1; return response.body?.cancel(); }).catch(() => { process.exitCode = 1; });'; then
	rollback
fi
if ! curl --fail --silent --show-error --max-time 20 --output /dev/null https://3fp.org/api/health; then
	rollback
fi

install -d -o root -g root -m 0755 "$state_directory"
state_tmp="$state_file.$$"
printf '%s\n' "$target_commit" > "$state_tmp"
chmod 0644 "$state_tmp"
mv -f "$state_tmp" "$state_file"
printf 'Deployed %s at %s.\n' "$deploy_ref" "$target_commit"
