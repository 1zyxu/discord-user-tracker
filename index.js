require('dotenv').config();
const {
  Client: BotClient, GatewayIntentBits, Partials,
  PermissionsBitField, ChannelType,
  ContainerBuilder, TextDisplayBuilder,
  SectionBuilder, ThumbnailBuilder,
  SeparatorBuilder, SeparatorSpacingSize, MessageFlags
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');

// ─── State ────────────────────────────────────────────────────────────────────
const STATE_FILE = path.join(__dirname, 'data', 'state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { trackedUsers: {} }; } }
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
let state = loadState();

const lastActivities = {};
const msgCache = new Map();

// ─── Logger ───────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  cyan: '\x1b[36m', red: '\x1b[31m', gray: '\x1b[90m', white: '\x1b[37m',
};
function ts() {
  return `${c.gray}${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}${c.reset}`;
}
const log = {
  info: (tag, msg) => console.log(`${ts()} ${c.bold}${c.blue}[${tag}]${c.reset} ${msg}`),
  success: (tag, msg) => console.log(`${ts()} ${c.bold}${c.green}[${tag}]${c.reset} ${msg}`),
  warn: (tag, msg) => console.log(`${ts()} ${c.bold}${c.yellow}[${tag}]${c.reset} ${msg}`),
  error: (tag, msg) => console.log(`${ts()} ${c.bold}${c.red}[${tag}]${c.reset} ${msg}`),
  event: (tag, msg) => console.log(`${ts()} ${c.bold}${c.cyan}[${tag}]${c.reset} ${msg}`),
  dim: (tag, msg) => console.log(`${ts()} ${c.dim}[${tag}] ${msg}${c.reset}`),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function istTime() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit',
    second: '2-digit', hour12: true, day: '2-digit', month: 'short', year: 'numeric'
  });
}
function dur(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = [];
  if (h) p.push(`${h}h`);
  if (m) p.push(`${m}m`);
  p.push(`${sec}s`);
  return p.join(' ');
}
const STATUS_LABEL = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', offline: 'Offline', invisible: 'Offline' };
const STATUS_DOT = { online: '🟢', idle: '🟡', dnd: '🔴', offline: '⚫', invisible: '⚫' };
const STATUS_COL = { online: c.green, idle: c.yellow, dnd: c.red, offline: c.gray, invisible: c.gray };

// ─── BOT CLIENT — only sends messages ────────────────────────────────────────
const bot = new BotClient({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.GuildMember, Partials.User]
});

// ─── SELF CLIENT — handles all presence & event tracking ─────────────────────
const self = new SelfClient({ checkUpdate: false, intents: 53608447 });

// ─── Container V2 sender ─────────────────────────────────────────────────────
async function send(channelId, lines, thumb = null) {
  try {
    const ch = await bot.channels.fetch(channelId).catch(() => null);
    if (!ch) { log.warn('SEND', `Channel not found: ${channelId}`); return; }
    const text = lines.filter(l => l != null && l !== '').join('\n');
    if (!text.trim()) return;
    const container = new ContainerBuilder();
    if (thumb) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb).setDescription('avatar'))
      );
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
    }
    const msg = await ch.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    return msg; // Return message for ID tracking
  } catch (e) {
    log.error('SEND', e.message);
  }
}

// sendMulti — multiple blocks in ONE container, separated by separators
async function sendMulti(channelId, blocks, thumb = null) {
  try {
    const ch = await bot.channels.fetch(channelId).catch(() => null);
    if (!ch) { log.warn('SEND', `Channel not found: ${channelId}`); return; }

    const container = new ContainerBuilder();
    let first = true;

    for (const block of blocks) {
      const text = block.lines.filter(l => l != null && l !== '').join('\n');
      if (!text.trim()) continue;

      if (!first) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      }

      if (first && thumb) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb).setDescription('avatar'))
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
      }
      first = false;
    }

    const msg = await ch.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
    return msg; // Return message for ID tracking
  } catch (e) {
    log.error('SEND', e.message);
  }
}

// editMulti — edit existing message with new blocks
async function editMulti(channelId, messageId, blocks, thumb = null) {
  try {
    const ch = await bot.channels.fetch(channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(messageId).catch(() => null);
    if (!msg) return;

    const container = new ContainerBuilder();
    let first = true;

    for (const block of blocks) {
      const text = block.lines.filter(l => l != null && l !== '').join('\n');
      if (!text.trim()) continue;

      if (!first) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
      }

      if (first && thumb) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb).setDescription('avatar'))
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
      }
      first = false;
    }

    await msg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (e) {
    log.error('EDIT', e.message);
  }
}

async function getAvatar(userId) {
  try { return (await bot.users.fetch(userId, { force: false })).displayAvatarURL({ size: 128 }); }
  catch { return null; }
}

// ─── /adduser autocomplete ────────────────────────────────────────────────────
bot.on('interactionCreate', async interaction => {
  if (!interaction.isAutocomplete()) return;

  if (interaction.commandName === 'adduser') {
    const focused = interaction.options.getFocused().trim();
    if (!focused) return interaction.respond([]);
    try {
      // Try fetch by ID first
      let user = await bot.users.fetch(focused).catch(() => null);
      // If not found by ID, search by username in cache
      if (!user) {
        user = bot.users.cache.find(u =>
          u.username.toLowerCase().includes(focused.toLowerCase()) ||
          (u.globalName || '').toLowerCase().includes(focused.toLowerCase())
        ) || null;
      }
      if (user) {
        const displayName = user.globalName
          ? `${user.globalName} (${user.username})`
          : user.username;
        return interaction.respond([{ name: displayName, value: user.id }]);
      }
    } catch {}
    return interaction.respond([]);
  }

  if (interaction.commandName === 'removeuser') {
    const choices = [];
    for (const [userId, tracked] of Object.entries(state.trackedUsers)) {
      if (tracked.guildId !== interaction.guild.id) continue;
      // Use stored username from state.json — always available
      const username    = tracked.username || userId;
      const globalName  = tracked.globalName;
      const displayName = globalName ? `${globalName} (${username})` : username;
      choices.push({ name: displayName, value: userId });
    }
    return interaction.respond(choices.slice(0, 25));
  }
});

// ─── /adduser command ─────────────────────────────────────────────────────────
bot.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'adduser') return;
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator))
    return interaction.reply({ content: 'Admins only.', flags: MessageFlags.Ephemeral });

  const userId = interaction.options.getString('userid');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let targetUser;
  try { targetUser = await bot.users.fetch(userId); }
  catch { return interaction.editReply('Could not fetch that user. Check the ID.'); }

  if (state.trackedUsers[userId]) {
    // Verify channels still exist — if not, allow re-add
    const existing = state.trackedUsers[userId];
    const auditExists = await interaction.guild.channels.fetch(existing.auditChannelId).catch(() => null);
    if (auditExists) {
      return interaction.editReply(`Already tracking **${targetUser.username}**.`);
    } else {
      // Channels were deleted — clean up stale entry
      delete state.trackedUsers[userId];
      delete lastActivities[userId];
      saveState(state);
    }
  }

  const guild = interaction.guild;
  const category = await guild.channels.create({
    name: `${targetUser.username}.in | ${userId}`,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
    ]
  });
  const isOnlineCh = await guild.channels.create({ name: 'is-online', type: ChannelType.GuildText, parent: category.id });
  const auditCh = await guild.channels.create({ name: 'audit', type: ChannelType.GuildText, parent: category.id });

  state.trackedUsers[userId] = {
    guildId: guild.id, categoryId: category.id,
    isOnlineChannelId: isOnlineCh.id, auditChannelId: auditCh.id,
    username: targetUser.username,
    globalName: targetUser.globalName || null,
    lastStatus: 'offline', onlineSince: null,
    vcSince: null, vcChannelId: null, vcMessageId: null, vcMembers: {}, lastOnlineAlert: 0
  };
  saveState(state);

  // Try to get current status from self client
  let currentStatus = 'unknown';
  for (const [, g] of self.guilds.cache) {
    const m = g.members.cache.get(userId);
    if (m?.presence?.status) { currentStatus = m.presence.status; break; }
  }

  await interaction.editReply(`Now tracking **${targetUser.username}** (\`${userId}\`)\nCurrent status: **${currentStatus}**`);
  log.success('TRACK', `${c.white}${targetUser.username}${c.reset} ${c.gray}(${userId}) — status: ${currentStatus}${c.reset}`);
});

