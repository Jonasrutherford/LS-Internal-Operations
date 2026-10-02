"""Assemble src/ into a standalone web page that runs outside Claude.

Same application code as the artifact build. The only difference is that
standalone/claude-shim.js supplies window.claude.use('db') from browser storage,
so the app has a database on an ordinary web host.

Output: dist/standalone/index.html  (no business data is embedded)

Usage:  python3 scripts/build_standalone.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda *p: open(os.path.join(ROOT, *p), encoding='utf-8').read()

JS_FILES = ['core.js', 'app.js', 'views-work.js', 'views-money.js']
CDN = [
    'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
]


def build():
    logo = S('assets', 'logo-path.txt').strip()
    js = '\n'.join(S('src', f) for f in JS_FILES).replace('%%LOGO%%', logo)

    head = S('src', 'head.html').rstrip()
    scripts = ''.join(f'<script src="{u}"></script>\n' for u in CDN)
    shim = '<script>\n' + S('standalone', 'claude-shim.js') + '</script>\n'

    # The shim resolves once data is present, then the app boots exactly as it does
    # inside Claude. The artifact build calls boot() directly instead.
    app = '<script>\n' + js + '\nwindow.__lucidReady.then(boot);\n</script>\n'

    page = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="robots" content="noindex,nofollow">'
        '</head><body>'
        + head + '\n' + scripts + shim + app +
        '</body></html>\n'
    )

    out_dir = os.path.join(ROOT, 'dist', 'standalone')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, 'index.html')
    open(out, 'w', encoding='utf-8').write(page)
    print(f'Built {out} ({len(page)//1024} KB)')


if __name__ == '__main__':
    build()
