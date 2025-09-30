
const { EmbedBuilder } = require("discord.js");

async function handleWarn(message, args, client, hasModeratorPermissions, Strike, GuildSettings) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to issue warnings.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const user = message.mentions.users.first();
  const reason = args.slice(1).join(" ");

  if (!user || !reason) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!warn @user <reason>`\n\n**Example:** `!warn @user Please follow clan rules`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  if (user.id === message.author.id) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Action")
      .setDescription("You cannot warn yourself.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    await Strike.findOneAndUpdate(
      { userId: user.id, guildId: message.guild.id },
      {
        $push: {
          warnings: {
            reason: reason,
            moderator: message.author.tag,
            date: new Date()
          }
        }
      },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Warning Issued")
      .setDescription(`Warning issued to ${user.username}`)
      .setColor(0xFFFF00)
      .addFields(
        { name: "User", value: user.tag, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Moderator", value: message.author.tag, inline: true }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

    // Send DM to user
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle("⚠️ Warning Received")
        .setDescription(`You have received a warning in **${message.guild.name}**`)
        .setColor(0xFFFF00)
        .addFields({ name: "Reason", value: reason, inline: false })
        .setTimestamp();

      await user.send({ embeds: [dmEmbed] });
    } catch (dmError) {
      console.log(`Could not DM ${user.username}`);
    }

  } catch (error) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Warning Failed")
      .setDescription(`Error: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

async function handleViewWarnings(message, args, client, hasModeratorPermissions, Strike, GuildSettings) {
  const targetUser = message.mentions.users.first() || message.author;
  
  // Only moderators can view other users' warnings
  if (targetUser.id !== message.author.id && !hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You can only view your own warnings.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const record = await Strike.findOne({ userId: targetUser.id, guildId: message.guild.id });
    
    if (!record || !record.warnings || record.warnings.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("📋 Warning History")
        .setDescription(`${targetUser.username} has no warnings.`)
        .setColor(0x00FF00)
        .setThumbnail(targetUser.displayAvatarURL());
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Warning History - ${targetUser.username}`)
      .setDescription(`**Total Warnings:** ${record.warnings.length}`)
      .setColor(0xFFFF00)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    // Show last 5 warnings
    const recentWarnings = record.warnings.slice(-5).reverse();
    
    recentWarnings.forEach((warning, index) => {
      const date = new Date(warning.date).toLocaleDateString();
      embed.addFields({
        name: `${recentWarnings.length - index}. ${date}`,
        value: `**Reason:** ${warning.reason}\n**Moderator:** ${warning.moderator}`,
        inline: false
      });
    });

    if (record.warnings.length > 5) {
      embed.setFooter({ text: `Showing 5 most recent warnings (${record.warnings.length} total)` });
    }

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Error")
      .setDescription(`Error fetching warnings: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

async function handleRemoveWarning(message, args, client, hasModeratorPermissions, Strike, GuildSettings) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to remove warnings.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const user = message.mentions.users.first();
  const amount = parseInt(args[1]) || 1;

  if (!user) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!removewarn @user [amount]`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const record = await Strike.findOne({ userId: user.id, guildId: message.guild.id });
    
    if (!record || !record.warnings || record.warnings.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("ℹ️ No Warnings")
        .setDescription(`${user.username} has no warnings to remove.`)
        .setColor(0x00FF00);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const warningsToRemove = Math.min(amount, record.warnings.length);
    const newWarnings = record.warnings.slice(0, -warningsToRemove);

    await Strike.findOneAndUpdate(
      { userId: user.id, guildId: message.guild.id },
      { $set: { warnings: newWarnings } }
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ Warnings Removed")
      .setDescription(`Removed ${warningsToRemove} warning(s) from ${user.username}`)
      .setColor(0x00FF00)
      .addFields(
        { name: "User", value: user.tag, inline: true },
        { name: "Warnings Removed", value: `${warningsToRemove}`, inline: true },
        { name: "Remaining Warnings", value: `${newWarnings.length}`, inline: true },
        { name: "Moderator", value: message.author.tag, inline: true }
      )
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Remove Warning Failed")
      .setDescription(`Error: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

async function handleClearWarnings(message, args, client, hasModeratorPermissions, Strike, GuildSettings) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to clear warnings.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const user = message.mentions.users.first();

  if (!user) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!clearwarnings @user`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const record = await Strike.findOne({ userId: user.id, guildId: message.guild.id });
    
    if (!record || !record.warnings || record.warnings.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("ℹ️ No Warnings")
        .setDescription(`${user.username} has no warnings to clear.`)
        .setColor(0x00FF00);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const warningCount = record.warnings.length;

    await Strike.findOneAndUpdate(
      { userId: user.id, guildId: message.guild.id },
      { $unset: { warnings: "" } }
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ All Warnings Cleared")
      .setDescription(`Cleared all ${warningCount} warning(s) from ${user.username}`)
      .setColor(0x00FF00)
      .addFields(
        { name: "User", value: user.tag, inline: true },
        { name: "Warnings Cleared", value: `${warningCount}`, inline: true },
        { name: "Moderator", value: message.author.tag, inline: true }
      )
      .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Clear Warnings Failed")
      .setDescription(`Error: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }
}

const commands = {
  warn: handleWarn,
  warnings: handleViewWarnings,
  mywarnings: handleViewWarnings,
  removewarn: handleRemoveWarning,
  clearwarnings: handleClearWarnings
};

const metadata = {
  name: "warnings",
  description: "Warning system commands",
  category: "balance",
  permissions: ["moderator"],
  version: "1.0.0"
};

module.exports = {
  commands,
  metadata,
  handleWarn,
  handleViewWarnings,
  handleRemoveWarning,
  handleClearWarnings
};