// ─── /removeuser command ──────────────────────────────────────────────────────
bot.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'removeuser') return;
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator))
    return interaction.reply({ content: 'Admins only.', flags: MessageFlags.Ephemeral });

  const userId = interaction.options.getString('userid');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!state.trackedUsers[userId])
    return interaction.editReply('That user is not being tracked.');

  const tracked = state.trackedUsers[userId];

  // Delete channels and category
  try {
    const guild = interaction.guild;
    for (const chId of [tracked.isOnlineChannelId, tracked.auditChannelId]) {
      const ch = guild.channels.cache.get(chId) || await guild.channels.fetch(chId).catch(() => null);
      if (ch) await ch.delete().catch(() => { });
    }
    const cat = guild.channels.cache.get(tracked.categoryId) || await guild.channels.fetch(tracked.categoryId).catch(() => null);
    if (cat) await cat.delete().catch(() => { });
  } catch { }

  // Remove from state
  delete state.trackedUsers[userId];
  delete lastActivities[userId];
  saveState(state);

  let username = userId;
  try { username = (await bot.users.fetch(userId)).username; } catch { }

  await interaction.editReply(`Stopped tracking **${username}** and deleted their channels.`);
  log.warn('REMOVE', `${c.white}${username}${c.reset} ${c.gray}(${userId})${c.reset}`);
});

// ─── /mutual command ──────────────────────────────────────────────────────────
bot.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'mutual') return;
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator))
    return interaction.reply({ content: 'Admins only.', flags: MessageFlags.Ephemeral });

  const targetId = interaction.options.getString('userid').trim();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Validate user exists
  let targetUser;
  try { targetUser = await bot.users.fetch(targetId); }
  catch { return interaction.editReply('Could not fetch that user. Check the ID.'); }

  // Find mutual servers — check all guilds the self client is in
  const mutuals = [];
  for (const [, guild] of self.guilds.cache) {
    const member = await guild.members.fetch(targetId).catch(() => null);
    if (member) {
      const memberCount = guild.memberCount || guild.members.cache.size;
      mutuals.push(`**${guild.name}** \`${guild.id}\` — ${memberCount} members`);
    }
  }

  if (mutuals.length === 0) {
    return interaction.editReply(`No mutual servers found with **${targetUser.username}** (\`${targetId}\`).`);
  }

  const lines = [
    `**Mutual Servers with ${targetUser.username} (${targetUser.globalName || targetUser.username})**`,
    `Found **${mutuals.length}** mutual server(s):`,
    '',
    ...mutuals
  ];

  // Split into chunks if too long (Discord 2000 char limit)
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if ((current + '\n' + line).length > 1900) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);

  await interaction.editReply(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    await interaction.followUp({ content: chunks[i], flags: MessageFlags.Ephemeral });
  }

  log.info('MUTUAL', `${c.white}${targetUser.username}${c.reset} — ${mutuals.length} mutual server(s)`);
});


