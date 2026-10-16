-- Ground Myra stop photos and add a specific, nearby offbeat Madikeri stop.
alter table public.catalogue_places
  add column if not exists photo_url text,
  add column if not exists photo_credit text;

insert into public.catalogue_places
  (city,name,kind,area,lat,lng,offbeat,interests,wiki_title,typical_cost_inr)
values
  ('Coorg','Raja’s Tomb (Gaddige)','sight','Madikeri',12.4295,75.7337,true,array['history','architecture','culture']::text[],'Gaddige_Raja''s_Tomb',0)
on conflict(city,name,kind) do update set
  area=excluded.area,lat=excluded.lat,lng=excluded.lng,offbeat=excluded.offbeat,
  interests=excluded.interests,wiki_title=excluded.wiki_title,
  typical_cost_inr=excluded.typical_cost_inr;

-- These Commons files depict the exact Kodava/Karnataka dishes listed. If a
-- browser cannot fetch a photo, Myra displays a labelled placeholder instead.
update public.catalogue_places set
  photo_url='https://commons.wikimedia.org/wiki/Special:FilePath/Pandi_Curry.jpg?width=640',
  photo_credit='Rupak76 · Pandi Curry.jpg · CC BY-SA 4.0'
where city='Coorg' and name='Pandi curry' and kind='food';

update public.catalogue_places set
  photo_url='https://commons.wikimedia.org/wiki/Special:FilePath/Akki_Roti_-_A2B_-_Karnataka_-_Kae003.jpg?width=640',
  photo_credit='KaedeNaga · Akki Roti · CC BY-SA 4.0'
where city='Coorg' and name='Akki rotti' and kind='food';

update public.catalogue_places set
  name='Kadubu of Coorg',
  wiki_title='Kadubu_of_Coorg',
  interests=array['food','culture']::text[],
  photo_url='https://commons.wikimedia.org/wiki/Special:FilePath/Kadubu_of_Coorg.jpg?width=640',
  photo_credit='Abhishek Chintamani · Kadubu of Coorg · CC BY-SA 4.0'
where city='Coorg' and name='Bamboo shoot curry' and kind='food';

update public.catalogue_places set
  photo_url='https://commons.wikimedia.org/wiki/Special:FilePath/South_Indian_Filter_Coffee.jpg?width=640',
  photo_credit='Celestial Pari · South Indian Filter Coffee · CC BY-SA 4.0'
where city='Coorg' and name='Coorg coffee tasting' and kind='food';
