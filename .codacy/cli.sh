#!/usr/bin/env bash


set -euo pipefail

fatal() {
    echo "Error: $1" >&2
    exit 1
}

# Set up paths first
bin_name="codacy-cli-v2"

# Determine OS-specific paths
os_name=$(uname)
arch=$(uname -m)

case "$arch" in
"x86_64")
  arch="amd64"
  ;;
"x86")
  arch="386"
  ;;
"aarch64"|"arm64")
  arch="arm64"
  ;;
*)
    fatal "unsupported architecture '$arch' from 'uname -m'; supported mappings: x86_64->amd64, x86->386, aarch64|arm64->arm64"
    ;;
esac

if [ -z "${CODACY_CLI_V2_TMP_FOLDER:-}" ]; then
    if [ "$os_name" = "Linux" ]; then
        CODACY_CLI_V2_TMP_FOLDER="$HOME/.cache/codacy/codacy-cli-v2"
    elif [ "$os_name" = "Darwin" ]; then
        CODACY_CLI_V2_TMP_FOLDER="$HOME/Library/Caches/Codacy/codacy-cli-v2"
    else
        CODACY_CLI_V2_TMP_FOLDER=".codacy-cli-v2"
    fi
fi

version_file="$CODACY_CLI_V2_TMP_FOLDER/version.yaml"


get_version_from_yaml() {
    if [ -f "$version_file" ]; then
        local version=$(grep -o 'version: *"[^"]*"' "$version_file" | cut -d'"' -f2)
        if [ -n "$version" ]; then
            echo "$version"
            return 0
        fi
    fi
    return 1
}

get_latest_version() {
    local response
    local auth_header=()
    if [ -n "${GH_TOKEN:-}" ]; then
        auth_header=(--header "Authorization: Bearer ${GH_TOKEN}")
    fi

    if [ "${#auth_header[@]}" -gt 0 ]; then
        response=$(curl --silent --show-error --location --connect-timeout 10 --max-time 30 "${auth_header[@]}" "https://api.github.com/repos/codacy/codacy-cli-v2/releases/latest")
    else
        response=$(curl --silent --show-error --location --connect-timeout 10 --max-time 30 "https://api.github.com/repos/codacy/codacy-cli-v2/releases/latest")
    fi
    handle_rate_limit "$response"

    local version
    if command -v jq > /dev/null 2>&1; then
        version=$(echo "$response" | jq -r '.tag_name // empty')
    else
        version=$(echo "$response" | grep -m 1 tag_name | cut -d'"' -f4)
    fi
    if [ -z "$version" ]; then
        fatal "could not read latest Codacy CLI version from GitHub response"
    fi
    echo "$version"
}

handle_rate_limit() {
    local response="$1"
    if echo "$response" | grep -q "API rate limit exceeded"; then
          fatal "GitHub API rate limit exceeded. Please try again later"
    fi
}

download_file() {
    local url="$1"

    echo "Downloading from URL: ${url}"
    if command -v curl > /dev/null 2>&1; then
        curl --fail --location --show-error --progress-bar --connect-timeout 10 --max-time 120 "$url" -O
    elif command -v wget > /dev/null 2>&1; then
        wget --timeout=120 --tries=3 "$url"
    else
        fatal "Could not find curl or wget, please install one."
    fi
}

verify_archive_checksum() {
    local checksum_path="$1"
    local archive_name="$2"
    local archive_dir="$3"
    local match_file="${archive_dir}/${archive_name}.sha256"

    grep "[[:space:]]${archive_name}$" "$checksum_path" > "$match_file" || \
        fatal "failed to locate checksum for ${archive_name} in ${checksum_path}"

    if command -v sha256sum > /dev/null 2>&1; then
        ( cd "$archive_dir" && sha256sum -c "$(basename "$match_file")" ) || \
            fatal "checksum verification failed for ${archive_name}"
    elif command -v shasum > /dev/null 2>&1; then
        ( cd "$archive_dir" && shasum -a 256 -c "$(basename "$match_file")" ) || \
            fatal "checksum verification failed for ${archive_name}"
    else
        fatal "sha256 checksum verifier not found; install sha256sum or shasum"
    fi

    rm -f "$match_file"
}