async function handlePresence(userId, newStatus, activities, clientStatus) {
  if (!userId || !state.trackedUsers[userId]) return;

  const tracked = state.trackedUsers[userId];
  const oldStatus = tracked.lastStatus || 'offline';
  const now = Date.now();

  // ── Status changed ──────────────────────────────────────────────────────────
  if (newStatus !== oldStatus) {
    const avatar = await getAvatar(userId);
    log.event('PRESENCE', `${c.gray}${userId}${c.reset}  ${c.dim}${oldStatus}${c.reset} → ${STATUS_COL[newStatus] || c.white}${c.bold}${newStatus}${c.reset}${clientStatus ? ` ${c.dim}[${Object.keys(clientStatus).join('+')}]${c.reset}` : ''}`);

    // Came online
    if (['online', 'idle', 'dnd'].includes(newStatus)) {
      if (['offline', 'invisible'].includes(oldStatus)) tracked.onlineSince = now;
      await send(tracked.isOnlineChannelId, [
        `## ${STATUS_DOT[newStatus]} ${STATUS_LABEL[newStatus]}`,
        `-# ${istTime()}`
      ], avatar);
    }

    // Went offline
    if (['offline', 'invisible'].includes(newStatus)) {
      const sessionDur = tracked.onlineSince ? dur(now - tracked.onlineSince) : null;
      await send(tracked.isOnlineChannelId, [
        `## ${STATUS_DOT.offline} Offline`,
        sessionDur ? `**Session Duration:** ${sessionDur}` : null,
        `-# ${istTime()}`
      ], avatar);
      tracked.onlineSince = null;
    }

    // Build audit blocks — Status Changed + Platform + Custom Status in ONE container
    const auditBlocks = [];

    // Build platform line (detects newly added platforms)
    const platLine = buildPlatformLine(userId, clientStatus);

    // Save all active platforms AFTER building the line (so diff is correct)
    if (clientStatus && Object.keys(clientStatus).length) {
      tracked.lastPlatform = Object.keys(clientStatus).join(',');
    }

    // Block 1: Status Changed
    auditBlocks.push({
      lines: [
        `## Status Changed`,
        `**Before:** ${STATUS_DOT[oldStatus]} ${STATUS_LABEL[oldStatus]}`,
        `**After:** ${STATUS_DOT[newStatus]} ${STATUS_LABEL[newStatus]}`
      ]
    });

    // Block 2: timestamp + platform
    const footerLines = [`-# ${istTime()}`];
    if (platLine) footerLines.push(platLine);
    auditBlocks.push({ lines: footerLines });

    // Block 3: Custom status
    const customAct = (activities || []).find(a => a.type === 4 && (a.state || a.emoji));
    if (customAct) {
      const emoji = customAct.emoji?.name || '';
      const txt = customAct.state || '';
      auditBlocks.push({
        lines: [`**Custom Status:** ${[emoji, txt].filter(Boolean).join(' ')}`]
      });
    }

    await sendMulti(tracked.auditChannelId, auditBlocks, avatar);

    tracked.lastStatus = newStatus;
    saveState(state);
  }

  // ── Activity diff ────────────────────────────────────────────────────────────
  const newActs = (activities || []).map(a => ({
    type: a.type, name: a.name, details: a.details, state: a.state,
    timestamps: a.timestamps, assets: a.assets, url: a.url, emoji: a.emoji,
    sync_id: a.sync_id, syncId: a.syncId, party: a.party
  }));
  const prevActs = lastActivities[userId] || [];

  for (const act of newActs) {
    if (act.type === 4) continue; // custom status handled in status block
    if (prevActs.some(a => a.type === act.type && a.name === act.name)) continue;

    if (act.type === 0) {
      const party = act.party?.size ? `${act.party.size[0]}/${act.party.size[1]}` : null;
      const platLine = buildStoredPlatformLine(userId);
      const blocks = [{
        lines: [
          `## Playing  ${act.name}`,
          act.details ? `**Details:** ${act.details}` : null,
          act.state ? `**State:** ${act.state}` : null,
          party ? `**Party:** ${party}` : null,
          act.timestamps?.start ? `**Started:** <t:${Math.floor(act.timestamps.start / 1000)}:R>` : null,
        ]
      }];
      const footer = [`-# ${istTime()}`];
      if (platLine) footer.push(platLine);
      blocks.push({ lines: footer });
      await sendMulti(tracked.auditChannelId, blocks);
    } else if (act.type === 2 && act.name === 'Spotify') {
      // sync_id = Spotify track ID (raw WS field)
      const trackId = act.sync_id || act.syncId || null;
      const trackUrl = trackId ? `https://open.spotify.com/track/${trackId}` : null;

      // Album art: large_image comes as "spotify:ab67616d..." — extract the image hash
      let albumArt = null;
      const largeImg = act.assets?.large_image || act.assets?.largeImage || '';
      if (largeImg.startsWith('spotify:')) {
        const imgHash = largeImg.replace('spotify:', '');
        albumArt = `https://i.scdn.co/image/${imgHash}`;
      } else if (largeImg.startsWith('http')) {
        albumArt = largeImg;
      }

      const songLine = act.details
        ? (trackUrl ? `**Song:** [${act.details}](${trackUrl})` : `**Song:** ${act.details}`)
        : null;

      const platLine = buildStoredPlatformLine(userId);
      const songHeader = act.details
        ? (trackUrl ? `## Spotify  [${act.details}](${trackUrl})` : `## Spotify  ${act.details}`)
        : `## Spotify`;
      const blocks = [{
        lines: [
          songHeader,
          act.state ? `**Artist:** ${act.state}` : null,
          act.assets?.large_text || act.assets?.largeText
            ? `**Album:** ${act.assets.large_text || act.assets.largeText}` : null,
          act.timestamps?.start ? `**Started:** <t:${Math.floor(act.timestamps.start / 1000)}:R>` : null,
        ]
      }];
      const footerLines = [`-# ${istTime()}`];
      if (platLine) footerLines.push(platLine);
      blocks.push({ lines: footerLines });
      await sendMulti(tracked.auditChannelId, blocks, albumArt);
    } else if (act.type === 1) {
      const platLine = buildStoredPlatformLine(userId);
      const titleHeader = act.url ? `## [Streaming](${act.url})  ${act.name}` : `## Streaming  ${act.name}`;
      const blocks = [{
        lines: [
          titleHeader,
          act.details ? `**Details:** ${act.details}` : null,
        ]
      }];
      const footer = [`-# ${istTime()}`];
      if (platLine) footer.push(platLine);
      blocks.push({ lines: footer });
      await sendMulti(tracked.auditChannelId, blocks);
    } else if (act.type === 3) {
      const platLine = buildStoredPlatformLine(userId);
      const blocks = [{
        lines: [
          `## Watching  ${act.name}`,
          act.details ? `**Details:** ${act.details}` : null,
        ]
      }];
      const footer = [`-# ${istTime()}`];
      if (platLine) footer.push(platLine);
      blocks.push({ lines: footer });
      await sendMulti(tracked.auditChannelId, blocks);
    } else if (act.type === 5) {
      const platLine = buildStoredPlatformLine(userId);
      const blocks = [{ lines: [`## Competing  ${act.name}`] }];
      const footer = [`-# ${istTime()}`];
      if (platLine) footer.push(platLine);
      blocks.push({ lines: footer });
      await sendMulti(tracked.auditChannelId, blocks);
    }
  }

  for (const act of prevActs) {
    if (act.type === 4) continue;
    if (!newActs.some(a => a.type === act.type && a.name === act.name)) {
      const typeLabel = { 0: 'Game', 1: 'Stream', 2: 'Spotify', 3: 'Watch', 5: 'Competition' };
      const platLine = buildStoredPlatformLine(userId);
      const blocks = [{
        lines: [`## Stopped  ${act.name}`]
      }];
      const footer = [`-# ${istTime()}`];
      if (platLine) footer.push(platLine);
      blocks.push({ lines: footer });
      await sendMulti(tracked.auditChannelId, blocks);
    }
  }

  lastActivities[userId] = newActs;
}

// ─── Platform helpers ─────────────────────────────────────────────────────────
const PLATFORM_LABEL = { desktop: 'Desktop', mobile: 'Mobile', web: 'Web', console: 'Console' };
const PLATFORM_ICON  = { desktop: '🖥️ ', mobile: '📱 ', web: '🌐 ', console: '🎮 ' };

function getPlatformLabel(clientStatus) {
  if (!clientStatus || !Object.keys(clientStatus).length) return null;
  return Object.keys(clientStatus)
    .map(p => `${PLATFORM_ICON[p] || '❓'} ${PLATFORM_LABEL[p] || p}`)
    .join('  ·  ');
}

// Returns a platform block line for use after a separator
// Shows current platforms and, if platforms changed, what's new
function buildPlatformLine(userId, clientStatus) {
  const current = clientStatus ? Object.keys(clientStatus) : [];
  const prev = (state.trackedUsers[userId]?.lastPlatform || '').split(',').map(s => s.trim()).filter(Boolean);

  const currentLabel = current.length
    ? current.map(p => `${PLATFORM_ICON[p] || '❓'} ${PLATFORM_LABEL[p] || p}`).join('  ·  ')
    : null;

  // Find newly added platforms (present now but not before)
  const newlyAdded = current.filter(p => !prev.includes(p));
  const newlyAddedLabel = newlyAdded.length
    ? newlyAdded.map(p => `${PLATFORM_ICON[p] || '❓'} ${PLATFORM_LABEL[p] || p}`).join('  ·  ')
    : null;

  if (!currentLabel) return null;

  // If platforms changed and there were previous platforms, show what's new
  if (newlyAddedLabel && prev.length > 0 && newlyAdded.length < current.length) {
    return `-# ${currentLabel}   *(${newlyAddedLabel} just connected)*`;
  }
  return `-# ${currentLabel}`;
}

// Returns platform line using stored lastPlatform (for events without live clientStatus)
function buildStoredPlatformLine(userId) {
  const plat = state.trackedUsers[userId]?.lastPlatform;
  if (!plat) return null;
  const platforms = plat.split(',').map(s => s.trim()).filter(Boolean);
  if (!platforms.length) return null;
  const label = platforms.map(p => `${PLATFORM_ICON[p] || '❓'} ${PLATFORM_LABEL[p] || p}`).join('  ·  ');
  return `-# ${label}`;
}

// ─── VC Message Builder ───────────────────────────────────────────────────────
const vcUpdateCooldown = new Map(); // userId -> lastUpdateTime
const vcUpdateIntervals = new Map(); // userId -> intervalId

