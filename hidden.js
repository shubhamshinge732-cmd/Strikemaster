
const { EmbedBuilder } = require("discord.js");

/**
 * Hidden Commands
 * Dangerous database operations - not shown in help menu
 * Owner-only commands for testing and emergency cleanup
 */

const metadata = {
  name: "hidden",
  description: "Hidden administrative commands",
  category: "owner",
  permissions: ["OWNER"],
  version: "1.0.0",
  hidden: true // This prevents it from showing in help
};

const commands = {
  async cleardb(message, args, context) {
    const { client, hasModeratorPermissions, Strike, GuildSettings } = context;
    
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to clear database.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const confirmationPhrase = args.join(' ');
    const requiredPhrase = "CLEAR ALL DATA PERMANENTLY";

    if (confirmationPhrase !== requiredPhrase) {
      const embed = new EmbedBuilder()
        .setTitle("⚠️ Database Clear Confirmation Required")
        .setDescription("**⚠️ DANGER: This will permanently delete ALL strike data!**\n\n**This includes:**\n• All user strikes\n• All strike history\n• All warnings\n• Guild settings (except API keys)\n\n**To confirm, type:**\n`!cleardb CLEAR ALL DATA PERMANENTLY`")
        .setColor(0xFF6600)
        .setFooter({ text: "This action cannot be undone!" });
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const finalConfirmEmbed = new EmbedBuilder()
      .setTitle("🚨 FINAL WARNING: Clear All Database Data?")
      .setDescription("**This will PERMANENTLY delete:**\n• All strikes for all users\n• All strike histories\n• All warnings\n• Most guild settings\n\n**Are you absolutely sure?**")
      .setColor(0xFF0000)
      .setFooter({ text: "✅ Confirm Permanent Deletion | ❌ Cancel | Expires in 30 seconds" });

    const confirmMessage = await message.channel.send({ embeds: [finalConfirmEmbed], allowedMentions: { repliedUser: false } });

    await confirmMessage.react('✅');
    await new Promise(resolve => setTimeout(resolve, 100));
    await confirmMessage.react('❌');

    const filter = (reaction, reactionUser) => {
      return (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') &&
             !reactionUser.bot &&
             reaction.message.id === confirmMessage.id &&
             hasModeratorPermissions(message.guild.members.cache.get(reactionUser.id));
    };

    const collector = confirmMessage.createReactionCollector({
      filter,
      time: 30000,
      max: 1
    });

    collector.on('collect', async (reaction, reactionUser) => {
      await confirmMessage.reactions.removeAll().catch(() => {});

      if (reaction.emoji.name === '✅') {
        try {
          const progressEmbed = new EmbedBuilder()
            .setTitle("🔄 Clearing Database...")
            .setDescription("Please wait while all data is being deleted...")
            .setColor(0xFF6600);
          await confirmMessage.edit({ embeds: [progressEmbed] });

          // Clear all strikes for this guild
          const strikeResult = await Strike.deleteMany({ guildId: message.guild.id });

          // Clear guild settings but preserve API keys
          const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
          if (guildSettings) {
            const preservedData = {
              guildId: message.guild.id,
              cocApiKey: guildSettings.cocApiKey || null,
              createdAt: guildSettings.createdAt || new Date(),
              updatedAt: new Date()
            };

            await GuildSettings.findOneAndReplace(
              { guildId: message.guild.id },
              preservedData,
              { upsert: true }
            );
          }

          const successEmbed = new EmbedBuilder()
            .setTitle("✅ Database Cleared Successfully")
            .setDescription("🧹 All strike data has been permanently deleted!")
            .setColor(0x00FF00)
            .addFields(
              { name: "📊 Deleted Records", value: `${strikeResult.deletedCount} user records`, inline: true },
              { name: "⚙️ Settings", value: "Reset (API keys preserved)", inline: true },
              { name: "🔒 Performed By", value: `${message.author.tag}\n(Confirmed by ${reactionUser.tag})`, inline: true }
            )
            .setFooter({ text: "Database cleanup completed" })
            .setTimestamp();

          await confirmMessage.edit({ embeds: [successEmbed] });

          console.log(`🗑️ Database cleared for guild ${message.guild.id} by ${message.author.tag} (confirmed by ${reactionUser.tag}): ${strikeResult.deletedCount} records deleted`);

        } catch (error) {
          console.error(`❌ Database clear error: ${error.message}`);
          const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Database Clear Failed")
            .setDescription(`Error during database cleanup: ${error.message}`)
            .setColor(0xFF0000);
          await confirmMessage.edit({ embeds: [errorEmbed] });
        }
      } else {
        const cancelledEmbed = new EmbedBuilder()
          .setTitle("❌ Database Clear Cancelled")
          .setDescription("Database cleanup cancelled - no data was deleted")
          .setColor(0x808080);
        await confirmMessage.edit({ embeds: [cancelledEmbed] });
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setTitle("⏰ Database Clear Request Expired")
          .setDescription("No action taken - Request timed out")
          .setColor(0x808080);
        await confirmMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
        await confirmMessage.reactions.removeAll().catch(() => {});
      }
    });
  },

  async cleandb(message, args, context) {
    // Alias for cleardb
    return this.cleardb(message, args, context);
  },

  async wipedb(message, args, context) {
    const { client, Strike, GuildSettings } = context;
    
    // Check if user is the bot owner - replace with your Discord user ID
    const OWNER_ID = process.env.OWNER_ID || "YOUR_DISCORD_USER_ID"; // Set this in your secrets
    
    if (message.author.id !== OWNER_ID) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Owner Only Command")
        .setDescription("This command can only be used by the bot owner.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const confirmationPhrase = args.join(' ');
    const requiredPhrase = "WIPE ALL DATA PERMANENTLY FOR TESTING";

    if (confirmationPhrase !== requiredPhrase) {
      const embed = new EmbedBuilder()
        .setTitle("🚨 OWNER DATABASE WIPE - TESTING MODE")
        .setDescription("**⚠️ DANGER: This will permanently delete ALL database data across ALL servers!**\n\n**This includes:**\n• All user strikes from all servers\n• All strike histories from all servers\n• All guild settings from all servers\n• All COC integrations and player links\n• All achievement data\n• Everything in your MongoDB database\n\n**⚠️ This is designed for testing with MongoDB free tier**\n\n**To confirm, type:**\n`!wipedb WIPE ALL DATA PERMANENTLY FOR TESTING`")
        .setColor(0xFF0000)
        .setFooter({ text: "Owner only - This action cannot be undone!" });
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const finalConfirmEmbed = new EmbedBuilder()
      .setTitle("🚨 FINAL WARNING: WIPE ENTIRE DATABASE?")
      .setDescription("**This will PERMANENTLY delete:**\n• All strikes from ALL servers\n• All guild settings from ALL servers\n• All COC data and integrations\n• Everything in your MongoDB database\n\n**⚠️ TESTING MODE - MONGODB FREE TIER CLEANUP**\n\n**Are you absolutely sure?**")
      .setColor(0xFF0000)
      .setFooter({ text: "✅ WIPE DATABASE | ❌ Cancel | Expires in 30 seconds" });

    const confirmMessage = await message.channel.send({ embeds: [finalConfirmEmbed], allowedMentions: { repliedUser: false } });

    await confirmMessage.react('✅');
    await new Promise(resolve => setTimeout(resolve, 100));
    await confirmMessage.react('❌');

    const filter = (reaction, reactionUser) => {
      return (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') &&
             reactionUser.id === OWNER_ID &&
             reaction.message.id === confirmMessage.id;
    };

    const collector = confirmMessage.createReactionCollector({
      filter,
      time: 30000,
      max: 1
    });

    collector.on('collect', async (reaction, reactionUser) => {
      await confirmMessage.reactions.removeAll().catch(() => {});

      if (reaction.emoji.name === '✅') {
        try {
          const progressEmbed = new EmbedBuilder()
            .setTitle("🔄 WIPING ENTIRE DATABASE...")
            .setDescription("Please wait while ALL data is being permanently deleted from MongoDB...")
            .setColor(0xFF6600);
          await confirmMessage.edit({ embeds: [progressEmbed] });

          // Get counts before deletion for reporting
          const strikeCount = await Strike.countDocuments({});
          const guildSettingsCount = await GuildSettings.countDocuments({});

          // WIPE EVERYTHING - No guild filtering
          console.log(`🚨 OWNER DATABASE WIPE initiated by ${message.author.tag}`);
          
          const strikeResult = await Strike.deleteMany({});
          const settingsResult = await GuildSettings.deleteMany({});

          const successEmbed = new EmbedBuilder()
            .setTitle("✅ DATABASE COMPLETELY WIPED")
            .setDescription("🧹 ALL data has been permanently deleted from MongoDB!")
            .setColor(0x00FF00)
            .addFields(
              { name: "📊 Deleted Records", value: `${strikeResult.deletedCount} strike records\n${settingsResult.deletedCount} guild settings`, inline: true },
              { name: "🌍 Scope", value: "Entire Database\nAll Servers", inline: true },
              { name: "🔒 Performed By", value: `${message.author.tag}\n(Owner Only)`, inline: true },
              { name: "💾 MongoDB Status", value: "Free tier cleaned\nReady for testing", inline: false }
            )
            .setFooter({ text: "Database completely wiped for testing purposes" })
            .setTimestamp();

          await confirmMessage.edit({ embeds: [successEmbed] });

          console.log(`🗑️ COMPLETE DATABASE WIPE by owner ${message.author.tag}: ${strikeResult.deletedCount} strikes, ${settingsResult.deletedCount} settings deleted`);

        } catch (error) {
          console.error(`❌ Database wipe error: ${error.message}`);
          const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Database Wipe Failed")
            .setDescription(`Error during database wipe: ${error.message}`)
            .setColor(0xFF0000);
          await confirmMessage.edit({ embeds: [errorEmbed] });
        }
      } else {
        const cancelledEmbed = new EmbedBuilder()
          .setTitle("❌ Database Wipe Cancelled")
          .setDescription("Database wipe cancelled - no data was deleted")
          .setColor(0x808080);
        await confirmMessage.edit({ embeds: [cancelledEmbed] });
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setTitle("⏰ Database Wipe Request Expired")
          .setDescription("No action taken - Request timed out")
          .setColor(0x808080);
        await confirmMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
        await confirmMessage.reactions.removeAll().catch(() => {});
      }
    });
  },

  async wipeall(message, args, context) {
    // Alias for wipedb
    return this.wipedb(message, args, context);
  }
};

module.exports = {
  metadata,
  commands
};
