import pathlib, unicodedata
text = pathlib.Path(''src/App.jsx'').read_text(''utf-8'')
chars = sorted({ch for ch in text if ord(ch) > 127})
for ch in chars:
    print(f'{ord(ch):04x} {ch} {unicodedata.name(ch, '?')}')
