# tv-art-display

Generative science pieces written for a 4K television — each one a single HTML
file that simulates something real and draws the result, rather than animating a
picture of it.

They were built for an ambient display driven by a Raspberry Pi, where they
rotate one into the next. The copies here are standalone: no build, no server,
no keys, no dependency on each other. Open the HTML file.

| | |
|---|---|
| [**plume**](plume/) | Finding a gas leak from a moving vehicle. A car drives a real street network with a methane analyser; the colour on the ground is the survey's *belief* about where the leak is, built up reading by reading. |

More to follow.

## The idea

Each piece is a simulation, not an animation. The gas really does disperse as
Gaussian puffs on a wandering wind, and the analyser really does read whatever
concentration happens to be at the car — so a leak can be missed, and often is.
That is the point: these are pictures of how well a measurement works, including
when it doesn't.

The street networks and building footprints are real, fetched at build time and
embedded, so a page keeps working when the network doesn't.

## Credits

Street and building data © OpenStreetMap contributors (ODbL) and the
Overture Maps Foundation.
