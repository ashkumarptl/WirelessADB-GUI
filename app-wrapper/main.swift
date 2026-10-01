import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    var didStartServer: Bool = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)

        startServerIfNeeded()

        let screenSize = NSScreen.main?.visibleFrame.size ?? CGSize(width: 1440, height: 900)
        let width = min(1000, screenSize.width - 80)
        let height = min(840, screenSize.height - 80)

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: width, height: height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "ADB Wireless GUI"
        window.center()
        window.minSize = NSSize(width: 650, height: 500)

        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.navigationDelegate = self
        webView.autoresizingMask = [.width, .height]
        window.contentView?.addSubview(webView)

        setupMainMenu()

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        loadURL()
    }

    func isServerRunning() -> Bool {
        let task = Process()
        task.launchPath = "/usr/sbin/lsof"
        task.arguments = ["-i", ":5151"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe
        try? task.run()
        task.waitUntilExit()
        return task.terminationStatus == 0
    }

    func startServerIfNeeded() {
        if !isServerRunning() {
            let bundleDir = Bundle.main.bundlePath
            let projectDir = (bundleDir as NSString).deletingLastPathComponent

            let process = Process()
            process.launchPath = "/bin/bash"
            let script = "export PATH=\"/opt/homebrew/bin:/usr/local/bin:$PATH\"; cd \"\(projectDir)\"; exec node server.js"
            process.arguments = ["-c", script]
            try? process.run()
            self.serverProcess = process
            self.didStartServer = true

            Thread.sleep(forTimeInterval: 0.6)
        }
    }

    func loadURL() {
        if let url = URL(string: "http://localhost:5151") {
            webView.load(URLRequest(url: url))
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.loadURL()
        }
    }

    func stopServerIfWeStartedIt() {
        if didStartServer {
            serverProcess?.terminate()
            serverProcess = nil

            let killTask = Process()
            killTask.launchPath = "/bin/bash"
            killTask.arguments = ["-c", "PID=$(lsof -ti :5151); [ -n \"$PID\" ] && kill $PID"]
            try? killTask.run()
            killTask.waitUntilExit()
        }
    }

    func setupMainMenu() {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)

        let appMenu = NSMenu()
        let quitItem = NSMenuItem(title: "Quit ADB Wireless", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenu.addItem(quitItem)
        appMenuItem.submenu = appMenu

        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        NSApp.mainMenu = mainMenu
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopServerIfWeStartedIt()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
