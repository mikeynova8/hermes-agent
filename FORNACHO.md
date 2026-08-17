# FORNACHO — How Mikey Works

## The short version

Mikey is not a tiny AI model trapped inside an iPhone. It is a secure mobile window into the same Hermes that already lives on the always-on Mac mini.

Think of the iPhone as the cockpit and the Mac mini as the engine room:

```text
iPhone / Mikey
    │
    │ private Tailscale HTTPS
    ▼
Mac mini reverse proxy
    │ adds the real Hermes session credential locally
    ▼
Hermes dashboard + gateway
    │
    ├── sessions and history
    ├── memory and skills
    ├── tools and files
    └── long-running work
```

That design is why work can continue across mobile, desktop, and CLI without creating a second isolated assistant.

## Architecture

### 1. Capacitor shell

The iOS app is a native Capacitor 8 container around the Hermes desktop renderer. Capacitor supplies the real iOS application, lifecycle, signing, and `WKWebView`; Hermes supplies the chat interface.

This was the fastest path to a useful personal client because it reuses the mature renderer instead of rebuilding every chat surface in SwiftUI.

### 2. Browser compatibility shim

Hermes Desktop normally talks to Electron APIs. Those APIs do not exist in an iOS `WKWebView`, so `desktop-port/shim/hermes-web-shim.js` recreates the small bridge contract the renderer expects.

The shim knows Nacho's private Tailscale gateway URL. Its bundled token is only a non-secret marker. It is not the real Hermes session credential.

### 3. Mac-side credential boundary

The real credential remains in the Mac mini's local Hermes environment. A loopback-only Caddy proxy receives traffic admitted through Tailscale, substitutes the real credential, and forwards the request to the local Hermes gateway.

This is safer than putting a reusable backend secret in an IPA, where it could be extracted from the application bundle.

### 4. Tailscale transport

Mikey connects through:

```text
https://mikeys-mac-mini.tailaf453c.ts.net:9443
```

The endpoint is private to the tailnet. HTTPS protects transport; Tailscale controls device membership; the local proxy keeps the real Hermes credential off the phone.

## Project structure

The mobile implementation lives under `apps/mobile/`:

- `capacitor.config.ts` — app identity and web bundle location.
- `package.json` — mobile build and test commands.
- `desktop-port/build.sh` — builds Hermes Desktop for the browser target.
- `desktop-port/shim/hermes-web-shim.js` — Electron-to-browser compatibility bridge and private gateway default.
- `desktop-port/test/bridge.test.mjs` — bridge contract and first-launch connection tests.
- `ios/App/` — native Xcode workspace, signing settings, Info.plist, icons, and generated web assets.
- `assets/logo.png` — source Mikey icon.

Mac-side service configuration is deliberately outside the repository under `~/.hermes/mikey/` and `~/Library/LaunchAgents/`. Credentials must never enter Git.

## Technical choices

### Why Capacitor instead of SwiftUI

A SwiftUI rewrite could eventually feel more native, but it would require rebuilding streaming chat, Markdown, code blocks, tool cards, artifacts, sessions, settings, and many edge cases. Capacitor gave us the existing Hermes experience immediately while preserving access to native iOS APIs later.

### Why a remote Mac backend

Hermes is powerful because it can use terminals, files, repositories, browser sessions, skills, and long-running processes. iOS sandboxing cannot provide the same environment. Keeping the agent on the Mac mini preserves the full toolset and makes the phone a continuation of the same workspace.

### Why not embed the session credential

Anything shipped inside an IPA should be considered extractable. The proxy-marker design makes the bundled value useless outside Nacho's authenticated tailnet and leaves the actual credential on the machine that owns the backend.

### Why the App Store record is “Mikey Agent”

App Store Connect names are globally unique, and “Mikey” was already taken. Apple accepted “Mikey Agent” for the store record. `CFBundleDisplayName` remains “Mikey,” so the installed icon still says Mikey.

## Release identity

- Display name: **Mikey**
- App Store Connect record: **Mikey Agent**
- Bundle ID: `com.ignacioiacovino.mikey`
- Version/build: `1.0 (1)`
- Apple team: `JXF76W23J6`
- App Store Connect app ID: `6802144898`

## Bugs and fixes

### The upstream build appeared to hang

The mobile build tried to clone a pinned Hermes renderer into its vendor directory. That was slow and left a partial vendor checkout.

**Fix:** discard the partial vendor directory and build from the existing local Hermes worktree using `HERMES_AGENT_SRC`. The renderer then built in under two seconds, and Capacitor synchronization completed successfully.

### App Store Connect API could not create the app record

The available API key could query and update app resources but could not create a new app record.

**Fix:** create the record through the logged-in App Store Connect UI, then switch back to the API for deterministic verification and TestFlight automation.

### “Mikey” failed App Store name validation

Apple requires globally unique App Store names.

**Fix:** use “Mikey Agent” for the record while retaining “Mikey” as the on-device display name.

### App Store user-access save warning

