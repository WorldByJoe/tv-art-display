import ScreenSaver
import WebKit
import os.log

/* ---------------------------------------------------------------------------
   MurmurationSaverView.swift
   the murmuration as a macOS screen saver.

   WHAT IT IS. A ScreenSaverView that hosts one WKWebView and points it at the
   copy of ../murmuration that build.sh puts inside the bundle. Nothing is
   fetched from the network: the saver works on a plane. The page itself is
   untouched - it already restarts a new evening in place when a run ends,
   because the GitHub build leaves CONFIG.nextPage empty.

   WHY THERE IS MORE HERE THAN "ADD A WEB VIEW". Since macOS 14 third-party
   savers run inside Apple's legacyScreenSaver host, and that host has a few
   habits a web page cannot survive on its own:

     - the window belongs to another process, so WebKit decides the view is
       occluded: requestAnimationFrame stops, document.hidden goes true, and
       the page sits frozen under its own black fade-in. The fix is to switch
       WebKit's occlusion detection off on the view. As insurance, a script
       run before the page also tells it the document is visible - this page
       never asks, but a later version might, and it costs nothing.
     - the host does not reliably send stopAnimation() when the saver is
       dismissed, and the process lingers. A WebGL flock left running behind
       the desktop is a fan you can hear, so the view also listens for the
       system-wide "screen saver will stop" notification and tears the web
       view down itself. Exiting the host process as well is available as an
       Info.plist switch (MurmurationExitOnStop) but off by default, because
       on macOS 26 that has been seen to leave the saver unable to launch
       again until a restart.
     - on macOS 26 the frame handed to init is sometimes 0x0, bounds can
       arrive in backing pixels on a non-Retina external display, and
       isPreview is not trustworthy. So: the frame is filled from the screen
       when empty, the web view is clamped to the screen's point size and laid
       out by hand (no autoresizing mask), and "preview" is judged by size.

   PREVIEW. The thumbnail in System Settings runs the real page with a small
   fixed flock (MurmurationPreviewQuery) so it is recognisable without heating
   the machine. It also never tears itself down on another saver's stop
   notification and never exits anything.
--------------------------------------------------------------------------- */

@objc(MurmurationSaverView)
public final class MurmurationSaverView: ScreenSaverView, WKNavigationDelegate {

    private static let log = OSLog(subsystem: "io.github.worldbyjoe.murmuration-saver", category: "saver")

    /// What the System Settings thumbnail loads instead of a full evening.
    private static let previewQuery = "n=600&rs=0.6"

    private var webView: WKWebView?

    // MARK: - lifecycle

    public override init?(frame: NSRect, isPreview: Bool) {
        super.init(frame: frame, isPreview: isPreview)
        commonInit()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        // We draw nothing ourselves - WebKit paces its own frames - so the
        // host's animation timer may as well be slow.
        animationTimeInterval = 1.0
        ensureNonZeroFrame()
        let center = DistributedNotificationCenter.default()
        for name in ["com.apple.screensaver.willstop", "com.apple.screensaver.didstop"] {
            center.addObserver(self, selector: #selector(screenSaverWillStop(_:)),
                               name: Notification.Name(name), object: nil)
        }
        os_log("init %{public}@ frame %{public}@", log: Self.log, type: .info,
               isPreview ? "(preview)" : "", NSStringFromRect(frame))
    }

    deinit {
        DistributedNotificationCenter.default().removeObserver(self)
    }

    // MARK: - ScreenSaverView

    public override func startAnimation() {
        super.startAnimation()
        ensureNonZeroFrame()
        installWebViewIfNeeded()
        layoutWebView()
    }

    public override func stopAnimation() {
        super.stopAnimation()
        tearDownWebView()
    }

    public override func animateOneFrame() {
        // intentionally empty: the page animates itself inside the web view
    }

    public override func draw(_ rect: NSRect) {
        // black until the page's own fade lifts; also the colour of any gap
        NSColor.black.setFill()
        rect.fill()
    }

    public override var hasConfigureSheet: Bool { return false }
    public override var configureSheet: NSWindow? { return nil }

    // MARK: - geometry

    /// isPreview lies on macOS 26 (FB19201567). The System Settings thumbnail
    /// is a few hundred points wide; no screen is.
    private var looksLikePreview: Bool {
        return isPreview || (bounds.width > 1 && bounds.width < 700)
    }

    /// macOS 26 sometimes hands init a 0x0 frame. Fill it from the screen
    /// until the host sizes the view properly; never touch a settled frame.
    private func ensureNonZeroFrame() {
        if bounds.width > 1 && bounds.height > 1 { return }
        let size = window?.screen?.frame.size
            ?? NSScreen.main?.frame.size
            ?? NSSize(width: 1920, height: 1080)
        setFrameSize(size)
    }

    /// Where the web view goes. In the preview, the whole view. On a screen,
    /// the view but never larger than the screen's point size - on a
    /// non-Retina external display macOS 26 passes bounds in backing pixels.
    private func targetFrame() -> NSRect {
        if looksLikePreview { return bounds }
        let screen = window?.screen?.frame.size ?? NSScreen.main?.frame.size ?? .zero
        if screen.width > 1 && screen.height > 1 {
            if bounds.width > 1 && bounds.height > 1 {
                return NSRect(x: 0, y: 0,
                              width: min(bounds.width, screen.width),
                              height: min(bounds.height, screen.height))
            }
            return NSRect(origin: .zero, size: screen)
        }
        return bounds
    }

