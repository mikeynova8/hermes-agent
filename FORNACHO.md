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

### 1. Capacitor shell and dedicated renderer

The iOS app is a native Capacitor 8 container around a dedicated React/Vite mobile renderer. Capacitor supplies the iOS lifecycle, signing, and `WKWebView`; the renderer supplies a phone-first conversation UI rather than squeezing Hermes Desktop onto a narrow screen.

The mobile client reuses Hermes contracts—not its desktop layout. Session history comes through REST, while streaming messages, tools, prompts, and Projects use the structured JSON-RPC gateway.

### 2. Mobile transport boundary

`apps/mobile/src/transport/` contains the tailnet endpoint, authenticated request helpers, and session-history API. `apps/shared/src/json-rpc-gateway.ts` supplies the reusable WebSocket client. The bundled marker remains non-secret; the real Hermes session credential never enters the IPA.

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

- `capacitor.config.ts` — app identity and dedicated Vite bundle location.
- `src/App.tsx` — phone-first chat, drawer, Projects, composer, and lifecycle orchestration.
- `src/chat/` — transcript normalization, timestamps, gateway reducer, and new-session routing.
- `src/projects/` — native Hermes Project list, creation, session flattening, and cwd inheritance.
- `src/transport/` — tailnet REST/WebSocket transport and history loading.
- `vite.config.ts` / `package.json` — production build and Vitest gates.
- `desktop-port/` — retained temporarily as historical fallback; it is not packaged in Build 3.
- `ios/App/` — native Xcode workspace, signing settings, Info.plist, icons, and generated web assets.
- `assets/logo.png` — source Mikey icon.

Mac-side service configuration is deliberately outside the repository under `~/.hermes/mikey/` and `~/Library/LaunchAgents/`. Credentials must never enter Git.

## Technical choices

### Why Capacitor plus a dedicated React renderer

Builds 1–2 proved that wrapping the full desktop renderer was technically fast but visually wrong. A full SwiftUI rewrite would still duplicate streaming, Markdown, gateway events, sessions, and attachment behavior. The middle path keeps the proven Capacitor shell and Hermes protocols while replacing the desktop composition with a small mobile-only renderer.

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
- Version/build: `1.0 (9)` candidate
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

## Build 3: a real mobile client

Build 3 removes the desktop renderer from the packaged application. The result is a calm, chat-first UI with conversation titles, subtle WhatsApp/Telegram-style timestamps and day separators, one-row composer controls, collapsed tool activity, and no file explorer, Git chrome, terminal, or desktop pane graph.

The conversation drawer now uses native Hermes Projects. A Project groups chats under a workspace, persists in Hermes' `projects.db`, and provides the default working directory for new chats. Because Projects are profile-scoped, the current client creates them under the connected `default` Hermes profile. Cross-profile selection requires a real profile-specific gateway connection; a decorative dropdown would be misleading.

Two integration bugs were especially instructive:

1. A WebSocket can open before an event listener is fully attached in WKWebView. The shared gateway client now reconciles that connection ordering instead of leaving the app stuck at “Connecting.”
2. REST transcript messages use `content`, while `session.resume` messages can use `text`. The mobile normalizer accepts both and preserves the better historical timestamps rather than replacing a valid transcript with empty messages.

Build 3 verification includes 14 Vitest regressions, TypeScript, production Vite build, zero production npm vulnerabilities, credential scanning, simulator compile/install/launch, real session restore, live Hermes Project loading/drill-in, keyboard-safe Project creation UI, and exact screenshot approval. The final release candidate uses a consistent Lucide icon set and 44-point controls; the composer placeholder uses a symmetric 44-point line box so it is optically centered.

## Build 4: deterministic long-conversation scrolling

Build 3 used a circular scroll heuristic: it would scroll after rendering only when the viewport was already within 180 points of the bottom. A newly selected long transcript begins far from the bottom, so the condition prevented its own recovery. Build 4 models the intent explicitly instead:

- selecting a conversation forces an immediate jump to its newest message after React and WKWebView complete layout;
- live output remains pinned only while the reader is already near the bottom;
- scrolling upward reveals a 44-point floating down-arrow above the composer;
- tapping the arrow smoothly restores the newest message and resumes bottom-following;
- a `ResizeObserver` catches late wrapping and expanding activity cards that change transcript height without adding a message.

The complaint-driven browser fixture exercised a real 69,728-pixel transcript. It opened at exactly zero pixels from the bottom, exposed the control after moving 700 pixels upward, and returned to zero after the button was tapped. Four pure scroll-boundary regressions bring the dedicated mobile suite to 18 tests.

## Build 5: user conversations, not agent machinery

Build 4 exposed a cron run as a normal chat. Its first `user` row was actually the scheduler's synthetic `[IMPORTANT: You are running as a scheduled cron job…]` instruction, so filtering only by message role was insufficient. Those rows carry no per-message display metadata in the current database; the reliable boundary is the session source.

