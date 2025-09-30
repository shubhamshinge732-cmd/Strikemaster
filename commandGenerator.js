
const fs = require('fs');
const path = require('path');

/**
 * Command Generator
 * Automatically generates new commands in appropriate groups
 */
class CommandGenerator {
  constructor() {
    this.commandsDir = path.join(__dirname, '../commands');
  }

  /**
   * Generate a new command in the appropriate group
   */
  generateCommand(commandName, options = {}) {
    const {
      group = this.suggestGroup(commandName),
      description = `${commandName} command`,
      permissions = ['MODERATE'],
      type = 'basic'
    } = options;

    const commandTemplate = this.getCommandTemplate(commandName, description, permissions, type);
    return this.addCommandToGroup(group, commandName, commandTemplate);
  }

  /**
   * Suggest appropriate group for a command
   */
  suggestGroup(commandName) {
    const patterns = {
      user: /^(my|check|view|show)/,
      strikes: /^(strike|warn|remove|add)/,
      admin: /^(set|config|setup|list)/,
      system: /^(debug|test|sync|reload)/,
      reports: /^(analytics|stats|report|export)/,
      achievements: /^(achievement|reward|season)/,
      coc: /^(coc|clash)/
    };

    for (const [group, pattern] of Object.entries(patterns)) {
      if (pattern.test(commandName)) {
        return group;
      }
    }

    return 'basic'; // Default group
  }

  /**
   * Get command template based on type
   */
  getCommandTemplate(commandName, description, permissions, type) {
    const templates = {
      basic: `
  async ${commandName}(message, args, context) {
    const { hasModeratorPermissions } = context;
    
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to use this command.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    // TODO: Implement ${commandName} functionality
    const embed = new EmbedBuilder()
      .setTitle("🚧 Command Under Development")
      .setDescription("${description}")
      .setColor(0xFFFF00);
    
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }`,
      
      database: `
  async ${commandName}(message, args, context) {
    const { hasModeratorPermissions, Strike, GuildSettings, isDatabaseConnected } = context;
    
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to use this command.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    if (!isDatabaseConnected()) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Database Connection Error")
        .setDescription("Database is not available. Please try again later.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    try {
      // TODO: Implement ${commandName} database functionality
      
      const embed = new EmbedBuilder()
        .setTitle("✅ ${commandName}")
        .setDescription("${description}")
        .setColor(0x00FF00);
      
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      console.error(\`❌ Error in ${commandName}: \${error.message}\`);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Command Error")
        .setDescription(\`Error: \${error.message}\`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
    }
  }`,
      
      confirmation: `
  async ${commandName}(message, args, context) {
    const { hasModeratorPermissions } = context;
    
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to use this command.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const confirmEmbed = new EmbedBuilder()
      .setTitle("⚠️ ${commandName} Confirmation")
      .setDescription("${description}\\n\\nAre you sure you want to proceed?")
      .setColor(0xFFFF00)
      .setFooter({ text: "✅ Confirm | ❌ Cancel | Expires in 2 minutes" });

    const confirmMessage = await message.channel.send({ embeds: [confirmEmbed], allowedMentions: { repliedUser: false } });

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
      time: 120000,
      max: 1
    });

    collector.on('collect', async (reaction, reactionUser) => {
      await confirmMessage.reactions.removeAll().catch(() => {});

      if (reaction.emoji.name === '✅') {
        // TODO: Implement confirmed action
        const successEmbed = new EmbedBuilder()
          .setTitle("✅ ${commandName} Completed")
          .setDescription("${description} executed successfully.")
          .setColor(0x00FF00);
        await confirmMessage.edit({ embeds: [successEmbed] });
      } else {
        const cancelledEmbed = new EmbedBuilder()
          .setTitle("❌ ${commandName} Cancelled")
          .setDescription("Operation cancelled by moderator")
          .setColor(0x808080);
        await confirmMessage.edit({ embeds: [cancelledEmbed] });
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setTitle("⏰ ${commandName} Request Expired")
          .setDescription("No action taken - Request timed out")
          .setColor(0x808080);
        await confirmMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
        await confirmMessage.reactions.removeAll().catch(() => {});
      }
    });
  }`
    };

    return templates[type] || templates.basic;
  }

  /**
   * Add command to appropriate group file
   */
  addCommandToGroup(groupName, commandName, commandTemplate) {
    const groupPath = path.join(this.commandsDir, `${groupName}.js`);
    
    try {
      let groupContent;
      
      if (fs.existsSync(groupPath)) {
        groupContent = fs.readFileSync(groupPath, 'utf8');
        
        // Add command to existing group
        const commandsRegex = /(const commands = {)([\s\S]*?)(};)/;
        const match = groupContent.match(commandsRegex);
        
        if (match) {
          const beforeCommands = match[1];
          const existingCommands = match[2];
          const afterCommands = match[3];
          
          const newCommands = existingCommands + ',' + commandTemplate;
          groupContent = groupContent.replace(commandsRegex, beforeCommands + newCommands + afterCommands);
        }
      } else {
        // Create new group file
        groupContent = this.createNewGroupFile(groupName, commandName, commandTemplate);
      }
      
      fs.writeFileSync(groupPath, groupContent);
      console.log(`✅ Added command '${commandName}' to group '${groupName}'`);
      return true;
    } catch (error) {
      console.error(`❌ Error adding command to group: ${error.message}`);
      return false;
    }
  }

  /**
   * Create new group file with command
   */
  createNewGroupFile(groupName, commandName, commandTemplate) {
    return `const { EmbedBuilder } = require("discord.js");

/**
 * ${groupName.charAt(0).toUpperCase() + groupName.slice(1)} Commands
 * Small maintainable group for ${groupName} functionality
 */

const metadata = {
  name: "${groupName}",
  description: "${groupName.charAt(0).toUpperCase() + groupName.slice(1)} command group",
  category: "${groupName}",
  permissions: ["MODERATE"],
  version: "1.0.0"
};

const commands = {${commandTemplate}
};

module.exports = {
  metadata,
  commands
};
`;
  }
}

module.exports = CommandGenerator;
