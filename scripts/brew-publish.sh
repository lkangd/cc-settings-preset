#!/usr/bin/env bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PACKAGE_NAME="@lkangd/cc-settings-preset"
FORMULA_NAME="cc-settings-preset"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --tap-dir)
      HOMEBREW_TAP_DIR="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [--tap-dir PATH]"
      echo ""
      echo "Options:"
      echo "  --tap-dir PATH    Path to homebrew-tap directory"
      echo ""
      echo "Environment variables:"
      echo "  HOMEBREW_TAP_DIR  Path to homebrew-tap directory"
      echo ""
      echo "If not specified, will try to find homebrew-tap in parent directory"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Run '$0 --help' for usage"
      exit 1
      ;;
  esac
done

# Determine homebrew-tap directory
# Priority: 1. Command line arg, 2. Environment variable, 3. Auto-detect
if [ -z "$HOMEBREW_TAP_DIR" ]; then
  if [ -n "$HOMEBREW_TAP_DIR" ]; then
    # Use environment variable
    :
  else
    # Try to auto-detect in parent directory
    CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    PARENT_DIR="$(dirname "$CURRENT_DIR")"

    if [ -d "${PARENT_DIR}/homebrew-tap" ]; then
      HOMEBREW_TAP_DIR="${PARENT_DIR}/homebrew-tap"
      echo -e "${YELLOW}Auto-detected tap directory: ${HOMEBREW_TAP_DIR}${NC}"
    else
      echo -e "${RED}Error: Could not find homebrew-tap directory${NC}"
      echo -e "Please specify it using one of:"
      echo -e "  1. Command line: $0 --tap-dir /path/to/homebrew-tap"
      echo -e "  2. Environment: export HOMEBREW_TAP_DIR=/path/to/homebrew-tap"
      exit 1
    fi
  fi
fi

FORMULA_FILE="${HOMEBREW_TAP_DIR}/Formula/${FORMULA_NAME}.rb"

# Get current version from package.json
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION=$(node -p "require('${CURRENT_DIR}/package.json').version")

if [ -z "$VERSION" ]; then
  echo -e "${RED}Error: Could not read version from package.json${NC}"
  exit 1
fi

echo -e "${GREEN}Publishing ${PACKAGE_NAME}@${VERSION} to Homebrew${NC}"
echo ""

# Step 1: Calculate SHA256
echo -e "${YELLOW}Step 1: Calculating SHA256 for npm tarball...${NC}"
NPM_URL="https://registry.npmjs.org/${PACKAGE_NAME}/-/${FORMULA_NAME}-${VERSION}.tgz"
SHA256=$(curl -sL "${NPM_URL}" | shasum -a 256 | awk '{print $1}')

if [ -z "$SHA256" ]; then
  echo -e "${RED}Error: Could not calculate SHA256${NC}"
  exit 1
fi

echo -e "${GREEN}✓ SHA256: ${SHA256}${NC}"
echo ""

# Step 2: Check if homebrew-tap directory exists
echo -e "${YELLOW}Step 2: Checking homebrew-tap directory...${NC}"
if [ ! -d "$HOMEBREW_TAP_DIR" ]; then
  echo -e "${RED}Error: Homebrew tap directory not found: ${HOMEBREW_TAP_DIR}${NC}"
  exit 1
fi

if [ ! -f "$FORMULA_FILE" ]; then
  echo -e "${RED}Error: Formula file not found: ${FORMULA_FILE}${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Found formula file${NC}"
echo ""

# Step 3: Update formula file
echo -e "${YELLOW}Step 3: Updating formula file...${NC}"

# Backup original file
cp "$FORMULA_FILE" "${FORMULA_FILE}.bak"

# Update URL and SHA256 using sed
sed -i '' "s|url \"https://registry.npmjs.org/${PACKAGE_NAME}/-/${FORMULA_NAME}-.*\.tgz\"|url \"${NPM_URL}\"|" "$FORMULA_FILE"
sed -i '' "s|sha256 \".*\"|sha256 \"${SHA256}\"|" "$FORMULA_FILE"

echo -e "${GREEN}✓ Updated formula file${NC}"
echo ""

# Step 4: Show diff
echo -e "${YELLOW}Step 4: Changes to be committed:${NC}"
cd "$HOMEBREW_TAP_DIR"
git diff "$FORMULA_FILE"
echo ""

# Step 5: Commit and push
echo -e "${YELLOW}Step 5: Committing and pushing changes...${NC}"
read -p "Do you want to commit and push these changes? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  git add "$FORMULA_FILE"
  git commit -m "chore: update ${FORMULA_NAME} to ${VERSION}

- Update tarball URL to version ${VERSION}
- Update SHA256 checksum"

  git push

  echo ""
  echo -e "${GREEN}✓ Successfully published ${FORMULA_NAME}@${VERSION} to Homebrew!${NC}"
  echo ""
  echo -e "Users can now install with:"
  echo -e "  ${YELLOW}brew update${NC}"
  echo -e "  ${YELLOW}brew upgrade ${FORMULA_NAME}${NC}"
else
  echo -e "${YELLOW}Aborted. Restoring original formula file...${NC}"
  mv "${FORMULA_FILE}.bak" "$FORMULA_FILE"
  exit 1
fi

# Cleanup backup
rm -f "${FORMULA_FILE}.bak"
