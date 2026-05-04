#!/usr/bin/env bash
set -euo pipefail

# Build a .mcpb bundle (ZIP archive) for Claude Desktop distribution.
# Usage: npm run pack

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="$REPO_ROOT/.mcpb-staging"
VERSION=$(node -p "require('$REPO_ROOT/package.json').version")
OUTPUT="$REPO_ROOT/kosli-mcp-server-${VERSION}.mcpb"

echo "Building .mcpb bundle v${VERSION}..."

# Clean build
rm -rf "$STAGING" "$OUTPUT"
npm run build --prefix "$REPO_ROOT"

# Stage files
mkdir -p "$STAGING"

# Inject version from package.json into manifest
node -e "
  const m = JSON.parse(require('fs').readFileSync('$REPO_ROOT/manifest.json', 'utf8'));
  m.version = '$VERSION';
  require('fs').writeFileSync('$STAGING/manifest.json', JSON.stringify(m, null, 2) + '\n');
"
cp -r "$REPO_ROOT/assets" "$STAGING/"
cp -r "$REPO_ROOT/dist" "$STAGING/"

# Install production dependencies only
cp "$REPO_ROOT/package.json" "$STAGING/"
cp "$REPO_ROOT/package-lock.json" "$STAGING/" 2>/dev/null || true
(cd "$STAGING" && npm install --omit=dev --ignore-scripts --no-audit --no-fund)
rm "$STAGING/package.json" "$STAGING/package-lock.json" 2>/dev/null || true

# Create ZIP
(cd "$STAGING" && zip -rq "$OUTPUT" .)

# Clean up
rm -rf "$STAGING"

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo "Created $OUTPUT ($SIZE)"
