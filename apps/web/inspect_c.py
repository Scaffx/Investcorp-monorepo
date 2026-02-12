from pathlib import Path
text = Path("src/App.jsx").read_text("utf-8")
target = "<Section title=\"C"
idx = text.index(target)
print(text[idx:idx+40])
print([ord(ch) for ch in text[idx:idx+20]])
