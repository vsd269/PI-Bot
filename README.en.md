# PI Bot

Persistent Bot teams for **PI Desktop**. [简体中文](README.md)

PI Bot is an independently maintained adaptation of [DS Bot](https://github.com/Fei2411/DeepSeek-Bot), developed by learning from and porting its open-source implementation to PI Desktop's plugin APIs. Thanks to the upstream author and contributors. This is not an official DS Bot distribution, and it does not claim complete feature parity.

This GitHub release includes changes from 0.3.94 through 0.3.101. See the [combined release notes](docs/GITHUB-RELEASE-0.3.101.md) for features, installation, and validation limits.

## New in 0.3.101

Adds sent-image thumbnails and expanded viewing, unread message dividers, readable tool steps, and live work states. Selected text supports quoting and a seven-item editing menu that follows PI Desktop language settings. Refines the detail avatar, settings header, and message actions. See [release notes](docs/RELEASE-0.3.101.md).

## New in 0.3.100

Edit a Bot's avatar and name directly in the right panel. Uploaded images keep their full frame and support zoom, vertical positioning, dragging, and three shapes. The panel now separates Details, Library (memory, skills, working folder), and Computer (browser and native workspace). See [release notes](docs/RELEASE-0.3.100.md).

## New in 0.3.99

Keeps unanswered greeting choices across chat navigation, adds a compact call bar with an expandable transcript, streams dictation with supported realtime profiles, moves work experience into menus, and adds complete searchable table cards with copy, CSV export and expanded viewing. See [release notes](docs/RELEASE-0.3.99.md).

## New in 0.3.96

Adds immediate local greetings and choice cards, complete-proportion attachment previews, upload retry/removal, and native attachment delivery for group and private administrator planning. Refines composer geometry, header spacing and detail controls. Image understanding still requires a vision-capable model. See [release notes](docs/RELEASE-0.3.96.md).

## New in 0.3.95

Refines header/footer controls and detail cards, adds a customizable sidebar profile image in Settings → General, and places 11px Geist timestamps beside message actions. See [release notes](docs/RELEASE-0.3.95.md).

## New in 0.3.94

Scopes Apps errors to the Apps dialog, pauses failed authorization polling, improves sanitized network diagnostics, and removes thick resize-handle hover bars. See [release notes](docs/RELEASE-0.3.94.md).

## New in 0.3.93

This release combines 0.3.91–0.3.93. See the [full release notes](docs/GITHUB-RELEASE-0.3.93.md). Fixes [#1](https://github.com/vsd269/PI-Bot/issues/1); thanks [@royrao2007](https://github.com/royrao2007) for the detailed report and suggestions.

Adds a source-aligned Apps catalog with service logos, categories, search and pagination. Each user supplies a personal Composio project key, authorizes accounts on official pages, and explicitly grants access to selected Bots or all Bots. Credentials and project configuration use the local Windows encrypted vault. Existing GitHub PAT and MCP integrations remain available. Sidebar resize, panel motion and titlebar drag-region fixes are included. Real third-party account authorization still requires user acceptance testing. See [setup and limits](docs/RELEASE-0.3.93.md).

## New in 0.3.91

Fixes administrator plan parsing and bounded correction, adds schedule-run lifecycle tracking, local file conditions, quoted memory evidence, work receipts and configuration-only team templates. Idle polling and unchanged state saves are reduced without weakening durable admission. Templates exclude chats, memory, keys, grants and local folders; schedules import paused and skills remain unassigned. File waits require the app to keep running. See [entry points and limits](docs/RELEASE-0.3.91.md).

## New in 0.3.90

Persist-before-execute admission now covers continuations, answered questions, result delivery, manual recovery and group batches. Group results return through the existing planner session; unanswered questions block collection, and unknown or interrupted submissions are not replayed blindly. Automatic follow-up is limited to two additional batches and does not run for a normal greeting.

Settings now includes **待处理 / Pending** for user questions, native approval links, proposals, execution issues and completed turns awaiting review. A completed turn is not an independently verified outcome. State-file writer locking and external-change protection preserve both copies before user reconciliation; automatic memory review handles malformed changes individually.

During group work, the existing send action becomes a stop button and returns to send afterward. Normal text relays have no fixed count ceiling; only consecutive no-tool acknowledgement or exact repeated replies are parked for user continuation. Experience actions now sit next to their heading.

Local regression: 283 passed, 1 skipped due to Windows symlink permissions, 0 failed. Headless UI checks cover Pending, existing upstream features/layout, privacy settings and attachments. Real PI Desktop/model acceptance is still required. See [entry points and limits](docs/RELEASE-0.3.90.md).

## New in 0.3.89

This cumulative release includes the 0.3.87–0.3.89 changes: durable acknowledgement of request-ID worker delegations, bounded execution history, group-wide stop, user-approved Skill and AGENTS.md proposals, responsive resizable sidebars, lightweight Office tools, and plugin-level private Bots.

Private Bots require a separate folder and cannot join groups. They restrict PI Bot-owned tools and memory scopes; native PI filesystem, shell, MCP and child-session isolation is not verified, and this is not an OS sandbox. Office tools require a standalone Node.js 20+ runtime. Automatic experience review is off by default and uses the configured model when enabled.

Local regression: 237 passed, 1 skipped due to Windows symlink permissions, 0 failed. Real-host/model acceptance is not covered by these automated tests. See the [cumulative release notes](docs/GITHUB-RELEASE-0.3.89.md) and [privacy guide](docs/RELEASE-0.3.89.md).

## New in 0.3.86

Adds a shared avatar library, `/side` as an alias for `/btw`, deletion of completed side questions, unread Bot-to-Bot queue indicators, and `message_bot` request ID deduplication. See the [0.3.86 release notes](docs/RELEASE-0.3.86.md) for entry points and limits.

The 0.3.85 migration from DS Bot 0.2.1 added `/btw` side questions, charts and formula calculators, persisted group mention pause/continue, bubble/flat layouts and width controls, optional thinking display, secret-purpose editing, unreadable-memory protection, and narrow/touch improvements. See [0.3.85 release notes](docs/RELEASE-0.3.85.md).

Side questions use the Bot's configured model and incur normal usage. Cancellation ignores late answers; PI does not expose cancellation of the underlying one-shot request. HTML cards are static opaque-origin sandboxes with scripts and network disabled. Upstream standalone-client packaging, account management and browser-profile cookie import are not included.

## Features

- Persistent private chats and Bot groups, administrator delegation, serial or parallel group execution.
- Streaming message updates, references, text selection, chat search and history.
- Separate file-backed memory for each Bot and group, with configurable model-assisted memory extraction.
- Private-chat cards for text, metrics, tables, progress, choices, confirmations and short forms; requires model tool support.
- Local message times and reply durations from recorded measurements.
- Local Skill import, shared capability packs and batch assignment to multiple Bots.
- GitHub integration and explicitly authorized per-Bot local / remote MCP connectors.
- Voice input, live transcription conversations, input device selection and recording status.
- Local schedules, session-based recovery, usage, backups, themes and custom avatars.

## Install

1. Install [PI Desktop](https://github.com/vsd269/PI-Desktop) and configure an available model.
2. Download `local.pi-bot-VERSION.piplug` from [Releases](https://github.com/vsd269/PI-Bot/releases/latest).
3. Install the local package in PI Desktop's plugin manager, review permissions and restart the client.
4. Open **PI Bot** and create your Bots or groups.

The declared minimum host API is **0.18.0**. The release package was verified with the Windows PI Desktop **0.20.1 native installer** using isolated data. Windows is the primary validation platform; other platforms have not been fully tested. The plugin ID is `local.pi-bot`; see the identity migration instructions below when upgrading from 0.3.80 or earlier.

## Build and test

Node.js **20+** is required. These commands have no npm dependency installation step:

```sh
git clone https://github.com/vsd269/PI-Bot.git
cd PI-Bot
npm run check
npm test
npm run package
npm run verify:package
```

The package and SHA-256 file are created under `dist/`. The native installer requires ZIP STORE entries; a normal deflated ZIP is not interchangeable.

## Boundaries

Bring your own PI model configuration, cloud speech credentials and application accounts. Services may incur charges. Applications can use the user-owned Composio project or compatible MCP services; catalog entries are not verified account connections. Schedules require the client to remain running. Recovery uses saved sessions and is not an arbitrary mid-tool process checkpoint. Windows credentials are encrypted for the current OS user and require encrypted export for transfer.

Tests use synthetic data and mocks where applicable. Real model, microphone, OAuth and browser behavior depends on your environment. Do not publish credentials, private chats or team backups in an issue.

See [connector guidance](CONNECTORS.md), [contribution guide](CONTRIBUTING.md), [security policy](SECURITY.md) and [changelog](CHANGELOG.md). Report adapter issues in [this repository](https://github.com/vsd269/PI-Bot/issues).

## Credits and license

Based on **Fei2411 / DS Bot** (the upstream repository retains its historical `DeepSeek-Bot` URL) under Apache-2.0. Original notices, earlier upstream identities and migration records are retained in [NOTICE](NOTICE) and [source provenance](renderer/upstream/provenance.json). The bundled `ws` dependency retains its [MIT license](src/vendor/ws/LICENSE). User-supplied avatar artwork and existing attribution are retained; no rights in third-party marks are claimed.

Code is distributed under [Apache License 2.0](LICENSE). This repository does not bundle or modify PI Desktop client binaries.

## Update notifications

Starting with 0.3.79, an open PI Bot page checks this repository's public stable GitHub Releases in the background. New versions appear in the sidebar; Settings → About provides manual checks, release notes and package downloads. Automatic checking can be disabled. Successful checks are cached for six hours; failures are shown honestly and can be retried.

Download the `.piplug`, import it in PI Desktop's plugin manager, then restart. This does not silently replace running plugins. Versions before 0.3.79 need one manual upgrade to acquire this feature. No connector token is sent to the release API. Publishers must create a non-draft, non-prerelease Release with a matching `local.pi-bot-X.Y.Z.piplug` asset and a higher version.

For the plugin center upload, use the canonical `local.pi-bot-VERSION.piplug`. The identically sized and hashed `PI-bot-VERSION.piplug` release asset is kept solely for 0.3.79 update discovery. `npm run preflight:market` checks the specific filename and dynamic-import patterns encountered during submission; it does not replace the platform's full review.

## Identity migration in 0.3.81

PI Bot now uses plugin ID `local.pi-bot`. Before upgrading from 0.3.80 or earlier, disable the old PI Bot plugin without uninstalling it, import the new package, and restart. On first start, the new plugin copies and validates the legacy team, chat history, memory, skills, uploads, browser profiles and Windows-user-encrypted vault. Legacy data is kept. Existing new data/backups are never overwritten or merged; interrupted migration resumes from a journal. The old plugin must stay disabled to prevent duplicate task execution.
