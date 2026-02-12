from pathlib import Path
text = Path("src/App.jsx").read_text("utf-8")
needle = "label=\"Relat"
idx = text.index(needle)
snippet = text[idx:idx+20]
print(repr(snippet))
print([ord(ch) for ch in snippet])
