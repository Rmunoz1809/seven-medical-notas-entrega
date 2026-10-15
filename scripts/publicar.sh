#!/bin/bash
# Publica public/ en la rama gh-pages (GitHub Pages)
set -e
cd "$(dirname "$0")/.."
git subtree split --prefix public -b gh-pages-tmp >/dev/null
git push -f origin gh-pages-tmp:gh-pages
git branch -D gh-pages-tmp >/dev/null
