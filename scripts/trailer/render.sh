#!/usr/bin/env bash
set -euo pipefail

concat="${1:?usage: render.sh <concat.txt> <out-dir> [mp4-crf] [webm-crf]}"
out="${2:?usage: render.sh <concat.txt> <out-dir> [mp4-crf] [webm-crf]}"
mp4_crf="${3:-20}"
webm_crf="${4:-34}"
filter="fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p"

mkdir -p "$out"

ffmpeg -y -loglevel error -f concat -safe 0 -i "$concat" -vf "$filter" \
  -c:v libx264 -preset slow -crf "$mp4_crf" -pix_fmt yuv420p -movflags +faststart -an \
  "$out/trailer.mp4"

ffmpeg -y -loglevel error -f concat -safe 0 -i "$concat" -vf "$filter" \
  -c:v libvpx-vp9 -crf "$webm_crf" -b:v 0 -row-mt 1 -cpu-used 2 -pix_fmt yuv420p -an \
  "$out/trailer.webm"

ffmpeg -y -loglevel error -ss 5 -i "$out/trailer.mp4" -frames:v 1 -q:v 2 "$out/poster.jpg"

ls -l "$out/trailer.mp4" "$out/trailer.webm" "$out/poster.jpg"
