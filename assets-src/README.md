# Source artwork

Full-resolution originals. **Not** in `public/`, because everything in
`public/` is copied verbatim into `dist/` and served to every visitor —
`educhess_logo.png` alone is 844 KB and was previously shipped just to render
a 16x16 favicon.

Regenerate the sized icons after changing the mark:

```python
from PIL import Image
src = Image.open("assets-src/educhess_logo.png").convert("RGBA")
src.resize((32, 32), Image.LANCZOS).save("public/favicon-32.png", optimize=True)
src.resize((180, 180), Image.LANCZOS).save("public/apple-touch-icon.png", optimize=True)
```
