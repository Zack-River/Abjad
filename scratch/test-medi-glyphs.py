import re

outlines = {}
with open('scratch/flipped-outlines.ts') as f:
    for line in f:
        m = re.match(r"export const (\w+)_OUTLINE = '([^']+)'; // adv: (\d+)", line)
        if m:
            outlines[m.group(1)] = (m.group(2), int(m.group(3)))

# 1. Medial Kaf (uni0643_medi)
path_kaf_medi = "M 508 -36 L 400 -36 C 360 -36, 330 -80, 310 -150 L 140 -430 L 400 -670 C 350 -630, 260 -560, 180 -490 C 100 -410, 170 -250, 250 -130 C 270 -90, 180 -36, 80 -36 L 0 -36"
svg_kaf = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -800 650 1000" width="600" height="600">
  <rect x="-50" y="-800" width="650" height="1000" fill="#1e1e2e"/>
  <line x1="-50" y1="-36" x2="650" y2="-36" stroke="#89b4fa" stroke-dasharray="4,4" stroke-width="2"/>
  <path d="{outlines['uni0643_medi'][0]}" fill="#313244" stroke="#cdd6f4" stroke-width="2"/>
  <path d="{path_kaf_medi}" fill="none" stroke="#f38ba8" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
</svg>'''
with open('scratch/test-kaf-medi.svg', 'w') as f:
    f.write(svg_kaf)

# 2. Medial Heh (uni0647_medi)
# Medial Heh: entrance at 507, -36 -> loop top -> loop bottom -> exit at 0, -36
path_heh_medi = "M 507 -36 L 420 -36 C 360 -36, 320 -70, 280 -130 C 200 -260, 230 -330, 290 -334 C 330 -334, 340 -270, 310 -180 C 270 -80, 210 20, 240 100 C 270 180, 350 180, 350 60 C 350 -10, 290 -36, 150 -36 L 0 -36"
svg_heh = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -500 650 800" width="600" height="600">
  <rect x="-50" y="-500" width="650" height="800" fill="#1e1e2e"/>
  <line x1="-50" y1="-36" x2="650" y2="-36" stroke="#89b4fa" stroke-dasharray="4,4" stroke-width="2"/>
  <path d="{outlines['uni0647_medi'][0]}" fill="#313244" stroke="#cdd6f4" stroke-width="2"/>
  <path d="{path_heh_medi}" fill="none" stroke="#f38ba8" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
</svg>'''
with open('scratch/test-heh-medi.svg', 'w') as f:
    f.write(svg_heh)

print("Generated test-kaf-medi.svg and test-heh-medi.svg")
