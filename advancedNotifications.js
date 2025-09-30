
const { EmbedBuilder } = require('discord.js');
const { GuildSettings } = require('../config/database');

class AdvancedNotificationManager {
  constructor(client) {
    this.client = client;
  }

  // Enhanced leadership notification with escalation
  async notifyLeadership(guild, user, strikeData, totalStrikes, moderator, selectedClan = null, options = {}) {
    try {
      console.log(`🔔 Advanced notification: ${user.username} has ${totalStrikes} strikes`);

      const guildSettings = await GuildSettings.findOne({ guildId: guild.id });
      if (!guildSettings) {
        console.log(`⚠️ No guild settings found for ${guild.name}`);
        return;
      }

      // Determine notification priority
      const priority = this.calculatePriority(totalStrikes, strikeData);
      
      // Get notification channels and roles
      const notificationTargets = await this.getNotificationTargets(guild, guildSettings, selectedClan, priority);

      // Send notifications to all targets
      for (const target of notificationTargets) {
        await this.sendNotificationToTarget(guild, user, strikeData, totalStrikes, moderator, target, priority);
      }

      // Send webhook notifications if configured
      if (guildSettings.webhookUrls && guildSettings.webhookUrls.size > 0) {
        await this.sendWebhookNotifications(guild, user, strikeData, totalStrikes, moderator, guildSettings, priority);
      }

      // Log notification activity
      await this.logNotificationActivity(guild, user, totalStrikes, notificationTargets.length, guildSettings);

    } catch (error) {
      console.error(`❌ Failed to send advanced notification:`, error.message);
    }
  }

  // Calculate notification priority based on strikes and violation type
  calculatePriority(totalStrikes, strikeData) {
    if (totalStrikes >= 4) return 'critical';
    if (totalStrikes >= 3) return 'high';
    if (totalStrikes >= 2) return 'medium';
    if (strikeData.strikes >= 2) return 'medium'; // High-value single violations
    return 'low';
  }

  // Get all notification targets based on priority and clan
  async getNotificationTargets(guild, guildSettings, selectedClan, priority) {
    const targets = [];

    try {
      // Primary leadership (always notified for medium+ priority)
      if (priority !== 'low') {
        if (selectedClan && guildSettings.clanLeaderRoles?.has(selectedClan)) {
          const leaderRoleName = guildSettings.clanLeaderRoles.get(selectedClan);
          const leaderRole = guild.roles.cache.find(r => r.name.toLowerCase() === leaderRoleName.toLowerCase());
          
          if (leaderRole) {
            targets.push({
              type: 'role',
              role: leaderRole,
              channel: this.getTargetChannel(guild, guildSettings, selectedClan),
              priority: 'primary'
            });
          }
        }

        // Co-leadership (for high+ priority)
        if (priority === 'high' || priority === 'critical') {
          if (selectedClan && guildSettings.clanCoLeaderRoles?.has(selectedClan)) {
            const coLeaderRoleName = guildSettings.clanCoLeaderRoles.get(selectedClan);
            const coLeaderRole = guild.roles.cache.find(r => r.name.toLowerCase() === coLeaderRoleName.toLowerCase());
            
            if (coLeaderRole) {
              targets.push({
                type: 'role',
                role: coLeaderRole,
                channel: this.getTargetChannel(guild, guildSettings, selectedClan),
                priority: 'secondary'
              });
            }
          }
        }
      }

      // Critical escalation (for ban threshold)
      if (priority === 'critical') {
        // Notify server administrators
        const adminRole = guild.roles.cache.find(r => 
          ['admin', 'administrator', 'server admin'].includes(r.name.toLowerCase())
        );
        
        if (adminRole) {
          targets.push({
            type: 'role',
            role: adminRole,
            channel: this.getTargetChannel(guild, guildSettings, selectedClan),
            priority: 'critical'
          });
        }

        // Also send to general admin channel if different from clan channel
        if (guildSettings.logChannelId) {
          const generalChannel = await guild.channels.fetch(guildSettings.logChannelId).catch(() => null);
          if (generalChannel) {
            targets.push({
              type: 'channel',
              channel: generalChannel,
              priority: 'critical'
            });
          }
        }
      }

    } catch (error) {
      console.error('❌ Error getting notification targets:', error.message);
    }

    return targets;
  }

