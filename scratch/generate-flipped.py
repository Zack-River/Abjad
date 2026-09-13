import re
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

font = TTFont('public/fonts/NotoSansArabic-Regular.ttf')
glyphSet = font.getGlyphSet()
hmtx = font['hmtx']

def flip_svg_path(path_str):
    # Regex to match SVG commands and coordinates
    # In TTF fonts, commands are M, L, H, V, Q, Z, etc.
    # Note: SVGPathPen outputs M x y, L x y, H x, V y, Q x1 y1 x y, Z
    tokens = re.findall(r'([A-Za-z]|[-+]?[0-9]*\.?[0-9]+)', path_str)
    out = []
    i = 0
    cmd = ''
    while i < len(tokens):
        t = tokens[i]
        if t.isalpha():
            cmd = t
            out.append(cmd)
            i += 1
        else:
            if cmd in ('M', 'L'):
                x = tokens[i]
                y = float(tokens[i+1])
                out.append(x)
                out.append(f"{-y:g}")
                i += 2
            elif cmd == 'H':
                x = tokens[i]
                out.append(x)
                i += 1
            elif cmd == 'V':
                y = float(tokens[i])
                out.append(f"{-y:g}")
                i += 1
            elif cmd == 'Q':
                x1 = tokens[i]
                y1 = float(tokens[i+1])
                x = tokens[i+2]
                y = float(tokens[i+3])
                out.append(x1)
                out.append(f"{-y1:g}")
                out.append(x)
                out.append(f"{-y:g}")
                i += 4
            else:
                out.append(t)
                i += 1
    return " ".join(out)

for name in ['uni0643.medi', 'kafDotlessar.fina', 'miniKehehar', 'uni0647.medi', 'dotcenterar', 'uni062D.init', 'uni062D.medi', 'uni062D.fina', 'uni0633.init', 'uni0633.medi', 'uni0633.fina']:
    if name in glyphSet:
        pen = SVGPathPen(glyphSet)
        glyphSet[name].draw(pen)
        adv = hmtx[name][0]
        flipped = flip_svg_path(pen.getCommands())
        print(f"export const {name.replace('.', '_')}_OUTLINE = '{flipped}'; // adv: {adv}")
