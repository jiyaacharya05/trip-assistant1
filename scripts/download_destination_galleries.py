#!/usr/bin/env python3
"""Download the page's named Commons destination photos as local assets."""
from __future__ import annotations
import concurrent.futures, hashlib, json, re, subprocess, time, urllib.parse, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/"index.html").read_text()
OUT=ROOT/"assets"/"destination-galleries"
HEADERS={"User-Agent":"TripAssistantPhotoCurator/1.0 (educational travel demo)"}

def js_object(name, stop):
    pattern=rf"const {name}=(\{{.*?\}});\s*{stop}"
    match=re.search(pattern, HTML, re.S)
    if not match: raise SystemExit(f"Could not find {name} in index.html")
    script="const value="+match.group(1)+";process.stdout.write(JSON.stringify(value));"
    return json.loads(subprocess.check_output(["node","-e",script],text=True))

holidays=js_object("holidayPhotoTitles",r"const holidayPhotoUrl")
tours=js_object("tourAttractionTitles",r"const tourPhotos")

def get_file(title):
    encoded=urllib.parse.quote(title.replace(" ","_"),safe="()_,.-")
    page_url=f"https://commons.wikimedia.org/wiki/File:{encoded}"
    request=urllib.request.Request(page_url,headers=HEADERS)
    with urllib.request.urlopen(request,timeout=45) as response:
        html=response.read().decode("utf-8","replace")
    match=re.search(r'<meta property="og:image" content="([^"]+)"',html)
    if not match: raise RuntimeError("Commons file page has no image preview")
    image_url=match.group(1).replace("&amp;","&")
    request=urllib.request.Request(image_url,headers=HEADERS)
    with urllib.request.urlopen(request,timeout=45) as response:
        return response.read(),response.headers.get("Content-Type",""),page_url

def image_ext(data, content_type):
    if data.startswith(b"\xff\xd8\xff"): return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"): return ".png"
    if data.startswith(b"RIFF") and data[8:12]==b"WEBP": return ".webp"
    if "jpeg" in content_type: return ".jpg"
    if "png" in content_type: return ".png"
    return None

def fetch_one(item):
    city,category,index,title=item
    for attempt in range(4):
        try:
            data,ctype,final_url=get_file(title)
            ext=image_ext(data,ctype)
            if ext and len(data)>12000: return item,data,ext,final_url,None
            return item,None,None,final_url,"Response was not a usable image"
        except Exception as e:
            if attempt==3: return item,None,None,"",str(e)
            time.sleep(2*(attempt+1))
    return item,None,None,"","download failed"

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    jobs=[]
    for city,files in holidays.items():
        jobs += [(city,"holiday",n+1,title) for n,title in enumerate(files)]
    for city,files in tours.items():
        jobs += [(city,"tour",n+1,title) for n,title in enumerate(files)]
    unique_titles=list(dict.fromkeys(job[3] for job in jobs))
    title_jobs={title:next(job for job in jobs if job[3]==title) for title in unique_titles}
    results={}
    # Commons file pages throttle bursty requests, so keep image fetches serial.
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        futures=[pool.submit(fetch_one,title_jobs[t]) for t in unique_titles]
        for future in concurrent.futures.as_completed(futures):
            item,data,ext,url,error=future.result()
            title=item[3]
            results[title]=(data,ext,url,error)
            print(("OK   " if data else "MISS ")+title+(f" ({len(data)//1024} KB)" if data else f" :: {error}"),flush=True)

    metadata={};hashes={};missing=[]
    for city,category,index,title in jobs:
        data,ext,url,error=results[title]
        if not data:
            missing.append({"city":city,"category":category,"index":index,"commons_file":title,"error":error})
            continue
        digest=hashlib.sha256(data).hexdigest()
        filename=f"{city}-{category}-{index:02d}{ext}"
        (OUT/filename).write_bytes(data)
        metadata[filename]={"city":city,"section":category,"slot":index,"caption":re.sub(r"\.[^.]+$","",title),
            "commons_file":title,"source_url":f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(title.replace(' ','_'),safe='()_,.-')} ".strip(),
            "download_url":url,"sha256":digest,"bytes":len(data)}
        hashes.setdefault(digest,[]).append(filename)
    (ROOT/"assets"/"destination-photo-credits.json").write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+"\n")
    (ROOT/"assets"/"destination-photo-missing.json").write_text(json.dumps(missing,indent=2,ensure_ascii=False)+"\n")
    duplicates=[names for names in hashes.values() if len(names)>1]
    print(f"SAVED {len(metadata)} of {len(jobs)} referenced slots; exact duplicate image groups: {len(duplicates)}; missing: {len(missing)}")
    if duplicates: print("DUPLICATES",json.dumps(duplicates,ensure_ascii=False))

if __name__=="__main__": main()
