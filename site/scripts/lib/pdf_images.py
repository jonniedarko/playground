"""Extract image XObjects from the SHENZHEN I/O manual PDF as cropped PNGs.

Self-contained: parses the PDF and writes PNGs using only the Python standard
library, because this environment has no PyPI access. Merged from the two
throwaway scripts used to explore the manual so the extraction is reproducible.

    python3 pdf_images.py --pdf manual.pdf --out ../../assets/img/shenzhen
    python3 pdf_images.py --pdf manual.pdf --out DIR --only mc4000-pins,dx300-pins
    python3 pdf_images.py --pdf manual.pdf --list
"""
import argparse

import re, zlib, struct, sys, os

PDF = None
data = b''

# ---------- object index ----------
objs = {}
for m in re.finditer(rb'(?<![0-9])(\d+)\s+(\d+)\s+obj\b', data):
    num = int(m.group(1))
    start = m.end()
    e = data.find(b'endobj', start)
    if e == -1: e = len(data)
    objs[num] = (start, e)

def raw(num):
    if num not in objs: return b''
    s,e = objs[num]
    return data[s:e]

# ---------- tiny object parser ----------
class Ref:
    __slots__=('n',)
    def __init__(self,n): self.n=n
    def __repr__(self): return 'R%d'%self.n

WS = b'\x00\t\n\x0c\r '
DELIM = b'()<>[]{}/%'

def skip_ws(b,i):
    n=len(b)
    while i<n:
        c=b[i:i+1]
        if c in (b'%',):
            while i<n and b[i:i+1] not in (b'\n',b'\r'): i+=1
        elif c and c[0] in WS: i+=1
        else: break
    return i

def parse_obj(b,i):
    i = skip_ws(b,i)
    if i>=len(b): return None,i
    c = b[i:i+1]
    if c==b'<':
        if b[i+1:i+2]==b'<':
            d={}; i+=2
            while True:
                i=skip_ws(b,i)
                if b[i:i+2]==b'>>': return d,i+2
                if i>=len(b): return d,i
                if b[i:i+1]!=b'/':
                    # malformed; bail
                    o,i=parse_obj(b,i)
                    if o is None: return d,i
                    continue
                k,i=parse_name(b,i)
                v,i=parse_obj(b,i)
                d[k]=v
        else:
            j=b.find(b'>',i)
            hx=re.sub(rb'[^0-9A-Fa-f]',b'',b[i+1:j])
            if len(hx)%2: hx+=b'0'
            return bytes.fromhex(hx.decode()),j+1
    if c==b'/':
        return parse_name(b,i)
    if c==b'(':
        return parse_str(b,i)
    if c==b'[':
        arr=[]; i+=1
        while True:
            i=skip_ws(b,i)
            if b[i:i+1]==b']': return arr,i+1
            if i>=len(b): return arr,i
            o,ni=parse_obj(b,i)
            if ni==i: return arr,i+1
            arr.append(o); i=ni
    if c==b']' or c==b'>' or c==b'}' or c==b')':
        return None, i+1
    # keyword / number
    m=re.match(rb'(\d+)\s+(\d+)\s+R\b', b[i:i+40])
    if m: return Ref(int(m.group(1))), i+m.end()
    m=re.match(rb'[+-]?[\d.]+', b[i:])
    if m:
        t=m.group(0)
        try: v=float(t) if b'.' in t else int(t)
        except: v=0
        return v, i+m.end()
    m=re.match(rb'[A-Za-z*\'"]+', b[i:])
    if m: return ('KW',m.group(0).decode('latin-1')), i+m.end()
    return None,i+1

def parse_name(b,i):
    i+=1; out=b''
    n=len(b)
    while i<n:
        c=b[i:i+1]
        if c[0] in WS or c in [bytes([x]) for x in DELIM]: break
        if c==b'#' and i+2<n:
            try:
                out+=bytes.fromhex(b[i+1:i+3].decode()); i+=3; continue
            except: pass
        out+=c; i+=1
    return '/'+out.decode('latin-1'), i

