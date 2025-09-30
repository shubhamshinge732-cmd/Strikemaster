const { EmbedBuilder } = require("discord.js");

// Handle missing dependencies gracefully
let BackupManager, hasModeratorPermissions, ConfirmationFlow;

try {
  BackupManager = require("../utils/backupManager").BackupManager;
} catch (error) {
  console.warn("BackupManager not found, backup commands may not work properly");
}

try {
  hasModeratorPermissions = require("../utils/permissions").hasModeratorPermissions;
} catch (error) {
  // Fallback permission check
  hasModeratorPermissions = (member) => {
    return member && member.permissions && member.permissions.has("ManageMessages");
  };
}

try {
  ConfirmationFlow = require("../utils/confirmationFlow").ConfirmationFlow;
} catch (error) {
  // Simple confirmation fallback
  ConfirmationFlow = class {
    createConfirmationEmbed(options) {
      return new EmbedBuilder()
        .setTitle(options.title)
        .setDescription(options.description)
        .setColor(options.color)
        .setFooter({ text: options.footerText });
    }
    
    async createSimpleConfirmation(message, options) {
      const confirmMessage = await message.channel.send({ embeds: [options.embed] });
      await confirmMessage.react('✅');
      await confirmMessage.react('❌');
      
      const filter = (reaction, user) => {
        return (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') && !user.bot;
      };
      
      const collector = confirmMessage.createReactionCollector({ filter, max: 1, time: 60000 });
      
      collector.on('collect', async (reaction, user) => {
        if (reaction.emoji.name === '✅') {
          await options.onConfirm(confirmMessage, user);
        }
      });
    }
  };
}

async function handleBackupCommand(message, args, client, context) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to manage backups.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const subcommand = args[0]?.toLowerCase();
  const backupManager = new BackupManager(client);

  switch (subcommand) {
    case 'create':
    case 'manual':
    case 'now':
      return handleCreateBackup(message, backupManager);

    case 'list':
    case 'ls':
      return handleListBackups(message, backupManager);

    case 'restore':
      return handleRestoreBackup(message, args.slice(1), backupManager);

    case 'stats':
    case 'status':
      return handleBackupStats(message, backupManager);

    case 'delete':
    case 'remove':
      return handleDeleteBackup(message, args.slice(1), backupManager);

    case 'cleanup':
      return handleBackupCleanup(message, backupManager);

    case 'setlogchannel':
    case 'setlog':
      return handleSetBackupLogChannel(message, args.slice(1), client);

    default:
      return handleBackupHelp(message);
  }
}

async function handleCreateBackup(message, backupManager) {
  const confirmation = new ConfirmationFlow();

  const confirmEmbed = confirmation.createConfirmationEmbed({
    title: "💾 Create Manual Database Backup?",
    description: "This will create a complete backup of all database records including:\n\n• All user strikes and history\n• All guild settings and configurations\n• All COC integrations and mappings",
    color: 0x0099FF,
    footerText: "✅ Create Backup | ❌ Cancel"
  });

  const result = await confirmation.createSimpleConfirmation(message, {
    embed: confirmEmbed,
    onConfirm: async (confirmMessage, reactionUser) => {
      const progressEmbed = new EmbedBuilder()
        .setTitle("💾 Creating Database Backup...")
        .setDescription("Please wait while the backup is being created...")
        .setColor(0x0099FF);

      await confirmMessage.edit({ embeds: [progressEmbed] });

      try {
        const backupResult = await backupManager.performBackup(true);

        const successEmbed = new EmbedBuilder()
          .setTitle("✅ Backup Created Successfully")
          .setColor(0x00FF00)
          .addFields(
            { name: "File Name", value: backupResult.fileName, inline: true },
            { name: "File Size", value: `${backupResult.size}MB`, inline: true },
            { name: "Duration", value: `${backupResult.duration}ms`, inline: true },
            { name: "Records Backed Up", value: `Strikes: ${backupResult.recordCount.strikes}\nSettings: ${backupResult.recordCount.guildSettings}`, inline: false }
          )
          .setFooter({ text: `Backup created by ${reactionUser.tag}` })
          .setTimestamp();

        await confirmMessage.edit({ embeds: [successEmbed] });

      } catch (error) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Backup Failed")
          .setDescription(`Error creating backup: ${error.message}`)
          .setColor(0xFF0000);

        await confirmMessage.edit({ embeds: [errorEmbed] });
      }
    }
  });
}