async function updateVCMessage(userId, isLeavingVC = false) {
  const tracked = state.trackedUsers[userId];
  
  // If leaving, we need the channelId before it's cleared
  const channelId = tracked.vcChannelId;
  if (!tracked || !channelId) return;

  const now = Date.now();
  const avatar = await getAvatar(userId);
  
  // Fetch channel info
  let channel, guild, channelName, guildName, userLimit = null;
  try {
    for (const [, g] of self.guilds.cache) {
      const ch = g.channels.cache.get(channelId);
      if (ch) {
        channel = ch;
        guild = g;
        channelName = ch.name;
        guildName = g.name;
        userLimit = ch.userLimit || null;
        break;
      }
    }
  } catch (e) {
    log.error('VC', `Failed to fetch channel: ${e.message}`);
    return;
  }

  if (!channel || !guild) {
    log.warn('VC', `Channel ${channelId} not found in any guild`);
    return;
  }

  // Initialize vcMembers if not exists
  if (!tracked.vcMembers) tracked.vcMembers = {};

  // Get all members currently in this VC (excluding tracked user)
  const currentMembers = channel.members || new Map();
  const otherMembers = new Map([...currentMembers].filter(([id]) => id !== userId));
  const memberCount = otherMembers.size;
  const limitText = userLimit && userLimit > 0 ? `${memberCount}/${userLimit}` : `${memberCount}`;

  // Update vcMembers tracking
  for (const [memberId, member] of otherMembers) {
    if (!tracked.vcMembers[memberId]) {
      // New member joined
      const joinTime = member.voice?.joinedTimestamp || now;
      tracked.vcMembers[memberId] = { 
        joinedAt: joinTime,
        leftAt: null,
        totalTime: 0 // Total time across all sessions
      };
    } else if (tracked.vcMembers[memberId].leftAt) {
      // Member rejoined - add previous session time to total
      const prevSessionTime = tracked.vcMembers[memberId].leftAt - tracked.vcMembers[memberId].joinedAt;
      tracked.vcMembers[memberId].totalTime += prevSessionTime;
      tracked.vcMembers[memberId].joinedAt = now;
      tracked.vcMembers[memberId].leftAt = null;
    }
  }

  // Mark members who left
  for (const memberId in tracked.vcMembers) {
    if (!otherMembers.has(memberId) && !tracked.vcMembers[memberId].leftAt) {
      tracked.vcMembers[memberId].leftAt = now;
    }
  }

  // If leaving, send final history and delete live message
  if (isLeavingVC) {
    // Stop the auto-update interval
    const intervalId = vcUpdateIntervals.get(userId);
    if (intervalId) {
      clearInterval(intervalId);
      vcUpdateIntervals.delete(userId);
    }
    
    // Delete the live VC message
    if (tracked.vcMessageId) {
      try {
        const ch = await bot.channels.fetch(tracked.auditChannelId).catch(() => null);
        if (ch) {
          const msg = await ch.messages.fetch(tracked.vcMessageId).catch(() => null);
          if (msg) await msg.delete().catch(() => {});
        }
      } catch {}
    }
    
    // Send detailed history
    await sendVCHistory(userId, tracked, guildName, channelId, guild.id, avatar);
    return;
  }

  // Build live VC status message
  const memberLines = [];
  const activeMemberIds = [];

  for (const memberId in tracked.vcMembers) {
    if (!tracked.vcMembers[memberId].leftAt) {
      activeMemberIds.push(memberId);
    }
  }

  // Active members with timers
  if (activeMemberIds.length > 0) {
    memberLines.push(`**Active (${activeMemberIds.length}):**`);
    for (const memberId of activeMemberIds) {
      const memberData = tracked.vcMembers[memberId];
      const currentTime = now - memberData.joinedAt;
      const totalTime = memberData.totalTime + currentTime;
      const timeStr = dur(totalTime);
      memberLines.push(`- <@${memberId}> - ${timeStr}`);
    }
  } else {
    memberLines.push('*No other members in voice channel*');
  }

  const sessionDuration = tracked.vcSince ? dur(now - tracked.vcSince) : '0s';
  const isStage = channel.type === ChannelType.GuildStageVoice;
  const channelType = isStage ? 'Stage' : 'Voice';

  // Block 1: header
  const blocks = [{
    lines: [
      `## [${channelType}](https://discord.com/channels/${guild.id}/${channelId})`,
      `**Server:** ${guildName}`,
      `**Channel:** <#${channelId}>`,
      `**Members:** ${limitText}`
    ]
  }];

  // Block 2: member list
  blocks.push({ lines: memberLines });

  // Block 3: footer (timestamp + session duration)
  const platLine = buildStoredPlatformLine(userId);
  const footerLines = [`-# ${istTime()}  **Session Duration:** ${sessionDuration}`];
  if (platLine) footerLines.push(platLine);
  blocks.push({ lines: footerLines });

  // Send or edit message
  if (tracked.vcMessageId) {
    await editMulti(tracked.auditChannelId, tracked.vcMessageId, blocks, avatar);
  } else {
    const msg = await sendMulti(tracked.auditChannelId, blocks, avatar);
    if (msg) {
      tracked.vcMessageId = msg.id;
      
      // Start auto-update interval (every 10 seconds)
      if (!vcUpdateIntervals.has(userId)) {
        const intervalId = setInterval(async () => {
          // Check if user is still in VC
          if (state.trackedUsers[userId]?.vcChannelId) {
            await updateVCMessage(userId, false);
          } else {
            // User left, clear interval
            clearInterval(intervalId);
            vcUpdateIntervals.delete(userId);
          }
        }, 10000); // 10 seconds
        
        vcUpdateIntervals.set(userId, intervalId);
      }
    }
  }
  
  saveState(state);
}

// Send final VC history when user leaves
async function sendVCHistory(userId, tracked, guildName, channelId, guildId, avatar) {
  const now = Date.now();
  const sessionDuration = tracked.vcSince ? dur(now - tracked.vcSince) : '0s';
  
  const historyLines = [];
  const allMembers = Object.entries(tracked.vcMembers);
  
  if (allMembers.length > 0) {
    historyLines.push(`**Members Encountered:**`);
    
    // Sort by total time (highest first)
    allMembers.sort((a, b) => {
      const aTotal = a[1].totalTime + (a[1].leftAt ? (a[1].leftAt - a[1].joinedAt) : 0);
      const bTotal = b[1].totalTime + (b[1].leftAt ? (b[1].leftAt - b[1].joinedAt) : 0);
      return bTotal - aTotal;
    });
    
    for (const [memberId, data] of allMembers) {
      const finalTime = data.leftAt ? (data.leftAt - data.joinedAt) : (now - data.joinedAt);
      const totalTime = data.totalTime + finalTime;
      const timeStr = dur(totalTime);
      const status = data.leftAt ? ` (Left)` : '';
      historyLines.push(`- <@${memberId}> - ${timeStr}${status}`);
    }
  } else {
    historyLines.push('*No other members encountered*');
  }

  const blocks = [{
    lines: [
      `## Voice Session Details`,
      `**Server:** ${guildName}`,
      `**Channel:** <#${channelId}>`,
      `**Total Duration:** ${sessionDuration}`,
      `[Join](https://discord.com/channels/${guildId}/${channelId})`,
      `-# ${istTime()}`
    ]
  }];

  blocks.push({ lines: historyLines });

  const platLine = buildStoredPlatformLine(userId);
  if (platLine) blocks.push({ lines: [platLine] });

  await sendMulti(tracked.auditChannelId, blocks, avatar);
}
const presenceDedup = new Map();
self.ws.on('PRESENCE_UPDATE', (data) => {
  const userId    = data.user?.id;
  const newStatus = data.status || 'offline';
  if (!userId || !state.trackedUsers[userId]) return;

  // Dedup: same status + same activities within 10s = skip
  const actKey = (data.activities || []).map(a => `${a.type}:${a.name}`).sort().join('|');
  const key    = `${userId}:${newStatus}:${actKey}`;
  const last   = presenceDedup.get(key) || 0;
  if (Date.now() - last < 10000) return;
  presenceDedup.set(key, Date.now());

  handlePresence(userId, newStatus, data.activities, data.client_status);
});

