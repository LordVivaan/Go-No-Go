insert into public.missions (code, title, celestial_body, risk_class, budget_cap_musd, design_life_years)
values
  ('FLOODWATCH', 'Global Flood Disaster Response Observatory', 'EARTH', 'C', 95.00, 3.0),
  ('LUNAR SCOUT', 'South Pole Volatile & Permanently Shadowed Crater Orbiter', 'MOON', 'B', 145.00, 2.0),
  ('MARS OBSERVER', 'Martian Polar Cap & Dust Storm Telecom Orbiter', 'MARS', 'B', 260.00, 5.0),
  ('ASTEROID EXPLORER', 'Near-Earth Asteroid Rubble-Pile Rendezvous', 'ASTEROID', 'B', 195.00, 3.5)
on conflict (code) do nothing;