  // Get appropriate channel for notifications
  getTargetChannel(guild, guildSettings, selectedClan) {
    // Try clan-specific channel first
    if (selectedClan && guildSettings.clanLogChannels?.has(selectedClan)) {
      const channelId = guildSettings.clanLogChannels.get(selectedClan);
      return guild.channels.cache.get(channelId);
    }

    // Fall back to general log channel
    if (guildSettings.logChannelId) {
      return guild.channels.cache.get(guildSettings.logChannelId);
    }

    return null;
  }

  // Send notification to a specific target
  async sendNotificationToTarget(guild, user, strikeData, totalStrikes, moderator, target, priority) {
    try {
      if (!target.channel) return;

      const embed = this.createNotificationEmbed(user, strikeData, totalStrikes, moderator, priority, target);
      
      let messageContent = this.getMessageContent(target, priority, user);

      const allowedMentions = { roles: [] };
      if (target.role) {
        allowedMentions.roles.push(target.role.id);
      }

      await target.channel.send({
        content: messageContent,
        embeds: [embed],
        allowedMentions: allowedMentions
      });

      console.log(`✅ Notification sent to ${target.type} ${target.role?.name || target.channel.name}`);

    } catch (error) {
      console.error(`❌ Failed to send notification to target:`, error.message);
    }
  }

  // Create notification embed based on priority
  createNotificationEmbed(user, strikeData, totalStrikes, moderator, priority, target) {
    const priorityConfig = {
      critical: { color: 0xFF0000, emoji: '🚨', title: 'CRITICAL ALERT - BAN THRESHOLD' },
      high: { color: 0xFF4500, emoji: '⚠️', title: 'HIGH PRIORITY ALERT' },
      medium: { color: 0xFFFF00, emoji: '⚠️', title: 'MODERATION ALERT' },
      low: { color: 0x0099FF, emoji: 'ℹ️', title: 'Violation Report' }
    };

    const config = priorityConfig[priority];

    const embed = new EmbedBuilder()
      .setTitle(`${config.emoji} ${config.title}`)
      .setColor(config.color)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "👤 User", value: `${user.tag}\n(<@${user.id}>)`, inline: true },
        { name: "⚠️ Violation", value: strikeData.reason, inline: true },
        { name: "📊 Total Strikes", value: `**${totalStrikes}**`, inline: true },
        { name: "🛡️ Moderator", value: moderator.tag, inline: true },
        { name: "⏰ Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        { name: "🎯 Priority", value: priority.toUpperCase(), inline: true }
      )
      .setTimestamp();

    // Add critical warnings
    if (priority === 'critical') {
      embed.setDescription('**🚨 IMMEDIATE ACTION REQUIRED 🚨**\n\nThis member has reached the ban threshold and requires immediate review!');
      embed.addFields({
        name: "🚨 Required Actions",
        value: "• Review member's history\n• Consider removal from clan\n• Document decision\n• Notify member of status",
        inline: false
      });
    } else if (priority === 'high') {
      embed.setDescription('**⚠️ HIGH RISK MEMBER**\n\nThis member is approaching the ban threshold.');
      embed.addFields({
        name: "📋 Recommended Actions",
        value: "• Monitor behavior closely\n• Consider additional mentoring\n• Review clan activity",
        inline: false
      });
    }

    // Add footer based on target type
    if (target.priority === 'critical') {
      embed.setFooter({ text: "🚨 CRITICAL ESCALATION - Server Administration Alert" });
    } else if (target.priority === 'primary') {
      embed.setFooter({ text: "👑 Leadership Notification - Primary Alert" });
    } else if (target.priority === 'secondary') {
      embed.setFooter({ text: "🥈 Co-Leadership Notification - Secondary Alert" });
    } else {
      embed.setFooter({ text: "📢 Moderation Alert" });
    }