    private func layoutWebView() {
        guard let wv = webView else { return }
        let frame = targetFrame()
        if wv.frame != frame { wv.frame = frame }
    }

    public override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        layoutWebView()
    }

    public override func layout() {
        super.layout()
        layoutWebView()
    }

    public override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        layoutWebView()
    }

    public override func resizeSubviews(withOldSize oldSize: NSSize) {
        super.resizeSubviews(withOldSize: oldSize)
        layoutWebView()
    }

    // MARK: - the web view

    /// Run before any page script. WebKit marks the saver's document hidden
    /// (see the header). The page does not consult this today; insurance.
    private static let visibilityOverride = """
    try {
      Object.defineProperty(Document.prototype, 'hidden',
        { configurable: true, get: function () { return false; } });
      Object.defineProperty(Document.prototype, 'visibilityState',
        { configurable: true, get: function () { return 'visible'; } });
    } catch (e) {}
    """

    private func installWebViewIfNeeded() {
        if webView != nil { return }

        let config = WKWebViewConfiguration()
        // Nothing the page stores (wall.js keeps a few settings in
        // localStorage) needs to outlive the run, and a persistent store
        // would live on in the host's sandbox container.
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.addUserScript(
            WKUserScript(source: Self.visibilityOverride,
                         injectionTime: .atDocumentStart,
                         forMainFrameOnly: true))

        let wv = WKWebView(frame: targetFrame(), configuration: config)
        wv.navigationDelegate = self
        wv.wantsLayer = true
        wv.layer?.backgroundColor = NSColor.black.cgColor
        if #available(macOS 13.0, *) { wv.underPageBackgroundColor = .black }
        // Lets Safari's Develop menu attach to the running saver (or the
        // preview) to read the page's console. Harmless when unused.
        if #available(macOS 13.3, *) { wv.isInspectable = true }
        Self.setWindowOcclusionDetection(wv, enabled: false)

        addSubview(wv)
        webView = wv
        load(into: wv)
    }

    /// Since Sonoma the saver's window belongs to another process and WebKit
    /// concludes the view is occluded, which stops requestAnimationFrame.
    /// This is a private WebKit hook, so it is looked up by name and skipped
    /// if a future WebKit no longer has it.
    private static func setWindowOcclusionDetection(_ wv: WKWebView, enabled: Bool) {
        let selector = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
        guard wv.responds(to: selector), let imp = wv.method(for: selector) else {
            os_log("WebKit has no _setWindowOcclusionDetectionEnabled:; relying on the visibility override alone",
                   log: log, type: .error)
            return
        }
        typealias Setter = @convention(c) (AnyObject, Selector, Bool) -> Void
        let setter = unsafeBitCast(imp, to: Setter.self)
        setter(wv, selector, enabled)
    }

    private func load(into wv: WKWebView) {
        let bundle = Bundle(for: MurmurationSaverView.self)
        guard let index = bundle.url(forResource: "index", withExtension: "html",
                                     subdirectory: "murmuration") else {
            os_log("murmuration/index.html is missing from the bundle", log: Self.log, type: .error)
            return
        }
        let query: String
        if looksLikePreview {
            query = (bundle.object(forInfoDictionaryKey: "MurmurationPreviewQuery") as? String) ?? Self.previewQuery
        } else {
            query = (bundle.object(forInfoDictionaryKey: "MurmurationQuery") as? String) ?? ""
        }
        var components = URLComponents(url: index, resolvingAgainstBaseURL: false)
        components?.query = query.isEmpty ? nil : query
        let url = components?.url ?? index
        os_log("loading %{public}@", log: Self.log, type: .info, url.absoluteString)
        // Read access to the whole folder, so wall.css, three.min.js and the
        // rest load beside index.html.
        wv.loadFileURL(url, allowingReadAccessTo: index.deletingLastPathComponent())
    }

    private func tearDownWebView() {
        guard let wv = webView else { return }
        os_log("tearing down the web view", log: Self.log, type: .info)
        wv.navigationDelegate = nil
        wv.stopLoading()
        // Drop the WebGL context now rather than whenever the host gets round
        // to releasing the view.
        wv.loadHTMLString("", baseURL: nil)
        wv.removeFromSuperview()
        webView = nil
    }

    // MARK: - the host not stopping us

    /// The host does not reliably call stopAnimation() when the saver is
    /// dismissed (a Sonoma-era bug that persists), but the system does post
    /// this. The preview ignores it: it fires for every saver on the Mac.
    @objc private func screenSaverWillStop(_ note: Notification) {
        if looksLikePreview { return }
        os_log("%{public}@", log: Self.log, type: .info, note.name.rawValue)
        tearDownWebView()
        let exitOnStop = (Bundle(for: MurmurationSaverView.self)
            .object(forInfoDictionaryKey: "MurmurationExitOnStop") as? Bool) ?? false
        if exitOnStop {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { exit(0) }
        }
    }

    // MARK: - WKNavigationDelegate

    public func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // The page never navigates away (a standalone copy restarts in place),
        // and a screen saver has no business leaving its bundle.
        decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel)
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        os_log("loaded", log: Self.log, type: .info)
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                        withError error: Error) {
        os_log("load failed: %{public}@", log: Self.log, type: .error, error.localizedDescription)
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        os_log("navigation failed: %{public}@", log: Self.log, type: .error, error.localizedDescription)
    }

    /// A WebGL page running for hours can lose its content process. Reload
    /// rather than stay black until the next dismissal.
    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        os_log("web content process ended; reloading", log: Self.log, type: .error)
        load(into: webView)
    }
}
