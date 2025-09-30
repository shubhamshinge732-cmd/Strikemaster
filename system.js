const { EmbedBuilder } = require("discord.js");

/**
 * System Commands
 * Small maintainable group for system management and diagnostics
 */

const metadata = {
  name: "system",
  description: "System monitoring and diagnostic commands",
  category: "system",
  permissions: ["moderator"],
  version: "2.0.0"
};

const commands = {
  async debugbot(message, args, context) {
    const { client, hasModeratorPermissions, isDatabaseConnected } = context;

    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to run debug checks.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    try {
      const startTime = Date.now();

      // System diagnostics
      const uptime = process.uptime();
      const uptimeString = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
      const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const dbStatus = isDatabaseConnected() ? "✅ Connected" : "❌ Disconnected";

      const diagnostics = {
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        ping: Math.round(client.ws.ping),
        nodeVersion: process.version
      };

      let recentIssues = "None detected";
      if (diagnostics.ping > 200) {
        recentIssues = `⚠️ High latency: ${diagnostics.ping}ms`;
      } else if (memUsage > 400) {
        recentIssues = `⚠️ High memory usage: ${memUsage}MB`;
      }

      const endTime = Date.now();
      const testDuration = ((endTime - startTime) / 1000).toFixed(2);

      const embed = new EmbedBuilder()
        .setTitle("🔧 System Debug Report")
        .setColor(0x0099FF)
        .addFields(
          { name: "⏱️ Uptime", value: uptimeString, inline: true },
          { name: "🏓 Latency", value: `${diagnostics.ping}ms`, inline: true },
          { name: "💾 Memory", value: `${memUsage}MB`, inline: true },
          { name: "🏰 Guilds", value: `${diagnostics.guilds}`, inline: true },
          { name: "👥 Users", value: `${diagnostics.users}`, inline: true },
          { name: "🗃️ Database", value: dbStatus, inline: true },
          { name: "⚙️ Node.js", value: diagnostics.nodeVersion, inline: true },
          { name: "⏱️ Test Duration", value: `${testDuration}s`, inline: true },
          { name: "🚨 Issues", value: recentIssues, inline: true }
        )
        .setTimestamp();

      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

    } catch (error) {
      console.error(`❌ Debug error: ${error.message}`);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Debug Failed")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
    }
  },

  async systeminfo(message, args, context) {
    const { client, hasModeratorPermissions } = context;

    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to view system information.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };

    const embed = new EmbedBuilder()
      .setTitle("ℹ️ System Information")
      .setColor(0x0099FF)
      .addFields(
        { name: "Platform", value: systemInfo.platform, inline: true },
        { name: "Architecture", value: systemInfo.arch, inline: true },
        { name: "Node.js", value: systemInfo.nodeVersion, inline: true },
        { name: "Heap Used", value: `${Math.round(systemInfo.memoryUsage.heapUsed / 1024 / 1024)}MB`, inline: true },
        { name: "Heap Total", value: `${Math.round(systemInfo.memoryUsage.heapTotal / 1024 / 1024)}MB`, inline: true },
        { name: "RSS", value: `${Math.round(systemInfo.memoryUsage.rss / 1024 / 1024)}MB`, inline: true }
      )
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  },

  async reload(message, args, context) {
    const { hasModeratorPermissions } = context;

    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to reload command groups.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const groupName = args[0];

    if (!groupName) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!reload <group_name>`\n\n**Example:** `!reload strikes`")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    try {
      // This would need to be passed from the main file
      const embed = new EmbedBuilder()
        .setTitle("🔄 Command Group Reload")
        .setDescription(`Command group hot reload functionality would be implemented here.\n\nTarget group: **${groupName}**`)
        .setColor(0xFFFF00);

      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Reload Failed")
        .setDescription(`Error reloading command group: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
    }
  }
};

module.exports = {
  metadata,
  commands
};