def parse_str(b,i):
    i+=1; depth=1; out=bytearray()
    n=len(b)
    while i<n:
        c=b[i]
        ch=bytes([c])
        if ch==b'\\':
            i+=1
            if i>=n: break
            e=bytes([b[i]])
            mp={b'n':b'\n',b'r':b'\r',b't':b'\t',b'b':b'\b',b'f':b'\x0c',b'(':b'(',b')':b')',b'\\':b'\\'}
            if e in mp: out+=mp[e]; i+=1
            elif e.isdigit():
                o=b''
                for _ in range(3):
                    if i<n and bytes([b[i]]) in b'01234567' and bytes([b[i]]).isdigit():
                        o+=bytes([b[i]]); i+=1
                    else: break
                out+=bytes([int(o,8)&0xFF])
            elif e in (b'\n',): i+=1
            elif e in (b'\r',):
                i+=1
                if i<n and bytes([b[i]])==b'\n': i+=1
            else: out+=e; i+=1
            continue
        if ch==b'(': depth+=1
        elif ch==b')':
            depth-=1
            if depth==0: return bytes(out), i+1
        out+=ch; i+=1
    return bytes(out), i

_cache={}
def resolve(o):
    seen=0
    while isinstance(o,Ref):
        seen+=1
        if seen>32: return None
        n=o.n
        if n in _cache: o=_cache[n]; continue
        b=raw(n)
        v,_=parse_obj(b,0)
        _cache[n]=v
        o=v
    return o

def get_stream(num):
    b=raw(num)
    d,i=parse_obj(b,0)
    if not isinstance(d,dict): return b'',{}
    m=re.compile(rb'stream\r?\n?').search(b,i)
    if not m: return b'',d
    s=m.end()
    ln=resolve(d.get('/Length'))
    if isinstance(ln,(int,float)) and s+int(ln)<=len(b):
        payload=b[s:s+int(ln)]
    else:
        e=b.rfind(b'endstream')
        payload=b[s:e if e!=-1 else len(b)]
    f=resolve(d.get('/Filter'))
    filters=[f] if isinstance(f,str) else (f or [])
    for fl in filters:
        if fl=='/FlateDecode':
            try: payload=zlib.decompress(payload)
            except Exception:
                try: payload=zlib.decompressobj().decompress(payload)
                except Exception: pass
        elif fl=='/ASCIIHexDecode':
            hx=re.sub(rb'[^0-9A-Fa-f]',b'',payload.split(b'>')[0])
            if len(hx)%2: hx+=b'0'
            payload=bytes.fromhex(hx.decode())
    # predictor
    dp=resolve(d.get('/DecodeParms')) or resolve(d.get('/DP'))
    if isinstance(dp,list): dp=resolve(dp[0]) if dp else None
    if isinstance(dp,dict) and resolve(dp.get('/Predictor',1)) and int(resolve(dp.get('/Predictor',1)) or 1)>=10:
        cols=int(resolve(dp.get('/Columns',1)) or 1)
        colors=int(resolve(dp.get('/Colors',1)) or 1)
        bpc=int(resolve(dp.get('/BitsPerComponent',8)) or 8)
        bpp=max(1,(colors*bpc)//8)
        rowlen=(cols*colors*bpc+7)//8
        out=bytearray(); prev=bytearray(rowlen)
        p=0
        while p+1+rowlen<=len(payload):
            ft=payload[p]; row=bytearray(payload[p+1:p+1+rowlen]); p+=1+rowlen
            if ft==1:
                for k in range(bpp,rowlen): row[k]=(row[k]+row[k-bpp])&0xFF
            elif ft==2:
                for k in range(rowlen): row[k]=(row[k]+prev[k])&0xFF
            elif ft==3:
                for k in range(rowlen):
                    left=row[k-bpp] if k>=bpp else 0
                    row[k]=(row[k]+((left+prev[k])>>1))&0xFF
            elif ft==4:
                for k in range(rowlen):
                    a=row[k-bpp] if k>=bpp else 0
                    bb=prev[k]; cc=prev[k-bpp] if k>=bpp else 0
                    pp=a+bb-cc; pa=abs(pp-a); pb=abs(pp-bb); pc=abs(pp-cc)
                    pr=a if (pa<=pb and pa<=pc) else (bb if pb<=pc else cc)
                    row[k]=(row[k]+pr)&0xFF
            out+=row; prev=row
        payload=bytes(out)
    return payload,d

# ---------- ToUnicode CMap ----------
def parse_tounicode(stream):
    mp={}
    txt=stream
    for m in re.finditer(rb'beginbfchar(.*?)endbfchar', txt, re.S):
        body=m.group(1)
        toks=re.findall(rb'<([0-9A-Fa-f]+)>', body)
        for i in range(0,len(toks)-1,2):
            src=toks[i]; dst=toks[i+1]
            try:
                code=int(src,16)
                s=bytes.fromhex(dst.decode() if len(dst)%2==0 else dst.decode()+'0').decode('utf-16-be','ignore')
                mp[code]=s
            except Exception: pass
    for m in re.finditer(rb'beginbfrange(.*?)endbfrange', txt, re.S):
        body=m.group(1)
        for rm in re.finditer(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])', body, re.S):
            lo=int(rm.group(1),16); hi=int(rm.group(2),16); dst=rm.group(3)
            if dst.startswith(b'['):
                items=re.findall(rb'<([0-9A-Fa-f]+)>', dst)
                for k,it in enumerate(items):
                    try: mp[lo+k]=bytes.fromhex(it.decode()).decode('utf-16-be','ignore')
                    except Exception: pass
            else:
                h=dst.strip(b'<>')
                try:
                    base=bytes.fromhex(h.decode()).decode('utf-16-be','ignore')
                    if len(base)==1:
                        bo=ord(base)
                        for k in range(hi-lo+1):
                            if k>65535: break
                            mp[lo+k]=chr(bo+k)
                except Exception: pass
    return mp

