
const { GuildSettings } = require("../config/database");

// Function to log actions to the configured log channel
async function logAction(client, guildId, embed, userId = null, clan = null) {
  try {
    const guildSettings = await GuildSettings.findOne({ guildId });
    let targetChannelId = guildSettings ? guildSettings.logChannelId : null;

    if (!targetChannelId) {
      console.log(`📝 No log channel configured for guild ${guildId}`);
      return;
    }

    const logChannel = await client.channels.fetch(targetChannelId);
    if (!logChannel) {
      console.warn(`⚠️ Log channel ${targetChannelId} not found for guild ${guildId}`);
      return;
    }

    const guild = client.guilds.cache.get(guildId);
    const guildName = guild ? guild.name : `Unknown Guild (${guildId})`;

    embed.addFields({ name: "Guild", value: guildName, inline: true });
    embed.setTimestamp();

    await logChannel.send({ embeds: [embed] });
    console.log(`✅ Logged action to ${logChannel.name} in ${guildName}`);
  } catch (error) {
    console.error(`❌ Failed to send log action for guild ${guildId}: ${error.message}`);
  }
}

module.exports = {
  logAction
};
