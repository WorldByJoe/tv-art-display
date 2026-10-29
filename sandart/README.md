# Sand Picture

A moving sand picture worked out from physics: four sands, water and a little air between two panes of glass 1.2 mm apart, just after the frame has been turned over. Each time the page loads it makes a new frame, with sands of random mineral, grain size and colour and a new colour behind the water. The sand rests on a row of air bubbles and drains through the gaps between them like an hourglass, falls in thin streams and builds layered mountains. Each picture starts from the last one turned over, and takes about an hour, close to a real frame's pace.

## Running it

Open `index.html` in a browser. That is the whole of it - one file, no build,
no server, no keys. It is written for a 4K screen and scales down.

There is no text on screen. Add `?hud` to the URL to see the picture's clock and how fast your computer is running it against real time: the physics needs most of one fast core to keep up, and a slower machine runs the picture slower rather than skipping. `?frame=` with any number repeats a frame's sands and colours, `?seed=` a picture's pour, and `?classic` brings back the first frame's black, rust, white and pale sands on blue.

## What it is doing

- What it was checked against: a 25x time-lapse of a real frame. Just after the flip the air gathers under the sand as one level row of small bubbles; 10-12 thin streams fall from gaps in that row; the top of the upper sand sinks in V funnels, leaving triangles standing on the bubbles; near the end the row unzips, the triangles fall as clouds and drape the mountains. The real frame took 78 minutes; the model's pictures take about 45-90, depending on the frame's sands (finer sand drains slower), on a computer that can keep up.
- No grain is tracked. The picture is a grid of squares 1.2 mm across, each holding the share of its volume that is each sand, and the page draws one grain per pixel from those shares.
- Each of a frame's four sands is a random mineral (river or crushed quartz, crushed glass, feldspar, marble or basalt: 2,500-3,000 kg/m3, angles of repose 31-35 degrees) with a grain size from its own band between 0.09 and 0.27 mm, so every frame has a fine sand that hangs as a haze and a coarse one that falls first. A lone grain sinks through the water at 4 to 25 mm/s (Ferguson and Church's law, slowed by the glass), and crowded grains sink slower, so one stream sorts as it falls.
- The colours come from the palette of a tile mosaic painting (cream, yellow, ochre, red, teal, olive, brown, charcoal). A frame takes its four sands and the colour behind the water from five different groups, redrawn until the layers will read: a light sand and a dark one, every two sands clearly apart, and the water apart from all four. The sands keep their colours from picture to picture, as a real frame's do.
- The water is pushed by the weight of the sand in it and held back by the drag of the two panes, which damps any stirring in about a tenth of a second.
- The upper sand drains only as fast as water can seep into it to take its place (Darcy's law). Water seeps through sand as the square of its grain size, so a hole with a frame's finest sand over it passes three to nine times less than one with its coarsest.
- The sand over a hole does not sink as one block the width of the hole. Grains beside the falling ones step into the room they leave, so the sand that moves widens upward, as the square root of the height (the kinematic model of a draining silo, Nedderman and Tuzun), and the layers sag into Vs whose tip is the hole, as they do in the real frame. In the model, sand only ever moves in toward the hole, so the layers bend without mixing.
- Turning the frame over bends the old mountains: while it lies on its side the packed sand slumps along the glass, so the upper sand starts as waves and swirls, not straight zigzags. The model makes that fold with a few random rolls of a flow that neither squeezes the sand nor crosses its edges, a different amount each picture, so no sand is made or lost and the stripes stay sharp. The row of bubbles under it stays level and in place: in the time-lapse it never sank, and the sand drains through its gaps.
- Why a row of 3 mm bubbles can hold up a wall of sand: in a gap this thin, friction on the glass carries the sand's weight (the Janssen effect), so the pressure on the bubbles stops growing after about 3 mm of sand. A bubble rises out only through less than about 1.5 mm of sand. When the streams have dwindled the row unzips, one bubble every few seconds; that last rule copies what the real frame does rather than following from the physics.
- The mountains grow by avalanches, as a slowly fed heap does: sand landing on a face lodges up to about 4 degrees steeper than it rests (31-35 degrees for these minerals), and once the steeper cap reaches the bottom the whole face slides and lays one layer from the toe up, fine grains under coarse. That is what makes the thin stripes parallel to the slopes (Makse, Cizeau and Stanley 1997).
- Where it still differs from the real frame: late in a real picture only 4-6 streams are left and three or four wide triangles stand on the bubbles, while the model keeps draining through nearly every hole and leaves more, smaller ridges; and its stripes are thinner, about 1.3 mm against about 2.3 mm in a photograph of a real one.

---
*Generated by `build_github.py` from the version that runs on the wall, so this
copy cannot drift out of step with it.*