STD_DIFF_CACHE={}
def font_widths(fd):
    W={}; dw=500.0
    st=resolve(fd.get('/Subtype'))
    if st=='/Type0':
        dfs=resolve(fd.get('/DescendantFonts')) or []
        df=resolve(dfs[0]) if dfs else None
        if isinstance(df,dict):
            dw=float(resolve(df.get('/DW')) or 1000)
            warr=resolve(df.get('/W')) or []
            k=0
            while k < len(warr):
                a=resolve(warr[k])
                if k+1<len(warr) and isinstance(resolve(warr[k+1]),list):
                    lst=resolve(warr[k+1])
                    for j,w in enumerate(lst):
                        try: W[int(a)+j]=float(resolve(w))
                        except: pass
                    k+=2
                elif k+2<len(warr):
                    b=resolve(warr[k+1]); w=resolve(warr[k+2])
                    try:
                        for c in range(int(a),min(int(b),int(a)+65535)+1): W[c]=float(w)
                    except: pass
                    k+=3
                else: break
    else:
        fc=resolve(fd.get('/FirstChar'))
        ws=resolve(fd.get('/Widths')) or []
        if isinstance(fc,(int,float)):
            for j,w in enumerate(ws):
                wv=resolve(w)
                if isinstance(wv,(int,float)): W[int(fc)+j]=float(wv)
        dw=500.0
        fdsc=resolve(fd.get('/FontDescriptor'))
        if isinstance(fdsc,dict):
            mw=resolve(fdsc.get('/MissingWidth'))
            if isinstance(mw,(int,float)): dw=float(mw)
    return W,dw

