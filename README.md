<p align="center">
  <img src="https://cdn.discordapp.com/attachments/1503494832218308808/1503497032499859526/content.png?ex=6a03903a&is=6a023eba&hm=9ab9899a86218ac4fb50ab57648c47a39abf413b10d0f6c7d377a54a06e881f9" alt="Stalker Banner" width="100%"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="discord.js v14"/>
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 18+"/>
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License"/>
</p>

<h1 align="center">Stalker Bot</h1>
<p align="center">
  <strong>Real-time Discord user activity tracker with full audit logging</strong><br/>
  <sub>Presence monitoring · Voice tracking · Message logging · Invisible detection · Mutual server discovery</sub>
</p>

---

## Overview

Stalker Bot is an advanced Discord activity tracking system built on a **dual-client architecture**. A standard bot client handles slash commands and sends rich UI notifications (Components V2), while a self/user client provides deep, cross-server presence tracking that regular bots cannot achieve. All activity is logged into private, auto-generated Discord channels — one for online/offline status, one for the full audit trail.

> **Disclaimer:** This project is for educational and personal use only. Tracking users without consent may violate Discord's Terms of Service and applicable privacy laws. Use responsibly.

---

## Features

### Presence Tracking
- Real-time status transitions (Online, Idle, DND, Offline) with session duration calculation
- Platform detection — Desktop, Mobile, Web — with alerts when a new client connects
- Custom status capture including emoji and text
- **Invisible detection** — flags users who appear offline but are typing, sending messages, or joining voice channels

### Activity Monitoring
- **Games** — Detects playing sessions with game name, details, party size, and elapsed time
- **Spotify** — Song title with direct link, artist, album name, album art thumbnail, and play start time
- **Streaming** — Stream URL and platform details
- **Watching / Competing** — Logs all remaining Discord activity types
- **Stopped** — Logs when any activity ends

### Voice Channel Tracking
- Join, leave, and move events with server/channel context and jump links
- **Live VC panel** — an auto-updating message (refreshes every 10s) showing all members in the channel with individual time counters
- **Session history** — when the tracked user leaves, a detailed summary is posted listing every member encountered, sorted by time spent together
- Mute, deafen, video, screen share, and stage speaker/audience state changes
- Server-side mute/deafen by admins is logged separately

### Message Logging
- Messages sent — content (up to 500 chars), attachments with links, and jump URL
- Messages edited — before/after comparison
- Messages deleted — recovers content from internal cache
- VC chat messages are tagged separately
- Typing events with 30-second cooldown

### Profile Changes
- Avatar, username, and display name changes with before/after values

### Mutual Server Discovery
The `/mutual` command scans all servers the self client is in and identifies which ones the target user is also a member of. For each mutual server it reports:
- Server name and ID
- Member count

### System
- **Auto-deploy** — Slash commands register automatically on bot startup
- **Auto channel setup** — `/adduser` creates a private category with `#is-online` and `#audit` channels
- **Persistent state** — JSON file survives restarts; tracks status, VC sessions, platform, and more
- **Stale cleanup** — Removes tracking entries if their channels are deleted
- **Presence re-subscription** — Re-subscribes to Discord gateway every 2 minutes to prevent presence drops
- **Components V2 UI** — All notifications use Discord's container/section/separator components

---

## Project Structure

```
stalker/
├── index.js          # Main application — tracking logic, commands, event handlers, UI
├── deploy.js         # Standalone command registration (optional, auto-deploys on startup)
├── package.json      # Dependencies and scripts
├── .env.example      # Environment variable template
├── .gitignore        # Git ignore rules
├── LICENSE           # MIT License
└── data/
    └── state.json    # Runtime state (auto-generated, gitignored)
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18.0 or higher
- A [Discord Bot Application](https://discord.com/developers/applications) with a bot token
- A Discord user/self token for the tracking client

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/stalker.git
cd stalker
npm install
```

### Configuration

```bash
cp .env.example .env
```

```env
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_client_id_here
SELF_TOKEN=your_self_token_here
```

### Bot Permissions

In the [Discord Developer Portal](https://discord.com/developers/applications), enable these **Privileged Gateway Intents**:

- Presence Intent
- Server Members Intent
- Message Content Intent

Invite the bot with the `bot` and `applications.commands` scopes. Recommended permission: **Administrator**.

### Run

```bash
npm start
```

Slash commands are registered automatically on startup. No separate deploy step needed.

---

## Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/adduser <userid>` | Start tracking a user — creates private logging channels | Administrator |
| `/removeuser <userid>` | Stop tracking a user and delete their logging channels | Administrator |
| `/mutual <userid>` | List all servers shared between the self client and the target user | Administrator |

### Channel Structure

When you run `/adduser`, the bot creates:

```
username.in | 123456789  (Category — private)
├── #is-online            Status change notifications
└── #audit                Full activity log
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Stalker Bot                       │
├────────────────────────┬─────────────────────────────┤
│     Bot Client         │      Self Client            │
│     (discord.js v14)   │      (selfbot-v13)          │
│                        │                             │
│  Slash commands        │  Presence tracking (WS)     │
│  Channel management    │  Voice state events         │
│  Components V2 output  │  Message monitoring         │
│  User update events    │  Typing detection           │
│  Auto command deploy   │  Guild/member scanning      │
│                        │  Gateway subscriptions      │
└────────────────────────┴─────────────────────────────┘
                         │
                         ▼
                ┌─────────────────┐
                │   state.json    │
                │  (persistent)   │
                └─────────────────┘
```

---

## Console Output

```
12:30:45 AM [BOT]       StalkerBot#1234 · ready
12:30:45 AM [DEPLOY]    Slash commands registered globally
12:30:46 AM [SELF]      UserAccount#5678 · 42 guilds
12:30:46 AM [SELF]      Tracking 3 user(s)
12:30:47 AM [PRESENCE]  123456789  offline → online [desktop]
12:30:48 AM [VC]        joined General in My Server
12:31:02 AM [MSG]       username in My Server › #general
```

---

## Security

- **Never commit `.env`** — it contains authentication tokens. The `.gitignore` excludes it by default.
- `state.json` contains user IDs and channel mappings — it is also gitignored.
- The self client runs in **invisible** mode by default.

---

## License

[MIT](LICENSE)

---

<p align="center">
  <sub>If this was useful, consider starring the repository.</sub>
</p>
