#!/bin/bash
set -e
D="$(cd "$(dirname "$0")" && pwd)"
{
  echo '<title>MargenVivo · Vender no es ganar</title>'
  echo '<meta name="viewport" content="width=device-width,initial-scale=1">'
  echo '<meta name="description" content="Tu sistema te dice cuánto vendiste. MargenVivo te dice cuánto te quedó y qué hacer el lunes.">'
  echo '<style>'; cat "$D/_fonts.css" "$D/_style.css"; echo '</style>'
  cat "$D/_body.html"
  echo '<script>'; cat "$D/_js.js"; echo '</script>'
} > "$D/index.html"
echo "index.html: $(grep -c '' "$D/index.html") líneas, $(wc -c < "$D/index.html") bytes"
