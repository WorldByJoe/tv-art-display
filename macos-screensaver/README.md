# Murmuration as a macOS screen saver

The [murmuration](../murmuration/) running as a screen saver: starlings over a
field at dusk, a new evening every eight minutes, no network needed. It is the
page from this repository, whole and unchanged, inside a native screen-saver
bundle that shows it in a WebKit view.

## What you need

- A Mac on macOS 14 Sonoma or later. It was written against Sonoma, Sequoia
  and Tahoe; read *Apple's host* below before trusting it on anything newer.
- The Xcode Command Line Tools - `xcode-select --install` - not Xcode itself.
- This repository, cloned or downloaded.

## Build and install

```
cd tv-art-display/macos-screensaver
./build.sh --install
```

Then choose it: System Settings > Wallpaper > Screen Saver on macOS 26, or
System Settings > Screen Saver on macOS 14-15; scroll to the **Other** section
at the bottom and pick Murmuration. `open -a ScreenSaverEngine` starts whatever
saver is selected without waiting for the idle timer.

When the page changes: `git pull && ./build.sh --install`. To remove it:
`./build.sh --uninstall`.

The bundle is signed ad hoc, which is enough on the Mac that built it. A copy
carried to another Mac will be refused as unsigned.

## What is in the bundle

```
Murmuration.saver/Contents/
  Info.plist
  MacOS/Murmuration           compiled from Sources/MurmurationSaverView.swift
  Resources/murmuration/      a copy of ../murmuration, so nothing is fetched
```

Each display gets its own instance and so its own evening. The version shown
in System Settings is the date the page last changed in this repository.

## Tuning

- `MURMURATION_QUERY="n=2500&rs=0.75" ./build.sh --install` opens the page with
  that URL query. `n` fixes the bird count, `rs` the render scale (0.4-1). By
  default the page decides for itself: 3,000-5,000 birds, thinned if a warm-up
  timing says this Mac cannot keep up, and a render scale that steps down if
  the frame rate sags. Set `n` on a Mac you want to keep quiet.
- The thumbnail in System Settings runs 600 birds at 0.6 scale so it is
  recognisable without heating the machine (`MurmurationPreviewQuery` in
  Info.plist).
- `MURMURATION_EXIT_ON_STOP=1` is explained below.

## Apple's host, and what this saver does about it

Since macOS 14 every third-party saver runs inside Apple's
`legacyScreenSaver.appex`, which gets a little worse with each release. The
things it does that a web page cannot survive on its own are handled in
`MurmurationSaverView.swift`:

- **The page freezes under its own black fade-in.** The saver's window belongs
  to another process, so WebKit decides the view is occluded and stops
  `requestAnimationFrame`. The fix is to switch WebKit's occlusion detection off
  on the view - a private WebKit hook, looked up by name and skipped if a future
  WebKit drops it - and, as insurance, to tell the page its document is
  visible.
- **The saver keeps running after you dismiss it.** The host does not reliably
  tell a saver to stop, and the process lingers. A WebGL flock left running
  behind the desktop is a fan you can hear, so the saver listens for the
  system's own "screen saver will stop" notification and tears the page down
  itself. The stronger fix other savers use - quitting the host process as
  well - is `MURMURATION_EXIT_ON_STOP=1`, off by default because on macOS 26 it
  has been seen to leave the saver unable to launch again until a restart.
  Turn it on if you still hear the fans after dismissing it.
- **macOS 26 geometry.** The frame handed over is sometimes 0x0, bounds can
  arrive in backing pixels on a non-Retina external display, and the flag that
  says "this is the preview" is wrong. The view sizes itself from the screen
  when empty, never outgrows the screen, and judges "preview" by size.

Not handled, because nothing inside a saver can:

- **macOS 26.4** had a regression, reported in March 2026 (FB22353950), in
  which a WebKit view inside a legacy screen saver goes blank about three
  seconds in; 26.3.1 was fine and no workaround was known at the time of the
  report. If this saver shows the first seconds of an evening and then goes
  black, that is what you are seeing.
- On macOS 26 a third-party saver often fails to appear on a second display,
  and the System Settings preview sometimes starts two instances.
- Reports on macOS 27 say the host locks up or burns CPU after a run or two of
  any third-party saver until the Mac is restarted.

## If it shows nothing

1. Watch the saver's own log, then start the saver:
   ```
   log stream --info --predicate 'subsystem == "io.github.worldbyjoe.murmuration-saver"'
   ```
   `loading ... loaded` means WebKit received the page; what happens after that
   is the page's business.
2. The page's own console is reachable from Safari: turn on the Develop menu
   in Safari > Settings > Advanced, then Develop > (this Mac) > Murmuration
   while the saver or its preview is running.
3. The host keeps the old bundle mapped in memory, so a rebuild is not seen
   until it goes; `build.sh --install` kills it for you.

## The no-code alternative

[WebViewScreenSaver](https://github.com/liquidx/webviewscreensaver) is a
general-purpose saver that shows any URL, installable through Homebrew, and can
be pointed at <https://worldbyjoe.github.io/tv-art-display/murmuration/>. It
uses the same WebKit-inside-the-host approach, meets the same Apple bugs, and
needs the network each time it starts, but someone else keeps it working across
macOS releases.

## Credits

The page is drawn with three.js (MIT licence), carried inside the bundle. The
host workarounds follow what WebViewScreenSaver, ScreenSaverMinimal and
ytyng's macOS 26 notes found.
