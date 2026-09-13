from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

font = TTFont('public/fonts/NotoSansArabic-Regular.ttf')
glyphSet = font.getGlyphSet()
hmtx = font['hmtx']

glyphs = ['uni0643.medi', 'kafDotlessar.fina', 'miniKehehar', 'uni0647.medi', 'dotcenterar']

for name in glyphs:
    if name in glyphSet:
        pen = SVGPathPen(glyphSet)
        glyphSet[name].draw(pen)
        adv = hmtx[name][0]
        # Invert Y for our SVG coordinate convention (since fontTools outputs standard Cartesian with Y up, but SVG is Y down)
        # Note: SVGPathPen outputs Y up (positive is above baseline). In our stroke-registry, paths are flipped or Y is negated.
        # Let's inspect how other outlines are stored.
        print(f"=== {name} (adv: {adv}) ===")
        print(pen.getCommands())