The creation dialog reported that its explicit user-access setting could not be saved, while also confirming that all App Store Connect users already had access.

**Resolution:** verify the app exists through the API and add Nacho explicitly to the internal TestFlight group through Apple's tester picker.

### Simulator text automation produced repeated `a` characters

Synthetic macOS keystrokes were not translated correctly through Simulator into the web editor.

**Lesson:** do not interpret that automation artifact as an app input bug. Use physical-device/TestFlight input for final text-entry acceptance or drive the WebView with a dedicated semantic harness.

### Dependency audit initially reported high-severity issues

An unused icon-generation package pulled in a large transitive development tree.

**Fix:** remove `@capacitor/assets`, regenerate the lockfiles, and rerun the audit. The final audit reports zero vulnerabilities.

## Verification performed

- Hermes mobile renderer production build: passed.
- Capacitor iOS sync and CocoaPods install: passed.
- Node bridge tests: 13/13 passed, including dark-mode seeding before renderer boot.
- npm high-severity audit: zero vulnerabilities.
- iOS Simulator compilation: `BUILD SUCCEEDED`.
- Simulator install and launch: passed on iPhone 17 / iOS 26.2.
- Visual first-launch smoke: Hermes chat workspace loaded without a setup or connection-error screen.
- Tailscale gateway status: HTTP 200.
- Worktree scan for the real Hermes session credential: no match.
- App icon: 1024×1024 with no alpha channel.
- Release archive: succeeded for arm64, version `1.0 (1)`.
- App Store export: succeeded and re-signed with Apple Distribution.
- Exported IPA metadata: correct bundle ID, display name, version/build, and `ITSAppUsesNonExemptEncryption = false`.
- App Store upload: accepted with no errors.
- Internal TestFlight group: created.
- Nacho tester membership: confirmed in App Store Connect.

## Build 2: replacing the desktop shell on iPhone

Build 1 proved the difficult systems part: a TestFlight app could reach the real, tailnet-only Hermes backend and resume shared sessions. It also exposed the cost of treating a phone like a tiny desktop monitor. The desktop layout engine still mounted file, review, terminal, titlebar, and status surfaces. On a touch WebView, an invisible narrow-pane hover strip could synthesize a mouse event and reveal the file tree without a reliable way to dismiss or scroll it.

Build 2 does not merely hide those pixels. Below the mobile breakpoint, `ContribController` uses a dedicated composition:

- a safe-area-aware Mikey header with a 44-point conversations button;
- the real Hermes session sidebar as an `88vw` modal drawer;
- only the chat route as the primary content surface;
- no desktop layout tree, file/review pane, terminal, titlebar, or status bar;
- a fixed, safe-area-aware composer with mobile pop-out/drag behavior disabled.

The session drawer keeps its own vertical scroll container. Choosing a session, destination, cron run, or new-session action closes it; search and expansion controls deliberately keep it open. The renderer is seeded to dark mode before its JavaScript graph loads, preventing a light first frame and keeping Markdown, sheets, code, and tool cards on one palette.

The composer needed its own mobile adaptation. Desktop Git branch and repository `+/-` counters were removed on iPhone, the giant wordmark became a compact empty state, and thread changes no longer auto-focus the editor. That last detail matters because WKWebView can otherwise summon its input accessory and pan the whole shell beneath the notch.

Visual QA on iPhone 17 / iOS 26.2 confirmed the drawer opens, scrolls through more than 30 sessions to its bottom navigation, and closes after a session is selected. The chat remains a single dark column and the accidental file-browser path is absent.

## Pitfalls for the next build

1. Increment `CURRENT_PROJECT_VERSION`; Apple rejects duplicate build numbers.
2. Rebuild the renderer and run `npx cap sync ios` before archiving.
3. Never place the real Hermes credential in source, generated web assets, logs, or an export plist.
4. Verify the processed archive and exported IPA, not only Xcode source settings.
5. Upload success is not installability. Wait for `VALID`, confirm export compliance, group attachment, and tester access.
6. The iPhone must be connected to Nacho's tailnet; otherwise the intentionally private backend will be unreachable.
7. Background WebSockets are constrained by iOS. Treat Mikey as a foreground workspace until APNs/background coordination is designed explicitly.
8. Keep desktop capabilities out of the mobile composition by default. Add a bounded mobile sheet intentionally if files or diffs become useful later; never reactivate invisible narrow-pane hover strips on touch devices.

## How good engineers should think about this

The fastest implementation is not always the smallest codebase. Reusing the renderer created a large JavaScript bundle, but it avoided rebuilding years of interaction behavior. That is a good trade for a personal first TestFlight build.

The important boundary is not “native versus web.” It is **where authority and secrets live**. The iPhone owns presentation and input; the Mac owns the agent, files, tools, and credential. Tailscale and the local proxy make that boundary explicit.

Finally, a release is a chain of proofs:

```text
tests → simulator → archive → distribution signature → upload
      → Apple processing → beta group → tester access → physical install
```

Stopping at any earlier arrow and calling it “shipped” is how apparently successful releases disappear from TestFlight.
