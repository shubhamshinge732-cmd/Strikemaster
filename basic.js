const { EmbedBuilder } = require("discord.js");

function handleHelp(message) {
  try {
    const args = message.content.slice(1).trim().split(/ +/).slice(1);
    const category = args[0]?.toLowerCase();

    console.log(`Help command called with category: ${category}`);

    // If specific category requested, show detailed help for that category
    if (category) {
      const categoryEmbed = createHelpCategoryEmbed(category);
      if (categoryEmbed) {
        console.log(`Found help for category: ${category}`);
        return message.channel.send({ embeds: [categoryEmbed], allowedMentions: { repliedUser: false } });
      } else {
        console.log(`Category not found: ${category}`);
        // Show error for invalid categories
        const errorEmbed = new EmbedBuilder()
          .setTitle("❓ Category Not Found")
          .setDescription(`Help category '${category}' not found. Use \`!help\` to see all available categories.`)
          .setColor(0xFF0000)
          .addFields({
            name: "Available Categories",
            value: "basic, strikes, admin, coc, achievements, reports, testing, backup, warnings, decay, balance",
            inline: false
          });
        return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
      }
    }
  } catch (error) {
    console.error(`Error in help command: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Help Command Error")
      .setDescription("An error occurred while loading help information.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }

  // Main Help Overview with clean, minimal design
  const embed = new EmbedBuilder()
    .setTitle("Help Menu")
    .setColor(0x5865F2)
    .addFields(
      {
        name: "Basic Commands",
        value: "`!mystatus` - Check your strikes\n`!leaderboard` - View top strikers\n`!ping` - Test bot connection\n`!help [category]` - View detailed help",
        inline: false
      },
      {
        name: "User Information",
        value: "`!mystatus` - Check your current strikes\n`!mywarnings` - View your warnings\n`!leaderboard` - Hall of fame (top strikers)\n`!history @user` - Strike history (mod only)",
        inline: false
      },
      {
        name: "Strike Commands (Moderator)",
        value: "`!mw @user` - Missed war (0.5)\n`!fwa @user` - Missed FWA (1)\n`!cg @user` - Clan Games fail (2)\n`!don @user` - Donation fail (4)",
        inline: false
      },
      {
        name: "Admin Commands",
        value: "`!checkstrikes @user` - Check user strikes\n`!removestrike @user [amount]` - Remove strikes\n`!allstrikes` - View all strikes\n`!setlogchannel` - Set log channel",
        inline: false
      },
      {
        name: "Help Categories",
        value: "`!help basic` - Basic commands\n`!help strikes` - All strike commands\n`!help admin` - Admin commands\n`!help coc` - COC integration\n`!help achievements` - Achievements",
        inline: false
      },
      {
        name: "Additional Categories",
        value: "`!help reports` - Reports & analytics\n`!help warnings` - Warning system\n`!help decay` - Strike decay system\n`!help backup` - Backup commands\n`!help testing` - Debug & testing",
        inline: false
      }
    )
    .setTimestamp();

  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

// Helper function to create comprehensive help category embeds
function createHelpCategoryEmbed(category) {
  console.log(`Creating help embed for category: ${category}`);

  // Don't show help for hidden categories
  if (category === 'hidden') {
    return null;
  }

  let embed;

  switch (category) {
    case 'general':
    case 'user':
    case 'basic':
      embed = new EmbedBuilder()
        .setTitle("Basic Commands")
        .setColor(0x5865F2)
        .setDescription("Commands available to all members")
        .addFields(
          {
            name: "User Commands",
            value: "`!mystatus` - Check your current strike count\n`!mywarnings` - View your warnings\n`!leaderboard` - View top strikers hall of fame\n`!ping` - Test bot connection\n`!help [category]` - Display help menu",
            inline: false
          },
          {
            name: "Slash Commands",
            value: "`/mystatus` - Check strikes\n`/leaderboard` - View leaderboard\n`/ping` - Test connection\n`/help [category]` - Help menu",
            inline: false
          }
        )
        .setFooter({ text: "Both prefix and slash commands are available" });
      break;

    case 'strikes':
    case 'violations':
      embed = new EmbedBuilder()
        .setTitle("Strike Commands")
        .setColor(0x5865F2)
        .setDescription("All violation commands with strike values")
        .addFields(
          {
            name: "Minor Violations (0.5-1 strikes)",
            value: "`!mw @user` - Missed both war attacks (0.5)\n`!fwa @user` - Missed FWA war search (1)\n`!realbaseafterbl @user` - Real base after BL war (1)",
            inline: false
          },
          {
            name: "Moderate Violations (2 strikes)",
            value: "`!mwt @user` - Missed wars twice (2)\n`!nfp @user` - Not following war plan (2)\n`!cg @user` - Clan Games failure (2)\n`!mr @user` - Missed raid attacks (2)\n`!rb @user` - Rule violations (2)",
            inline: false
          },
          {
            name: "Serious Violations (3-4 strikes)",
            value: "`!rbf @user` - Real war base in FWA (3)\n`!mwth @user` - Missed wars 3+ times (4)\n`!don @user` - Donation failure (4)\n`!ld @user` - Left Discord (4)\n`!ia @user` - Extended inactivity (4)",
            inline: false
          },
          {
            name: "Strike Management",
            value: "`!checkstrikes @user` - Check user strikes\n`!removestrike @user [amount]` - Remove strikes",
            inline: false
          }
        )
        .setFooter({ text: "All commands require moderator permissions" });
      break;

    case 'admin':
    case 'moderation':
      embed = new EmbedBuilder()
        .setTitle("Admin Commands")
        .setColor(0x5865F2)
        .setDescription("Commands for moderators and administrators")
        .addFields(
          {
            name: "Strike Management",
            value: "`!checkstrikes @user` - Check strikes for a user\n`!removestrike @user [amount]` - Remove strikes\n`!history @user [page]` - View strike history\n`!allstrikes [clan] [page]` - View all strikes",
            inline: false
          },
          {
            name: "System Configuration",
            value: "`!setlogchannel [#channel]` - Set log channel\n`!setclanlog <clan_role> [#channel]` - Set clan log\n`!setleader <clan_role> <leader_role>` - Set leader role",
            inline: false
          },
          {
            name: "Maintenance & Info",
            value: "`!listclans` - List configured clans\n`!syncroles` - Sync member roles\n`!debug` - Bot status & diagnostics\n`!analytics [clan]` - Server dashboard",
            inline: false
          }
        )
        .setFooter({ text: "Requires moderator permissions" });
      break;

    case 'coc':
    case 'clashofclans':
    case 'cocapi':
      embed = new EmbedBuilder()
        .setTitle("⚔️COC Integration Commands")
        .setDescription("Clash of Clans API integration and monitoring")
        .setColor(0xFF8000)
        .addFields(
          {
            name: "🔧 Setup & Configuration",
            value: "`!cocsetup <api_key>` - Configure COC API key\n`!cocsetclan <role> <clan_tag>` - Link Discord roles to clans\n`!coclink <player_tag>` - Link your COC account\n`!cocautostrike on/off` - Enable auto-strikes for missed attacks",
            inline: false
          },
          {
            name: "📊 Information & Stats",
            value: "`!cocstats [clan_tag]` - View clan statistics\n`!cocprofile [@user]` - View COC profile\n`!cocmembers [clan_tag]` - List clan members\n`!coclistmappings` - View Discord/COC mappings",
            inline: false
          },
          {
            name: "⚔️ War Features",
            value: "`!cocwar [clan_tag]` - Check current war status\n`!coccheckwar <clan_tag>` - Manual war check\n`!cocattacks [clan_tag]` - View war attacks\n`!warcommentary <clan_tag>` - Live war analysis",
            inline: false
          },
          {
            name: "🤖 AI-Enhanced Features",
            value: "`!warstrategy <attacker_th> <enemy_th>` - Attack strategy recommendations\n`!donationtrack <clan_tag>` - Smart donation efficiency tracking",
            inline: false
          }
        )
        .setFooter({ text: "COC API key required for all features" });
      break;

    case 'achievements':
    case 'rewards':
    case 'positive':
      embed = new EmbedBuilder()
        .setTitle("Achievements")
        .setColor(0x5865F2)
        .setDescription("Commands for rewarding good behavior")
        .addFields(
          {
            name: "Individual Achievements",
            value: "`!cgachievement @user` - 4000+ Clan Games (-1 strike)\n`!donationachievement @user` - 10000+ donations (-1 strike)",
            inline: false
          },
          {
            name: "Mass Management",
            value: "`!seasonreset` - Reduce ALL strikes by 0.5 (20-day cooldown)",
            inline: false
          },
          {
            name: "Strike Decay System",
            value: "`!decay enable/disable` - Configure automatic decay\n`!decay set <days>` - Set decay period (7-90 days)\n`!decay status` - Check current settings",
            inline: false
          },
          {
            name: "Warning System",
            value: "`!warn @user <reason>` - Issue formal warning\n`!warnings [@user]` - View warning history\n`!mywarnings` - View your warnings",
            inline: false
          }
        )
        .setFooter({ text: "Promotes positive behavior" });
      break;

    case 'reports':
    case 'info':
      embed = new EmbedBuilder()
        .setTitle("Reports")
        .setColor(0x5865F2)
        .setDescription("Information and reporting commands")
        .addFields(
          {
            name: "Strike Reports",
            value: "`!allstrikes [clan] [page]` - View all strikes\n`!checkstrikes @user` - Check user strikes\n`!history @user [page]` - View strike history",
            inline: false
          },
          {
            name: "Leaderboards",
            value: "`!leaderboard` - Display top strikers",
            inline: false
          }
        )
        .setFooter({ text: "Some commands require moderator permissions" });
      break;

    case 'testing':
    case 'debug':
      embed = new EmbedBuilder()
        .setTitle("Testing & Debug")
        .setColor(0x5865F2)
        .setDescription("Development and troubleshooting commands")
        .addFields(
          {
            name: "System Testing",
            value: "`!testbot` - Run comprehensive tests\n`!debug` - Display bot status",
            inline: false
          },
          {
            name: "Maintenance",
            value: "`!cleanup` - Clear system locks\n`!syncroles` - Sync user roles\n`!dbstats` - View database statistics",
            inline: false
          }
        )
        .setFooter({ text: "Testing commands require moderator permissions" });
      break;



    case 'backup':
    case 'backups':
      embed = new EmbedBuilder()
        .setTitle("Backup System")
        .setDescription("Database backup and restore commands")
        .setColor(0x5865F2)
        .addFields(
          { name: "Backup Management", value: "`!backup create` - Create manual backup\n`!backup list` - List available backups\n`!backup stats` - View backup statistics", inline: false },
          { name: "Restore Operations", value: "`!backup restore <filename>` - Restore from backup\n`!backup restore <filename> --dry-run` - Preview changes", inline: false },
          { name: "Configuration", value: "`!backup setlogchannel [#channel]` - Set log channel\n`!backup cleanup` - Clean old backups", inline: false }
        )
        .setFooter({ text: "All backup commands require moderator permissions" })
        .setTimestamp();
      break;

    case 'system':
    case 'features':
    case 'advanced':
      embed = new EmbedBuilder()
        .setTitle("System Features")
        .setColor(0x5865F2)
        .setDescription("Advanced bot features and automation")
        .addFields(
          {
            name: "Automated Systems",
            value: "Strike decay system\nDatabase backup system\nPersistence recovery system\nCOC war monitoring",
            inline: false
          },
          {
            name: "Smart Features",
            value: "Multi-clan support with auto-detection\nLeadership notifications at ban threshold\nAutomatic role management\nConfirmation system for actions",
            inline: false
          },
          {
            name: "Command System",
            value: "Both slash (/) and prefix (!) commands\nSlash for quick info operations\nPrefix for complex actions\nContext-aware help system",
            inline: false
          }
        )
        .setFooter({ text: "Advanced features enhance bot functionality" });
      break;

    case 'warnings':
    case 'warning':
      embed = new EmbedBuilder()
        .setTitle("Warning System")
        .setColor(0x5865F2)
        .setDescription("Formal warning system for minor infractions")
        .addFields(
          {
            name: "Issue Warnings",
            value: "`!warn @user <reason>` - Issue formal warning\nMultiple warnings can escalate to strikes",
            inline: false
          },
          {
            name: "View Warnings",
            value: "`!warnings @user` - View user warnings\n`!mywarnings` - Check your warnings",
            inline: false
          },
          {
            name: "Manage Warnings",
            value: "`!removewarn @user [amount]` - Remove warnings\n`!clearwarnings @user` - Clear all warnings",
            inline: false
          }
        )
        .setFooter({ text: "Warning system requires moderator permissions" });
      break;

    case 'decay':
    case 'strikedecay':
      embed = new EmbedBuilder()
        .setTitle("Strike Decay System")
        .setColor(0x5865F2)
        .setDescription("Automatic strike reduction for rehabilitation")
        .addFields(
          {
            name: "Configuration",
            value: "`!decay enable` - Enable automatic decay\n`!decay disable` - Disable automatic decay\n`!decay set <days>` - Set decay period (7-90 days)",
            inline: false
          },
          {
            name: "Monitoring",
            value: "`!decay status` - Check current settings\n`!decay force` - Force immediate decay",
            inline: false
          },
          {
            name: "How It Works",
            value: "Users automatically lose 0.5 strikes every configured period\nOnly applies to users with good recent behavior\nUsers receive DM notifications when decay occurs",
            inline: false
          }
        )
        .setFooter({ text: "Strike decay promotes rehabilitation and fairness" });
      break;

    case 'balance':
    case 'fairness':
    case 'rehabilitation':
      embed = new EmbedBuilder()
        .setTitle("Balance & Fairness")
        .setColor(0x5865F2)
        .setDescription("Features promoting fairness and rehabilitation")
        .addFields(
          {
            name: "Strike Decay",
            value: "Automatic strike reduction for reformed members\nConfigurable decay periods (7-90 days)\nOnly applies to users with good behavior\nDM notifications when decay occurs",
            inline: false
          },
          {
            name: "Warning System",
            value: "Issue warnings without adding strikes\nTrack warning history separately\nGraduated response system\nEducational approach",
            inline: false
          },
          {
            name: "Achievement System",
            value: "Positive reinforcement for good behavior\nStrike reduction for outstanding performance\nClan Games and donation achievements\nMass season reset with cooldowns",
            inline: false
          }
        )
        .setFooter({ text: "Promoting rehabilitation over punishment" });
      break;

    case 'ai':
      embed = new EmbedBuilder()
        .setTitle("🤖 AI-Powered Features")
        .setDescription("Advanced artificial intelligence and machine learning features")
        .setColor(0x9400D3)
        .addFields(
          {
            name: "🧠 Behavior Analysis",
            value: "`!riskanalysis @user` - Behavioral risk analysis\n`!serverrisk` - Server-wide risk analysis report\n`!smartpredict` - Smart violation predictions\n`!analyzemessage <text>` - Message content analysis",
            inline: false
          },
          {
            name: "🎯 Smart Strike Predictions",
            value: "• Uses machine learning to analyze user behavior patterns\n• Predicts which users might violate rules\n• Provides proactive intervention recommendations\n• Analyzes message patterns and activity trends",
            inline: false
          },
          {
            name: "🔍 Automated Risk Assessment",
            value: "• Real-time analysis of user activity patterns\n• Smart detection of escalation behaviors\n• Identifies repeat offense patterns\n• Generates personalized intervention strategies",
            inline: false
          },
          {
            name: "📝 Natural Language Processing",
            value: "• Automatically detects rule-breaking content\n• Analyzes message toxicity and spam patterns\n• Provides severity scoring and recommendations\n• Supports multiple violation types",
            inline: false
          }
        )
        .setFooter({ text: "AI features require moderator permissions" });

      default:
        return this.createMainHelpEmbed();
  }

  if (embed) {
    console.log(`Successfully created help embed for category: ${category}`);
    embed.setTimestamp();
  }

  return embed;
}

