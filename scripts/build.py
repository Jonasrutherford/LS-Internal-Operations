"""Assemble src/ into dist/lucid-os.html, the single file that is published as the Lucid OS app.

Usage:  python3 scripts/build.py
"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda *p: open(os.path.join(ROOT, *p), encoding='utf-8').read()

# Order matters: core defines state and math, app defines shell/timer/editor, views register pages.
JS_FILES = ['core.js', 'app.js', 'views-work.js', 'views-money.js']
CDN = [
    'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js',   # charts
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',   # Excel import/export
]

def build():
    logo = S('assets', 'logo-path.txt').strip()
    js = '\n'.join(S('src', f) for f in JS_FILES).replace('%%LOGO%%', logo) + '\nboot();\n'
    html = S('src', 'head.html').rstrip() + '\n' + ''.join(f'<script src="{u}"></script>\n' for u in CDN) + '<script>\n' + js + '</script>\n'
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    out = os.path.join(ROOT, 'dist', 'lucid-os.html')
    open(out, 'w', encoding='utf-8').write(html)
    # Static hosts (Vercel) serve index.html at the root. The skeleton below is what Claude adds at publish time.
    page = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<meta name="robots" content="noindex,nofollow"></head><body>' + html + '</body></html>\n')
    open(os.path.join(ROOT, 'dist', 'index.html'), 'w', encoding='utf-8').write(page)
    open(os.path.join(ROOT, 'dist', 'app.js'), 'w', encoding='utf-8').write(js)   # for `node --check`
    print(f'Built {out} ({len(html)//1024} KB)')

if __name__ == '__main__':
    build()
