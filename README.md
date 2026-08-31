# tv-art-display

Generative science pieces written for a 4K television - each one a single HTML
file that simulates something real and draws the result, rather than animating a
picture of it.

They were built for an ambient display driven by a Raspberry Pi, where they
rotate one into the next. The copies here are standalone: no build, no server,
no keys, no dependency on each other. Open the HTML file.

**[Browse them all](https://worldbyjoe.github.io/tv-art-display/)**

| | |
|---|---|
| [**plume**](plume/) | A car drives a real street network with a methane analyser on the roof. Two to six leaks are hidden along the route; gas disperses from them as Gaussian puffs carried on a wandering wind, and the analyser samples whatever concentration happens to be at the car. Colour on the ground is not the gas - it is the survey's BELIEF about where the leak is, built up reading by reading. At the end the gas is shut off, the map clears, and every leak is marked found or missed. |
| [**surnames**](surnames/) | Five hundred families, one surname each, passed from father to son and to nobody else. Some men have no sons. Their name is gone, and nothing in a patrilineal system can bring it back. Watch long enough and five hundred names become one. |
| [**gravity**](gravity/) | Bodies pulling on each other under Newtonian gravity, with no scripted orbits. Five scenarios - a protoplanetary disk, a binary dance, two clusters colliding, an Oort scattering, a tidal encounter - one drawn at random each run, each with its own initial conditions. Bodies that touch MERGE, conserving mass and momentum, so the count only ever falls. |
| [**physarum**](physarum/) | About 137,000 particles, each doing nothing cleverer than steering towards the strongest smell in front of it and leaving a trail of its own. Out of that comes a transport network - the same behaviour that lets Physarum polycephalum reproduce a country's rail map when food is placed at the cities. |
| [**reaction**](reaction/) | A Gray-Scott reaction-diffusion system: one chemical is fed in, another consumes it and copies itself, and the two spread at different rates. Change two numbers and the same equations give spots, stripes, mazes, waves or a moving front - which is Turing's 1952 answer to how a uniform embryo becomes a patterned animal. |
| [**tree**](tree/) | Not a fractal and not an L-system. Every shoot is paid for out of what the leaves earned that season, against the cost of keeping those leaves alive and of building the new wood. Twenty-two years of that, drawn as a pencil study on cream paper with a person standing beside it for scale. |
| [**weather**](weather/) | A live forecast over one of three regions, run forward and back around now. The land is veiled in grey and sunlight lifts the veil, so the map shows through exactly where the sun is reaching the ground. The streaks are surface wind, drawn by letting tracers ride the field. |
| [**voyage**](voyage/) | Every run picks a real planetary system and flies to it. It opens on our corner of the Milky Way with both ends of the trip marked in it, then takes the 4,737 stars known to carry planets and peels them away, farthest first, until only the handful actually on the way is left - the rungs of the ladder out from here in that particular direction. |
| [**artworks**](artworks/) | Five public-domain works drawn live from the Art Institute of Chicago's open collection, one at a time, each with what the museum knows about it and a paragraph on the artist from Wikipedia. Nothing is stored in the page: every visit is a different five, out of a collection that runs to tens of thousands. |
| [**descent**](descent/) | A fresh trail is invented for every run - a bench cut traversing a hillside, switchbacking and plunging through changing dirt, with jumps built into it - and a rider is simulated down it. Nothing is scripted: a planner chooses where to be across the trail and when to brake, out of physics, and then the bike has to actually follow that plan. |

## The idea

Each piece is a simulation, not an animation. Nothing on screen is a recording
or a scripted path: the equations are integrated forward while you watch, and a
run that goes badly is allowed to go badly. Several of them are pictures of how
well a measurement or a process actually works, including when it doesn't.

Where a piece needs real-world data - street networks, building footprints,
coastlines, satellite imagery - it is fetched once at build time and embedded,
so the page keeps working when the network doesn't. Two pieces are exceptions
and say so on their own pages: `weather` is a live forecast, and `artworks`
fetches every picture it shows from the museum as it shows it.

## Two more, with sites of their own

Two pieces outgrew a card and have their own repositories:

- [**Plume**](https://worldbyjoe.github.io/plume-survey-sim/) - the leak
  survey above, as a standalone simulator with its own documentation.
- [**Selection**](https://worldbyjoe.github.io/selection-abm/) - an evolving
  ecology, with a laboratory panel for setting up a world before you run it.

## Credits

Street and building data (c) OpenStreetMap contributors (ODbL) and the
Overture Maps Foundation. Forecast data from Open-Meteo (CC BY 4.0).
Museum images and records from the Art Institute of Chicago; artist
paragraphs from Wikipedia (CC BY-SA 4.0). Elevation from Terrarium tiles on
AWS Open Data. Planetary parameters from the NASA Exoplanet Archive.
Boundaries from Natural Earth.

---
*Generated by `build_github.py` from the versions that run on the wall, so
these copies cannot drift out of step with them.*
