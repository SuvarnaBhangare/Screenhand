#!/usr/bin/env bash
set -euo pipefail

API_KEY="${GEMINI_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  echo "GEMINI_API_KEY is required" >&2
  exit 1
fi

OUT_JSON=".tmp/gemini_image_response.json"
OUT_IMG=".tmp/screenhand-devpost-cover.png"

cat > .tmp/gemini_image_req.json <<'JSON'
{
  "contents": [
    {
      "parts": [
        {
          "text": "Design a premium Devpost cover image for Screenhand. Include title text: 'Screenhand'. Include subtitle text: 'Give AI eyes and hands on your desktop'. Visual: desktop automation dashboard, cursor path, app windows, clean modern product launch aesthetic. Colors: teal, blue, dark navy accents. High clarity, marketing quality, no watermark."
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["IMAGE", "TEXT"]
  }
}
JSON

curl -sS "https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${API_KEY}" \
  -H 'Content-Type: application/json' \
  --data-binary @.tmp/gemini_image_req.json > "$OUT_JSON"

IMG_B64=$(jq -r '.candidates[0].content.parts[]? | select(.inlineData!=null) | .inlineData.data' "$OUT_JSON" | head -n 1)

if [ -z "$IMG_B64" ] || [ "$IMG_B64" = "null" ]; then
  echo "No image data found. Raw response:" >&2
  cat "$OUT_JSON" >&2
  exit 2
fi

echo "$IMG_B64" | base64 --decode > "$OUT_IMG"

echo "$OUT_IMG"
file "$OUT_IMG"
identify "$OUT_IMG" 2>/dev/null || true