def font_info(fref):
    fd=resolve(fref)
    if not isinstance(fd,dict): return {'map':{},'bytes':1,'W':{},'dw':500.0}
    info={'map':{},'bytes':1}
    try: info['W'],info['dw']=font_widths(fd)
    except Exception: info['W'],info['dw']={},500.0
    st=resolve(fd.get('/Subtype'))
    if st=='/Type0': info['bytes']=2
    tu=fd.get('/ToUnicode')
    if isinstance(tu,Ref):
        s,_=get_stream(tu.n)
        info['map']=parse_tounicode(s)
        if info['map'] and max(info['map'].keys() or [0])>255: info['bytes']=2
    # Encoding differences fallback
    enc=resolve(fd.get('/Encoding'))
    if isinstance(enc,dict) and '/Differences' in enc and not info['map']:
        diffs=resolve(enc.get('/Differences')) or []
        cur=0; m={}
        for it in diffs:
            if isinstance(it,(int,float)): cur=int(it)
            elif isinstance(it,str) and it.startswith('/'):
                nm=it[1:]
                ch=GLYPH.get(nm)
                if ch is None:
                    g=re.match(r'^uni([0-9A-Fa-f]{4})$',nm)
                    if g: ch=chr(int(g.group(1),16))
                if ch: m[cur]=ch
                cur+=1
        info['map']=m
    return info

GLYPH={'space':' ','exclam':'!','quotedbl':'"','numbersign':'#','dollar':'$','percent':'%','ampersand':'&','quotesingle':"'",'parenleft':'(','parenright':')','asterisk':'*','plus':'+','comma':',','hyphen':'-','period':'.','slash':'/','zero':'0','one':'1','two':'2','three':'3','four':'4','five':'5','six':'6','seven':'7','eight':'8','nine':'9','colon':':','semicolon':';','less':'<','equal':'=','greater':'>','question':'?','at':'@','bracketleft':'[','backslash':'\\','bracketright':']','asciicircum':'^','underscore':'_','grave':'`','braceleft':'{','bar':'|','braceright':'}','asciitilde':'~','quoteright':'\u2019','quoteleft':'\u2018','quotedblleft':'\u201c','quotedblright':'\u201d','endash':'\u2013','emdash':'\u2014','bullet':'\u2022','fi':'fi','fl':'fl'}
for c in range(65,91): GLYPH[chr(c)]=chr(c)
for c in range(97,123): GLYPH[chr(c)]=chr(c)

# ---------- pages ----------
def collect_pages():
    pages=[]
    seen=set()
    # find catalog->pages, else scan
    for num in sorted(objs):
        b=raw(num)
        if b'/Type' in b and b'/Page' in b:
            d,_=parse_obj(b,0)
            if isinstance(d,dict) and resolve(d.get('/Type'))=='/Page':
                pages.append((num,d))
    return pages

def decode_text(bs, fi):
    mp=fi['map']; nb=fi['bytes']
    W=fi.get('W',{}); dw=fi.get('dw',500.0)
    out=[]; wsum=0.0
    if nb==2:
        for i in range(0,len(bs)-1,2):
            code=(bs[i]<<8)|bs[i+1]
            out.append(mp.get(code, ''))
            wsum+=W.get(code,dw)
    else:
        for ch in bs:
            out.append(mp.get(ch, chr(ch) if 32<=ch<127 else ''))
            wsum+=W.get(ch,dw)
    return ''.join(out), wsum/1000.0

def extract_page(num,d):
    res=resolve(d.get('/Resources')) or {}
    fonts=resolve(res.get('/Font')) or {}
    fmap={}
    for k,v in (fonts.items() if isinstance(fonts,dict) else []):
        fmap[k]=font_info(v)
    cont=d.get('/Contents')
    streams=b''
    cl=resolve(cont)
    refs=[]
    if isinstance(cont,Ref):
        if isinstance(cl,list): refs=[r for r in cl if isinstance(r,Ref)]
        else: refs=[cont]
    elif isinstance(cont,list):
        refs=[r for r in cont if isinstance(r,Ref)]
    for r in refs:
        s,_=get_stream(r.n)
        streams+=s+b'\n'
    return render(streams,fmap)

def joinline(buf):
    items=sorted(buf, key=lambda z:(z[0],z[1]))
    res=''
    prev_end=None; prev_fs=10
    for x,sq,t,adv,fs in items:
        if res and prev_end is not None:
            gap=x-prev_end
            if gap > 0.13*max(fs,prev_fs) and not res.endswith(' ') and not t.startswith(' '):
                res+=' '
        res+=t
        prev_end=x+adv; prev_fs=fs
    return res

