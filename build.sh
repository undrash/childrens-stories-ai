#!/bin/bash
set -eu
shopt -s extglob # extended globbing

NODE_VERSION="node18"
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/" && pwd)
DIST_ROOT="$PROJECT_ROOT/dist"
ENTRYPOINTS_DIR="$PROJECT_ROOT/src/!(common)"

for FULL_PATH in $ENTRYPOINTS_DIR/index.ts
do
  # Use basename function to remove /index.ts and get the directory name
  DIR_NAME=$(basename "$(dirname $FULL_PATH)")

  # Define our out folder
  DIST_OUT="$DIST_ROOT/$DIR_NAME"

  # Make sure the output directory exists
  mkdir -p $DIST_OUT

  echo "Building $FULL_PATH to $DIST_OUT"

  npx esbuild \
    --bundle \
    --platform=node --target="$NODE_VERSION" \
    --external:@aws-sdk \
    --minify \
    --outdir="$DIST_OUT" \
    "$FULL_PATH"
done
