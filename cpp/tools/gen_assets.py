#!/usr/bin/env python3
"""把前端文件打包进 exe：生成 cpp/src/assets.cpp"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'assets.cpp')

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
    out = ['// 自动生成，勿手改：cpp/tools/gen_assets.py', '#include "src/assets.h"', '']
    entries = []
    for rel, path in files():
        data = open(path, 'rb').read()
        mime = MIME.get(os.path.splitext(path)[1].lower(), 'application/octet-stream')
        var = 'asset_' + ''.join(c if c.isalnum() else '_' for c in rel)
        out.append('static const unsigned char %s[] = {' % var)
        for i in range(0, len(data), 20):
            out.append('  ' + ','.join(str(b) for b in data[i:i+20]) + ',')
        out.append('};')
        entries.append((var, rel, mime, len(data)))
    out.append('namespace osc {')
    out.append('const Asset* assetTable(size_t& n) {')
    out.append('  static const Asset table[] = {')
    for var, rel, mime, size in entries:
        out.append('    {"/%s", "%s", %s, %d},' % (rel, mime, var, size))
    out.append('  };')
    out.append('  n = sizeof(table) / sizeof(table[0]);')
    out.append('  return table;')
    out.append('}')
    out.append('}  // namespace osc')
    with open(OUT, 'w') as f:
        f.write('\n'.join(out) + '\n')
    print('written', OUT, 'files:', len(entries))

if __name__ == '__main__':
    main()
