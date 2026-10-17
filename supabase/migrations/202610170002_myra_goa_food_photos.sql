-- Add distinct, Goa-relevant food suggestions with Commons photos and credits.
-- The itinerary planner uses each catalogue food only once per plan.
insert into public.catalogue_places
  (city,name,kind,area,lat,lng,offbeat,interests,wiki_title,typical_cost_inr,photo_url,photo_credit)
values
  ('Goa','Chicken Cafreal','food','Panaji',15.4909,73.8278,false,array['food','culture']::text[],'Chicken_Cafreal',350,
   'https://commons.wikimedia.org/wiki/Special:FilePath/Chicken_Cafreal-panji-goa-003.jpg?width=640',
   'Abhijeet Chandankhede · Chicken Cafreal · CC BY-SA 4.0'),
  ('Goa','Ros Omelette with Poi','food','Panaji',15.4909,73.8278,false,array['food','culture']::text[],'Ros_omelette',160,
   'https://commons.wikimedia.org/wiki/Special:FilePath/Goan_Poi_with_Ros_Omelette.jpg?width=640',
   'Blazing Fiery · Goan Poi with Ros Omelette · CC0 1.0'),
  ('Goa','Chicken Xacuti','food','Panaji',15.4909,73.8278,false,array['food','culture']::text[],'Chicken_Xacuti',380,
   'https://commons.wikimedia.org/wiki/Special:FilePath/Chicken_Xacuti.jpg?width=640',
   'Ramakrishna Reddy Yekulla · Chicken Xacuti · CC BY-SA 2.0')
on conflict(city,name,kind) do update set
  area=excluded.area,lat=excluded.lat,lng=excluded.lng,offbeat=excluded.offbeat,
  interests=excluded.interests,wiki_title=excluded.wiki_title,
  typical_cost_inr=excluded.typical_cost_inr,photo_url=excluded.photo_url,
  photo_credit=excluded.photo_credit;

update public.catalogue_places set
  photo_url='https://commons.wikimedia.org/wiki/Special:FilePath/Fish_curry_rice%2C_Goa.jpg?width=640',
  photo_credit='Praveen · Fish curry rice, Goa · CC BY 2.0'
where city='Goa' and name='Goan fish curry rice' and kind='food';

update public.catalogue_places set
  photo_url='https://commons.wikimedia.org/wiki/Special:FilePath/Bebinca%2C_a_delicacy_and_sweet_from_Goa.jpg?width=640',
  photo_credit='Fredericknoronha · Bebinca · CC BY-SA 4.0'
where city='Goa' and name='Bebinca' and kind='food';

update public.catalogue_places set
  photo_url='https://commons.wikimedia.org/wiki/Special:FilePath/Goan_prawn_curry.jpg?width=640',
  photo_credit='Schellack · Goan prawn curry · CC BY 3.0'
where city='Goa' and name='Prawn balchão' and kind='food';

update public.catalogue_places set
  photo_url='https://commons.wikimedia.org/wiki/Special:FilePath/Goan_Poee.jpg?width=640',
  photo_credit='Karthik Rangappa · Goan Poee · CC BY 2.0'
where city='Goa' and name='Poi bread snack' and kind='food';
