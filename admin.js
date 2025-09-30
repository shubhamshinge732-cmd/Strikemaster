const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { GuildSettings, Strike } = require("../config/database");
const { updateRole } = require("../utils/roleManager");

async function hasModeratorPermissions(member) {
  if (!member || !member.permissions) return false;

  try {
    // Check for admin permissions
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
    if (member.permissions.has(PermissionFlagsBits.KickMembers)) return true;

    // Check for moderator roles
    const moderatorRoleNames = ['mod', 'moderator', 'admin', 'administrator', 'staff'];
    const hasModRole = member.roles.cache.some(role =>
      moderatorRoleNames.some(modRole =>
        role.name.toLowerCase().includes(modRole)
      )
    );

    return hasModRole;
  } catch (error) {
    console.error(`Error checking permissions: ${error.message}`);
    return false;
  }
}


// Set log channel command
async function handleSetLogChannel(message, args, context) {
  const { hasModeratorPermissions, GuildSettings } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to configure log channels.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const channel = message.mentions.channels.first() || message.channel;

  try {
    await GuildSettings.findOneAndUpdate(
      { guildId: message.guild.id },
      { 
        $set: { 
          logChannelId: channel.id,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ Log Channel Set")
      .setDescription(`Default log channel set to ${channel}`)
      .setColor(0x00FF00)
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    console.error(`Error setting log channel: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Configuration Failed")
      .setDescription(`Failed to set log channel: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

// Set clan log command
async function handleSetClanLog(message, args, context) {
  const { hasModeratorPermissions, GuildSettings } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to configure clan log channels.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const clanRole = args[0];
  const channel = message.mentions.channels.first() || message.channel;

  if (!clanRole) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("Usage: `!setclanlog <clan_role> [#channel]`\nIf no channel is mentioned, the current channel will be used.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    await GuildSettings.findOneAndUpdate(
      { guildId: message.guild.id },
      { 
        $set: { 
          [`clanLogChannels.${clanRole}`]: channel.id,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ Clan Log Channel Set")
      .setDescription(`Clan **${clanRole}** log channel set to ${channel}`)
      .setColor(0x00FF00)
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    console.error(`Error setting clan log: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Configuration Failed")
      .setDescription(`Failed to set clan log channel: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

// Set leader command
async function handleSetLeader(message, args, context) {
  const { hasModeratorPermissions, GuildSettings } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to configure leadership roles.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const clanRole = args[0];
  const leaderRole = args[1];

  if (!clanRole || !leaderRole) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("Usage: `!setleader <clan_role> <leader_role>`\n\nExample: `!setleader Phoenix \"Phoenix Leader\"`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    await GuildSettings.findOneAndUpdate(
      { guildId: message.guild.id },
      { 
        $set: { 
          [`clanLeaderRoles.${clanRole}`]: leaderRole,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ Leader Role Set")
      .setDescription(`Clan **${clanRole}** leader role set to **${leaderRole}**`)
      .setColor(0x00FF00)
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    console.error(`Error setting leader role: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Configuration Failed")
      .setDescription(`Failed to set leader role: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

// Set co-leader command
async function handleSetCoLeader(message, args, context) {
  const { hasModeratorPermissions, GuildSettings } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to configure leadership roles.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const clanRole = args[0];
  const coLeaderRole = args[1];

  if (!clanRole || !coLeaderRole) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("Usage: `!setcoleader <clan_role> <co_leader_role>`\n\nExample: `!setcoleader Phoenix \"Phoenix Co-Leader\"`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    await GuildSettings.findOneAndUpdate(
      { guildId: message.guild.id },
      { 
        $set: { 
          [`clanCoLeaderRoles.${clanRole}`]: coLeaderRole,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ Co-Leader Role Set")
      .setDescription(`Clan **${clanRole}** co-leader role set to **${coLeaderRole}**`)
      .setColor(0x00FF00)
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    console.error(`Error setting co-leader role: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Configuration Failed")
      .setDescription(`Failed to set co-leader role: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

// List clans command
async function handleListClans(message, args, context) {
  const { hasModeratorPermissions, GuildSettings } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to view clan configurations.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });

    if (!guildSettings || !guildSettings.clanLogChannels || guildSettings.clanLogChannels.size === 0) {
      const embed = new EmbedBuilder()
        .setTitle("📋 Clan Configuration")
        .setDescription("No clan log channels configured.")
        .setColor(0x00FF00)
        .addFields({
          name: "How to Configure",
          value: "Use `!setclanlog <clan_role> [#channel]` to set clan-specific log channels.",
          inline: false
        });
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 Configured Clan Log Channels")
      .setColor(0x0099FF)
      .setTimestamp();

    let clanList = "";
    for (const [clanName, channelId] of guildSettings.clanLogChannels) {
      const channel = message.guild.channels.cache.get(channelId);
      const channelMention = channel ? channel.toString() : `<#${channelId}> (Channel not found)`;
      clanList += `**${clanName}** → ${channelMention}\n`;
    }

    embed.setDescription(clanList || "No clans configured.");
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    console.error(`Error listing clans: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Error")
      .setDescription("Failed to fetch clan configurations.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

// List leadership command
async function handleListLeadership(message, args, context) {
  const { hasModeratorPermissions, GuildSettings } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to view leadership configurations.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });

    const embed = new EmbedBuilder()
      .setTitle("👑 Leadership Configuration")
      .setColor(0xFFD700)
      .setTimestamp();

    let hasLeadershipConfig = false;
    let leadershipText = "";

    if (guildSettings && guildSettings.clanLeaderRoles && guildSettings.clanLeaderRoles.size > 0) {
      leadershipText += "**👑 Leader Roles:**\n";
      for (const [clanName, leaderRole] of guildSettings.clanLeaderRoles) {
        leadershipText += `• **${clanName}** → ${leaderRole}\n`;
      }
      leadershipText += "\n";
      hasLeadershipConfig = true;
    }

    if (guildSettings && guildSettings.clanCoLeaderRoles && guildSettings.clanCoLeaderRoles.size > 0) {
      leadershipText += "**🥈 Co-Leader Roles:**\n";
      for (const [clanName, coLeaderRole] of guildSettings.clanCoLeaderRoles) {
        leadershipText += `• **${clanName}** → ${coLeaderRole}\n`;
      }
      hasLeadershipConfig = true;
    }

    if (!hasLeadershipConfig) {
      embed.setDescription("No leadership roles configured.")
        .addFields({
          name: "How to Configure",
          value: "• `!setleader <clan_role> <leader_role>`\n• `!setcoleader <clan_role> <co_leader_role>`",
          inline: false
        });
    } else {
      embed.setDescription(leadershipText);
    }

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    console.error(`Error listing leadership: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Error")
      .setDescription("Failed to fetch leadership configurations.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

// Cleanup command
async function handleCleanup(message, args, context) {
  const { hasModeratorPermissions } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to perform cleanup.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    // Access cleanup functions from global state (these are defined in index.js)
    const oldCooldownSize = global.commandCooldowns?.size || 0;
    const oldProcessingSize = global.processingMessages?.size || 0;
    const oldRoleLocksSize = global.roleUpdateLocks?.size || 0;
    const oldMessageLocks = global.messageProcessingLocks?.size || 0;

    // Clear all locks and caches
    if (global.commandCooldowns) global.commandCooldowns.clear();
    if (global.processingMessages) global.processingMessages.clear();
    if (global.roleUpdateLocks) global.roleUpdateLocks.clear();
    if (global.messageProcessingLocks) global.messageProcessingLocks.clear();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('🗑️ Forced garbage collection');
    }

    // Get memory usage after cleanup
    const memoryAfter = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    const embed = new EmbedBuilder()
      .setTitle("🧹 Cleanup Complete")
      .setDescription("Bot cache and locks have been cleared.")
      .setColor(0x00FF00)
      .addFields(
        { name: "Cooldowns Cleared", value: `${oldCooldownSize}`, inline: true },
        { name: "Processing Messages Cleared", value: `${oldProcessingSize}`, inline: true },
        { name: "Role Locks Cleared", value: `${oldRoleLocksSize}`, inline: true },
        { name: "Message Locks Cleared", value: `${oldMessageLocks}`, inline: true },
        { name: "Memory Usage", value: `${memoryAfter}MB`, inline: true },
        { name: "Status", value: "✅ All systems cleaned", inline: true }
      )
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    console.error(`❌ Cleanup error: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Cleanup Failed")
      .setDescription(`Error during cleanup: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

async function handleSyncRoles(message, client, persistenceManager = null) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to sync member roles.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const embed = new EmbedBuilder()
    .setTitle("🔄 Syncing Roles...")
    .setDescription("This may take a moment...")
    .setColor(0x0099FF);

  const syncMessage = await message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  try {
    const { Strike } = require('../config/database');
    
    // Get all users with strikes
    const usersWithStrikes = await Strike.find({ 
      guildId: message.guild.id, 
      strikes: { $gt: 0 } 
    });

    let syncedCount = 0;
    let errorCount = 0;

    for (const userRecord of usersWithStrikes) {
      try {
        const member = await message.guild.members.fetch(userRecord.userId).catch(() => null);
        if (member) {
          await updateRole(member, userRecord.strikes);
          syncedCount++;
        }
      } catch (roleError) {
        console.error(`❌ Error syncing role for ${userRecord.userId}: ${roleError.message}`);
        errorCount++;
      }
    }

    const successEmbed = new EmbedBuilder()
      .setTitle("✅ Roles Synced")
      .setDescription(`Role synchronization completed!`)
      .setColor(0x00FF00)
      .addFields(
        { name: "✅ Users Synced", value: `${syncedCount}`, inline: true },
        { name: "❌ Errors", value: `${errorCount}`, inline: true },
        { name: "📊 Total Processed", value: `${usersWithStrikes.length}`, inline: true }
      )
      .setTimestamp();

    await syncMessage.edit({ embeds: [successEmbed] });

  } catch (error) {
    console.error(`Role sync error: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Sync Failed")
      .setDescription(`Error: ${error.message}`)
      .setColor(0xFF0000);
    await syncMessage.edit({ embeds: [errorEmbed] });
  }
}


async function handleListClans(message, client) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to view clan configurations.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });

    const embed = new EmbedBuilder()
      .setTitle("📋 Configured Clan Log Channels")
      .setColor(0x0099FF);

    if (!guildSettings || !guildSettings.clanLogChannels || guildSettings.clanLogChannels.size === 0) {
      embed.setDescription("No clan log channels configured.")
        .addFields({
          name: "How to Configure",
          value: "Use `!setclanlog <clan_role> [#channel]` to set clan-specific log channels.",
          inline: false
        });
    } else {
      let clanList = "";
      for (const [clanName, channelId] of guildSettings.clanLogChannels) {
        const channel = message.guild.channels.cache.get(channelId);
        const channelMention = channel ? channel.toString() : `<#${channelId}> (Not found)`;
        clanList += `**${clanName}** → ${channelMention}\n`;
      }
      embed.setDescription(clanList);
    }

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    console.error(`Error listing clans: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Error")
      .setDescription("Failed to fetch clan configurations.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

async function handleDebug(message, client) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to view debug info.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const uptime = process.uptime();
  const uptimeString = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  const embed = new EmbedBuilder()
    .setTitle("🔧 Bot Debug Information")
    .setColor(0x0099FF)
    .addFields(
      { name: "⏱️ Uptime", value: uptimeString, inline: true },
      { name: "🏓 Ping", value: `${Math.round(client.ws.ping)}ms`, inline: true },
      { name: "💾 Memory", value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true },
      { name: "🏰 Guilds", value: `${client.guilds.cache.size}`, inline: true },
      { name: "👥 Users", value: `${client.users.cache.size}`, inline: true },
      { name: "🔗 Database", value: "Connected", inline: true }
    )
    .setTimestamp();

  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

const commands = {
  setlogchannel: handleSetLogChannel,
  setclanlog: handleSetClanLog,
  setleader: handleSetLeader,
  setcoleader: handleSetCoLeader,
  listclans: handleListClans,
  listleadership: handleListLeadership,
  syncroles: handleSyncRoles,
  debug: handleDebug,
  cleanup: handleCleanup
};

const metadata = {
  name: "admin",
  description: "Admin commands",
  category: "admin",
  permissions: ["moderator"],
  version: "2.0.0"
};

module.exports = {
  commands,
  metadata,
  handleSetLogChannel,
  handleSetClanLog,
  handleSetLeader,
  handleSetCoLeader,
  handleListClans,
  handleListLeadership,
  handleSyncRoles,
  handleDebug,
  handleCleanup,
  hasModeratorPermissions
};