// ─── VOICE STATE — self client sees all servers it's in ───────────────────────
self.on('voiceStateUpdate', async (oldState, newState) => {
  const memberId = newState?.member?.user?.id || newState?.member?.id
    || oldState?.member?.user?.id || oldState?.member?.id;
  
  const oldCh = oldState?.channelId;
  const newCh = newState?.channelId;

  // Handle tracked user's own VC state
  if (memberId && state.trackedUsers[memberId]) {
    const tracked = state.trackedUsers[memberId];
    const now = Date.now();

    // Joined VC
    if (!oldCh && newCh) {
      tracked.vcSince = now;
      tracked.vcChannelId = newCh;
      tracked.vcMembers = {}; // Reset member tracking
      const guildName = newState?.guild?.name || 'Unknown';
      const chName = newState?.channel?.name || newCh;
      log.event('VC', `${c.green}joined${c.reset} ${chName} in ${guildName}`);
      
      // Invisible detection via VC join — 10 min cooldown
      if ((tracked.lastStatus === 'offline' || tracked.lastStatus === 'invisible') &&
          now - (tracked.lastInvisibleAlert || 0) > 10 * 60 * 1000) {
        tracked.lastInvisibleAlert = now;
        const avatar = await getAvatar(memberId);
        await send(tracked.isOnlineChannelId, [
          `## Possibly Invisible`,
          `User appears offline but just joined voice`,
          `-# ${istTime()}`
        ], avatar);
      }
      
      // Send simple join message
      const avatar = await getAvatar(memberId);
      const blocks = [{
        lines: [
          `## [Joined Voice](https://discord.com/channels/${newState.guild.id}/${newCh})`,
          `**Server:** ${guildName}`,
          `**Channel:** <#${newCh}>`,
          `-# ${istTime()}`
        ]
      }];
      const platLine = buildStoredPlatformLine(memberId);
      if (platLine) blocks.push({ lines: [platLine] });
      await sendMulti(tracked.auditChannelId, blocks, avatar);
      
      saveState(state);
      await updateVCMessage(memberId);
    }
    // Left VC
    else if (oldCh && !newCh) {
      const chName = oldState?.channel?.name || oldCh;
      const sessionDur = tracked.vcSince ? dur(now - tracked.vcSince) : null;
      log.event('VC', `${c.red}left${c.reset} ${chName}`);
      
      // Send simple left message
      const avatar = await getAvatar(memberId);
      const guildName = oldState?.guild?.name || 'Unknown';
      const blocks = [{
        lines: [
          `## [Voice Left${sessionDur ? ` (${sessionDur})` : ''}](https://discord.com/channels/${oldState.guild.id}/${oldCh})`,
          `**Server:** ${guildName}`,
          `**Channel:** <#${oldCh}>`,
          `-# ${istTime()}`
        ]
      }];
      const platLine = buildStoredPlatformLine(memberId);
      if (platLine) blocks.push({ lines: [platLine] });
      await sendMulti(tracked.auditChannelId, blocks, avatar);
      
      // Send detailed history
      await updateVCMessage(memberId, true);
      
      // Clear VC state after updating message
      tracked.vcSince = null;
      tracked.vcChannelId = null;
      tracked.vcMessageId = null;
      tracked.vcMembers = {};
      saveState(state);
    }
    // Moved VC
    else if (oldCh && newCh && oldCh !== newCh) {
      const oldChName = oldState?.channel?.name || oldCh;
      const newChName = newState?.channel?.name || newCh;
      log.event('VC', `moved ${oldChName} → ${c.cyan}${newChName}${c.reset}`);
      
      // Send left message for old channel
      const sessionDur = tracked.vcSince ? dur(now - tracked.vcSince) : null;
      const avatar = await getAvatar(memberId);
      const oldGuildName = oldState?.guild?.name || 'Unknown';
      let blocks = [{
        lines: [
          `## [Voice Left${sessionDur ? ` (${sessionDur})` : ''}](https://discord.com/channels/${oldState.guild.id}/${oldCh})`,
          `**Server:** ${oldGuildName}`,
          `**Channel:** <#${oldCh}>`,
          `-# ${istTime()}`
        ]
      }];
      let platLine = buildStoredPlatformLine(memberId);
      if (platLine) blocks.push({ lines: [platLine] });
      await sendMulti(tracked.auditChannelId, blocks, avatar);
      
      // Send history for old channel
      await updateVCMessage(memberId, true);
      
      // Reset for new channel
      tracked.vcSince = now;
      tracked.vcChannelId = newCh;
      tracked.vcMembers = {};
      tracked.vcMessageId = null;
      
      // Send join message for new channel
      const newGuildName = newState?.guild?.name || 'Unknown';
      blocks = [{
        lines: [
          `## [Joined Voice](https://discord.com/channels/${newState.guild.id}/${newCh})`,
          `**Server:** ${newGuildName}`,
          `**Channel:** <#${newCh}>`,
          `-# ${istTime()}`
        ]
      }];
      platLine = buildStoredPlatformLine(memberId);
      if (platLine) blocks.push({ lines: [platLine] });
      await sendMulti(tracked.auditChannelId, blocks, avatar);
      
      saveState(state);
      await updateVCMessage(memberId);
    }
    // State changes (mute, deafen, video, etc.) - same channel
    else if (oldCh && newCh && oldCh === newCh) {
      const avatar = await getAvatar(memberId);
      const guildName = newState?.guild?.name || 'Unknown';
      
      // Check if deafen state changed (to skip redundant mute messages)
      const deafenChanged = oldState.selfDeaf !== newState.selfDeaf;
      const serverDeafenChanged = oldState.serverDeaf !== newState.serverDeaf;
      
      // Self Mute (skip if deafen also changed, since deafen includes mute)
      if (oldState.selfMute !== newState.selfMute && !deafenChanged) {
        const action = newState.selfMute ? 'Muted' : 'Unmuted';
        log.event('VC', `${newState.selfMute ? c.red : c.green}${action.toLowerCase()}${c.reset}`);
        const platLine = buildStoredPlatformLine(memberId);
        const blocks = [{ lines: [`## ${action} (Self)`, `**Server:** ${guildName}`, `**Channel:** <#${newCh}>`] }];
        const footer = [`-# ${istTime()}`]; if (platLine) footer.push(platLine);
        blocks.push({ lines: footer });
        await sendMulti(tracked.auditChannelId, blocks, avatar);
      }
      
      // Self Deafen
      if (deafenChanged) {
        const action = newState.selfDeaf ? 'Deafened' : 'Undeafened';
        log.event('VC', `${newState.selfDeaf ? c.red : c.green}${action.toLowerCase()}${c.reset}`);
        const platLine = buildStoredPlatformLine(memberId);
        const blocks = [{ lines: [`## ${action} (Self)`, `**Server:** ${guildName}`, `**Channel:** <#${newCh}>`] }];
        const footer = [`-# ${istTime()}`]; if (platLine) footer.push(platLine);
        blocks.push({ lines: footer });
        await sendMulti(tracked.auditChannelId, blocks, avatar);
      }
      
      // Server Mute (by admin) - skip if server deafen also changed
      if (oldState.serverMute !== newState.serverMute && !serverDeafenChanged) {
        const action = newState.serverMute ? 'Server Muted' : 'Server Unmuted';
        log.event('VC', `${newState.serverMute ? c.red : c.green}${action.toLowerCase()}${c.reset} by admin`);
        const platLine = buildStoredPlatformLine(memberId);
        const blocks = [{ lines: [`## ${action}`, `**Server:** ${guildName}`, `**Channel:** <#${newCh}>`, `*By server admin*`] }];
        const footer = [`-# ${istTime()}`]; if (platLine) footer.push(platLine);
        blocks.push({ lines: footer });
        await sendMulti(tracked.auditChannelId, blocks, avatar);
      }
      
      // Server Deafen (by admin)
      if (serverDeafenChanged) {
        const action = newState.serverDeaf ? 'Server Deafened' : 'Server Undeafened';
        log.event('VC', `${newState.serverDeaf ? c.red : c.green}${action.toLowerCase()}${c.reset} by admin`);
        const platLine = buildStoredPlatformLine(memberId);
        const blocks = [{ lines: [`## ${action}`, `**Server:** ${guildName}`, `**Channel:** <#${newCh}>`, `*By server admin*`] }];
        const footer = [`-# ${istTime()}`]; if (platLine) footer.push(platLine);
        blocks.push({ lines: footer });
        await sendMulti(tracked.auditChannelId, blocks, avatar);
      }
      
      // Video
      if (oldState.selfVideo !== newState.selfVideo) {
        const action = newState.selfVideo ? 'Video Started' : 'Video Stopped';
        log.event('VC', `${newState.selfVideo ? c.green : c.red}${action.toLowerCase()}${c.reset}`);
        const platLine = buildStoredPlatformLine(memberId);
        const blocks = [{ lines: [`## ${action}`, `**Server:** ${guildName}`, `**Channel:** <#${newCh}>`] }];
        const footer = [`-# ${istTime()}`]; if (platLine) footer.push(platLine);
        blocks.push({ lines: footer });
        await sendMulti(tracked.auditChannelId, blocks, avatar);
      }
      
      // Screen Share / Streaming
      if (oldState.streaming !== newState.streaming) {
        const action = newState.streaming ? 'Screen Share Started' : 'Screen Share Stopped';
        log.event('VC', `${newState.streaming ? c.green : c.red}${action.toLowerCase()}${c.reset}`);
        const platLine = buildStoredPlatformLine(memberId);
        const blocks = [{ lines: [`## ${action}`, `**Server:** ${guildName}`, `**Channel:** <#${newCh}>`] }];
        const footer = [`-# ${istTime()}`]; if (platLine) footer.push(platLine);
        blocks.push({ lines: footer });
        await sendMulti(tracked.auditChannelId, blocks, avatar);
      }
      
      // Stage Channel - Suppress (audience/speaker)
      if (oldState.suppress !== newState.suppress) {
        const action = newState.suppress ? 'Moved to Audience' : 'Became Speaker';
        log.event('VC', `${action.toLowerCase()}`);
        const platLine = buildStoredPlatformLine(memberId);
        const blocks = [{ lines: [`## ${action}`, `**Server:** ${guildName}`, `**Channel:** <#${newCh}>`] }];
        const footer = [`-# ${istTime()}`]; if (platLine) footer.push(platLine);
        blocks.push({ lines: footer });
        await sendMulti(tracked.auditChannelId, blocks, avatar);
      }
    }
  }

  // Check if any tracked user is in the affected VC channels
  // This catches when OTHER members join/leave a tracked user's VC
  for (const [userId, tracked] of Object.entries(state.trackedUsers)) {
    if (!tracked.vcChannelId) continue;
    
    // Skip if this is the tracked user themselves (already handled above)
    if (userId === memberId) continue;
    
    // Someone joined or left the tracked user's VC
    if (oldCh === tracked.vcChannelId || newCh === tracked.vcChannelId) {
      await updateVCMessage(userId);
    }
  }
});

