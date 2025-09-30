const { EmbedBuilder } = require("discord.js");
const { GuildSettings } = require("../config/database");
const { hasModeratorPermissions } = require("../utils/permissions");
const { validateCocApiKey, getCocClanInfo, encryptApiKey, decryptApiKey, getCocCurrentWar } = require("../utils/cocApi");
const { logAction } = require("../utils/logging");

async function handleCocSetup(message, args, context) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to configure COC API.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const apiKey = args[0];
  if (!apiKey) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!cocsetup <api_key>`\n\n**Example:** `!cocsetup eyJ0eXAiOiJKV1QiLCJhbGciOi...`")
      .setColor(0xFF0000)
      .addFields(
        {
          name: "📋 How to get your API key:",
          value: "1. Visit https://developer.clashofclans.com/\n2. Login with your Supercell ID\n3. Create a key with your server's IP\n4. Copy the generated JWT token",
          inline: false
        },
        {
          name: "⚠️ Important Notes:",
          value: "• Your API key must include this server's IP address\n• Keys expire after a period of inactivity\n• Keep your key private - don't share it publicly",
          inline: false
        }
      );
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  if (!apiKey.startsWith('eyJ')) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid API Key Format")
      .setDescription("COC API keys should start with 'eyJ' (JWT format).")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const validation = await validateCocApiKey(apiKey);
  if (!validation.valid) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid API Key")
      .setDescription(validation.message)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const encryptedKey = encryptApiKey(apiKey);
  await GuildSettings.findOneAndUpdate(
    { guildId: message.guild.id },
    { $set: { cocApiKey: encryptedKey, updatedAt: new Date() } },
    { upsert: true }
  );

  const embed = new EmbedBuilder()
    .setTitle("✅ COC API Key Configured Successfully!")
    .setDescription("🎉 Your Clash of Clans API integration is now active!")
    .setColor(0x00FF00)
    .addFields(
      {
        name: "🚀 Available Commands:",
        value: "• `!cocstats [clan_tag]` - View clan statistics\n• `!cocsetclan <role> <clan_tag>` - Link Discord roles to clans\n• `!cocwar [clan_tag]` - Check current war status\n• `!cocautostrike on/off` - Enable auto-strike system",
        inline: false
      },
      {
        name: "🤖 Auto-Strike System:",
        value: "Enable with `!cocautostrike on` to automatically apply strikes for missed war attacks!",
        inline: false
      }
    )
    .setFooter({ text: "Use !help coc to see all COC commands" })
    .setTimestamp();

  await message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  // Delete original message for security
  setTimeout(async () => {
    try {
      await message.delete();
    } catch (deleteError) {
      console.log(`⚠️ Could not delete message: ${deleteError.message}`);
    }
  }, 2000);
}

async function handleCocWarCheck(message, args, context) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to check wars.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const clanTag = args[0];
  if (!clanTag) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!cocwarcheck <clan_tag>`\n\n**Example:** `!cocwarcheck #P28JG28J`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
    if (!guildSettings || !guildSettings.cocApiKey) {
      const embed = new EmbedBuilder()
        .setTitle("❌ COC API Not Configured")
        .setDescription("COC API is not set up. Use `!cocsetup <api_key>` first.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const apiKey = decryptApiKey(guildSettings.cocApiKey);
    const result = await context.cocWarChecker.manualWarCheck(message.guild, clanTag, apiKey);

    if (!result.success) {
      const embed = new EmbedBuilder()
        .setTitle("❌ War Check Failed")
        .setDescription(result.message)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const { war, missedAttackers, clanName } = result.data;

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ War Status - ${clanName}`)
      .setDescription(`**War State:** ${war.state}\n**Preparation Day:** ${war.preparationStartTime ? 'Started' : 'Not Started'}\n**War Day:** ${war.startTime ? 'Started' : 'Not Started'}`)
      .setColor(war.state === 'inWar' ? 0xFF0000 : 0x00FF00)
      .addFields(
        { name: "🏰 Clan", value: `${war.clan.name}\n${war.clan.tag}`, inline: true },
        { name: "🎯 Enemy", value: `${war.opponent.name}\n${war.opponent.tag}`, inline: true },
        { name: "⭐ Stars", value: `${war.clan.stars} vs ${war.opponent.stars}`, inline: true }
      );

    if (war.endTime) {
      embed.addFields({
        name: "⏰ War End Time",
        value: `<t:${Math.floor(new Date(war.endTime).getTime() / 1000)}:R>`,
        inline: true
      });
    }

    if (missedAttackers.length > 0) {
      embed.addFields({
        name: `⚠️ Missed Attacks (${missedAttackers.length})`,
        value: missedAttackers.slice(0, 10).map(player => 
          `• ${player.name} (${player.attacksMissed} missed)`
        ).join('\n') + (missedAttackers.length > 10 ? '\n...' : ''),
        inline: false
      });

      if (guildSettings.cocAutoStrike) {
        embed.addFields({
          name: "🤖 Auto-Strike Status",
          value: "Auto-strikes will be applied automatically when war ends.",
          inline: false
        });
      } else {
        embed.addFields({
          name: "💡 Auto-Strike",
          value: "Enable auto-strikes with `!cocautostrike on` to automatically apply strikes for missed attacks.",
          inline: false
        });
      }
    } else {
      embed.addFields({
        name: "✅ Attack Status",
        value: "All clan members have completed their attacks!",
        inline: false
      });
    }

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    console.error(`❌ COC war check error: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ War Check Error")
      .setDescription(`Error: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

async function handleCocAutoStrike(message, args, context) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to configure auto-strike.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const setting = args[0]?.toLowerCase();
  if (!setting || !['on', 'off', 'enable', 'disable'].includes(setting)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!cocautostrike <on/off>`\n\n**Examples:**\n• `!cocautostrike on`\n• `!cocautostrike off`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const enable = ['on', 'enable'].includes(setting);

  try {
    await GuildSettings.findOneAndUpdate(
      { guildId: message.guild.id },
      { $set: { cocAutoStrike: enable, updatedAt: new Date() } },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle(`✅ COC Auto-Strike ${enable ? 'Enabled' : 'Disabled'}`)
      .setDescription(`COC automatic strike system has been **${enable ? 'enabled' : 'disabled'}**.`)
      .setColor(enable ? 0x00FF00 : 0xFFFF00)
      .addFields({
        name: "🤖 Auto-Strike System",
        value: enable ? 
          "• Wars are monitored automatically every 30 minutes\n• Strikes applied 2 hours before war end\n• Users receive DM notifications\n• Leadership is notified of all actions" :
          "• No automatic strikes will be applied\n• Manual war checking still available\n• Use `!cocwarcheck <clan_tag>` for manual checks",
        inline: false
      });

    if (enable) {
      embed.addFields({
        name: "⚖️ Strike Values",
        value: "• **Missed both attacks:** 0.5 strikes\n• **Missed one attack:** 0.25 strikes",
        inline: false
      });
    }

    embed.setTimestamp();
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    console.error(`Error setting COC auto-strike: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Configuration Failed")
      .setDescription(`Error: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

async function handleCocStats(message, args, context) {
  const clanTag = args[0];
  if (!clanTag) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!cocstats <clan_tag>`\n\n**Example:** `!cocstats #P28JG28J`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
    if (!guildSettings || !guildSettings.cocApiKey) {
      const embed = new EmbedBuilder()
        .setTitle("❌ COC API Not Configured")
        .setDescription("COC API is not set up. Use `!cocsetup <api_key>` first.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const apiKey = decryptApiKey(guildSettings.cocApiKey);
    const clanInfo = await getCocClanInfo(clanTag, apiKey);

    if (!clanInfo.success) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Failed to Fetch Clan Data")
        .setDescription(clanInfo.message)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const clan = clanInfo.data;

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${clan.name} Statistics`)
      .setDescription(`**${clan.description || 'No description available'}**`)
      .setColor(0xFF8000)
      .setThumbnail(clan.badgeUrls?.large || clan.badgeUrls?.medium || null)
      .addFields(
        { name: "🏷️ Clan Tag", value: `\`${clan.tag}\``, inline: true },
        { name: "🏆 Trophies", value: `${clan.clanPoints.toLocaleString()}`, inline: true },
        { name: "🌟 Level", value: `${clan.clanLevel}`, inline: true },
        { name: "👥 Members", value: `${clan.members}/50`, inline: true },
        { name: "⚔️ War Wins", value: `${clan.warWins || 0}`, inline: true },
        { name: "💎 War League", value: `${clan.warLeague?.name || 'Unranked'}`, inline: true }
      )
      .setFooter({ text: `Auto-Strike: ${guildSettings.cocAutoStrike ? 'Enabled' : 'Disabled'}` })
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    console.error(`❌ COC stats error: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Error Fetching Statistics")
      .setDescription(`Failed to retrieve clan statistics: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

async function handleCocLink(message, args, context) {
  const playerTag = args[0];
  if (!playerTag) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!coclink <player_tag>`\n\n**Example:** `!coclink #ABC123DEF`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
    if (!guildSettings || !guildSettings.cocApiKey) {
      const embed = new EmbedBuilder()
        .setTitle("❌ COC API Not Configured")
        .setDescription("COC API is not set up. Use `!cocsetup <api_key>` first.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    await GuildSettings.findOneAndUpdate(
      { guildId: message.guild.id },
      { $set: { [`cocPlayerLinks.${message.author.id}`]: playerTag, updatedAt: new Date() } },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ COC Account Linked")
      .setDescription(`Your Discord account has been linked to COC player: \`${playerTag}\``)
      .setColor(0x00FF00)
      .addFields({
        name: "🤖 Auto-Strike Integration",
        value: "If auto-strikes are enabled, you'll automatically receive strikes for missed war attacks.",
        inline: false
      })
      .setFooter({ text: "Use !cocprofile to view your stats" });

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    console.error(`❌ COC link error: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Link Failed")
      .setDescription(`Error: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

module.exports = {
  handleCocSetup,
  handleCocStats,
  handleCocLink,
  handleCocWarCheck,
  handleCocAutoStrike
};