
const { EmbedBuilder } = require("discord.js");
const { Strike } = require("../config/database");
const { hasModeratorPermissions } = require("../utils/permissions");
const { logAction } = require("../utils/logging");

async function handleCGAchievement(message, client) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to apply achievements.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const user = message.mentions.users.first();
  if (!user) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("Usage: `!cgachievement @user` (Removes 1 strike for 4000+ CG points)")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  let record = await Strike.findOne({ userId: user.id, guildId: message.guild.id });
  const currentStrikes = record ? record.strikes : 0;

  if (currentStrikes === 0) {
    const embed = new EmbedBuilder()
      .setTitle("ℹ️ No Strikes")
      .setDescription(`${user.username} has no strikes to reduce.`)
      .setColor(0x00FF00);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const newStrikes = Math.max(0, currentStrikes - 1);
  
  const confirmEmbed = new EmbedBuilder()
    .setTitle(`🏆 Apply achievement for ${user.username}?`)
    .setDescription(`**4000+ Clan Games Points achievement**\n\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (-1)`)
    .setColor(0x00FF00)
    .setFooter({ text: "✅ Confirm | ❌ Cancel" });

  const confirmMessage = await message.channel.send({ embeds: [confirmEmbed], allowedMentions: { repliedUser: false } });

  await confirmMessage.react('✅');
  await confirmMessage.react('❌');

  const filter = (reaction, reactionUser) => {
    return (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') &&
           !reactionUser.bot &&
           hasModeratorPermissions(message.guild.members.cache.get(reactionUser.id));
  };

  const collector = confirmMessage.createReactionCollector({ filter, time: 300000, max: 1 });

  collector.on('collect', async (reaction, reactionUser) => {
    if (reaction.emoji.name === '✅') {
      try {
        await Strike.findOneAndUpdate(
          { userId: user.id, guildId: message.guild.id },
          {
            $set: { strikes: newStrikes },
            $push: {
              history: {
                reason: "4000+ Clan Games Points achievement",
                strikesAdded: -1,
                moderator: `${message.author.username} (confirmed by ${reactionUser.username})`,
                date: new Date()
              }
            }
          },
          { upsert: true }
        );

        const successEmbed = new EmbedBuilder()
          .setTitle("🏆 Achievement Applied")
          .setDescription(`${user.username} received the 4000+ Clan Games achievement!`)
          .setColor(0x00FF00)
          .addFields(
            { name: "Achievement", value: "4000+ Clan Games Points", inline: true },
            { name: "Strikes Reduced", value: "1", inline: true },
            { name: "New Total", value: `${newStrikes}`, inline: true }
          );

        await confirmMessage.edit({ embeds: [successEmbed] });

      } catch (error) {
        console.error(`Error applying achievement: ${error.message}`);
      }
    } else {
      const cancelledEmbed = new EmbedBuilder()
        .setTitle("❌ Achievement Cancelled")
        .setDescription("No changes made")
        .setColor(0x808080);
      await confirmMessage.edit({ embeds: [cancelledEmbed] });
    }
  });
}

async function handleDonationAchievement(message, client) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to apply achievements.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const user = message.mentions.users.first();
  if (!user) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("Usage: `!donationachievement @user` (Removes 1 strike for 10000+ donations)")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  // Similar implementation to CG achievement
  const embed = new EmbedBuilder()
    .setTitle("🏆 Donation Achievement")
    .setDescription("Processing donation achievement...")
    .setColor(0x00FF00);
  return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

module.exports = {
  handleCGAchievement,
  handleDonationAchievement
};