// ─── MESSAGES — self sees all messages in all its servers ─────────────────────
self.on('messageCreate', async msg => {
  const authorId = msg.author?.id;
  if (!authorId || !state.trackedUsers[authorId]) return;

  const tracked = state.trackedUsers[authorId];
  const avatar = await getAvatar(authorId);
  const guildId = msg.guild?.id || msg.guildId;
  const channelId = msg.channel?.id || msg.channelId;

  // Check if this is a VC text message
  let isVCMessage = false;
  try {
    const channel = msg.channel || await self.channels.fetch(channelId).catch(() => null);
    if (channel && (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice)) {
      isVCMessage = true;
    }
  } catch {}

  // Invisible detection — user is "offline" but sent a message
  // 10 min cooldown so it doesn't spam
  if ((tracked.lastStatus === 'offline' || tracked.lastStatus === 'invisible') &&
      Date.now() - (tracked.lastInvisibleAlert || 0) > 10 * 60 * 1000) {
    tracked.lastInvisibleAlert = Date.now();
    saveState(state);
    log.warn('INVISIBLE', `${c.yellow}${authorId}${c.reset} sent message while offline — possibly invisible`);
    await send(tracked.isOnlineChannelId, [
      `## Possibly Invisible`,
      `User appears offline but just sent a message`,
      `-# ${istTime()}`
    ], avatar);
  }

  const channelTypeLabel = isVCMessage ? 'VC Chat' : 'Message';
  log.event('MSG', `${c.white}${msg.author?.username || authorId}${c.reset} in ${c.cyan}${msg.guild?.name || 'DM'}${c.reset} › ${c.dim}#${msg.channel?.name || 'unknown'}${c.reset}${isVCMessage ? ' (VC)' : ''}`);

  msgCache.set(msg.id, msg.content || '');
  if (msgCache.size > 500) msgCache.delete(msgCache.keys().next().value);

  const jumpUrl = `https://discord.com/channels/${guildId || '@me'}/${channelId}/${msg.id}`;
  const blocks = [{
    lines: [
      `## [${channelTypeLabel} Sent](${jumpUrl})`,
      `**Server:** ${msg.guild?.name || 'DM'}`,
      `**Channel:** <#${channelId}>`
    ]
  }];

  // Block 2: content / attachments
  const contentLines = [];
  if (msg.content) contentLines.push(`> ${msg.content.slice(0, 500)}`);
  if (msg.attachments?.size)
    contentLines.push(`**Attachments:** ${[...msg.attachments.values()].map(a => `[${a.name}](${a.url})`).join(', ')}`);
  if (contentLines.length) blocks.push({ lines: contentLines });

  // Block 3: timestamp + platform
  const platLine = buildStoredPlatformLine(authorId);
  const footerLines = [`-# ${istTime()}`];
  if (platLine) footerLines.push(platLine);
  blocks.push({ lines: footerLines });

  await sendMulti(tracked.auditChannelId, blocks, avatar);
});