function handlePing(message, client) {
  const embed = new EmbedBuilder()
    .setTitle("🏓 Pong!")
    .setColor(0x00FF00)
    .addFields(
      { name: "Bot Latency", value: `${Date.now() - message.createdTimestamp}ms`, inline: true },
      { name: "API Latency", value: `${Math.round(client.ws.ping)}ms`, inline: true }
    )
    .setTimestamp();

  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

// --- Placeholder functions for new help categories ---
// These would typically be in separate files and imported,
// but are included here for completeness of the example.

async function showCOCHelp(message) {
  const embed = new EmbedBuilder()
    .setTitle("⚔️COC Integration Commands")
    .setDescription("Clash of Clans API integration and player management")
    .setColor(0x0099FF)
    .addFields(
      { name: "🔧 Setup Commands", value: "• `!cocsetup <api_key>` - Configure COC API integration\n• `!cocsetclan <role> <clan_tag>` - Map Discord roles to clans", inline: false },
      { name: "📊 Statistics Commands", value: "• `!cocstats [clan_tag]` - View clan statistics and member info\n• `!cocprofile [@user]` - View linked COC profile", inline: false },
      { name: "🔗 Linking Commands", value: "• `!coclink <player_tag>` - Link your Discord to COC account\n• `!cocunlink` - Unlink your COC account", inline: false },
      { name: "🎯 War Commands (Coming Soon)", value: "• War tracking and notifications\n• Attack monitoring\n• War performance analytics", inline: false }
    )
    .setFooter({ text: "Requires valid COC API key for setup" })
    .setTimestamp();

  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

async function showWarningsHelp(message) {
  const embed = new EmbedBuilder()
    .setTitle("⚠️ Warning System Commands")
    .setDescription("Formal warning system for minor infractions before strikes")
    .setColor(0xFFFF00)
    .addFields(
      { name: "📝 Issue Warnings", value: "• `!warn @user <reason>` - Issue formal warning with reason\n• Multiple warnings can escalate to strikes", inline: false },
      { name: "📋 View Warnings", value: "• `!warnings @user` - View all warnings for a user\n• `!mywarnings` - Check your own warnings", inline: false },
      { name: "🔧 Manage Warnings", value: "• `!removewarn @user [amount]` - Remove specific number of warnings\n• `!clearwarnings @user` - Remove all warnings from user", inline: false },
      { name: "⚙️ How It Works", value: "• Warnings are logged and tracked separately from strikes\n• Users receive DM notifications when warned\n• Progressive discipline system promotes fair enforcement", inline: false }
    )
    .setFooter({ text: "Warning system requires moderator permissions" })
    .setTimestamp();

  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

async function showDecayHelp(message) {
  const embed = new EmbedBuilder()
    .setTitle("⚖️ Strike Decay System")
    .setDescription("Automatic strike reduction system for promoting rehabilitation")
    .setColor(0x00FF7F)
    .addFields(
      { name: "🔧 Configuration", value: "• `!decay enable` - Enable automatic decay\n• `!decay disable` - Disable automatic decay\n• `!decay set <days>` - Set decay period (7-90 days)", inline: false },
      { name: "Monitoring", value: "• `!decay status` - Check current settings and next decay\n• `!decay force` - Force immediate decay processing", inline: false },
      { name: "⚙️ How Decay Works", value: "• Users automatically lose 0.5 strikes every configured period\n• Only applies to users with good recent behavior (no recent violations)\n• Users receive DM notifications when decay occurs", inline: false },
      { name: "🎯 Benefits", value: "• Encourages positive behavior change\n• Provides second chances for reformed members\n• Reduces long-term strike accumulation", inline: false }
    )
    .setFooter({ text: "Strike decay promotes rehabilitation and fairness" })
    .setTimestamp();

  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

async function showBackupHelp(message) {
  const embed = new EmbedBuilder()
    .setTitle("💾 Backup System Commands")
    .setDescription("Automated database backup and restore system")
    .setColor(0x0099FF)
    .addFields(
      { name: "📁 Backup Management", value: "• `!backup create` - Create manual backup\n• `!backup list` - List all available backups\n• `!backup stats` - View backup system statistics", inline: false },
      { name: "🔄 Restore Operations", value: "• `!backup restore <filename>` - Restore from backup file\n• `!backup restore <filename> --dry-run` - Preview restore changes", inline: false },
      { name: "🔧 Configuration", value: "• `!backup setlogchannel [#channel]` - Set dedicated backup log channel\n• `!backup cleanup` - Clean up old backup files", inline: false },
      { name: "🤖 Automated Features", value: "• Backups created automatically every 6 hours\n• Maximum of 30 backups retained\n• Includes all strikes, guild settings, and configurations", inline: false }
    )
    .setFooter({ text: "All backup commands require moderator permissions" })
    .setTimestamp();

  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

// Ping command
async function handlePing(message, args, context) {
  const start = Date.now();
  const sent = await message.channel.send("🏓 Pinging...");
  const timeDiff = Date.now() - start;

  const embed = new EmbedBuilder()
    .setTitle("🏓 Pong!")
    .setColor(0x00FF00)
    .addFields(
      { name: "Bot Latency", value: `${timeDiff}ms`, inline: true },
      { name: "💓 API Latency", value: `${Math.round(context.client.ws.ping)}ms`, inline: true }
    )
    .setTimestamp();

  await sent.edit({ content: "", embeds: [embed] });
}

// Quick status check function
function handleStatus(message, client) {
  const uptime = process.uptime();
  const uptimeString = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
  const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  const embed = new EmbedBuilder()
    .setTitle("📊 Quick Status Check")
    .setColor(0x00FF00)
    .addFields(
      { name: "🟢 Status", value: "Online & Operational", inline: true },
      { name: "⏱️ Uptime", value: uptimeString, inline: true },
      { name: "🏓 Latency", value: `${Math.round(client.ws.ping)}ms`, inline: true },
      { name: "💾 Memory", value: `${memUsage}MB`, inline: true },
      { name: "🏰 Guilds", value: `${client.guilds.cache.size}`, inline: true },
      { name: "👥 Users", value: `${client.users.cache.size}`, inline: true }
    )
    .setFooter({ text: "Use !test for comprehensive diagnostics" })
    .setTimestamp();

  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

// Command handlers for modular system
const commands = {
  help: handleHelp,
  ping: handlePing,
  status: handleStatus
};

const metadata = {
  name: "basic",
  description: "Basic user commands",
  category: "basic",
  permissions: ["user"],
  version: "1.0.0"
};

module.exports = {
  commands,
  metadata,
  handleHelp,
  handlePing,
  handleStatus,
  createHelpCategoryEmbed
};