
const { EmbedBuilder } = require("discord.js");

class ConfirmationFlow {
  constructor(options = {}) {
    this.timeout = options.timeout || 300000; // 5 minutes default
    this.requiredPermissions = options.requiredPermissions;
    this.allowedUsers = options.allowedUsers;
  }

  // Create a standard confirmation embed
  createConfirmationEmbed(options) {
    const {
      title,
      description,
      color = 0xFFFF00,
      user,
      action,
      consequences,
      thumbnailUrl,
      fields = [],
      footerText = "✅ Confirm | ❌ Cancel | Expires in 5 minutes"
    } = options;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setFooter({ text: footerText })
      .setTimestamp();

    if (thumbnailUrl) {
      embed.setThumbnail(thumbnailUrl);
    }

    if (action) {
      embed.addFields({ name: "Action", value: action, inline: true });
    }

    if (consequences) {
      embed.addFields({ name: "Result", value: consequences, inline: true });
    }

    fields.forEach(field => embed.addFields(field));

    return embed;
  }

  // Handle multi-option selection (for clan selection, etc.)
  async createMultiOptionFlow(message, options) {
    const {
      title,
      description,
      choices,
      maxChoices = 10,
      onSelect,
      onCancel,
      thumbnailUrl
    } = options;

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const validChoices = choices.slice(0, Math.min(maxChoices, choices.length));

    let choiceText = "";
    for (let i = 0; i < validChoices.length; i++) {
      choiceText += `${numberEmojis[i]} **${validChoices[i].label}**\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`${description}\n\n${choiceText}`)
      .setColor(0x0099FF)
      .setFooter({ text: "Select option number | ❌ Cancel | Expires in 5 minutes" })
      .setTimestamp();

    if (thumbnailUrl) {
      embed.setThumbnail(thumbnailUrl);
    }

    const selectionMessage = await message.channel.send({ 
      embeds: [embed], 
      allowedMentions: { repliedUser: false } 
    });

    // Add reaction emojis
    const requiredEmojis = numberEmojis.slice(0, validChoices.length).concat(['❌']);
    for (const emoji of requiredEmojis) {
      await selectionMessage.react(emoji).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return new Promise((resolve) => {
      const filter = (reaction, reactionUser) => {
        const isValidEmoji = numberEmojis.slice(0, validChoices.length).includes(reaction.emoji.name) || reaction.emoji.name === '❌';
        return isValidEmoji && 
               !reactionUser.bot && 
               reaction.message.id === selectionMessage.id &&
               this.hasPermissionToConfirm(message.guild.members.cache.get(reactionUser.id));
      };

      const collector = selectionMessage.createReactionCollector({
        filter,
        time: this.timeout,
        max: 1
      });

      collector.on('collect', async (reaction, reactionUser) => {
        if (reaction.emoji.name === '❌') {
          if (onCancel) {
            await onCancel(selectionMessage, reactionUser);
          }
          resolve({ cancelled: true, reactionUser });
        } else {
          const emojiIndex = numberEmojis.indexOf(reaction.emoji.name);
          if (emojiIndex >= 0 && emojiIndex < validChoices.length) {
            const selectedChoice = validChoices[emojiIndex];
            if (onSelect) {
              await onSelect(selectedChoice, selectionMessage, reactionUser);
            }
            resolve({ 
              cancelled: false, 
              selectedChoice, 
              selectedIndex: emojiIndex,
              reactionUser 
            });
          }
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle("⏰ Selection Expired")
            .setDescription("No selection made - request timed out")
            .setColor(0x808080);
          await selectionMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
          await selectionMessage.reactions.removeAll().catch(() => {});
          resolve({ cancelled: true, reason: 'timeout' });
        }
      });
    });
  }

  // Handle simple yes/no confirmation
  async createSimpleConfirmation(message, options) {
    const {
      embed,
      onConfirm,
      onCancel,
      customEmojis = { confirm: '✅', cancel: '❌' }
    } = options;

    const confirmMessage = await message.channel.send({ 
      embeds: [embed], 
      allowedMentions: { repliedUser: false } 
    });

    await confirmMessage.react(customEmojis.confirm);
    await new Promise(resolve => setTimeout(resolve, 100));
    await confirmMessage.react(customEmojis.cancel);

    return new Promise((resolve) => {
      const filter = (reaction, reactionUser) => {
        return (reaction.emoji.name === customEmojis.confirm || reaction.emoji.name === customEmojis.cancel) &&
               !reactionUser.bot &&
               reaction.message.id === confirmMessage.id &&
               this.hasPermissionToConfirm(message.guild.members.cache.get(reactionUser.id));
      };

      const collector = confirmMessage.createReactionCollector({
        filter,
        time: this.timeout,
        max: 1
      });

      collector.on('collect', async (reaction, reactionUser) => {
        try {
          await confirmMessage.reactions.removeAll().catch(() => {});
        } catch (error) {
          console.log(`Could not remove reactions: ${error.message}`);
        }

        if (reaction.emoji.name === customEmojis.confirm) {
          if (onConfirm) {
            await onConfirm(confirmMessage, reactionUser);
          }
          resolve({ confirmed: true, reactionUser, message: confirmMessage });
        } else {
          if (onCancel) {
            await onCancel(confirmMessage, reactionUser);
          }
          resolve({ confirmed: false, reactionUser, message: confirmMessage });
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle("⏰ Confirmation Expired")
            .setDescription("No action taken - request timed out")
            .setColor(0x808080);
          await confirmMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
          await confirmMessage.reactions.removeAll().catch(() => {});
          resolve({ confirmed: false, reason: 'timeout', message: confirmMessage });
        }
      });
    });
  }

  // Permission check helper
  hasPermissionToConfirm(member) {
    if (!member) return false;

    if (this.allowedUsers && this.allowedUsers.includes(member.id)) {
      return true;
    }

    if (this.requiredPermissions) {
      return this.requiredPermissions(member);
    }

    // Default: require moderator permissions
    const { hasModeratorPermissions } = require('./permissions');
    return hasModeratorPermissions(member);
  }

  // Create strike confirmation with clan selection
  async createStrikeConfirmation(message, user, strikeData, clanRoles = []) {
    const currentRecord = await require('../config/database').Strike.findOne({ 
      userId: user.id, 
      guildId: message.guild.id 
    });
    const currentStrikes = currentRecord ? currentRecord.strikes : 0;
    const newStrikes = currentStrikes + strikeData.strikes;

    const warningText = newStrikes >= 4 ? " 🚫 **BAN THRESHOLD!**" : 
                       newStrikes >= 3 ? " ⚠️ **DANGER ZONE!**" : "";

    // If multiple clan roles, show selection first
    if (clanRoles.length > 1) {
      const clanChoices = clanRoles.map(clan => ({ label: clan, value: clan }));

      const clanResult = await this.createMultiOptionFlow(message, {
        title: `⚠️ Strike ${user.username}?`,
        description: `**${strikeData.reason}**\n\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (+${strikeData.strikes})${warningText}\n\n**User has multiple clan roles. Please select which clan to log this strike to:**`,
        choices: clanChoices,
        thumbnailUrl: user.displayAvatarURL()
      });

      if (clanResult.cancelled) {
        return { confirmed: false, selectedClan: null };
      }

      const selectedClan = clanResult.selectedChoice.value;

      // Now show final confirmation
      const confirmEmbed = this.createConfirmationEmbed({
        title: `⚠️ Strike ${user.username}?`,
        description: `**${strikeData.reason}**\n\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (+${strikeData.strikes})${warningText}`,
        color: 0xFFFF00,
        thumbnailUrl: user.displayAvatarURL(),
        fields: [{ name: "Selected Clan", value: selectedClan, inline: true }]
      });

      const finalResult = await this.createSimpleConfirmation(message, {
        embed: confirmEmbed
      });

      return { 
        confirmed: finalResult.confirmed, 
        selectedClan, 
        reactionUser: finalResult.reactionUser,
        message: finalResult.message 
      };
    } else {
      // Single or no clan - direct confirmation
      const selectedClan = clanRoles.length === 1 ? clanRoles[0] : null;
      const confirmEmbed = this.createConfirmationEmbed({
        title: `⚠️ Strike ${user.username}?`,
        description: `**${strikeData.reason}**\n\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (+${strikeData.strikes})${warningText}`,
        color: 0xFFFF00,
        thumbnailUrl: user.displayAvatarURL(),
        fields: selectedClan ? [{ name: "Detected Clan", value: selectedClan, inline: true }] : []
      });

      const result = await this.createSimpleConfirmation(message, {
        embed: confirmEmbed
      });

      return { 
        confirmed: result.confirmed, 
        selectedClan, 
        reactionUser: result.reactionUser,
        message: result.message 
      };
    }
  }

  // Create achievement confirmation
  async createAchievementConfirmation(message, user, achievementType, strikesReduced) {
    const currentRecord = await require('../config/database').Strike.findOne({ 
      userId: user.id, 
      guildId: message.guild.id 
    });
    const currentStrikes = currentRecord ? currentRecord.strikes : 0;
    const newStrikes = Math.max(0, currentStrikes - strikesReduced);

    const confirmEmbed = this.createConfirmationEmbed({
      title: `🏆 Apply achievement for ${user.username}?`,
      description: `**${achievementType}**\n\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (-${strikesReduced})`,
      color: 0x00FF00,
      thumbnailUrl: user.displayAvatarURL()
    });

    return this.createSimpleConfirmation(message, { embed: confirmEmbed });
  }
}

module.exports = { ConfirmationFlow };
