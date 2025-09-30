
const fs = require('fs');
const path = require('path');

/**
 * Command Loader System
 * Automatically loads and organizes commands into maintainable groups
 */
class CommandLoader {
  constructor() {
    this.commandGroups = new Map();
    this.commandMap = new Map();
  }

  /**
   * Load all command groups from the commands directory
   */
  async loadAllCommands() {
    const commandsDir = path.join(__dirname, '../commands');
    
    try {
      const files = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));
      
      for (const file of files) {
        const groupName = path.basename(file, '.js');
        await this.loadCommandGroup(groupName);
      }
      
      console.log(`✅ Loaded ${this.commandGroups.size} command groups with ${this.commandMap.size} total commands`);
    } catch (error) {
      console.error(`❌ Error loading commands: ${error.message}`);
    }
  }

  /**
   * Load a specific command group
   */
  async loadCommandGroup(groupName) {
    try {
      const groupPath = path.join(__dirname, '../commands', `${groupName}.js`);
      
      if (!fs.existsSync(groupPath)) {
        console.warn(`⚠️ Command group file not found: ${groupName}.js`);
        return;
      }

      // Clear require cache for hot reloading
      delete require.cache[require.resolve(groupPath)];
      
      const commandGroup = require(groupPath);
      
      if (commandGroup && commandGroup.commands) {
        this.commandGroups.set(groupName, commandGroup);
        
        // Map individual commands to their groups
        const commandNames = [];
        for (const [commandName, commandHandler] of Object.entries(commandGroup.commands)) {
          this.commandMap.set(commandName, {
            group: groupName,
            handler: commandHandler,
            metadata: commandGroup.metadata || {}
          });
          commandNames.push(commandName);
        }
        
        console.log(`✅ Loaded command group: ${groupName} (${Object.keys(commandGroup.commands).length} commands: ${commandNames.join(', ')})`);
      }
    } catch (error) {
      console.error(`❌ Error loading command group ${groupName}: ${error.message}`);
    }
  }

  /**
   * Execute a command
   */
  async executeCommand(commandName, message, args, context) {
    const command = this.commandMap.get(commandName);
    
    if (!command) {
      return false; // Command not found - don't log here to avoid spam
    }

    console.log(`🔧 Executing modular command: ${commandName} from group: ${command.group}`);

    try {
      // Handle different types of command handlers
      if (typeof command.handler === 'function') {
        // Pass all necessary parameters based on command requirements
        if (commandName === 'backup') {
          await command.handler(message, args, context.client, context);
        } else if (commandName === 'decay') {
          await command.handler(message, args, context);
        } else if (['warn', 'warnings', 'mywarnings', 'removewarn', 'clearwarnings'].includes(commandName)) {
          await command.handler(message, args, context.client, context.hasModeratorPermissions, context.Strike, context.GuildSettings);
        } else {
          // Default handler call - try with context first, fallback to individual parameters
          try {
            await command.handler(message, args, context);
          } catch (error) {
            // Fallback for commands expecting individual parameters
            if (error.message.includes('undefined') || error.message.includes('not a function')) {
              await command.handler(message, args, context.client, context);
            } else {
              throw error;
            }
          }
        }
        console.log(`✅ Modular command '${commandName}' executed successfully`);
      } else {
        console.warn(`⚠️ Command handler for ${commandName} is not a function, type: ${typeof command.handler}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`❌ Error executing modular command ${commandName}: ${error.message}`);
      console.error(`Stack trace:`, error.stack);
      throw error;
    }
  }

  /**
   * Get command information
   */
  getCommandInfo(commandName) {
    return this.commandMap.get(commandName);
  }

  /**
   * Get all commands by group
   */
  getCommandsByGroup(groupName) {
    const group = this.commandGroups.get(groupName);
    return group ? group.commands : {};
  }

  /**
   * Get all available commands
   */
  getAllCommands() {
    return Array.from(this.commandMap.keys());
  }

  /**
   * Get visible command groups (excluding hidden ones)
   */
  getVisibleCommandGroups() {
    const visibleGroups = new Map();
    for (const [groupName, group] of this.commandGroups) {
      if (!group.metadata?.hidden) {
        visibleGroups.set(groupName, group);
      }
    }
    return visibleGroups;
  }

  /**
   * Check if a command group is hidden
   */
  isCommandGroupHidden(groupName) {
    const group = this.commandGroups.get(groupName);
    return group?.metadata?.hidden === true;
  }

  /**
   * Create help category embed for slash commands
   */
  createHelpCategoryEmbed(category) {
    const { EmbedBuilder } = require('discord.js');
    
    let embed;

    switch (category) {
      case 'general':
      case 'user':
      case 'basic':
        embed = new EmbedBuilder()
          .setTitle("📋 Basic Commands")
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
        embed = new EmbedBuilder()
          .setTitle("⚔️ Strike System")
          .setColor(0xFF4444)
          .setDescription("Strike management commands (Moderator only)")
          .addFields(
            {
              name: "Minor Violations (0.5-1 strikes)",
              value: "`!mw @user` - Missed war (0.5)\n`!fwa @user` - Missed FWA search (1)\n`!realbaseafterbl @user` - Real base after BL (1)",
              inline: false
            },
            {
              name: "Moderate Violations (2 strikes)",
              value: "`!cg @user` - Clan Games failure (2)\n`!mr @user` - Missed raids (2)\n`!rb @user` - Rule violations (2)",
              inline: false
            },
            {
              name: "Major Violations (4 strikes)",
              value: "`!don @user` - Donation failures (4)\n`!ia @user` - Inactivity (4)",
              inline: false
            },
            {
              name: "Strike Management",
              value: "`!checkstrikes @user` - Check user strikes\n`!removestrike @user [amount]` - Remove strikes",
              inline: false
            }
          );
        break;

      case 'admin':
        embed = new EmbedBuilder()
          .setTitle("🛡️ Administration")
          .setColor(0x9932CC)
          .setDescription("Server administration commands")
          .addFields(
            {
              name: "Configuration",
              value: "`!setlogchannel [#channel]` - Set default log channel\n`!setclanlog <clan_role> [#channel]` - Clan-specific logging\n`!setleader <clan_role> <leader_role>` - Leadership configuration",
              inline: false
            },
            {
              name: "System Management",
              value: "`!syncroles` - Force role synchronization\n`!debug` - Bot status & diagnostics\n`!cleanup` - Clear system locks",
              inline: false
            }
          );
        break;

      case 'achievements':
        embed = new EmbedBuilder()
          .setTitle("🏆 Achievements")
          .setColor(0xFFD700)
          .setDescription("Positive reinforcement system")
          .addFields(
            {
              name: "Achievement Commands",
              value: "`!cgachievement @user` - 4000+ Clan Games (-1 strike)\n`!donationachievement @user` - 10000+ donations (-1 strike)",
              inline: false
            },
            {
              name: "Season Management",
              value: "`!seasonreset` - Reduce all strikes by 0.5 (20-day cooldown)",
              inline: false
            }
          );
        break;

      case 'reports':
        embed = new EmbedBuilder()
          .setTitle("📊 Reports & Analytics")
          .setColor(0x0099FF)
          .setDescription("Information and reporting commands")
          .addFields(
            {
              name: "Strike Reports",
              value: "`!allstrikes [clan] [page]` - View all strikes\n`!checkstrikes @user` - Check user strikes\n`!history @user [page]` - View strike history",
              inline: false
            },
            {
              name: "Analytics",
              value: "`!analytics [clan]` - Server health dashboard\n`!leaderboard` - Top strikers hall of fame",
              inline: false
            }
          );
        break;

      case 'coc':
        embed = new EmbedBuilder()
          .setTitle("⚔️ COC Integration")
          .setColor(0xFF8000)
          .setDescription("Clash of Clans API integration")
          .addFields(
            {
              name: "Setup Commands",
              value: "`!cocsetup <api_key>` - Configure COC API\n`!cocsetclan <role> <clan_tag>` - Map Discord roles to clans",
              inline: false
            },
            {
              name: "Information Commands",
              value: "`!cocstats [clan_tag]` - View clan statistics\n`!cocprofile [@user]` - View COC player profile",
              inline: false
            }
          );
        break;

      case 'warnings':
        embed = new EmbedBuilder()
          .setTitle("⚠️ Warning System")
          .setColor(0xFFFF00)
          .setDescription("Educational warning system")
          .addFields(
            {
              name: "Warning Commands",
              value: "`!warn @user <reason>` - Issue warning\n`!mywarnings` - Check your warnings\n`!warnings @user` - View user warnings",
              inline: false
            },
            {
              name: "Management",
              value: "`!removewarn @user [amount]` - Remove warnings\n`!clearwarnings @user` - Clear all warnings",
              inline: false
            }
          );
        break;

      case 'decay':
        embed = new EmbedBuilder()
          .setTitle("⚖️ Strike Decay")
          .setColor(0x32CD32)
          .setDescription("Automatic strike reduction system")
          .addFields(
            {
              name: "How Strike Decay Works",
              value: "• Automatically reduces strikes for reformed members\n• Only applies to users with good behavior\n• Configurable decay periods (7-90 days)\n• DM notifications when decay occurs",
              inline: false
            },
            {
              name: "Configuration",
              value: "`!decay config` - View current settings\n`!decay enable/disable` - Toggle system\n`!decay period <days>` - Set decay period",
              inline: false
            }
          );
        break;

      case 'backup':
        embed = new EmbedBuilder()
          .setTitle("💾 Backup System")
          .setColor(0x8B4513)
          .setDescription("Data backup and recovery")
          .addFields(
            {
              name: "Backup Commands",
              value: "`!backup create` - Create manual backup\n`!backup list` - View available backups\n`!backup delete <filename>` - Delete specific backup\n`!backup restore <filename>` - Restore from backup",
              inline: false
            },
            {
              name: "Management",
              value: "`!backup stats` - View backup statistics\n`!backup cleanup` - Clean old backups\n`!backup setlogchannel [#channel]` - Set log channel",
              inline: false
            },
            {
              name: "Features",
              value: "• Automatic backups every 6 hours\n• Manual backup creation\n• Data integrity verification\n• Selective restore options",
              inline: false
            }
          );
        break;

      case 'testing':
        embed = new EmbedBuilder()
          .setTitle("🧪 Testing & Debug")
          .setColor(0xFF8C00)
          .setDescription("Development and troubleshooting commands")
          .addFields(
            {
              name: "System Testing",
              value: "`!testbot` - Run comprehensive tests\n`!debug` - Display bot status\n`!health` - Quick health check",
              inline: false
            },
            {
              name: "Maintenance",
              value: "`!cleanup` - Clear system locks\n`!syncroles` - Sync user roles\n`!dbstats` - Database statistics",
              inline: false
            }
          );
        break;

      default:
        return null;
    }

    if (embed) {
      embed.setTimestamp();
    }

    return embed;
  }

  /**
   * Hot reload a command group
   */
  async reloadCommandGroup(groupName) {
    console.log(`🔄 Reloading command group: ${groupName}`);
    await this.loadCommandGroup(groupName);
  }

  /**
   * Cleanup command loader resources
   */
  cleanup() {
    this.commandGroups.clear();
    this.commandMap.clear();
    console.log('🧹 Command loader cleaned up');
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    return {
      commandGroups: this.commandGroups.size,
      totalCommands: this.commandMap.size,
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    };
  }

  /**
   * Auto-detect and create new command group template
   */
  createCommandGroupTemplate(groupName, description = '') {
    const templatePath = path.join(__dirname, '../commands', `${groupName}.js`);
    
    if (fs.existsSync(templatePath)) {
      console.warn(`⚠️ Command group ${groupName} already exists`);
      return false;
    }

    const template = `const { EmbedBuilder } = require("discord.js");

/**
 * ${groupName.charAt(0).toUpperCase() + groupName.slice(1)} Commands
 * ${description || `Small maintainable group for ${groupName} functionality`}
 */

const metadata = {
  name: "${groupName}",
  description: "${description || `${groupName.charAt(0).toUpperCase() + groupName.slice(1)} command group`}",
  category: "${groupName}",
  permissions: ["MODERATE"], // MODERATE, ADMIN, USER
  version: "1.0.0"
};

const commands = {
  // Add your commands here
  // Example:
  // async exampleCommand(message, args, context) {
  //   const { client, hasModeratorPermissions, Strike, GuildSettings } = context;
  //   
  //   if (!hasModeratorPermissions(message.member)) {
  //     const embed = new EmbedBuilder()
  //       .setTitle("❌ Permission Denied")
  //       .setDescription("You don't have permission to use this command.")
  //       .setColor(0xFF0000);
  //     return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  //   }
  //
  //   // Command logic here
  // }
};

module.exports = {
  metadata,
  commands
};
`;

    try {
      fs.writeFileSync(templatePath, template);
      console.log(`✅ Created new command group template: ${groupName}.js`);
      return true;
    } catch (error) {
      console.error(`❌ Error creating command group template: ${error.message}`);
      return false;
    }
  }
}

module.exports = CommandLoader;
