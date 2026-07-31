#!/bin/bash
set -e
D="$(cd "$(dirname "$0")" && pwd)"
{
  echo '<title>MargenVivo · Analizador de ventas</title>'
  echo '<meta name="viewport" content="width=device-width,initial-scale=1">'
  echo '<style>'; cat "$D/_fonts.css" "$D/_style.css"; echo '</style>'
  cat "$D/_body.html"
  echo '<script>'; cat "$D/_xls.js" "$D/_analisis.js" "$D/_ui.js"; echo 'iniciar();'; echo '</script>'
} > "$D/index.html"
echo "index.html: $(grep -c '' "$D/index.html") líneas, $(wc -c < "$D/index.html") bytes"
