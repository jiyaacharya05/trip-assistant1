#!/usr/bin/env python3
"""Build the local photo manifest and credit data used by the site."""
import hashlib, json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/"assets"
credits=json.loads((ASSETS/"destination-photo-credits.json").read_text())
hash_by_file={name:data["sha256"] for name,data in credits.items()}
selected={city:{"holiday":[],"tour":[]} for city in sorted({d["city"] for d in credits.values()})}
used=set()

# Keep hand-curated destination sets that use direct Wikimedia Commons URLs
# (rather than local files). The current photo downloader only processes the
# title lists in index.html, so without this merge a rebuild would silently
# remove newer destinations such as Coorg, Ooty, Udaipur and London.
manifest=ASSETS/"destination-gallery-data.js"
existing={}
if manifest.exists():
    raw=manifest.read_text().strip()
    prefix="window.DESTINATION_GALLERY_DATA="
    if raw.startswith(prefix) and raw.endswith(";"):
        existing=json.loads(raw[len(prefix):-1])

HOLIDAY_CAPTIONS={
 "pune":["Shaniwar Wada","Shaniwar Wada","Sinhagad Fort","Shaniwar Wada Garden","Shaniwar Wada Fort"],
 "mumbai":["Gateway of India","Marine Drive","Elephanta Caves","Chhatrapati Shivaji Maharaj Terminus","Taj Mahal Palace"],
 "goa":["Fort Aguada","Palolem Beach","Anjuna Beach","Basilica of Bom Jesus","Fort Aguada"],
 "bengaluru":["Vidhana Soudha","Lalbagh Botanical Garden","Bangalore Palace","Cubbon Park","Vidhana Soudha"],
 "delhi":["Humayun's Tomb","Qutb Minar","Red Fort","India Gate","Qutb Minar"],
 "jaipur":["Hawa Mahal","Amer Fort","Jantar Mantar","Jal Mahal","Hawa Mahal"],
 "hyderabad":["Golconda Fort","Charminar","Chowmahalla Palace","Golconda Fort","Chowmahalla Palace"],
 "chennai":["Kapaleeshwarar Temple","Marina Beach","Marina Beach","Santhome Basilica","Kapaleeshwarar Temple"],
 "kolkata":["Howrah Bridge","Victoria Memorial","Dakshineswar Kali Temple","Victoria Memorial","Dakshineswar Kali Temple"],
 "ahmedabad":["Adalaj Stepwell","Sidi Saiyyed Mosque","Sabarmati Ashram","Kankaria Lake","Adalaj Stepwell"],
 "sydney":["Sydney Opera House and Harbour Bridge","Bondi Beach","Sydney Skyline","Circular Quay","Sydney Harbour"],
 "kerala":["Alleppey Backwaters","Munnar Tea Gardens","Kochi Backwaters","Munnar Tea Gardens","Alleppey Backwaters"],
}
TOUR_CAPTIONS={
 "pune":["Pataleshwar Cave Temple","Raja Dinkar Kelkar Museum","Sinhagad Fort","Aga Khan Palace"],
 "mumbai":["Elephanta Caves","Marine Drive","Gateway of India","Chhatrapati Shivaji Maharaj Terminus"],
 "goa":["Dudhsagar Falls","Basilica of Bom Jesus","Palolem Beach","Fort Aguada"],
 "bengaluru":["ISKCON Temple","Bangalore Palace","Lalbagh Botanical Garden","Vidhana Soudha"],
 "delhi":["Red Fort","Safdarjung Tomb","Qutb Minar","Humayun's Tomb"],
 "jaipur":["Jaipur City Palace","Jal Mahal","Jantar Mantar","Amber Fort"],
 "hyderabad":["Birla Mandir","Charminar","Chowmahalla Palace","Golconda Fort"],
 "chennai":["Chennai Lighthouse","Vivekananda House","Fort St. George","Santhome Church"],
 "kolkata":["Birla Planetarium","Marble Palace","Indian Museum","Dakshineswar Kali Temple"],
 "ahmedabad":["Sidi Saiyyed Mosque","Sabarmati Riverfront","Kankaria Lake","Ahmedabad Riverfront"],
 "sydney":["Bondi Beach","Sydney Opera House","Sydney from Taronga Zoo","Royal Botanic Gardens"],
 "kerala":["Alleppey Backwaters","Munnar Tea Gardens","Kochi Backwaters","Athirappilly Waterfall"],
 "kochi":["Chinese Fishing Nets","Mattancherry Palace","St. Francis Church","Kerala Folklore Museum","Hill Palace Museum","Paradesi Synagogue","Fort Kochi Beach","Marine Drive","Cherai Beach","Bolgatty Palace"],
}