def render(cs,fmap):
    i=0; n=len(cs)
    stack=[]
    cur=None
    lines=[]   # (y, x, seq, text)
    seq=[0]
    tm=[1,0,0,1,0,0]; tlm=tm[:]
    curfont={'map':{},'bytes':1,'W':{},'dw':500.0}
    fsize=1.0
    frag=[]
    def flush():
        pass
    while i<n:
        i=skip_ws(cs,i)
        if i>=n: break
        c=cs[i:i+1]
        if c in (b'(',b'<',b'[',b'/') or (c.isdigit() or c in (b'-',b'+',b'.')):
            o,ni=parse_obj(cs,i)
            if ni<=i: i+=1; continue
            stack.append(o); i=ni; continue
        m=re.match(rb"[A-Za-z'\"*0-9]+", cs[i:])
        if not m:
            i+=1; continue
        op=m.group(0).decode('latin-1'); i+=m.end()
        if op=='BT':
            tm=[1,0,0,1,0,0]; tlm=tm[:]
        elif op=='Tf':
            if len(stack)>=2:
                fn=stack[-2]
                try: fsize=float(stack[-1])
                except: fsize=1.0
                if isinstance(fn,str): curfont=fmap.get(fn,{'map':{},'bytes':1,'W':{},'dw':500.0})
        elif op=='Td':
            if len(stack)>=2:
                try:
                    tx=float(stack[-2]); ty=float(stack[-1])
                    tlm=[tlm[0],tlm[1],tlm[2],tlm[3], tlm[0]*tx+tlm[2]*ty+tlm[4], tlm[1]*tx+tlm[3]*ty+tlm[5]]
                    tm=tlm[:]
                except: pass
        elif op=='TD':
            if len(stack)>=2:
                try:
                    tx=float(stack[-2]); ty=float(stack[-1])
                    tlm=[tlm[0],tlm[1],tlm[2],tlm[3], tlm[0]*tx+tlm[2]*ty+tlm[4], tlm[1]*tx+tlm[3]*ty+tlm[5]]
                    tm=tlm[:]
                except: pass
        elif op=='Tm':
            if len(stack)>=6:
                try:
                    tlm=[float(x) for x in stack[-6:]]; tm=tlm[:]
                except: pass
        elif op in ('T*',):
            tlm=[tlm[0],tlm[1],tlm[2],tlm[3], tlm[2]*0+tlm[4], -12*tlm[3]+tlm[5]]
            tm=tlm[:]
        elif op in ('Tj','TJ',"'",'"'):
            if op in ("'",'"'):
                tlm=[tlm[0],tlm[1],tlm[2],tlm[3], tlm[4], -12*tlm[3]+tlm[5]]
                tm=tlm[:]
            arg=stack[-1] if stack else b''
            txt=''; wid=0.0
            if isinstance(arg,bytes):
                txt,wid=decode_text(arg,curfont)
            elif isinstance(arg,list):
                parts=[]
                for el in arg:
                    if isinstance(el,bytes):
                        t2,w2=decode_text(el,curfont); parts.append(t2); wid+=w2
                    elif isinstance(el,(int,float)):
                        wid-=float(el)/1000.0
                        if el<-190: parts.append(' ')
                txt=''.join(parts)
            if txt:
                txt=txt.replace('\t',' ')
                seq[0]+=1
                sc=abs(tm[0]) or 1.0
                adv=wid*fsize*sc if wid>0 else len(txt)*fsize*sc*0.48
                lines.append((round(tm[5],1), round(tm[4],1), seq[0], txt, adv, fsize*sc))
        elif op=='ET':
            pass
        if op not in ('BI','ID'):
            stack=[]
        if op=='BI':
            j=cs.find(b'EI',i)
            i=j+2 if j!=-1 else n
            stack=[]
    # assemble by y desc
    lines=[l for l in lines if l[3]]
    lines.sort(key=lambda t:(-t[0], t[1], t[2]))
    out=[]; last_y=None; buf=[]
    for y,x,sq,t,adv,fs in lines:
        if last_y is None or abs(y-last_y)<3.0:
            buf.append((x,sq,t,adv,fs))
        else:
            out.append(joinline(buf))
            buf=[(x,sq,t,adv,fs)]
        last_y=y
    if buf: out.append(joinline(buf))
    out=[re.sub(r'[ ]{2,}',' ',o).rstrip() for o in out]
    return '\n'.join(o for o in out if o.strip())






