const { EmbedBuilder } = require("discord.js");

/**
 * Reports Commands
 * Analytics and reporting functionality
 */

// All strikes command with pagination and clan filtering
async function handleAllStrikes(message, args, context) {
  const { hasModeratorPermissions, Strike, GuildSettings } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to view all strikes.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    let clanFilter = null;
    let pageArg = 1;

    // Parse arguments - check if first arg is a clan name or page number
    if (args.length > 0) {
      if (isNaN(args[0])) {
        // First arg is clan name
        clanFilter = args[0].toLowerCase();
        pageArg = parseInt(args[1]) || 1;
      } else {
        // First arg is page number
        pageArg = parseInt(args[0]) || 1;
      }
    }

    // Get guild settings to check for clan channels
    const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
    let channelClan = null;

    // Auto-detect clan from channel if in clan-specific channel
    if (!clanFilter && guildSettings && guildSettings.clanLogChannels && guildSettings.clanLogChannels.size > 0) {
      for (const [clanName, channelId] of guildSettings.clanLogChannels) {
        if (channelId === message.channel.id) {
          clanFilter = clanName.toLowerCase();
          channelClan = clanName;
          break;
        }
      }
    }

    let allStrikes = await Strike.find({ 
      guildId: message.guild.id, 
      strikes: { $gt: 0 } 
    }).sort({ strikes: -1, lastViolation: -1 });

    let filteredStrikes = [];

    if (clanFilter) {
      // Find clan role
      const clanRole = message.guild.roles.cache.find(r => 
        r.name.toLowerCase() === clanFilter.toLowerCase()
      );

      if (!clanRole) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Clan Not Found")
          .setDescription(`No role found matching clan name: **${clanFilter}**`)
          .setColor(0xFF0000)
          .addFields({
            name: "💡 Available Clans",
            value: guildSettings && guildSettings.clanLogChannels ? 
              Array.from(guildSettings.clanLogChannels.keys()).join(', ') || 'None configured' :
              'None configured',
            inline: false
          });
        return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
      }

      // Filter strikes by clan members
      const clanMemberIds = clanRole.members.map(member => member.id);
      filteredStrikes = allStrikes.filter(strike => clanMemberIds.includes(strike.userId));
    } else {
      filteredStrikes = allStrikes;
    }

    if (filteredStrikes.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("📊 All Strikes" + (clanFilter ? ` - ${clanFilter.toUpperCase()}` : ''))
        .setDescription(clanFilter ? 
          `No strikes found for clan **${clanFilter.toUpperCase()}**! 🎉` :
          "No strikes found in this server! 🎉")
        .setColor(0x00FF00);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const itemsPerPage = 10;
    const totalPages = Math.ceil(filteredStrikes.length / itemsPerPage);
    const page = Math.max(1, Math.min(pageArg, totalPages));
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageStrikes = filteredStrikes.slice(startIndex, endIndex);

    let titleSuffix = '';
    let contextInfo = '';

    if (clanFilter) {
      titleSuffix = ` - ${clanFilter.toUpperCase()}`;
      if (channelClan && clanFilter === channelClan.toLowerCase()) {
        contextInfo = `📍 *${channelClan.toUpperCase()} clan strikes (channel context)*\n\n`;
      } else {
        contextInfo = `🔍 *Filtered by: ${clanFilter.toUpperCase()}*\n\n`;
      }
    } else if (channelClan) {
      contextInfo = `🌐 *Server-wide strikes (use !allstrikes ${channelClan.toLowerCase()} for channel clan only)*\n\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 All Strikes${titleSuffix} (Page ${page}/${totalPages})`)
      .setDescription(contextInfo + `Showing ${startIndex + 1}-${Math.min(endIndex, filteredStrikes.length)} of ${filteredStrikes.length} users with strikes`)
      .setColor(0x0099FF)
      .setFooter({ 
        text: `Use !allstrikes ${clanFilter || ''} [page] to navigate | !analytics for insights` 
      })
      .setTimestamp();

    for (let i = 0; i < pageStrikes.length; i++) {
      const strike = pageStrikes[i];
      const user = await message.client.users.fetch(strike.userId).catch(() => null);
      const username = user ? user.username : `Unknown User (${strike.userId})`;
      const position = startIndex + i + 1;

      const lastViolation = strike.lastViolation ? 
        `<t:${Math.floor(new Date(strike.lastViolation).getTime() / 1000)}:R>` : 
        'Unknown';

      let statusEmoji = '';
      if (strike.strikes >= 4) statusEmoji = '🚫';
      else if (strike.strikes >= 3) statusEmoji = '⚠️';
      else if (strike.strikes >= 2) statusEmoji = '🟡';
      else statusEmoji = '🟢';

      embed.addFields({
        name: `${position}. ${statusEmoji} ${username}`,
        value: `**${strike.strikes}** strikes | Last: ${lastViolation}`,
        inline: true
      });
    }

    // Add navigation info if multiple pages
    if (totalPages > 1) {
      const navInfo = [];
      if (page > 1) navInfo.push(`◀️ Page ${page - 1}`);
      if (page < totalPages) navInfo.push(`Page ${page + 1} ▶️`);

      if (navInfo.length > 0) {
        embed.addFields({
          name: "📖 Navigation",
          value: navInfo.join(' | '),
          inline: false
        });
      }
    }

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    console.error(`❌ All strikes error: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Error Loading Strikes")
      .setDescription("Failed to load strike data. Please try again.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

// Strike history command
async function handleHistory(message, args, context) {
  const { hasModeratorPermissions, Strike } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to view strike history.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const user = message.mentions.users.first();
  if (!user) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("Usage: `!history @user [page]`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const pageArg = parseInt(args[0]) || 1;
    const record = await Strike.findOne({ userId: user.id, guildId: message.guild.id });

    if (!record || !record.history || record.history.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`📋 Strike History - ${user.username}`)
        .setDescription("No strike history found for this user.")
        .setColor(0x00FF00)
        .setThumbnail(user.displayAvatarURL());
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const itemsPerPage = 5;
    const totalPages = Math.ceil(record.history.length / itemsPerPage);
    const page = Math.max(1, Math.min(pageArg, totalPages));
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageHistory = record.history.slice().reverse().slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
      .setTitle(`📜 Strike History - ${user.username} (Page ${page}/${totalPages})`)
      .setDescription(`**Current Strikes:** ${record.strikes}\n**Total History Entries:** ${record.history.length}`)
      .setColor(record.strikes >= 4 ? 0xFF0000 : record.strikes >= 3 ? 0xFFA500 : record.strikes >= 2 ? 0xFFFF00 : 0x00FF00)
      .setThumbnail(user.displayAvatarURL())
      .setFooter({ text: `Use !history @${user.username} [page] to navigate` })
      .setTimestamp();

    pageHistory.forEach((entry, index) => {
      const entryNumber = record.history.length - (startIndex + index);
      const date = entry.date ? `<t:${Math.floor(new Date(entry.date).getTime() / 1000)}:F>` : 'Unknown date';
      const strikesText = entry.strikesAdded > 0 ? `+${entry.strikesAdded}` : `${entry.strikesAdded}`;
      const actionEmoji = entry.strikesAdded > 0 ? '⚠️' : '🗑️';

      embed.addFields({
        name: `${actionEmoji} Entry #${entryNumber}`,
        value: `**${entry.reason}**\n${strikesText} strikes | By: ${entry.moderator}\n${date}`,
        inline: false
      });
    });

    // Add navigation info if multiple pages
    if (totalPages > 1) {
      const navInfo = [];
      if (page > 1) navInfo.push(`◀️ Page ${page - 1}`);
      if (page < totalPages) navInfo.push(`Page ${page + 1} ▶️`);

      if (navInfo.length > 0) {
        embed.addFields({
          name: "📖 Navigation",
          value: navInfo.join(' | '),
          inline: false
        });
      }
    }

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    console.error(`❌ History error: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Error Loading History")
      .setDescription("Failed to load strike history. Please try again.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

// Leaderboard command
async function handleLeaderboard(message, args, context) {
  const { Strike } = context;

  try {
    const topUsers = await Strike.find({ guildId: message.guild.id, strikes: { $gt: 0 } })
      .sort({ strikes: -1 })
      .limit(10);

    if (topUsers.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("🏆 Strike Leaderboard")
        .setDescription("No users with strikes found!")
        .setColor(0x00FF00);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 Strike Leaderboard")
      .setDescription("Top users with most strikes")
      .setColor(0xFFD700)
      .setTimestamp();

    for (let i = 0; i < topUsers.length; i++) {
      const user = await message.client.users.fetch(topUsers[i].userId).catch(() => null);
      const username = user ? user.username : `Unknown User (${topUsers[i].userId})`;
      const position = i + 1;
      const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : `${position}.`;

      embed.addFields({
        name: `${medal} ${username}`,
        value: `${topUsers[i].strikes} strikes`,
        inline: true
      });
    }

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    console.error(`Leaderboard error: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Error")
      .setDescription("Failed to fetch leaderboard data.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

// Analytics dashboard command
async function handleAnalytics(message, args, context) {
  const { hasModeratorPermissions, Strike, GuildSettings } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to view analytics.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
    let channelClan = null;
    let clanFilter = args[0] && args[0].toLowerCase() !== 'all' ? args[0].toLowerCase() : null;

    if (!clanFilter && guildSettings && guildSettings.clanLogChannels && guildSettings.clanLogChannels.size > 0) {
      for (const [clanName, channelId] of guildSettings.clanLogChannels) {
        if (channelId === message.channel.id) {
          clanFilter = clanName.toLowerCase();
          channelClan = clanName.toLowerCase();
          break;
        }
      }
    }

    if (args[0] && args[0].toLowerCase() === 'all') {
      clanFilter = null;
    }

    let allStrikes = await Strike.find({ 
      guildId: message.guild.id, 
      strikes: { $gt: 0 } 
      }).sort({ strikes: -1 });

    let filteredStrikes = [];
    let totalTrackedUsers = 0;

    if (clanFilter) {
      const clanRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === clanFilter.toLowerCase());

      if (!clanRole) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Clan Not Found")
          .setDescription(`No role found matching clan name: **${clanFilter}**`)
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
      }

      const clanMemberIds = clanRole.members.map(member => member.id);
      filteredStrikes = allStrikes.filter(strike => clanMemberIds.includes(strike.userId));
      totalTrackedUsers = clanRole.members.size;
    } else {
      filteredStrikes = allStrikes;
      totalTrackedUsers = message.guild.memberCount;
    }

    const totalUsersWithStrikes = filteredStrikes.length;
    const usersWithoutStrikes = Math.max(0, totalTrackedUsers - totalUsersWithStrikes);
    const totalStrikes = filteredStrikes.reduce((sum, strike) => sum + strike.strikes, 0);
    const averageStrikes = totalUsersWithStrikes > 0 ? (totalStrikes / totalUsersWithStrikes).toFixed(1) : 0;

    const highRisk = filteredStrikes.filter(s => s.strikes >= 4).length;
    const mediumRisk = filteredStrikes.filter(s => s.strikes >= 2 && s.strikes < 4).length;
    const lowRisk = filteredStrikes.filter(s => s.strikes > 0 && s.strikes < 2).length;

    const highRiskPercent = totalTrackedUsers > 0 ? (highRisk / totalTrackedUsers) * 100 : 0;
    const mediumRiskPercent = totalTrackedUsers > 0 ? (mediumRisk / totalTrackedUsers) * 100 : 0;

    let healthColor, healthStatus, healthEmoji;
    if (highRiskPercent > 30) {
      healthColor = 0xFF0000;
      healthStatus = "CRITICAL";
      healthEmoji = "🔴";
    } else if (highRiskPercent > 15 || mediumRiskPercent > 50) {
      healthColor = 0xFFA500;
      healthStatus = "WARNING";
      healthEmoji = "🟡";
    } else {
      healthColor = 0x00FF00;
      healthStatus = "HEALTHY";
      healthEmoji = "🟢";
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentStrikes = filteredStrikes.filter(strike => {
      const lastViolation = new Date(strike.lastViolation);
      return lastViolation >= thirtyDaysAgo;
    });

    const violationCounts = {};
    filteredStrikes.forEach(strike => {
      if (strike.history) {
        strike.history.forEach(entry => {
          const entryDate = new Date(entry.date);
          if (entryDate >= thirtyDaysAgo && entry.strikesAdded > 0) {
            const reason = entry.reason.replace(/^TEST:\s*/, '');
            violationCounts[reason] = (violationCounts[reason] || 0) + 1;
          }
        });
      }
    });

    const topViolations = Object.entries(violationCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([reason, count]) => `• ${reason} (${count}x)`)
      .join('\n') || 'No recent violations';

    let titleSuffix = '';
    let contextInfo = '';

    if (clanFilter) {
      titleSuffix = ` - ${clanFilter.toUpperCase()}`;
      if (channelClan && clanFilter === channelClan) {
        contextInfo = `📍 *${clanFilter.toUpperCase()} clan analytics (channel context)*\n\n`;
      } else {
        contextInfo = `🔍 *Filtered by: ${clanFilter.toUpperCase()}*\n\n`;
      }
    } else if (channelClan) {
      contextInfo = `🌐 *Server-wide analytics (use !analytics ${channelClan} for channel clan only)*\n\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 Server Analytics${titleSuffix}`)
      .setDescription(`${healthEmoji} **${healthStatus}** | ${new Date().toLocaleDateString()}`)
      .setColor(healthColor)
      .addFields(
        {
          name: "👥 Users",
          value: `Total: ${totalTrackedUsers}\nWith Strikes: ${totalUsersWithStrikes}\nClean: ${usersWithoutStrikes}`,
          inline: true
        },
        {
          name: "📈 Strikes",
          value: `Total: ${totalStrikes}\nAvg: ${averageStrikes}\nRecent: ${recentStrikes.length}`,
          inline: true
        },
        {
          name: "⚠️ Risk Distribution",
          value: `🔴 ${highRisk} (${(highRiskPercent).toFixed(1)}%)\n🟡 ${mediumRisk} (${(mediumRiskPercent).toFixed(1)}%)\n🟢 ${lowRisk}`,
          inline: true
        },
        {
          name: "🔝 Top Violations (30 days)",
          value: topViolations.length > 300 ? topViolations.substring(0, 300) + '...' : topViolations || 'None',
          inline: false
        }
      )
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    console.error(`❌ Analytics error: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Analytics Error")
      .setDescription("Failed to generate analytics dashboard.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

const commands = {
  allstrikes: handleAllStrikes,
  history: handleHistory,
  leaderboard: handleLeaderboard,
  analytics: handleAnalytics
};

const metadata = {
  name: "reports",
  description: "Reports and analytics commands",
  category: "analytics",
  permissions: ["moderator"],
  version: "2.0.0"
};

module.exports = {
  commands,
  metadata
};