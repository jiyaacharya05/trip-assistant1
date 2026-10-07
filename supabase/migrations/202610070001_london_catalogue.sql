-- Real London property names and locations, verified against official hotel pages.
-- INR nightly rates below are illustrative demo estimates for this sample app,
-- not live offers, currency conversions, or bookable rates. Recheck at booking.
-- Sources: https://www.pointahotels.com/our-hotels/kings-cross/
--          https://www.premierinn.com/gb/en/hotels/england/greater-london/london/london-kings-cross.html
--          https://www.premierinn.com/gb/en/hotels/england/greater-london/london/hub-london-kings-cross.html
--          https://www.travelodge.co.uk/hotels/258/London-Central-Kings-Cross-hotel
--          https://all.accor.com/hotel/7943/index.en.shtml
insert into public.catalogue_hotels(city,name,price_per_night_inr,area,tags) values
  ('London','Point A Hotel London Kings Cross - St Pancras',10500,'King’s Cross',array['budget','popular']),
  ('London','Travelodge London Central Kings Cross',11500,'King’s Cross',array['budget','popular']),
  ('London','hub by Premier Inn London King’s Cross hotel',13500,'King’s Cross',array['budget','popular']),
  ('London','Premier Inn London King’s Cross hotel',15500,'King’s Cross',array['popular','family-friendly']),
  ('London','ibis London Blackfriars',16000,'Blackfriars / Southwark',array['popular','family-friendly'])
on conflict(city,name) do update
set price_per_night_inr=excluded.price_per_night_inr,
    area=excluded.area,
    tags=excluded.tags;