def unpack_bits(data, width, height, bpc):
    """Expand a packed 1/2/4/8-bit image into one byte per sample."""
    if bpc == 8:
        return data
    per_row = (width * bpc + 7) // 8
    out = bytearray()
    mask = (1 << bpc) - 1
    for row in range(height):
        chunk = data[row * per_row:(row + 1) * per_row]
        vals = []
        for byte in chunk:
            for shift in range(8 - bpc, -1, -bpc):
                vals.append((byte >> shift) & mask)
        out += bytes(vals[:width])
    return bytes(out)


def to_rgb(obj_num):
    payload, d = get_stream(obj_num)
    width = int(resolve(d.get('/Width')))
    height = int(resolve(d.get('/Height')))
    bpc = int(resolve(d.get('/BitsPerComponent')) or 8)
    cs = resolve(d.get('/ColorSpace'))

    if isinstance(cs, list) and resolve(cs[0]) == '/Indexed':
        lookup = cs[3]
        if hasattr(lookup, 'n'):
            lookup, _ = get_stream(lookup.n)
        if not isinstance(lookup, (bytes, bytearray)):
            return None
        samples = unpack_bits(payload, width, height, bpc)
        rgb = bytearray(width * height * 3)
        for i, idx in enumerate(samples[:width * height]):
            off = idx * 3
            rgb[i * 3:i * 3 + 3] = lookup[off:off + 3] if off + 3 <= len(lookup) else b'\xff\xff\xff'
        return width, height, bytes(rgb)

    if cs == '/DeviceRGB' and bpc == 8:
        return width, height, payload[:width * height * 3]

    if cs == '/DeviceGray':
        samples = unpack_bits(payload, width, height, bpc)
        scale = 255 // ((1 << bpc) - 1)
        rgb = bytearray()
        for v in samples[:width * height]:
            rgb += bytes([v * scale]) * 3
        return width, height, bytes(rgb)

    return None


def crop_white(width, height, rgb, pad=8):
    """Trim uniform near-white margins so the diagram fills the frame."""
    def row_blank(y):
        base = y * width * 3
        return all(rgb[base + x] > 245 for x in range(0, width * 3, 3))

    def col_blank(x):
        return all(rgb[(y * width + x) * 3] > 245 for y in range(height))

    top = 0
    while top < height - 1 and row_blank(top):
        top += 1
    bottom = height - 1
    while bottom > top and row_blank(bottom):
        bottom -= 1
    left = 0
    while left < width - 1 and col_blank(left):
        left += 1
    right = width - 1
    while right > left and col_blank(right):
        right -= 1

    top = max(0, top - pad)
    left = max(0, left - pad)
    bottom = min(height - 1, bottom + pad)
    right = min(width - 1, right + pad)

    nw = right - left + 1
    nh = bottom - top + 1
    if nw == width and nh == height:
        return width, height, rgb
    out = bytearray()
    for y in range(top, bottom + 1):
        base = (y * width + left) * 3
        out += rgb[base:base + nw * 3]
    return nw, nh, bytes(out)


def write_png(path, width, height, rgb):
    raw_rows = bytearray()
    stride = width * 3
    for y in range(height):
        raw_rows.append(0)
        raw_rows += rgb[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw_rows), 9))
    png += chunk(b'IEND', b'')
    open(path, 'wb').write(png)