# These original local destination photos fill the few Commons files that
# Commons temporarily rate-limited. Their image subjects were visually checked.
supplements={
  ("pune","holiday"):[("pune-06.jpg","Pune garden and heritage landscape")],
  ("chennai","holiday"):[("chennai-05.jpg","Chennai coast")],
  ("kolkata","holiday"):[("kolkata-01.jpg","Kolkata Durga Puja")],
  ("sydney","holiday"):[("sydney-05.jpg","Sydney beach scene"),("sydney-08.jpg","Sydney Harbour")],
  ("ahmedabad","tour"):[("ahmedabad-02.jpg","Ahmedabad old city street"),("ahmedabad-08.jpg","Ahmedabad stepwell interior")],
  ("hyderabad","tour"):[("hyderabad-04.jpg","Hyderabad temple landmark")],
  ("kerala","tour"):[("kerala-02.jpg","Kerala highland scenery"),("kerala-04.jpg","Kerala green landscape"),("kerala-06.jpg","Kerala backwater landscape")],
  ("kolkata","tour"):[("kolkata-06.jpg","Kolkata tram street")],
  ("sydney","tour"):[("sydney-06.jpg","Sydney Harbour Bridge")],
  ("kochi","tour"):[("kerala-03.jpg","Kochi traditional waterfront home")],
}

def entry(filename, meta=None, caption=None):
    if meta:
        return {"src":"assets/destination-galleries/"+filename,"caption":caption or meta["caption"],"source":meta["source_url"],"commons_file":meta["commons_file"]}
    return {"src":"assets/holiday-destinations/"+filename,"caption":caption or filename,"source":"","commons_file":""}

# Package images are selected first so the tourism collection can never reuse
# a holiday photo, even where two source titles point to the same file.
for filename,meta in credits.items():
    if meta["section"]!="holiday": continue
    digest=meta["sha256"]
    if digest in used: continue
    n=meta["slot"]-1
    caption=(HOLIDAY_CAPTIONS.get(meta["city"],[])[n] if n<len(HOLIDAY_CAPTIONS.get(meta["city"],[])) else meta["caption"])
    used.add(digest); selected[meta["city"]]["holiday"].append(entry(filename,meta,caption))
for (city,section),files in supplements.items():
    if section!="holiday": continue
    for filename,caption in files:
        path=ASSETS/"holiday-destinations"/filename
        if not path.exists(): continue
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in used: continue
        used.add(digest); selected[city][section].append(entry(filename,caption=caption))

for filename,meta in credits.items():
    if meta["section"]!="tour": continue
    digest=meta["sha256"]
    if digest in used: continue
    n=meta["slot"]-1
    caption=(TOUR_CAPTIONS.get(meta["city"],[])[n] if n<len(TOUR_CAPTIONS.get(meta["city"],[])) else meta["caption"])
    used.add(digest); selected[meta["city"]]["tour"].append(entry(filename,meta,caption))
for (city,section),files in supplements.items():
    if section!="tour": continue
    for filename,caption in files:
        path=ASSETS/"holiday-destinations"/filename
        if not path.exists(): continue
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in used: continue
        used.add(digest); selected[city][section].append(entry(filename,caption=caption))

# Preserve remote sets only for cities absent from the locally downloaded
# credits. This leaves generated local photo selections authoritative.
for city,sections in existing.items():
    if city not in selected:
        selected[city]=sections

manifest.write_text("window.DESTINATION_GALLERY_DATA="+json.dumps(selected,ensure_ascii=False,separators=(",",":"))+";\n")
print("gallery counts:")
for city,data in selected.items(): print(city,"holiday",len(data["holiday"]),"tour",len(data["tour"]))
print("selected unique photo files:",len(used))
