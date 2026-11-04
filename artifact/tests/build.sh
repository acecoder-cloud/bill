# Wraps the artifact fragment in a document with the mock injected first.
F="$(dirname "$0")/../bill-log.html"
{ echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'; echo "<script>$(cat mock-claude.js)</script></head><body>"; cat $F; echo '</body></html>'; } > page.html
