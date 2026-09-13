from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

font = TTFont('public/fonts/NotoSansArabic-Regular.ttf')
glyphSet = font.getGlyphSet()

for name in ['uni066F.fina']:
    if name in glyphSet:
        pen = SVGPathPen(glyphSet)
        glyphSet[name].draw(pen)
        print(f"{name}: {pen.getCommands()}")
