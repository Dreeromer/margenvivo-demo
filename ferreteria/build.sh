#!/bin/bash
# Arma index.html desde las piezas. Editar las piezas, NO el index.
set -e
D="$(cd "$(dirname "$0")" && pwd)"
{
  echo '<title>MargenVivo · Ferretería Santa Rosa</title>'
  echo '<meta name="viewport" content="width=device-width,initial-scale=1">'
  echo '<link rel="preconnect" href="https://fonts.googleapis.com">'
  echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  echo '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">'
  echo '<style>'
  cat "$D/_style.css"
  echo '</style>'
  cat "$D/_body.html"
  echo '<script>'
  cat "$D/_data.js" "$D/_core.js" "$D/_ui.js" "$D/_panel.js" "$D/_mod.js"
  echo 'init();'
  echo '</script>'
} > "$D/index.html"
echo "index.html: $(grep -c '' "$D/index.html") líneas, $(wc -c < "$D/index.html") bytes"