async function handleListBackups(message, backupManager) {
  try {
    const backups = await backupManager.listBackups();

    if (backups.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("💾 Database Backups")
        .setDescription("No backups found.")
        .setColor(0x00FF00)
        .addFields({
          name: "💡 Create a Backup",
          value: "Use `!backup create` to create your first backup.",
          inline: false
        });

      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const embed = new EmbedBuilder()
      .setTitle("💾 Available Database Backups")
      .setDescription(`Found ${backups.length} backup files`)
      .setColor(0x0099FF);

    // Show last 10 backups
    const recentBackups = backups.slice(0, 10);

    for (const backup of recentBackups) {
      const createdDate = new Date(backup.created).toLocaleDateString();
      const createdTime = new Date(backup.created).toLocaleTimeString();
      const type = backup.metadata.type || 'unknown';
      const records = backup.metadata.totalRecords ? 
        `${backup.metadata.totalRecords.strikes} strikes, ${backup.metadata.totalRecords.guildSettings} settings` : 
        'unknown';

      embed.addFields({
        name: `📄 ${backup.fileName}`,
        value: `**Size:** ${backup.size}\n**Created:** ${createdDate} ${createdTime}\n**Type:** ${type}\n**Records:** ${records}`,
        inline: true
      });
    }

    if (backups.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${backups.length} backups. Use !backup stats for complete overview.` });
    }

    embed.setTimestamp();
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Error Listing Backups")
      .setDescription(`Failed to list backups: ${error.message}`)
      .setColor(0xFF0000);

    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

async function handleRestoreBackup(message, args, backupManager) {
  const fileName = args[0];
  const dryRun = args.includes('--dry-run') || args.includes('--preview');

  if (!fileName) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!backup restore <filename> [--dry-run]`\n\n**Examples:**\n• `!backup restore backup_2024-01-15T10-30-00-000Z.json`\n• `!backup restore backup_2024-01-15T10-30-00-000Z.json --dry-run`")
      .setColor(0xFF0000)
      .addFields({
        name: "💡 Available Options",
        value: "• `--dry-run` or `--preview` - Show what would be restored without making changes",
        inline: false
      });

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const confirmation = new ConfirmationFlow();

  const confirmEmbed = confirmation.createConfirmationEmbed({
    title: `🔄 ${dryRun ? 'Preview' : 'Restore'} Database Backup?`,
    description: `${dryRun ? 'This will preview what would be restored from:' : '⚠️ **WARNING: This will overwrite current database data!**\n\nRestore from:'}\n\`${fileName}\`\n\n${dryRun ? 'No changes will be made to the database.' : 'All current data will be replaced with backup data.'}`,
    color: dryRun ? 0x0099FF : 0xFFFF00,
    footerText: `✅ ${dryRun ? 'Preview' : 'Restore'} | ❌ Cancel`
  });

  const result = await confirmation.createSimpleConfirmation(message, {
    embed: confirmEmbed,
    onConfirm: async (confirmMessage, reactionUser) => {
      const progressEmbed = new EmbedBuilder()
        .setTitle(`🔄 ${dryRun ? 'Previewing' : 'Restoring'} Database Backup...`)
        .setDescription("Please wait while the restore operation is processed...")
        .setColor(0x0099FF);

      await confirmMessage.edit({ embeds: [progressEmbed] });

      try {
        const restoreResult = await backupManager.restoreFromBackup(fileName, { 
          dryRun,
          targetGuild: null
        });

        const resultEmbed = new EmbedBuilder()
          .setTitle(`✅ ${dryRun ? 'Preview' : 'Restore'} Completed`)
          .setColor(0x00FF00)
          .addFields(
            { name: "Backup File", value: fileName, inline: false },
            { name: "Backup Created", value: new Date(restoreResult.metadata.timestamp).toLocaleString(), inline: true },
            { name: "Backup Type", value: restoreResult.metadata.type || 'unknown', inline: true },
            { name: "Strike Records", value: `${dryRun ? 'Would restore' : 'Restored'}: ${restoreResult.results.strikes.restored}\nSkipped: ${restoreResult.results.strikes.skipped}\nErrors: ${restoreResult.results.strikes.errors}`, inline: true },
            { name: "Guild Settings", value: `${dryRun ? 'Would restore' : 'Restored'}: ${restoreResult.results.guildSettings.restored}\nSkipped: ${restoreResult.results.guildSettings.skipped}\nErrors: ${restoreResult.results.guildSettings.errors}`, inline: true }
          )
          .setFooter({ text: `${dryRun ? 'Previewed' : 'Restored'} by ${reactionUser.tag}` })
          .setTimestamp();

        await confirmMessage.edit({ embeds: [resultEmbed] });

      } catch (error) {
        const errorEmbed = new EmbedBuilder()
          .setTitle(`❌ ${dryRun ? 'Preview' : 'Restore'} Failed`)
          .setDescription(`Error: ${error.message}`)
          .setColor(0xFF0000);

        await confirmMessage.edit({ embeds: [errorEmbed] });
      }
    }
  });
}

async function handleBackupStats(message, backupManager) {
  try {
    const stats = await backupManager.getBackupStats();

    const embed = new EmbedBuilder()
      .setTitle("💾 Backup System Statistics")
      .setColor(0x0099FF)
      .addFields(
        { name: "📊 Overview", value: `Total Backups: ${stats.totalBackups}\nTotal Size: ${stats.totalSize}\nAverage Size: ${stats.averageSize}`, inline: true },
        { name: "📅 Timeline", value: stats.newestBackup ? `Newest: ${new Date(stats.newestBackup).toLocaleDateString()}\nOldest: ${new Date(stats.oldestBackup).toLocaleDateString()}` : 'No backups available', inline: true },
        { name: "⚙️ Settings", value: `Auto-backup: Every 6 hours\nRetention: 30 backups\nDirectory: ./backups`, inline: true }
      );

    if (stats.backups && stats.backups.length > 0) {
      const recentList = stats.backups.slice(0, 5).map(backup => {
        const date = new Date(backup.created).toLocaleDateString();
        return `• ${backup.fileName.substring(0, 30)}... (${backup.size}, ${date})`;
      }).join('\n');

      embed.addFields({
        name: "📋 Recent Backups",
        value: recentList,
        inline: false
      });
    }

    embed.setTimestamp();
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Error Getting Backup Statistics")
      .setDescription(`Failed to get backup stats: ${error.message}`)
      .setColor(0xFF0000);

    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

async function handleDeleteBackup(message, args, backupManager) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to delete backups.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    // Get list of available backups
    const backups = await backupManager.listBackups();

    if (backups.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("💾 No Backups Available")
        .setDescription("There are no backup files to delete.")
        .setColor(0x00FF00)
        .addFields({
          name: "💡 Create a Backup",
          value: "Use `!backup create` to create your first backup.",
          inline: false
        });

      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    // Show backup selection menu
    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const maxShow = Math.min(10, backups.length);
    const backupsToShow = backups.slice(0, maxShow);

    let backupList = "";
    for (let i = 0; i < backupsToShow.length; i++) {
      const backup = backupsToShow[i];
      const createdDate = new Date(backup.created).toLocaleDateString();
      const createdTime = new Date(backup.created).toLocaleTimeString();
      const type = backup.metadata.type || 'unknown';
      
      backupList += `${numberEmojis[i]} **${backup.fileName.substring(7, 26)}** (${backup.size})\n`;
      backupList += `   📅 ${createdDate} ${createdTime} | ${type}\n\n`;
    }

    const selectionEmbed = new EmbedBuilder()
      .setTitle("🗑️ Select Backup to Delete")
      .setDescription(`**⚠️ WARNING: Deletion cannot be undone!**\n\nSelect which backup file to delete:\n\n${backupList}`)
      .setColor(0xFF0000)
      .setFooter({ text: "Select backup number | ❌ Cancel | Expires in 3 minutes" });

    if (backups.length > 10) {
      selectionEmbed.setFooter({ text: `Showing 10 of ${backups.length} backups | Select number | ❌ Cancel` });
    }

    const selectionMessage = await message.channel.send({ 
      embeds: [selectionEmbed], 
      allowedMentions: { repliedUser: false } 
    });

    // Add number reactions
    const requiredEmojis = numberEmojis.slice(0, maxShow).concat(['❌']);
    for (const emoji of requiredEmojis) {
      await selectionMessage.react(emoji).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Backup selection collector
    const selectionFilter = (reaction, reactionUser) => {
      const isValidNumberEmoji = numberEmojis.slice(0, maxShow).includes(reaction.emoji.name);
      const isCancelEmoji = reaction.emoji.name === '❌';
      return (isValidNumberEmoji || isCancelEmoji) && 
             !reactionUser.bot && 
             reaction.message.id === selectionMessage.id &&
             hasModeratorPermissions(message.guild.members.cache.get(reactionUser.id));
    };

    const selectionCollector = selectionMessage.createReactionCollector({ 
      filter: selectionFilter, 
      time: 180000,
      max: 1
    });

    selectionCollector.on('collect', async (reaction, reactionUser) => {
      if (reaction.emoji.name === '❌') {
        const cancelledEmbed = new EmbedBuilder()
          .setTitle("❌ Backup Deletion Cancelled")
          .setDescription("No backup files were deleted.")
          .setColor(0x808080);
        await selectionMessage.edit({ embeds: [cancelledEmbed] });
        await selectionMessage.reactions.removeAll().catch(() => {});
        return;
      }

      // Get selected backup
      const emojiIndex = numberEmojis.indexOf(reaction.emoji.name);
      if (emojiIndex >= 0 && emojiIndex < backupsToShow.length) {
        const selectedBackup = backupsToShow[emojiIndex];

        // Show final confirmation
        const confirmEmbed = new EmbedBuilder()
          .setTitle("🗑️ Confirm Backup Deletion")
          .setDescription(`**⚠️ FINAL WARNING: This action cannot be undone!**\n\nYou are about to permanently delete:\n\`${selectedBackup.fileName}\``)
          .setColor(0xFF0000)
          .addFields(
            { name: "📄 File Name", value: selectedBackup.fileName, inline: false },
            { name: "📊 Size", value: selectedBackup.size, inline: true },
            { name: "📅 Created", value: new Date(selectedBackup.created).toLocaleString(), inline: true },
            { name: "🔧 Type", value: selectedBackup.metadata.type || 'unknown', inline: true }
          )
          .setFooter({ text: "✅ Delete Permanently | ❌ Cancel | Expires in 2 minutes" });

        await selectionMessage.edit({ embeds: [confirmEmbed] });
        await selectionMessage.reactions.removeAll().catch(() => {});

        // Add confirmation reactions
        const confirmReactions = ['✅', '❌'];
        for (const reaction of confirmReactions) {
          await selectionMessage.react(reaction).catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Final confirmation collector
        const confirmFilter = (confirmReaction, confirmUser) => {
          return (confirmReaction.emoji.name === '✅' || confirmReaction.emoji.name === '❌') &&
                 !confirmUser.bot &&
                 confirmReaction.message.id === selectionMessage.id &&
                 hasModeratorPermissions(message.guild.members.cache.get(confirmUser.id));
        };

        const confirmCollector = selectionMessage.createReactionCollector({
          filter: confirmFilter,
          time: 120000,
          max: 1
        });

        confirmCollector.on('collect', async (confirmReaction, confirmUser) => {
          if (confirmReaction.emoji.name === '✅') {
            try {
              await backupManager.deleteBackup(selectedBackup.fileName);

              const successEmbed = new EmbedBuilder()
                .setTitle("✅ Backup Deleted Successfully")
                .setDescription(`Backup file has been permanently deleted.`)
                .setColor(0x00FF00)
                .addFields(
                  { name: "📄 File Name", value: selectedBackup.fileName, inline: false },
                  { name: "📊 Size", value: selectedBackup.size, inline: true },
                  { name: "🗑️ Deleted By", value: confirmUser.tag, inline: true }
                )
                .setFooter({ text: `Deletion performed by ${confirmUser.tag}` })
                .setTimestamp();

              await selectionMessage.edit({ embeds: [successEmbed] });

            } catch (error) {
              const errorEmbed = new EmbedBuilder()
                .setTitle("❌ Deletion Failed")
                .setDescription(`Error deleting backup: ${error.message}`)
                .setColor(0xFF0000);

              await selectionMessage.edit({ embeds: [errorEmbed] });
            }
          } else {
            const cancelledEmbed = new EmbedBuilder()
              .setTitle("❌ Backup Deletion Cancelled")
              .setDescription("No backup files were deleted.")
              .setColor(0x808080);
            await selectionMessage.edit({ embeds: [cancelledEmbed] });
          }
        });

        confirmCollector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
              .setTitle("⏰ Deletion Confirmation Expired")
              .setDescription("No action taken - confirmation timed out")
              .setColor(0x808080);
            await selectionMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
            await selectionMessage.reactions.removeAll().catch(() => {});
          }
        });
      }
    });

    selectionCollector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setTitle("⏰ Backup Selection Expired")
          .setDescription("No backup selected - operation cancelled")
          .setColor(0x808080);
        await selectionMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
        await selectionMessage.reactions.removeAll().catch(() => {});
      }
    });

  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Error Loading Backups")
      .setDescription(`Failed to load backup list: ${error.message}`)
      .setColor(0xFF0000);

    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

async function handleBackupCleanup(message, backupManager) {
  const confirmation = new ConfirmationFlow();

  const confirmEmbed = confirmation.createConfirmationEmbed({
    title: "🧹 Clean Up Old Backups?",
    description: "This will remove backup files older than the retention limit (30 backups).\n\n**This action cannot be undone.**",
    color: 0xFFFF00,
    footerText: "✅ Clean Up | ❌ Cancel"
  });

  const result = await confirmation.createSimpleConfirmation(message, {
    embed: confirmEmbed,
    onConfirm: async (confirmMessage, reactionUser) => {
      try {
        await backupManager.cleanupOldBackups();

        const successEmbed = new EmbedBuilder()
          .setTitle("✅ Backup Cleanup Completed")
          .setDescription("Old backup files have been cleaned up successfully.")
          .setColor(0x00FF00)
          .setFooter({ text: `Cleanup performed by ${reactionUser.tag}` })
          .setTimestamp();

        await confirmMessage.edit({ embeds: [successEmbed] });

      } catch (error) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Cleanup Failed")
          .setDescription(`Error during cleanup: ${error.message}`)
          .setColor(0xFF0000);

        await confirmMessage.edit({ embeds: [errorEmbed] });
      }
    }
  });
}

async function handleSetBackupLogChannel(message, args, client) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to configure backup log channels.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const channel = message.mentions.channels.first() || message.channel;

  try {
    const { GuildSettings } = require("../config/database");

    await GuildSettings.findOneAndUpdate(
      { guildId: message.guild.id },
      { 
        $set: { 
          backupLogChannelId: channel.id,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ Backup Log Channel Set")
      .setDescription(`Backup log channel set to ${channel}`)
      .setColor(0x00FF00)
      .addFields(
        { name: "📍 Channel", value: channel.toString(), inline: true },
        { name: "🔔 Notifications", value: "Backup completions, failures, and status updates", inline: true },
        { name: "⚙️ Scope", value: "Automated & manual backup operations", inline: true }
      )
      .setFooter({ text: "Backup notifications will now be sent to this channel" })
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    console.error(`Error setting backup log channel: ${error.message}`);
    const embed = new EmbedBuilder()
      .setTitle("❌ Configuration Failed")
      .setDescription(`Failed to set backup log channel: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

async function handleBackupHelp(message) {
  const embed = new EmbedBuilder()
    .setTitle("💾 Backup System Commands")
    .setDescription("Automated database backup and restore system")
    .setColor(0x0099FF)
    .addFields(
      { name: "!backup create", value: "Create a manual backup immediately", inline: false },
      { name: "!backup manual", value: "Create a manual backup (alias for create)", inline: false },
      { name: "!backup now", value: "Create a manual backup right now (alias)", inline: false },
      { name: "!backup list", value: "List all available backups", inline: false },
      { name: "!backup delete", value: "Interactive backup deletion with selection menu", inline: false },
      { name: "!backup setlogchannel [#channel]", value: "Set dedicated backup log channel", inline: false },
      { name: "!backup restore <filename>", value: "Restore from backup file", inline: false },
      { name: "!backup restore <filename> --dry-run", value: "Preview restore without making changes", inline: false },
      { name: "!backup stats", value: "View backup system statistics", inline: false },
      { name: "!backup cleanup", value: "Clean up old backup files", inline: false }
    )
    .addFields({
      name: "🤖 Automated Backups",
      value: "• Backups are created automatically every 6 hours\n• Maximum of 30 backups are retained\n• Backups include all strikes, guild settings, and configurations",
      inline: false
    })
    .setFooter({ text: "All backup commands require moderator permissions" })
    .setTimestamp();

  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

module.exports = {
  commands: {
    backup: handleBackupCommand
  },
  metadata: {
    name: "backup",
    description: "Database backup and restore management",
    category: "admin",
    permissions: ["moderator"]
  },
  // Export the function directly for backwards compatibility
  handleBackupCommand
};