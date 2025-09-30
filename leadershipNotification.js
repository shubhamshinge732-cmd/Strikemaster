
const { EmbedBuilder } = require('discord.js');
const { GuildSettings } = require('../config/database');

// Enhanced leadership notification function
async function notifyLeadership(guild, user, strikeData, totalStrikes, moderator, selectedClan = null) {
  try {
    console.log(`🔔 Notifying leadership: ${user.username} has ${totalStrikes} strikes`);

    const guildSettings = await GuildSettings.findOne({ guildId: guild.id });
    if (!guildSettings) {
      console.log(`⚠️ No guild settings found for ${guild.name}`);
      return;
    }

    // Determine if this requires leadership notification
    let shouldNotify = false;
    let notificationLevel = 'info';
    
    if (totalStrikes >= 4) {
      shouldNotify = true;
      notificationLevel = 'critical';
    } else if (totalStrikes >= 3) {
      shouldNotify = true;
      notificationLevel = 'high';
    } else if (totalStrikes >= 2) {
      shouldNotify = true;
      notificationLevel = 'medium';
    }

    if (!shouldNotify) return;

    // Find appropriate notification channel
    let notificationChannel = null;
    
    // Try clan-specific channel first
    if (selectedClan && guildSettings.clanLogChannels && guildSettings.clanLogChannels.has(selectedClan)) {
      const channelId = guildSettings.clanLogChannels.get(selectedClan);
      notificationChannel = await guild.channels.fetch(channelId).catch(() => null);
    }
    
    // Fall back to general log channel
    if (!notificationChannel && guildSettings.logChannelId) {
      notificationChannel = await guild.channels.fetch(guildSettings.logChannelId).catch(() => null);
    }

    if (!notificationChannel) {
      console.log(`⚠️ No notification channel found for ${guild.name}`);
      return;
    }

    // Find leadership roles to notify
    const rolesToNotify = [];
    
    if (selectedClan) {
      // Try to find clan-specific leadership
      if (guildSettings.clanLeaderRoles && guildSettings.clanLeaderRoles.has(selectedClan)) {
        const leaderRoleName = guildSettings.clanLeaderRoles.get(selectedClan);
        const leaderRole = guild.roles.cache.find(r => r.name.toLowerCase() === leaderRoleName.toLowerCase());
        if (leaderRole) rolesToNotify.push(leaderRole);
      }
      
      if (guildSettings.clanCoLeaderRoles && guildSettings.clanCoLeaderRoles.has(selectedClan)) {
        const coLeaderRoleName = guildSettings.clanCoLeaderRoles.get(selectedClan);
        const coLeaderRole = guild.roles.cache.find(r => r.name.toLowerCase() === coLeaderRoleName.toLowerCase());
        if (coLeaderRole) rolesToNotify.push(coLeaderRole);
      }
    }

    // Create notification embed
    const notificationEmbed = new EmbedBuilder()
      .setTitle(`${getNotificationEmoji(notificationLevel)} Leadership Alert`)
      .setDescription(getNotificationDescription(notificationLevel, user, totalStrikes))
      .setColor(getNotificationColor(notificationLevel))
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "👤 Member", value: `${user.tag}\n<@${user.id}>`, inline: true },
        { name: "⚠️ Violation", value: strikeData.reason, inline: true },
        { name: "📊 Total Strikes", value: `**${totalStrikes}**`, inline: true },
        { name: "🛡️ Moderator", value: moderator.tag, inline: true },
        { name: "⏰ Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setTimestamp();

    if (selectedClan) {
      notificationEmbed.addFields({ name: "🏰 Clan", value: selectedClan, inline: true });
    }

    // Add action recommendations based on level
    if (notificationLevel === 'critical') {
      notificationEmbed.addFields({
        name: "🚨 Required Actions",
        value: "• Review member immediately\n• Consider clan removal\n• Document decision\n• Notify member of status",
        inline: false
      });
    } else if (notificationLevel === 'high') {
      notificationEmbed.addFields({
        name: "📋 Recommended Actions", 
        value: "• Monitor behavior closely\n• Consider additional mentoring\n• Review recent activity",
        inline: false
      });
    }

    // Send notification
    let messageContent = '';
    if (rolesToNotify.length > 0) {
      messageContent = rolesToNotify.map(role => role.toString()).join(' ');
    }

    if (notificationLevel === 'critical') {
      messageContent = `🚨 **CRITICAL ALERT** 🚨\n\n${messageContent} **IMMEDIATE ATTENTION REQUIRED**\n\n**${user.username}** has reached the **BAN THRESHOLD**!`;
    } else if (notificationLevel === 'high') {
      messageContent = `⚠️ **HIGH PRIORITY ALERT**\n\n${messageContent} **${user.username}** is approaching ban threshold.`;
    }

    await notificationChannel.send({
      content: messageContent,
      embeds: [notificationEmbed],
      allowedMentions: { roles: rolesToNotify.map(r => r.id) }
    });

    console.log(`✅ Leadership notification sent for ${user.username} (${totalStrikes} strikes)`);

  } catch (error) {
    console.error(`❌ Failed to send leadership notification: ${error.message}`);
  }
}

// Helper functions for notifications
function getNotificationEmoji(level) {
  switch (level) {
    case 'critical': return '🚨';
    case 'high': return '⚠️';
    case 'medium': return '🟡';
    default: return 'ℹ️';
  }
}

function getNotificationColor(level) {
  switch (level) {
    case 'critical': return 0xFF0000;
    case 'high': return 0xFF4500;
    case 'medium': return 0xFFFF00;
    default: return 0x0099FF;
  }
}

function getNotificationDescription(level, user, totalStrikes) {
  switch (level) {
    case 'critical':
      return `**🚨 IMMEDIATE ACTION REQUIRED 🚨**\n\nMember **${user.username}** has reached the ban threshold with **${totalStrikes} strikes**!`;
    case 'high':
      return `**⚠️ HIGH RISK MEMBER**\n\nMember **${user.username}** is approaching the ban threshold with **${totalStrikes} strikes**.`;
    case 'medium':
      return `Member **${user.username}** has received **${totalStrikes} strikes** and may need attention.`;
    default:
      return `Strike notification for **${user.username}** (${totalStrikes} total strikes).`;
  }
}

module.exports = {
  notifyLeadership
};