    return embed;
  }

  // Get message content based on target and priority
  getMessageContent(target, priority, user) {
    let content = '';

    if (priority === 'critical') {
      content = `🚨 **CRITICAL ALERT** 🚨\n\n`;
      if (target.role) {
        content += `${target.role} **IMMEDIATE ATTENTION REQUIRED**\n\n`;
      }
      content += `**${user.username}** has reached the **BAN THRESHOLD**!`;
    } else if (priority === 'high') {
      content = `⚠️ **HIGH PRIORITY ALERT**\n\n`;
      if (target.role) {
        content += `${target.role} `;
      }
      content += `**${user.username}** is approaching ban threshold.`;
    } else if (priority === 'medium') {
      if (target.role) {
        content = `${target.role} Moderation alert for **${user.username}**.`;
      } else {
        content = `⚠️ Moderation alert for **${user.username}**.`;
      }
    } else {
      content = `ℹ️ Strike applied to **${user.username}**.`;
    }

    return content;
  }

  // Send webhook notifications to external systems
  async sendWebhookNotifications(guild, user, strikeData, totalStrikes, moderator, guildSettings, priority) {
    try {
      if (!guildSettings.webhookUrls || guildSettings.webhookUrls.size === 0) return;

      const webhookData = {
        embeds: [{
          title: `Strike Alert - ${guild.name}`,
          description: `${user.username} has received a strike`,
          color: priority === 'critical' ? 0xFF0000 : priority === 'high' ? 0xFF4500 : 0xFFFF00,
          fields: [
            { name: "User", value: user.tag, inline: true },
            { name: "Total Strikes", value: totalStrikes.toString(), inline: true },
            { name: "Violation", value: strikeData.reason, inline: false },
            { name: "Moderator", value: moderator.tag, inline: true },
            { name: "Priority", value: priority.toUpperCase(), inline: true }
          ],
          timestamp: new Date().toISOString(),
          thumbnail: { url: user.displayAvatarURL() }
        }]
      };

      for (const [webhookName, webhookUrl] of guildSettings.webhookUrls) {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookData)
          });

          if (response.ok) {
            console.log(`✅ Webhook notification sent to ${webhookName}`);
          } else {
            console.error(`❌ Webhook failed for ${webhookName}: ${response.status}`);
          }
        } catch (webhookError) {
          console.error(`❌ Webhook error for ${webhookName}:`, webhookError.message);
        }
      }

    } catch (error) {
      console.error('❌ Error sending webhook notifications:', error.message);
    }
  }

  // Log notification activity
  async logNotificationActivity(guild, user, totalStrikes, notificationCount, guildSettings) {
    try {
      console.log(`📊 Notification summary: ${user.username} (${totalStrikes} strikes) - ${notificationCount} notifications sent`);

      // You could store this in database for analytics
      // await NotificationLog.create({
      //   guildId: guild.id,
      //   userId: user.id,
      //   totalStrikes: totalStrikes,
      //   notificationsSent: notificationCount,
      //   timestamp: new Date()
      // });

    } catch (error) {
      console.error('❌ Error logging notification activity:', error.message);
    }
  }

  // Send custom notification to specific roles/channels
  async sendCustomNotification(guild, title, description, options = {}) {
    try {
      const {
        color = 0x0099FF,
        channels = [],
        roles = [],
        fields = [],
        priority = 'medium'
      } = options;

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();

      if (fields.length > 0) {
        embed.addFields(fields);
      }

      // Send to specified channels
      for (const channelId of channels) {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (channel) {
          let content = '';
          if (roles.length > 0) {
            content = roles.map(roleId => `<@&${roleId}>`).join(' ');
          }

          await channel.send({
            content: content,
            embeds: [embed],
            allowedMentions: { roles: roles }
          });
        }
      }

      console.log(`✅ Custom notification sent: ${title}`);
    } catch (error) {
      console.error('❌ Error sending custom notification:', error.message);
    }
  }

  // Configure notification settings
  async configureNotifications(guildId, settings) {
    try {
      const updateData = {};

      if (settings.webhookUrls) {
        updateData['webhookUrls'] = settings.webhookUrls;
      }

      if (settings.escalationRoles) {
        updateData['escalationRoles'] = settings.escalationRoles;
      }

      if (settings.notificationThresholds) {
        updateData['notificationThresholds'] = settings.notificationThresholds;
      }

      await GuildSettings.findOneAndUpdate(
        { guildId },
        { $set: { ...updateData, updatedAt: new Date() } },
        { upsert: true }
      );

      console.log(`✅ Notification settings configured for guild ${guildId}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to configure notifications:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = { AdvancedNotificationManager };
