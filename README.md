<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="discord.js v14"/>
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 18+"/>
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License"/>
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge" alt="Active"/>
</p>

<h1 align="center">👁️ Stalker Bot</h1>
<p align="center">
  <strong>Advanced Discord User Activity Tracker</strong><br/>
  <em>Real-time presence monitoring, voice tracking, message logging & invisible detection — all delivered through Discord's Components V2 UI.</em>
</p>

---

## 🔍 Overview

**Stalker Bot** is a powerful Discord activity tracking system that monitors targeted users in real-time across all shared servers. It uses a **dual-client architecture** — a standard bot for sending rich UI notifications and a self/user client for deep presence tracking — to deliver comprehensive audit logs directly into private Discord channels.

> **⚠️ Disclaimer:** This project is intended for **educational and personal use only**. Tracking users without their knowledge or consent may violate Discord's Terms of Service and local privacy laws. Use responsibly.

---

## ✨ Features

### 🟢 Presence Tracking
- **Status Changes** — Online, Idle, DND, Offline transitions with session duration
- **Platform Detection** — Desktop, Mobile, Web client identification with change alerts
- **Custom Status** — Captures emoji and text custom status updates
- **Invisible Detection** — Flags users who appear offline but are typing, sending messages, or joining voice

### 🎮 Activity Monitoring
- **Game Activity** — Detects when a user starts/stops playing games with party info
- **Spotify Integration** — Song name, artist, album, album art, and direct Spotify links
- **Streaming** — Captures stream URL and details
- **Watching / Competing** — Tracks all Discord activity types

### 🎤 Voice Channel Tracking
- **Join / Leave / Move** — Logs all VC state changes with server and channel info
- **Live VC Panel** — Auto-updating message showing current VC members with individual timers
- **Session History** — On leave, posts a detailed summary with all members encountered and time spent
- **State Changes** — Mute, deafen, video, screen share, stage speaker/audience transitions
- **Invisible VC Detection** — Alerts when an "offline" user joins voice

### 💬 Message Logging
- **Message Sent** — Logs content, attachments, and jump links
- **Message Edited** — Shows before/after comparison
- **Message Deleted** — Recovers cached content
- **VC Chat** — Distinguishes voice channel text messages
- **Typing Indicator** — Logs typing events with cooldown

### 👤 Profile Changes
- **Avatar Changed** — Old and new avatar URLs
- **Username Changed** — Before/after comparison
- **Display Name Changed** — Tracks global name updates

### 🛠️ System Features
- **Slash Commands** — `/adduser`, `/removeuser`, `/mutual` with autocomplete
- **Auto Channel Setup** — Creates private category + channels per tracked user
- **Persistent State** — JSON-based state survives restarts
- **Stale Entry Cleanup** — Automatically removes tracking entries with deleted channels
- **Presence Re-subscription** — Periodic gateway re-subscription to prevent presence drops
- **Components V2 UI** — Rich, structured message layout using Discord's latest components

---

## 📁 Project Structure

```
stalker/
├── index.js          # Main application — all tracking logic, event handlers, and UI
├── deploy.js         # Slash command registration script
├── package.json      # Dependencies and scripts
├── .env.example      # Environment variable template
├── .gitignore        # Git ignore rules
└── data/
    └── state.json    # Runtime state (tracked users, VC sessions, etc.)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** `v18.0+` — [Download](https://nodejs.org/)
- **Discord Bot Application** — [Developer Portal](https://discord.com/developers/applications)
- **Discord User/Self Token** — Required for presence tracking

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/stalker.git
cd stalker
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_bot_client_id_here
SELF_TOKEN=your_self_token_here
```

### 4. Register Slash Commands

```bash
npm run deploy
```

### 5. Start the Bot

```bash
npm start
```

---

## ⚙️ Bot Setup (Discord Developer Portal)

1. Create a new application at [discord.com/developers](https://discord.com/developers/applications)
2. Navigate to **Bot** → Enable the following **Privileged Intents**:
   - ✅ Presence Intent
   - ✅ Server Members Intent
   - ✅ Message Content Intent
3. Generate an **OAuth2 invite link** with these scopes and permissions:
   - **Scopes:** `bot`, `applications.commands`
   - **Permissions:** `Administrator` (or granularly: Manage Channels, View Channels, Send Messages, Read Message History)
4. Invite the bot to your tracking server

---

## 📋 Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/adduser <userid>` | Start tracking a Discord user | Administrator |
| `/removeuser <userid>` | Stop tracking and delete channels | Administrator |
| `/mutual <userid>` | Find mutual servers with a user | Administrator |

> All commands support **autocomplete** — type a user ID or username and get suggestions.

### How Tracking Works

When you run `/adduser`, the bot:
1. Creates a **private category** named `username.in | userid`
2. Creates an **#is-online** channel — status change notifications
3. Creates an **#audit** channel — full activity log (messages, VC, games, Spotify, etc.)
4. Begins real-time tracking across all shared servers

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Stalker Bot                       │
├──────────────────────┬──────────────────────────────┤
│    Bot Client        │     Self Client              │
│    (discord.js v14)  │     (selfbot-v13)             │
│                      │                              │
│  • Sends messages    │  • Presence tracking         │
│  • Slash commands    │  • Voice state events        │
│  • Channel mgmt     │  • Message monitoring         │
│  • Components V2 UI │  • Typing detection           │
│                      │  • Guild/member scanning     │
│                      │  • Gateway subscriptions     │
└──────────────────────┴──────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   state.json    │
              │  (Persistent)   │
              └─────────────────┘
```

---

## 🖥️ Console Output

The bot features a color-coded terminal logger with IST timestamps:

```
12:30:45 AM [BOT]       StalkerBot#1234 · ready
12:30:46 AM [SELF]      UserAccount#5678 · 42 guilds
12:30:46 AM [SELF]      Tracking 3 user(s): 123, 456, 789
12:30:47 AM [PRESENCE]  123456789  offline → online [desktop+mobile]
12:30:48 AM [VC]        joined General in My Server
12:31:02 AM [MSG]       username in My Server › #general
```

---

## 🔐 Security Notes

- **Never commit your `.env` file** — it contains authentication tokens
- The `.gitignore` is pre-configured to exclude `.env` and `state.json`
- `state.json` contains user IDs and channel mappings — treat it as sensitive
- The self client runs as **invisible** by default

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

<p align="center">
  <strong>Built with 🖤 and discord.js</strong><br/>
  <em>If you found this useful, consider giving it a ⭐</em>
</p>
