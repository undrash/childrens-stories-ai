#!/bin/bash
set -eu
shopt -s extglob globstar # extended globbing

node_version="node18"
project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/" && pwd)
dist_root="$project_root/dist"
entrypoints_dir="$project_root/src"

for full_path in $entrypoints_dir/**/index.ts
do
  # Remove the entrypoint dir to get relative paths.
  relative_path="${full_path#$entrypoints_dir}"

  # Find out the designated output folder by replacing /index.ts
  out_dir="${relative_path/\/index.ts}"

  # Check if out_dir contains "_common"
  if [[ $out_dir == *"_lib"* ]]; then
    continue
  fi

  # Define our out folder
  dist_out="$dist_root/$out_dir"

  # Make sure the output directory exists
  mkdir -p "$dist_out"

  echo "Building $full_path to $dist_out"

  npx esbuild \
    --bundle \
    --platform=node --target="$node_version" \
    --external:@aws-sdk \
    --minify \
    --outdir="$dist_out" \
    "$full_path"
done
