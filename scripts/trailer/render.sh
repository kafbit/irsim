#!/usr/bin/env bash
set -euo pipefail

usage="usage: render.sh <concat.txt> <out-dir> [mp4-crf] [webm-crf] [audio.wav] [poster-seconds] [duration-seconds]"
concat="${1:?$usage}"
out="${2:?$usage}"
mp4_crf="${3:-20}"
webm_crf="${4:-34}"
audio="${5:-}"
poster_at="${6:-9}"
limit=()
if [[ -n "${7:-}" ]]; then limit=(-t "$7"); fi
filter="fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p"

mkdir -p "$out"

if [[ -n "$audio" ]]; then
  mp4_audio=(-i "$audio" -map 0:v -map 1:a -c:a aac -b:a 128k)
  webm_audio=(-i "$audio" -map 0:v -map 1:a -c:a libopus -b:a 96k)
else
  mp4_audio=(-an)
  webm_audio=(-an)
fi

ffmpeg -y -loglevel error -f concat -safe 0 -i "$concat" "${mp4_audio[@]}" -vf "$filter" \
  -c:v libx264 -preset slow -crf "$mp4_crf" -pix_fmt yuv420p -movflags +faststart "${limit[@]}" \
  "$out/trailer.mp4"

ffmpeg -y -loglevel error -f concat -safe 0 -i "$concat" "${webm_audio[@]}" -vf "$filter" \
  -c:v libvpx-vp9 -crf "$webm_crf" -b:v 0 -row-mt 1 -cpu-used 2 -pix_fmt yuv420p "${limit[@]}" \
  "$out/trailer.webm"

ffmpeg -y -loglevel error -ss "$poster_at" -i "$out/trailer.mp4" -frames:v 1 -q:v 2 "$out/poster.jpg"

ls -l "$out/trailer.mp4" "$out/trailer.webm" "$out/poster.jpg"