WANTED = {
    10: {'/Im1': 'an393-program'},
    11: {'/Im1': 'an650-program', '/Im0': 'an650-circuit'},
    18: {'/Im0': 'mc4000-pins'},
    19: {'/Im0': 'mc6000-pins'},
    20: {'/Im0': 'dx300-pins'},
    21: {'/Im1': 'dx300-stepper-program', '/Im0': 'dx300-stepper-circuit'},
    22: {'/Im1': 'ram-100p14-program', '/Im0': 'ram-100p14-circuit'},
    23: {'/Im1': 'rom-200p14-program', '/Im0': 'rom-200p14-circuit'},
    24: {'/Im0': 'lc70g-pins', '/Im1': 'lc70g-pins-inverter'},
    25: {'/Im0': 'dt2415-pins'},
    26: {'/Im0': 'rf901-pins'},
    27: {'/Im0': 'fmblaster-pins'},
    29: {'/Im0': 'mc4010-pins'},
    30: {'/Im0': 'd80c010-pins'},
    32: {'/Im0': 'pga33x6-diagram'},
    33: {'/Im0': 'nlp2-pins'},
    35: {'/Im0': 'harmonic-maximizer'},
    42: {'/Im0': 'elegant-bachelor'},
    44: {'/Im0': 'sushirobo-floorplan'},
    45: {'/Im0': 'lux-lcd-template'},
    # Page 46 (neural lattice) and pages 41/43 (iNK colour space, sector map)
    # are vector artwork with no image XObject - nothing to extract.
}



def load_pdf(path):
    """Point the module at a PDF and (re)build the indirect-object index."""
    global PDF, data, objs, _cache
    PDF = path
    data = open(path, 'rb').read()
    objs = {}
    _cache = {}
    for m in re.finditer(rb'(?<![0-9])(\d+)\s+(\d+)\s+obj\b', data):
        start = m.end()
        end = data.find(b'endobj', start)
        objs[int(m.group(1))] = (start, end if end != -1 else len(data))
    return len(objs)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--pdf', required=True, help='source manual PDF')
    ap.add_argument('--out', help='directory to write PNGs into')
    ap.add_argument('--only', help='comma-separated subset of figure names')
    ap.add_argument('--list', action='store_true', help='list figure names and exit')
    args = ap.parse_args()

    if args.list:
        for page in sorted(WANTED):
            for name in WANTED[page].values():
                print('%-26s page %d' % (name, page))
        return 0
    if not args.out:
        ap.error('--out is required unless --list is given')

    wanted = None
    if args.only:
        wanted = {n.strip() for n in args.only.split(',') if n.strip()}
        known = {n for m in WANTED.values() for n in m.values()}
        unknown = wanted - known
        if unknown:
            ap.error('unknown figure name(s): ' + ', '.join(sorted(unknown)))

    load_pdf(args.pdf)
    pages = collect_pages()
    os.makedirs(args.out, exist_ok=True)

    written = 0
    for page_no, mapping in sorted(WANTED.items()):
        if page_no > len(pages):
            continue
        num, d = pages[page_no - 1]
        res = resolve(d.get('/Resources')) or {}
        xo = resolve(res.get('/XObject')) or {}
        for key, name in mapping.items():
            if wanted is not None and name not in wanted:
                continue
            ref = xo.get(key)
            if ref is None or not hasattr(ref, 'n'):
                print('missing   %s (page %d %s)' % (name, page_no, key), file=sys.stderr)
                continue
            try:
                got = to_rgb(ref.n)
            except Exception as exc:
                print('error     %s: %s' % (name, exc), file=sys.stderr)
                continue
            if not got:
                print('unsupported %s (page %d %s)' % (name, page_no, key), file=sys.stderr)
                continue
            w, h, rgb = got
            w, h, rgb = crop_white(w, h, rgb)
            dest = os.path.join(args.out, name + '.png')
            write_png(dest, w, h, rgb)
            written += 1
            print('%-26s %5dx%-5d %8d bytes' % (name, w, h, os.path.getsize(dest)))

    print('wrote %d image(s) to %s' % (written, args.out))
    return 0


if __name__ == '__main__':
    sys.exit(main())
