#!/usr/bin/env bash
set -euo pipefail

# Build a .mcpb bundle (ZIP archive) for Claude Desktop distribution.
# Usage: npm run pack:mcpb        (version from package.json)
#        npm run pack:mcpb:dev    (next patch, -dev.<UTC timestamp>)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="$REPO_ROOT/.mcpb-staging"
VERSION=$(node -p "require('$REPO_ROOT/package.json').version")

# A dev bundle sorts above the installed release, so Claude Desktop takes it
# as an upgrade, and below the next real release, which then replaces it.
# Only the bundle's manifest carries it: package.json and src/version.ts keep
# the release version.
if [[ "${1:-}" == "--dev" ]]; then
  VERSION=$(node -p "
    const [major, minor, patch] = '$VERSION'.split('-')[0].split('.').map(Number);
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    \`\${major}.\${minor}.\${patch + 1}-dev.\${stamp}\`;
  ")
fi
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
rm "$STAGING/package-lock.json" 2>/dev/null || true

# dist/ is ESM, and without a "type": "module" above it Node before 22.7 parses
# it as CommonJS and fails on the first import. Ship only that field, not the
# repo's package.json with its scripts and dependency lists.
echo '{ "type": "module" }' > "$STAGING/package.json"

# Create ZIP
(cd "$STAGING" && zip -rq "$OUTPUT" .)

# Clean up
rm -rf "$STAGING"

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo "Created $OUTPUT ($SIZE)"
