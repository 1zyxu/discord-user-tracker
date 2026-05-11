require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('adduser')
    .setDescription('Start tracking a Discord user')
    .addStringOption(opt =>
      opt.setName('userid')
        .setDescription('The Discord user ID to track')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('removeuser')
    .setDescription('Stop tracking a Discord user')
    .addStringOption(opt =>
      opt.setName('userid')
        .setDescription('Select a tracked user to remove')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('mutual')
    .setDescription('Find mutual servers with a user')
    .addStringOption(opt =>
      opt.setName('userid')
        .setDescription('The Discord user ID to check mutuals for')
        .setRequired(true)
    )
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ /adduser command registered globally.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
})();
