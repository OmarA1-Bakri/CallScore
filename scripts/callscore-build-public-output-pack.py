#!/usr/bin/env python3
import argparse, base64, hashlib, json, os, re, shutil, zipfile
from pathlib import Path
from datetime import datetime, timezone

IMAGE_EXTS = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}
TEXT_EXTS = {'.txt', '.md'}

def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def norm_text(text: str) -> str:
    lines = [ln for ln in text.replace('\r\n','\n').split('\n') if not ln.startswith('SOURCE:')]
    return '\n'.join(lines).strip()

def copy_unique(src: Path, dst_dir: Path, name_hint: str, suffix: str, data: bytes, seen: dict, source_map: list, field='file'):
    h = sha_bytes(data)
    if h not in seen:
        dst = dst_dir / f"{name_hint}-{h[:12]}{suffix}"
        dst.write_bytes(data)
        seen[h] = dst
    else:
        dst = seen[h]
    source_map.append({'canonical_artifact_path': str(dst), 'source_path': str(src), 'source_field': field, 'sha256': h})
    return h, dst

def iter_files(paths):
    for root in paths:
        p = Path(root)
        if not p.exists():
            continue
        if p.is_file():
            yield p
        else:
            for f in p.rglob('*'):
                if f.is_file():
                    yield f

def maybe_extract_json_assets(path: Path, out: Path, img_seen, text_seen, source_map):
    try:
        data = json.loads(path.read_text(errors='replace'))
    except Exception:
        return False
    (out / 'json').mkdir(exist_ok=True)
    json_dst = out / 'json' / re.sub(r'[^A-Za-z0-9_.-]+','_', path.name)
    json_dst.write_text(json.dumps(data, indent=2, sort_keys=True)+'\n')
    source_map.append({'canonical_artifact_path': str(json_dst), 'source_path': str(path), 'source_field': 'json', 'sha256': sha_bytes(json_dst.read_bytes())})
    for field in ['exact_copy','text','commentary','body']:
        def walk(x, prefix=''):
            if isinstance(x, dict):
                for k,v in x.items():
                    if k == field and isinstance(v, str) and v.strip():
                        b = norm_text(v).encode()
                        copy_unique(path, out/'unique_text', f'{path.stem}-{field}', '.txt', b, text_seen, source_map, field=prefix+k)
                    else:
                        walk(v, prefix+k+'.')
            elif isinstance(x, list):
                for i,v in enumerate(x): walk(v, prefix+str(i)+'.')
        walk(data)
    def walk_img(x, prefix=''):
        if isinstance(x, dict):
            for k,v in x.items():
                lk=k.lower()
                if isinstance(v, str) and v.strip():
                    if lk.endswith('b64') or 'base64' in lk:
                        try:
                            raw=base64.b64decode(v.split(',')[-1], validate=False)
                            if raw.startswith(b'\x89PNG'):
                                copy_unique(path, out/'unique_images', f'{path.stem}-{k}', '.png', raw, img_seen, source_map, field=prefix+k)
                        except Exception: pass
                    elif (lk.endswith('path') or lk in {'path','local_png_path','png_b64_path'}) and Path(v).exists():
                        p=Path(v)
                        if p.suffix.lower() in IMAGE_EXTS:
                            copy_unique(p, out/'unique_images', p.stem, p.suffix.lower(), p.read_bytes(), img_seen, source_map, field=prefix+k)
                else:
                    walk_img(v, prefix+k+'.')
        elif isinstance(x, list):
            for i,v in enumerate(x): walk_img(v, prefix+str(i)+'.')
    walk_img(data)
    return True

def build_pack(inputs, out_dir: Path, zip_path: Path | None):
    out_dir.mkdir(parents=True, exist_ok=True)
    for sub in ['unique_text','unique_images','json','receipts']:
        (out_dir/sub).mkdir(exist_ok=True)
    img_seen, text_seen, source_map = {}, {}, []
    for f in iter_files(inputs):
        ext=f.suffix.lower()
        if ext in TEXT_EXTS:
            b=norm_text(f.read_text(errors='replace')).encode()
            if b.strip(): copy_unique(f, out_dir/'unique_text', f.stem, ext, b, text_seen, source_map)
        elif ext in IMAGE_EXTS:
            copy_unique(f, out_dir/'unique_images', f.stem, ext, f.read_bytes(), img_seen, source_map)
        elif ext == '.json':
            ok=maybe_extract_json_assets(f, out_dir, img_seen, text_seen, source_map)
            if 'receipt' in f.name or 'receipt' in str(f.parent):
                try: shutil.copy2(f, out_dir/'receipts'/f.name)
                except shutil.SameFileError: pass
    source_map_path=out_dir/'source-map.json'
    source_map_path.write_text(json.dumps(source_map, indent=2, sort_keys=True)+'\n')
    index=out_dir/'INDEX.md'
    index.write_text('\n'.join([
        '# CallScore Public Outputs',
        f'created_at: {datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}',
        f'unique_text: {len(text_seen)}',
        f'unique_images: {len(img_seen)}',
        f'source_mappings: {len(source_map)}',
        '',
        'See source-map.json for source path -> canonical artifact mapping.',
    ])+'\n')
    if zip_path:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
            for f in out_dir.rglob('*'):
                if f.is_file(): z.write(f, f.relative_to(out_dir))
    return {'out_dir': str(out_dir), 'zip_path': str(zip_path) if zip_path else None, 'unique_text': len(text_seen), 'unique_images': len(img_seen), 'source_mappings': len(source_map)}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--input', action='append', required=True)
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--zip')
    args=ap.parse_args()
    print(json.dumps(build_pack(args.input, Path(args.out_dir), Path(args.zip) if args.zip else None), indent=2))
if __name__ == '__main__':
    main()
