#!/bin/bash
# Publica public/ en la rama gh-pages (GitHub Pages).
# A cada archivo JS/CSS le agrega ?v=<versión> para que los navegadores no usen una copia vieja.
set -e
cd "$(dirname "$0")/.."
V=$(git rev-parse --short HEAD)$(git diff --quiet && echo "" || date +%H%M%S)
URL=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -R public/. "$TMP/"
find "$TMP/js" -name '*.js' -print0 | xargs -0 sed -i '' -E "s#(from '\./[^']+\.js)'#\1?v=$V'#g; s#(from '\.\./[^']+\.js)'#\1?v=$V'#g; s#(import\('\./[^']+\.js)'#\1?v=$V'#g"
sed -i '' -E "s#(src=\"js/main\.js)\"#\1?v=$V\"#; s#(href=\"css/app\.css)\"#\1?v=$V\"#; s#(src=\"vendor/pdfmake\.min\.js)\"#\1?v=$V\"#" "$TMP/index.html"
( cd "$TMP" && git init -q -b gh-pages && git add -A && git -c user.name="publicar" -c user.email="publicar@local" commit -qm "Publicar $V" && git push -qf "$URL" gh-pages )
rm -rf "$TMP"
echo "Publicado versión $V"