archive_has_safe_paths() {
    local archive_path="$1"
    tar -tzf "$archive_path" | grep -Eq '(^/|(^|/)\.\.(/|$))'
}

download() {
    local url="$1"
    local output_folder="$2"

    ( cd "$output_folder" && download_file "$url" )
}

download_cli() {
    # OS name lower case
    local suffix
    suffix=$(echo "$os_name" | tr '[:upper:]' '[:lower:]')

    local bin_folder="$1"
    local bin_path="$2"
    local version="$3"

    if [ ! -f "$bin_path" ]; then
        echo "📥 Downloading CLI version $version..."

        local remote_file="codacy-cli-v2_${version}_${suffix}_${arch}.tar.gz"
        local checksum_file="checksums.txt"
        local url="https://github.com/codacy/codacy-cli-v2/releases/download/${version}/${remote_file}"
        local checksum_url="https://github.com/codacy/codacy-cli-v2/releases/download/${version}/${checksum_file}"
        local archive_path="${bin_folder}/${remote_file}"
        local checksum_path="${bin_folder}/${checksum_file}"
        local abs_bin_folder

        abs_bin_folder=$(cd "$bin_folder" && pwd -P) || fatal "failed to resolve absolute path for ${bin_folder}"

        download "$url" "$bin_folder"
        download "$checksum_url" "$bin_folder"
        if [ ! -s "$archive_path" ]; then
            fatal "Codacy CLI archive was not downloaded or is empty"
        fi
        if [ ! -s "$checksum_path" ]; then
            rm -f "$archive_path"
            fatal "Codacy CLI checksum file was not downloaded or is empty"
        fi
        verify_archive_checksum "$checksum_path" "$remote_file" "$bin_folder"
        if ! command -v tar > /dev/null 2>&1; then
            rm -f "$archive_path" "$checksum_path"
            fatal "tar not found; please install tar"
        fi
        if archive_has_safe_paths "$archive_path"; then
            rm -f "$archive_path" "$checksum_path"
            fatal "Codacy CLI archive contains unsafe paths"
        fi
          tar xzf "$archive_path" --no-absolute-names --warning=no-unknown-keyword -C "$abs_bin_folder" || {
            rm -f "$archive_path" "$checksum_path"
            fatal "failed to extract Codacy CLI archive"
        }
        rm -f "$archive_path" "$checksum_path"
    fi
}

# Warn if CODACY_CLI_V2_VERSION is set and update is requested
if [ -n "${CODACY_CLI_V2_VERSION:-}" ] && [ "${1:-}" = "update" ]; then
    echo "⚠️  Warning: Performing update with forced version $CODACY_CLI_V2_VERSION"
    echo "    Unset CODACY_CLI_V2_VERSION to use the latest version"
fi

# Ensure version.yaml exists and is up to date
if [ -n "${CODACY_CLI_V2_VERSION:-}" ]; then
    version="$CODACY_CLI_V2_VERSION"
elif [ ! -f "$version_file" ] || [ "${1:-}" = "update" ]; then
    echo "ℹ️  Fetching latest version..."
    version=$(get_latest_version)
    mkdir -p "$CODACY_CLI_V2_TMP_FOLDER"
    echo "version: \"$version\"" > "$version_file"
else
    version=$(get_version_from_yaml) || fatal "could not read cached Codacy CLI version from ${version_file}; rerun with update or delete the file"
fi


# Set up version-specific paths
bin_folder="${CODACY_CLI_V2_TMP_FOLDER}/${version}"

mkdir -p "$bin_folder"
bin_path="$bin_folder"/"$bin_name"

# Download the tool if not already installed
download_cli "$bin_folder" "$bin_path" "$version"
chmod +x "$bin_path"

run_command="$bin_path"
if [ ! -x "$run_command" ]; then
    fatal "Codacy cli v2 binary could not be found or is not executable."
fi

if [ "$#" -eq 1 ] && [ "$1" = "download" ]; then
    echo "Codacy cli v2 download succeeded"
else
    exec "$run_command" "$@"
fi