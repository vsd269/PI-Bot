# PI Bot

Persistent Bot teams for **PI Desktop**. [简体中文](README.md)

PI Bot is an independently maintained adaptation of [DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot), developed by learning from and porting its open-source implementation to PI Desktop's plugin APIs. Thanks to the upstream author and contributors. This is not an official DeepSeek-Bot distribution, and it does not claim complete feature parity.

## New in 0.3.85

Adapted from DeepSeek-Bot 0.2.1: independent `/btw` side questions, charts and formula calculators, persisted group mention pause/continue, bubble/flat layouts and width controls, optional thinking display, secret purpose editing, unreadable-memory protection, and narrow/touch improvements. See [release notes](docs/RELEASE-0.3.85.md) for entry points and limits.

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

Bring your own PI model configuration, cloud speech credentials and application accounts. Services may incur charges. Notion and email need compatible MCP services and authorization; a configuration entry is not a verified account connection. Schedules require the client to remain running. Recovery uses saved sessions and is not an arbitrary mid-tool process checkpoint. Windows credentials are encrypted for the current OS user and require encrypted export for transfer.

Tests use synthetic data and mocks where applicable. Real model, microphone, OAuth and browser behavior depends on your environment. Do not publish credentials, private chats or team backups in an issue.

See [connector guidance](CONNECTORS.md), [contribution guide](CONTRIBUTING.md), [security policy](SECURITY.md) and [changelog](CHANGELOG.md). Report adapter issues in [this repository](https://github.com/vsd269/PI-Bot/issues).

## Credits and license

Based on **Fei2411 / DeepSeek-Bot** under Apache-2.0. Original notices, earlier upstream identities and migration records are retained in [NOTICE](NOTICE) and [source provenance](renderer/upstream/provenance.json). The bundled `ws` dependency retains its [MIT license](src/vendor/ws/LICENSE). User-supplied avatar artwork and existing attribution are retained; no rights in third-party marks are claimed.

Code is distributed under [Apache License 2.0](LICENSE). This repository does not bundle or modify PI Desktop client binaries.

## Update notifications

Starting with 0.3.79, an open PI Bot page checks this repository's public stable GitHub Releases in the background. New versions appear in the sidebar; Settings → About provides manual checks, release notes and package downloads. Automatic checking can be disabled. Successful checks are cached for six hours; failures are shown honestly and can be retried.

Download the `.piplug`, import it in PI Desktop's plugin manager, then restart. This does not silently replace running plugins. Versions before 0.3.79 need one manual upgrade to acquire this feature. No connector token is sent to the release API. Publishers must create a non-draft, non-prerelease Release with a matching `local.pi-bot-X.Y.Z.piplug` asset and a higher version.

For the plugin center upload, use the canonical `local.pi-bot-VERSION.piplug`. The identically sized and hashed `PI-bot-VERSION.piplug` release asset is kept solely for 0.3.79 update discovery. `npm run preflight:market` checks the specific filename and dynamic-import patterns encountered during submission; it does not replace the platform's full review.

## Identity migration in 0.3.81

PI Bot now uses plugin ID `local.pi-bot`. Before upgrading from 0.3.80 or earlier, disable the old PI Bot plugin without uninstalling it, import the new package, and restart. On first start, the new plugin copies and validates the legacy team, chat history, memory, skills, uploads, browser profiles and Windows-user-encrypted vault. Legacy data is kept. Existing new data/backups are never overwritten or merged; interrupted migration resumes from a journal. The old plugin must stay disabled to prevent duplicate task execution.
