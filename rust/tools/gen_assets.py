#!/usr/bin/env python3
"""把前端文件打包进 Rust 二进制：生成 src/assets.rs（用 include_bytes!）"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets.rs')

INCLUDE = ['index.html', 'style.css', 'responsive.css', 'tokens.json']
INCLUDE_DIRS = ['js', 'assets']

MIME = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
        '.js':'application/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
        '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml',
        '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2'}

def files():
    for f in INCLUDE:
        p = os.path.join(ROOT, f)
        if os.path.exists(p): yield f, p
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        for cur, _, fs in os.walk(base):
            for f in fs:
                p = os.path.join(cur, f)
                rel = os.path.relpath(p, ROOT).replace(os.sep, '/')
                if rel.endswith('.md'): continue
                yield rel, p

def main():
    out = ['// 自动生成，勿手改：rust/tools/gen_assets.py', 'use crate::assets_support::Asset;', '']
    out.append('pub static ASSETS: &[Asset] = &[')
    for rel, path in files():
        mime = MIME.get(os.path.splitext(path)[1].lower(), 'application/octet-stream')
        out.append('    Asset { path: "/%s", mime: "%s", bytes: include_bytes!("../../%s") },'
                   % (rel, mime, rel))
    out.append('];')
    with open(OUT, 'w') as f:
        f.write('\n'.join(out) + '\n')
    print('written', OUT)

if __name__ == '__main__':
    main()
