#!/bin/bash
set -e

# Ensure we are in the repo root
cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)

echo "🦞 Force Upgrading OpenClaw Source..."

# 1. Update Code
echo "1. Pulling latest changes..."
git pull

# 2. Build
echo "2. Installing dependencies and building..."
pnpm install
pnpm build

# 3. Force Service Reinstall
# The --force flag is now reliably handled by our CLI fixes
echo "3. Reinstalling Gateway Service..."
node openclaw.mjs gateway install --force

# 4. Restart Service
echo "4. Restarting Gateway..."
node openclaw.mjs gateway restart

# 5. Override Binary
echo "5. Overriding 'openclaw' binary..."

override_binary() {
  local target="$1"
  if [ -f "$target" ]; then
    echo "Found binary at $target"
    if [ -L "$target" ]; then
       echo "It is already a symlink. Updating..."
       rm "$target"
    else
       echo "Backing up original to ${target}.bak"
       mv "$target" "${target}.bak"
    fi
    ln -s "$REPO_ROOT/openclaw.mjs" "$target"
    echo "✓ Linked $target -> $REPO_ROOT/openclaw.mjs"
    return 0
  fi
  return 1
}

# Try common brew locations
if override_binary "/home/linuxbrew/.linuxbrew/bin/openclaw"; then
  :
elif override_binary "/usr/local/bin/openclaw"; then
  :
elif override_binary "$(which openclaw 2>/dev/null)"; then
  :
else
  echo "Could not find existing 'openclaw' to replace."
  echo "Creating new link in ~/.local/bin..."
  mkdir -p "$HOME/.local/bin"
  ln -sf "$REPO_ROOT/openclaw.mjs" "$HOME/.local/bin/openclaw"
  echo "✓ Created $HOME/.local/bin/openclaw"
fi

# Ensure executable
chmod +x "$REPO_ROOT/openclaw.mjs"

echo ""
echo "✅ Force upgrade complete!"
echo "Version check:"
"$REPO_ROOT/openclaw.mjs" --version
