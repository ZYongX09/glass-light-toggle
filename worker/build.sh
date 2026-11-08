#!/usr/bin/env bash
# 把仓库根目录的演示页装配到 worker/public/projects/light-switch/
# （assets 路径与线上路由 /projects/light-switch 对应，html_handling 默认 auto-trailing-slash）
set -euo pipefail
cd "$(dirname "$0")"
rm -rf public
mkdir -p public/projects/light-switch
cp ../index.html public/projects/light-switch/index.html
cp ../glass-toggle.js public/projects/light-switch/glass-toggle.js
echo "built worker/public/projects/light-switch"