self.on('messageUpdate', async (oldMsg, newMsg) => {
  const authorId = newMsg.author?.id;
  if (!authorId || !state.trackedUsers[authorId]) return;
  if ((oldMsg.content || '') === (newMsg.content || '')) return;
  const tracked = state.trackedUsers[authorId];
  const avatar = await getAvatar(authorId);
  const guildId = newMsg.guild?.id || newMsg.guildId;
  const channelId = newMsg.channel?.id || newMsg.channelId;
  log.event('EDIT', `${c.white}${newMsg.author?.username || authorId}${c.reset} in ${c.cyan}${newMsg.guild?.name || 'DM'}${c.reset}`);
  
  const jumpUrl = `https://discord.com/channels/${guildId || '@me'}/${channelId}/${newMsg.id}`;
  const blocks = [{
    lines: [
      `## [Message Edited](${jumpUrl})`,
      `**Server:** ${newMsg.guild?.name || 'DM'}`,
      `**Channel:** <#${channelId}>`,
      `**Before:**\n> ${(oldMsg.content || msgCache.get(oldMsg.id) || '*(unknown)*').slice(0, 300)}`,
      `**After:**\n> ${(newMsg.content || '').slice(0, 300)}`
    ]
  }];
  const platLine = buildStoredPlatformLine(authorId);
  const footerLines = [`-# ${istTime()}`];
  if (platLine) footerLines.push(platLine);
  blocks.push({ lines: footerLines });
  await sendMulti(tracked.auditChannelId, blocks, avatar);
  msgCache.set(newMsg.id, newMsg.content || '');
});

self.on('messageDelete', async msg => {
  const authorId = msg.author?.id;
  if (!authorId || !state.trackedUsers[authorId]) return;
  const tracked = state.trackedUsers[authorId];
  const avatar = await getAvatar(authorId);
  log.event('DEL', `${c.white}${msg.author?.username || authorId}${c.reset} in ${c.cyan}${msg.guild?.name || 'DM'}${c.reset}`);
  
  const chId = msg.channel?.id || msg.channelId;
  const guildId = msg.guild?.id || msg.guildId;
  const blocks = [{
    lines: [
      `## Message Deleted`,
      `**Server:** ${msg.guild?.name || 'DM'}`,
      `**Channel:** <#${chId}>`
    ]
  }];

  const content = (msg.content || msgCache.get(msg.id) || '*(not cached)*').slice(0, 500);
  blocks.push({ lines: [`> ${content}`] });

  const platLine = buildStoredPlatformLine(authorId);
  const footerLines = [`-# ${istTime()}`];
  if (platLine) footerLines.push(platLine);
  blocks.push({ lines: footerLines });

  await sendMulti(tracked.auditChannelId, blocks, avatar);
  msgCache.delete(msg.id);
});

// ─── TYPING ───────────────────────────────────────────────────────────────────
self.on('typingStart', async typing => {
  const userId = typing.user?.id;
  if (!userId || !state.trackedUsers[userId]) return;
  const tracked = state.trackedUsers[userId];
  const now = Date.now();

  // Invisible detection via typing — 10 min cooldown
  if ((tracked.lastStatus === 'offline' || tracked.lastStatus === 'invisible') &&
    now - (tracked.lastInvisibleAlert || 0) > 10 * 60 * 1000) {
    tracked.lastInvisibleAlert = now;
    saveState(state);
    const avatar = await getAvatar(userId);
    await send(tracked.isOnlineChannelId, [
      `## Possibly Invisible`,
      `User appears offline but is typing`,
      `-# ${istTime()}`
    ], avatar);
    return;
  }

  if (now - (tracked.lastOnlineAlert || 0) < 30000) return;
  tracked.lastOnlineAlert = now;
  saveState(state);
  
  const blocks = [{
    lines: [
      `## Typing`,
      `**Server:** ${typing.guild?.name || 'DM'}`,
      `**Channel:** <#${typing.channel?.id}>`
    ]
  }];
  const platLine = buildStoredPlatformLine(userId);
  const footerLines = [`-# ${istTime()}`];
  if (platLine) footerLines.push(platLine);
  blocks.push({ lines: footerLines });
  await sendMulti(tracked.auditChannelId, blocks);
});

// ─── USER UPDATE — via both bot and self for reliability ─────────────────────
async function handleUserUpdate(oldUser, newUser) {
  if (!state.trackedUsers[newUser.id]) return;
  const tracked = state.trackedUsers[newUser.id];
  const avatar  = newUser.displayAvatarURL({ size: 128 });

  // Always keep username/globalName in sync
  tracked.username   = newUser.username;
  tracked.globalName = newUser.globalName || null;
  saveState(state);
  if (oldUser.avatar !== newUser.avatar) {
    log.event('PROFILE', `${c.white}${newUser.username}${c.reset} changed avatar`);
    const platLine = buildStoredPlatformLine(newUser.id);
    const blocks = [{ lines: [`## Avatar Changed`, `**Old:** ${oldUser.displayAvatarURL({ size: 128 })}`, `**New:** ${avatar}`] }];
    const footer = [`-# ${istTime()}`];
    if (platLine) footer.push(platLine);
    blocks.push({ lines: footer });
    await sendMulti(tracked.auditChannelId, blocks, avatar);
  }
  if (oldUser.username !== newUser.username) {
    log.event('PROFILE', `${c.dim}${oldUser.username}${c.reset} → ${c.white}${newUser.username}${c.reset}`);
    const platLine = buildStoredPlatformLine(newUser.id);
    const blocks = [{ lines: [`## Username Changed`, `**Before:** ${oldUser.username}`, `**After:** ${newUser.username}`] }];
    const footer = [`-# ${istTime()}`];
    if (platLine) footer.push(platLine);
    blocks.push({ lines: footer });
    await sendMulti(tracked.auditChannelId, blocks, avatar);
  }
  if (oldUser.globalName !== newUser.globalName) {
    const platLine = buildStoredPlatformLine(newUser.id);
    const blocks = [{ lines: [`## Display Name Changed`, `**Before:** ${oldUser.globalName || '*(none)*'}`, `**After:** ${newUser.globalName || '*(none)*'}`] }];
    const footer = [`-# ${istTime()}`];
    if (platLine) footer.push(platLine);
    blocks.push({ lines: footer });
    await sendMulti(tracked.auditChannelId, blocks, avatar);
  }
}
bot.on('userUpdate', (o, n) => handleUserUpdate(o, n));
self.on('userUpdate', (o, n) => handleUserUpdate(o, n));

// ─── BOT READY ────────────────────────────────────────────────────────────────
bot.once('clientReady', async () => {
  console.log('');
  console.log(`  ${c.bold}${c.blue}STALKER BOT${c.reset}`);
  console.log(`  ${'─'.repeat(32)}`);
  log.success('BOT', `${c.white}${bot.user.tag}${c.reset} ${c.gray}· ready${c.reset}`);

  // Verify all tracked users' channels exist — remove stale entries
  // Also fetch and store username if missing
  for (const [userId, tracked] of Object.entries(state.trackedUsers)) {
    const guild    = bot.guilds.cache.get(tracked.guildId);
    const audit    = await guild?.channels.fetch(tracked.auditChannelId).catch(() => null);
    const isOnline = await guild?.channels.fetch(tracked.isOnlineChannelId).catch(() => null);
    const category = await guild?.channels.fetch(tracked.categoryId).catch(() => null);

    if (!guild || !audit || !isOnline || !category) {
      log.warn('STARTUP', `Stale tracking entry for ${userId} — channels missing, removing`);
      delete state.trackedUsers[userId];
      delete lastActivities[userId];
      continue;
    }

    // Fetch username if not stored
    if (!tracked.username) {
      const user = await bot.users.fetch(userId).catch(() => null);
      if (user) {
        tracked.username   = user.username;
        tracked.globalName = user.globalName || null;
        log.dim('STARTUP', `Fetched username for ${userId}: ${user.username}`);
      }
    }

    // Initialize vcMembers if missing (for existing tracked users)
    if (!tracked.vcMembers) {
      tracked.vcMembers = {};
    }
    if (!tracked.vcMessageId) {
      tracked.vcMessageId = null;
    }
  }
  saveState(state);
});

