# Murmuration studio

Make your own video of a simulated starling murmuration, up to 100,000 birds in 4K, rendered in your browser. A simple front for the settings, an advanced panel for the model, and a settings file beside every video so any flock can be made again.

**[Open the studio](https://worldbyjoe.github.io/tv-art-display/murmuration-studio/)**

- Best in Chrome or Edge on a desktop or laptop: they stream a large 4K video
  straight to a folder you choose. Safari and Firefox build the video in memory,
  so keep those to 1080p, under a minute and under 20,000 birds.
- Keep the tab open and in front while it renders; browsers slow background tabs.
- Needs an internet connection once per render (the MP4 writer, mp4-muxer, loads
  from jsDelivr).
- Each video gets a settings file (.json) with the seed and every parameter used.

The flock follows rules from field studies of European starlings: 6-7 topological
neighbours (Ballerini et al. 2008), turning inertia (Attanasi et al. 2014), social
speed control (Bialek et al. 2014), steering toward the flock's visible edges
(Pearce et al. 2014), and roost and height attraction as in StarDisplay
(Hildenbrandt, Carere and Hemelrijk 2010).