Mikey now excludes operational `cron`, `subagent`, and retrieval-verification sessions from the conversation drawer while retaining interactive Telegram, CLI, Desktop, Mikey, and other messaging sessions. Because recent history can be dominated by automation, the client uses bounded 60-row pagination until it has 60 real conversations instead of issuing one oversized request or leaving the drawer empty.

The upgrade regression seeds Build 4's last-selected ID with a real gratitude cron session, reloads the app, and proves that the synthetic prompt is absent, the cron title is absent, the stale selection is not resumed, the new-chat state remains usable, and 60 interactive chats are still listed.

## Build 6: errors are product copy, not backend output

Build 5 fixed automation-session leakage but was intentionally not assigned to testers after a second audit found that rejected JSON-RPC requests could still render `cause.message` verbatim. Build 6 routes every banner and gateway error through a small classifier. Oversized-session failures become “This chat is too large to continue live. Start a new chat to keep going,” connection failures become calm retry copy, and unknown failures use operation-specific fallbacks. Exact counts, configuration keys, raw JSON-RPC objects, exception text, and backend names never enter the primary transcript or banner.

Regression coverage exercises both the rejected `session.resume` path and asynchronous gateway `error` events, and asserts that `active messages`, `max_resume_messages`, `config.yaml`, and exact limits are absent.

## Build 7: Bot Mode is profile routing, not a second chat system

Hermes 0.20.4 introduced Bot Mode around profiles. Mikey follows that backend contract instead of inventing mobile-only agents:

- the drawer has an explicit **Chats / Bots** switch;
- `profiles.list` supplies the live roster, display metadata, descriptions, colors, and profile models;
- each profile owns one server-synced canonical `Bot Chat`, stored in `ui_meta.hermes-bots.chat`;
- an existing latest profile session is adopted on first open so upgrading does not discard history;
- history REST calls, `session.create`, and `session.resume` carry the selected profile;
- the ordinary structured gateway still carries streaming text, tools, approvals, and `@bot` protocol events.

The roster intentionally does **not** show latest-message previews. Hermes profile previews can currently point at scheduler or synthetic turns without explicit display provenance, so showing them would recreate Build 5's privacy leak. Identity and profile description are safe; message previews remain hidden until the backend marks them user-visible.

Updating Hermes also tightened WebSocket Origin checks. The tailnet-only Caddy proxy now rewrites the upstream Origin to the trusted loopback dashboard origin while leaving the client connection private and authenticated. A production-bundle E2E opened the real Home profile, loaded its canonical history, sent `Reply with exactly: BOT MODE OK`, observed streaming, received `BOT MODE OK`, and remained connected. The mobile suite contains 31 passing tests.

Build 7 also reconnects after an already-open WebSocket closes, covering transient proxy restarts and iOS foreground/sleep transitions rather than only initial connection failures.

## Build 8: Markdown is presentation, not transcript text

Build 7 rendered assistant content inside a plain text `<div>`, so Markdown control characters appeared literally: `###` headings, `**bold**`, list hyphens, and backticks. Build 8 routes message text through `react-markdown` with GitHub-flavored Markdown support and raw HTML disabled. Mobile styles provide restrained heading hierarchy, list rhythm, safe links, inline-code pills, horizontally scrollable fenced code and tables, blockquotes, task lists, and long-token wrapping.

Component regressions render the exact release-proof shape from the physical-device complaint and assert semantic heading/list/bold/code output. They also cover fenced code, raw-script suppression, safe external-link attributes, and disabled task checkboxes. The suite now includes `.tsx` component tests instead of silently excluding them.

## Build 9: Mikey becomes ambient

The Lock Screen idea belongs inside Mikey rather than in a second app. Mikey already owns the Hermes connection, shared sessions, App Store identity, and mobile permission boundary. Throwing that away would duplicate the difficult transport work without making Live Activities more native.

The implementation is intentionally hybrid:

- the existing React renderer remains the chat and configuration surface;
- a small Swift `CAPBridgedPlugin` owns ActivityKit lifecycle calls;
- a native WidgetKit extension renders the Lock Screen, banner, and Dynamic Island;
- a shared `ActivityAttributes` contract keeps the host app and extension in sync;
- the model chooses from bounded payload fields—category, title, detail, symbol, tint, progress, and deadline—rather than generating arbitrary SwiftUI.

The first vertical slice is **Lock Screen Lab** in the conversation drawer. It offers leave-by, agent-progress, and open-evening templates, starts one native Live Activity at a time, and can end it explicitly. No credential, door code, private transcript, or sensitive command is allowed into these presets. Activity receipt is presentation, not authorization.

Why not rewrite Mikey in SwiftUI? The system surface is already 100% SwiftUI/WidgetKit where Apple requires it. Rewriting the chat shell would add months of duplicate Markdown, streaming, session, project, Bot, attachment, and reconnect work while producing the same ActivityKit extension. Native where the OS boundary demands it; reuse where the product already works.

Simulator compilation, installation, extension embedding, native plugin discovery, and Lock Screen Lab UI all pass. The iOS 26.2 simulator reports Live Activities disabled, so actual Lock Screen/Dynamic Island rendering remains a physical-device acceptance gate before Build 9 can be released.

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
