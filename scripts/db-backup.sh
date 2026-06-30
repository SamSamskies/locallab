#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

db="data/app.db"

if [ ! -f "$db" ]; then
  echo "Database not found: $db" >&2
  exit 1
fi

mkdir -p data/backups
backup="data/backups/app.$(date +%Y%m%d-%H%M%S).db"

sqlite3 "$db" ".backup '${backup}'"
echo "Backed up to ${backup}"
