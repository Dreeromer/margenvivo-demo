#!/bin/bash
# Arma index.html a partir de las piezas. Editar las piezas, no el index.
set -e
D="$(cd "$(dirname "$0")" && pwd)"
BASE="$D/_base.css"
{
  echo '<title>MargenVivo · Ferretería Santa Rosa (demostración)</title>'
  echo '<meta name="viewport" content="width=device-width,initial-scale=1">'
  sed '$d' "$BASE"          # el <style> ... sin su </style>
  cat "$D/_extra.css"
  echo '</style>'
  cat "$D/_body.html"
  echo '<script>'
  cat "$D/_data.js" "$D/_core.js" "$D/_ui.js" "$D/_mod.js"
  echo 'init();'
  echo '</script>'
} > "$D/index.html"
echo "index.html: $(grep -c '' "$D/index.html") líneas, $(wc -c < "$D/index.html") bytes"
