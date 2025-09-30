const { EmbedBuilder } = require("discord.js");
const { hasModeratorPermissions } = require("../utils/permissions");
const { StrikeDecayManager } = require("../utils/strikeDecay");

async function handleConfigureDecay(message, args, context) {
  const { Strike, GuildSettings, strikeDecayManager, hasModeratorPermissions } = context;
  
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to configure decay settings.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const subcommand = args[0]?.toLowerCase();
  const decayManager = strikeDecayManager;

  if (subcommand === "enable") {
    try {
      const result = await decayManager.configureDecay(message.guild.id, true);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle("✅ Strike Decay Enabled")
          .setDescription("Strike decay system has been enabled!")
          .setColor(0x00FF00)
          .addFields(
            { name: "⚙️ How it works", value: "Strikes automatically reduce by 0.5 every 30 days", inline: false },
            { name: "🔄 Processing", value: "Decay is checked every hour for eligible users", inline: false },
            { name: "📢 Notifications", value: "Users receive DM notifications when decay is applied", inline: false }
          )
          .setFooter({ text: "Use !decay status to check current settings" })
          .setTimestamp();

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Configuration Failed")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  if (subcommand === "disable") {
    try {
      const result = await decayManager.configureDecay(message.guild.id, false);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle("✅ Strike Decay Disabled")
          .setDescription("Strike decay system has been disabled.")
          .setColor(0x00FF00)
          .addFields({
            name: "ℹ️ Note",
            value: "Existing strikes will remain unchanged. You can re-enable decay at any time.",
            inline: false
          })
          .setTimestamp();

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Configuration Failed")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  if (subcommand === "set") {
    const days = parseInt(args[1]);
    if (!days || days < 7 || days > 90) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Days")
        .setDescription("Days must be between 7 and 90.")
        .setColor(0xFF0000)
        .addFields({
          name: "💡 Recommended Settings",
          value: "• **7-14 days**: Very lenient (for new members)\n• **30 days**: Balanced (default)\n• **60-90 days**: Strict (for serious violations)",
          inline: false
        });
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    try {
      const status = await decayManager.getDecayStatus(message.guild.id);
      const result = await decayManager.configureDecay(message.guild.id, status.enabled, days);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle("✅ Decay Period Updated")
          .setDescription(`Strike decay period set to ${days} days.`)
          .setColor(0x00FF00)
          .addFields(
            { name: "⏰ Decay Schedule", value: `Every ${days} days, eligible users will have 0.5 strikes removed`, inline: false },
            { name: "📊 Impact", value: `Users with good behavior for ${days} days will see gradual strike reduction`, inline: false }
          )
          .setTimestamp();

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Configuration Failed")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  if (subcommand === "status") {
    try {
      const status = await decayManager.getDecayStatus(message.guild.id);

      const embed = new EmbedBuilder()
        .setTitle("📊 Strike Decay Status")
        .setColor(status.enabled ? 0x00FF00 : 0xFF0000)
        .addFields(
          { name: "Status", value: status.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
          { name: "Decay Period", value: `${status.days} days`, inline: true },
          { name: "Decay Amount", value: "0.5 strikes", inline: true }
        );

      if (status.lastProcessed) {
        embed.addFields({
          name: "Last Processed",
          value: `<t:${Math.floor(new Date(status.lastProcessed).getTime() / 1000)}:R>`,
          inline: true
        });
      }

      embed.setFooter({ text: "Use !decay help for configuration options" });
      embed.setTimestamp();

      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Status Check Failed")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  if (subcommand === "force") {
    const confirmEmbed = new EmbedBuilder()
      .setTitle("⚠️ Force Decay Process")
      .setDescription("This will immediately process decay for all eligible users.\n\n**Are you sure you want to proceed?**")
      .setColor(0xFFFF00)
      .setFooter({ text: "✅ Confirm | ❌ Cancel | Expires in 2 minutes" });

    const confirmMessage = await message.channel.send({ embeds: [confirmEmbed], allowedMentions: { repliedUser: false } });

    await confirmMessage.react('✅');
    await confirmMessage.react('❌');

    const filter = (reaction, reactionUser) => {
      return (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') &&
             !reactionUser.bot &&
             reaction.message.id === confirmMessage.id &&
             hasModeratorPermissions(message.guild.members.cache.get(reactionUser.id));
    };

    const collector = confirmMessage.createReactionCollector({
      filter,
      time: 120000,
      max: 1
    });

    collector.on('collect', async (reaction, reactionUser) => {
      if (reaction.emoji.name === '✅') {
        const progressEmbed = new EmbedBuilder()
          .setTitle("🔄 Processing Force Decay...")
          .setDescription("Please wait while decay is processed...")
          .setColor(0x0099FF);
        await confirmMessage.edit({ embeds: [progressEmbed] });
        await confirmMessage.reactions.removeAll().catch(() => {});

        try {
          // Use forced decay to bypass uptime check
          await decayManager.processDecay(true);

          const successEmbed = new EmbedBuilder()
            .setTitle("✅ Force Decay Completed")
            .setDescription("Strike decay has been processed for all eligible users.")
            .setColor(0x00FF00)
            .setTimestamp();
          await confirmMessage.edit({ embeds: [successEmbed] });
        } catch (error) {
          const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Force Decay Failed")
            .setDescription(`Error: ${error.message}`)
            .setColor(0xFF0000);
          await confirmMessage.edit({ embeds: [errorEmbed] });
        }
      } else {
        const cancelEmbed = new EmbedBuilder()
          .setTitle("❌ Force Decay Cancelled")
          .setDescription("No decay processing performed.")
          .setColor(0x808080);
        await confirmMessage.edit({ embeds: [cancelEmbed] });
        await confirmMessage.reactions.removeAll().catch(() => {});
      }
    });

    return;
  }

  // Default help message
  const embed = new EmbedBuilder()
    .setTitle("⚖️ Strike Decay System")
    .setDescription("Automatic strike reduction system for promoting rehabilitation")
    .setColor(0x0099FF)
    .addFields(
      { 
        name: "📋 Available Commands", 
        value: "`!decay enable` - Enable automatic decay\n`!decay disable` - Disable automatic decay\n`!decay set <days>` - Set decay period (7-90 days)\n`!decay status` - Check current settings\n`!decay force` - Force immediate decay processing", 
        inline: false 
      },
      { 
        name: "⚙️ How Decay Works", 
        value: "• Users automatically lose 0.5 strikes every configured period\n• Only applies to users with good behavior (no recent violations)\n• Prevents permanent punishment for reformed members\n• Users receive DM notifications when decay occurs", 
        inline: false 
      },
      {
        name: "🎯 Benefits",
        value: "• Encourages positive behavior change\n• Provides second chances for reformed members\n• Reduces long-term strike accumulation\n• Maintains fairness in the system",
        inline: false
      }
    )
    .setFooter({ text: "Strike decay promotes rehabilitation and fairness" })
    .setTimestamp();

  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

const commands = {
  decay: handleConfigureDecay
};

const metadata = {
  name: "decay",
  description: "Strike decay system commands",
  category: "balance",
  permissions: ["moderator"],
  version: "1.0.0"
};

module.exports = {
  commands,
  metadata,
  handleConfigureDecay
};