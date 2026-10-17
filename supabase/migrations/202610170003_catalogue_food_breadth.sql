-- Add distinct local food entries so a week itinerary can offer one meal stop
-- per day without recycling a catalogue item. Myra loads each matching food
-- photo from the corresponding Wikipedia article and shows a placeholder if
-- that article has no thumbnail.
insert into public.catalogue_places
  (city,name,kind,area,lat,lng,offbeat,interests,wiki_title,typical_cost_inr)
values
  ('Ahmedabad','Khandvi','food','Law Garden',23.0227,72.5562,false,array['food']::text[],'Khandvi',120),
  ('Ahmedabad','Thepla','food','Navrangpura',23.036,72.561,false,array['food']::text[],'Thepla',100),
  ('Ahmedabad','Gujarati kadhi','food','Old City',23.0255,72.5871,false,array['food','culture']::text[],'Kadhi',180),
  ('Bengaluru','Benne dosa','food','Basavanagudi',12.9434,77.568,false,array['food']::text[],'Dosa',180),
  ('Bengaluru','Mysore pak','food','Malleswaram',13.0031,77.57,false,array['food']::text[],'Mysore_pak',120),
  ('Bengaluru','Holige','food','Jayanagar',12.925,77.5838,false,array['food']::text[],'Puran_poli',100),
  ('Chennai','Ven pongal','food','Mylapore',13.0337,80.2696,false,array['food']::text[],'Pongal_(dish)',140),
  ('Chennai','Masala dosa','food','T Nagar',13.0418,80.2341,false,array['food']::text[],'Masala_dosa',180),
  ('Chennai','Murukku','food','Besant Nagar',12.9997,80.2712,false,array['food']::text[],'Murukku',90),
  ('Coorg','Nool puttu','food','Madikeri',12.4244,75.7382,false,array['food','culture']::text[],'String_hoppers',180),
  ('Coorg','Bamboo shoot curry','food','Kushalnagar',12.463,75.967,false,array['food','culture']::text[],'Bamboo_shoots',260),
  ('Coorg','Kadambuttu rice dumplings','food','Madikeri',12.4244,75.7382,false,array['food','culture']::text[],'Kadambuttu',180),
  ('Delhi','Aloo tikki','food','Connaught Place',28.6315,77.2167,false,array['food']::text[],'Aloo_tikki',120),
  ('Delhi','Rajma chawal','food','Karol Bagh',28.6514,77.1907,false,array['food']::text[],'Rajma',180),
  ('Delhi','Chole kulche','food','Chandni Chowk',28.6506,77.2303,false,array['food','culture']::text[],'Chole_bhature',160),
  ('Hyderabad','Hyderabadi biryani','food','Charminar',17.3616,78.4747,false,array['food','culture']::text[],'Hyderabadi_biryani',320),
  ('Hyderabad','Double ka meetha','food','Old City',17.3616,78.4747,false,array['food']::text[],'Double_ka_meetha',150),
  ('Hyderabad','Osmania biscuits and chai','food','Abids',17.389,78.476,false,array['food','culture']::text[],'Osmania_biscuit',100),
  ('Jaipur','Pyaaz kachori','food','MI Road',26.916,75.818,false,array['food']::text[],'Kachori',100),
  ('Jaipur','Ghewar','food','Bapu Bazaar',26.9167,75.8237,false,array['food']::text[],'Ghevar',160),
  ('Jaipur','Mirchi bada','food','Johari Bazaar',26.9239,75.8267,false,array['food']::text[],'Mirchi_bada',90),
  ('Kolkata','Kathi roll','food','Park Street',22.5535,88.3525,false,array['food']::text[],'Kati_roll',180),
  ('Kolkata','Mishti doi','food','Ballygunge',22.528,88.365,false,array['food']::text[],'Mishti_doi',120),
  ('Kolkata','Roshogolla','food','Esplanade',22.5675,88.35,false,array['food']::text[],'Rasgulla',100),
  ('London','Sunday roast','food','Bloomsbury',51.5194,-0.127,false,array['food','culture']::text[],'Sunday_roast',2400),
  ('London','Sausage roll','food','Westminster',51.5007,-0.1246,false,array['food']::text[],'Sausage_roll',900),
  ('London','Cornish pasty','food','Southwark',51.5055,-0.091,false,array['food']::text[],'Cornish_pasty',1200),
  ('Mumbai','Vada pav','food','Dadar',19.0178,72.8478,false,array['food']::text[],'Vada_pav',50),
  ('Mumbai','Pav bhaji','food','Juhu',19.1075,72.8263,false,array['food']::text[],'Pav_bhaji',180),
  ('Mumbai','Bhel puri','food','Chowpatty',18.9549,72.8128,false,array['food','beaches']::text[],'Bhelpuri',100),
  ('Ooty','Ooty homemade fudge','food','Commercial Road',11.407,76.698,false,array['food']::text[],'Fudge',160),
  ('Ooty','Nilgiri tea and cake','food','Charing Cross',11.4064,76.6932,false,array['food','coffee']::text[],'Tea_in_India',180),
  ('Ooty','South Indian dosa','food','Charing Cross',11.4064,76.6932,false,array['food']::text[],'Dosa',160),
  ('Pune','Misal pav','food','Deccan Gymkhana',18.5175,73.8412,false,array['food']::text[],'Misal_pav',160),
  ('Pune','Bhakarwadi','food','Shivajinagar',18.5308,73.8475,false,array['food']::text[],'Bhakarwadi',100),
  ('Pune','Mastani','food','Camp',18.513,73.879,false,array['food']::text[],'Mastani_(drink)',180),
  ('Udaipur','Laal maas','food','Old City',24.5764,73.6835,false,array['food','culture']::text[],'Laal_maas',380),
  ('Udaipur','Mawa kachori','food','Old City',24.5764,73.6835,false,array['food']::text[],'Mawa_kachori',140),
  ('Udaipur','Mirchi bada','food','Hathipole',24.585,73.681,false,array['food']::text[],'Mirchi_bada',100)
on conflict (city,name,kind) do nothing;
