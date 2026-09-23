// Product profiles used by the "find the right robot" advisor.
// Numbers come from the Gausium spec sheets / user manuals in documents/.
// Edit freely — this text is inserted directly into the advisor system prompt.

export const ROBOT_PROFILES = `
OMNIE (Gausium Omnie) — mid/large hard-floor scrubber, 3-in-1
- Functions: scrubbing, dust mopping; roller brush version also sweeps (pre-sweep). Hard floors only.
- Versions: Disc brush (best for scrubbing smooth hard floors, 520 mm scrub width) or Roller brush (406 mm, sweeps + scrubs in one pass, handles light debris, 780 mm sweep width incl. side brushes).
- Theoretical efficiency: scrubbing 2046–2621 m²/h, dust mopping ~3600 m²/h, sweeping ~3931 m²/h (roller version).
- Water: 33 L clean / 24 L waste; filtration system gives ~70 L equivalent, up to ~4000 m² per tank.
- Runtime: scrubbing max 3 h, sweeping/mopping max 8 h. Charging 2 h. Auto charging dock.
- Size: 810 x 700 x 1070 mm, ~150 kg. Min. pass width 800 mm, min U-turn 1100 mm. Gradeability 8 %.
- Elevator integration (LoRa standard). Obstacle detection from 30 mm, 3D LiDAR + 4 RGB cameras + depth camera.
- Typical sites: offices with hard floors, shopping centres, supermarkets, airports, stations, hospitals, schools, light industry.

MIRA (Gausium Mira M4) — compact multi-function robot
- Functions: scrubbing, sweeping, dust mopping. Hard floors.
- Theoretical efficiency: scrubbing 2016 m²/h, sweeping 3780 m²/h, dust mopping 3124 m²/h.
- Water: 22 L clean / 20 L waste. Runtime: scrubbing 3.3–4.4 h, sweeping 6–8 h, dust mopping 7.5–10 h. Charging 2.5 h.
- Workstation (auto charging) needs ~1.8 x 2.14 m of free space in front.
- Size: 680 x 550 x 900 mm, 130 kg. Min. pass width 660 mm, min turning width 950 mm — good in narrower corridors and furnished areas.
- Glass-door detection, 3D LiDAR, 360° cameras. Elevator integration optional (LoRa). Max mapping 120 000 m².
- Typical sites: offices, hotels, schools, healthcare, retail — mixed areas with corridors where a compact robot is needed.

PHANTAS (Gausium Phantas) — small, compact 4-in-1 robot
- Functions: vacuuming (including carpet), sweeping, scrubbing and dust mopping. The only robot in the range that vacuums carpet.
- Designed for smaller and more crowded indoor spaces: offices, meeting rooms, hotels, schools, clinics, shops.
- Best fit for areas up to roughly 1500–2000 m² per robot, and for mixed floors (carpet + hard floor).
- Auto charging dock. Elevator integration possible.
- Exact capacity figures: not in our spec sheets — say that Ready Robotics will confirm them.

SCRUBBER 50 (Gausium Scrubber 50 / SC50) — dedicated scrubber for large hard floors
- Functions: scrubbing and mopping. Indoor hard floors only — NOT for carpet, wood floors, soil or outdoor use.
- Versions: disc brush (460 mm, ~1490 m²/h) or roller brush (406 mm / 780 mm incl. edge brush, ~2527 m²/h).
- Water: 30 L clean / 24 L waste. Runtime: scrubbing 3 h, mopping 8 h. Charging dock available.
- Size: 810 x 700 x 1070 mm, 140–150 kg. Gradeability 8 % (manual mode only).
- Typical sites: supermarkets, shopping centres, airports, stations, large open hard floors.

BEETLE (Gausium Beetle) — industrial / outdoor sweeper
- Functions: sweeping and dust collection only (no water). Picks up hard debris up to 250 x 250 x 80 mm and 1.2 kg (bottles, wood pieces, packaging).
- Theoretical efficiency: up to 3240 m²/h. 400 mm roller + 2 side brushes (750 mm sweep width). 45 L trash bin, HEPA filter.
- Runtime 3 h (Beetle) or 5 h (Beetle Pro), charging 2.5 h. Works in complete darkness, detects forklifts, AGVs, people and cars.
- Max mapping 60 000 m² (Beetle) / 120 000 m² (Pro). Pro has automatic HEPA dust removal, strobe light and visibility flag as standard.
- Min. pass width 750 mm, U-turn 1200 mm, gradeability 8° (14 %). IP3X.
- Typical sites: warehouses, factories, logistics hubs, parking areas, outdoor plazas, campuses, hotel conference halls.
- Often combined with a scrubber (e.g. Omnie) when a site needs both heavy debris removal and wet cleaning.
`;
