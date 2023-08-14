#!/bin/bash

# Get the path of the current script
script_path="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 || exit ; pwd -P )"

# Define the subdirectory relative to the script path
subdir_path="$script_path/comfy-ui-headless/src"

# Define the GitHub Project URL
comfy_url="https://github.com/comfyanonymous/ComfyUI"

# Define the specific commit you want to checkout
commit_hash="974958ff81d9af92b01490bcc99dfc93f8bb5d30"

# Delete the existing subdirectory
rm -rf "$subdir_path"

# Create the subdirectory if not already exists
mkdir -p "$subdir_path"

# Go to the newly created subdirectory
cd "$subdir_path" || exit

# Clone the GitHub project here
git clone $comfy_url .

# Checkout to specific commit
git checkout $commit_hash