// ─── SELF READY ───────────────────────────────────────────────────────────────
self.once('ready', async () => {
  log.success('SELF', `${c.white}${self.user.tag}${c.reset} ${c.gray}· ${self.guilds.cache.size} guilds${c.reset}`);

  const tracked = Object.keys(state.trackedUsers);
  log.info('SELF', `Tracking ${c.bold}${tracked.length}${c.reset} user(s): ${c.cyan}${tracked.join(', ')}${c.reset}`);

  // For each tracked user, find shared guilds, fetch member into cache,
  // AND subscribe to presence updates (critical for reliable tracking)
  for (const userId of tracked) {
    const sharedGuilds = [];
    for (const [, guild] of self.guilds.cache) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        sharedGuilds.push(guild);

        // Subscribe to presence for this user in this guild
        // This tells Discord gateway to send PRESENCE_UPDATE packets
        try {
          if (guild.shard) {
            guild.shard.send({
              op: 14, // LAZY_REQUEST / presence subscription
              d: {
                guild_id: guild.id,
                typing: true,
                activities: true,
                threads: false,
                members: [userId]
              }
            });
          }
        } catch { }
      }
    }

    if (sharedGuilds.length === 0) {
      log.warn('SELF', `${c.yellow}${userId}${c.reset} — no shared guilds, presence will NOT fire`);
    } else {
      log.dim('SELF', `${userId} · ${sharedGuilds.length} shared guild(s): ${sharedGuilds.slice(0, 3).map(g => g.name).join(', ')}${sharedGuilds.length > 3 ? ` +${sharedGuilds.length - 3} more` : ''}`);
    }
  }

  // Startup VC check — if user is already in VC when bot starts
  for (const userId of tracked) {
    const trackedUser = state.trackedUsers[userId];

    // Check current presence from cache
    let currentStatus = null;
    let currentActivities = [];
    let currentClientStatus = null;
    for (const [, g] of self.guilds.cache) {
      const m = g.members.cache.get(userId);
      if (m?.presence) {
        currentStatus = m.presence.status;
        currentActivities = m.presence.activities || [];
        currentClientStatus = m.presence.clientStatus;
        break;
      }
    }

    if (currentStatus && currentStatus !== trackedUser.lastStatus) {
      // Status changed while bot was offline — process it now
      log.warn('SELF', `${userId} status changed while offline: ${trackedUser.lastStatus} → ${currentStatus}`);
      await handlePresence(userId, currentStatus, currentActivities, currentClientStatus);
    } else if (currentStatus) {
      log.dim('SELF', `${userId} current status: ${currentStatus} (no change)`);
    }

    // VC check
    for (const [, g] of self.guilds.cache) {
      const member = g.members.cache.get(userId);
      if (member?.voice?.channelId) {
        const ch = member.voice.channel;
        if (!trackedUser.vcSince) {
          trackedUser.vcSince = Date.now();
          trackedUser.vcChannelId = ch.id;
          trackedUser.vcMembers = {};
          saveState(state);
          log.event('VC', `${c.yellow}[startup]${c.reset} already in ${ch.name} @ ${g.name}`);
          await updateVCMessage(userId);
        }
        break;
      }
    }
  }

  console.log(`  ${'─'.repeat(32)}`);
  console.log('');
  self.user.setPresence({
    status: 'invisible',
    activities: [{
      name: 'VALORANT',
      type: 0,
      application_id: '700136079562375258',
      timestamps: { start: Date.now() }
    }]
  });
});

// ─── SELF DISCONNECT — change bot status when self client disconnects ────────
self.on('disconnect', () => {
  log.warn('SELF', 'Self client disconnected - changing bot status to DND');
  if (bot.user) {
    bot.user.setPresence({
      status: 'dnd',
      activities: [{
        name: 'Self Bot Offline',
        type: 0
      }]
    });
  }
});

// ─── SELF RECONNECT — change bot status back when self client reconnects ─────
self.on('ready', () => {
  // Only set invisible if this is a reconnection (not initial ready)
  if (self.readyTimestamp && Date.now() - self.readyTimestamp > 10000) {
    log.success('SELF', 'Self client reconnected - changing bot status back to invisible');
    if (bot.user) {
      bot.user.setPresence({
        status: 'invisible',
        activities: [{
          name: 'VALORANT',
          type: 0,
          application_id: '700136079562375258',
          timestamps: { start: Date.now() }
        }]
      });
    }
  }
});

// ─── NEW SERVER — self joined a server where target is present ────────────────
self.on('guildCreate', async guild => {
  for (const [userId, tracked] of Object.entries(state.trackedUsers)) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      log.event('GUILD', `${c.green}new shared server${c.reset} with ${userId}: ${guild.name}`);
      const avatar = await getAvatar(userId);
      const platLine = buildStoredPlatformLine(userId);
      const blocks = [{ lines: [`## New Shared Server`, `**Server:** ${guild.name}`] }];
      const footer = [`-# ${istTime()}`]; if (platLine) footer.push(platLine);
      blocks.push({ lines: footer });
      await sendMulti(tracked.auditChannelId, blocks, avatar);
    }
  }
});

// ─── CHANNEL DELETE — remove tracking if audit / is-online / category deleted ─
bot.on('channelDelete', channel => {
  for (const [userId, tracked] of Object.entries(state.trackedUsers)) {
    if (
      channel.id === tracked.auditChannelId    ||
      channel.id === tracked.isOnlineChannelId ||
      channel.id === tracked.categoryId
    ) {
      log.warn('AUTO-REMOVE', `Tracked channel deleted for ${userId} — removed`);
      delete state.trackedUsers[userId];
      delete lastActivities[userId];
      saveState(state);
      break;
    }
  }
});

// ─── PERIODIC PRESENCE RE-SUBSCRIPTION ───────────────────────────────────────
// Discord stops sending PRESENCE_UPDATE after some time — re-subscribe every 2 min
setInterval(() => {
  for (const userId of Object.keys(state.trackedUsers)) {
    for (const [, guild] of self.guilds.cache) {
      if (!guild.members.cache.has(userId)) continue;
      try {
        if (guild.shard) {
          guild.shard.send({
            op: 14,
            d: {
              guild_id: guild.id,
              typing: true,
              activities: true,
              threads: false,
              members: [userId]
            }
          });
        }
      } catch { }
    }
  }
}, 2 * 60 * 1000);

// ─── LOGIN ────────────────────────────────────────────────────────────────────
bot.login(process.env.BOT_TOKEN).catch(e => {
  log.error('BOT', `Login failed — ${e.message}`); process.exit(1);
});
self.login(process.env.SELF_TOKEN).catch(e => {
  log.error('SELF', `Login failed — ${e.message}`); process.exit(1);
});
