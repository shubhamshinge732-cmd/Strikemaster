const { Strike, GuildSettings } = require('../config/database');

class StrikeDecayManager {
  constructor(client) {
    this.client = client;
    this.decayInterval = null;
  }

  // Start the decay system
  async start() {
    console.log('🕐 Starting Strike Decay System...');

    // Run decay check every hour
    this.decayInterval = setInterval(() => {
      this.processDecay().catch(error => {
        console.error('❌ Error in strike decay:', error.message);
      });
    }, 60 * 60 * 1000); // 1 hour

    // Run initial decay check
    setTimeout(() => {
      this.processDecay().catch(error => {
        console.error('❌ Error in initial decay:', error.message);
      });
    }, 10000); // 10 seconds after start

    console.log('✅ Strike Decay System started');
  }

  // Stop the decay system
  stop() {
    if (this.decayInterval) {
      clearInterval(this.decayInterval);
      this.decayInterval = null;
    }
    console.log('⏸️ Strike Decay System stopped');
  }

  // Process decay for all guilds
  async processDecay() {
    console.log('🔄 Processing strike decay...');

    try {
      // Get all guilds with decay enabled
      const guildsWithDecay = await GuildSettings.find({
        'decaySettings.enabled': true
      });

      if (guildsWithDecay.length === 0) {
        console.log('📊 No guilds have decay enabled');
        return;
      }

      let totalProcessed = 0;
      for (const guildSettings of guildsWithDecay) {
        const processed = await this.processGuildDecay(guildSettings);
        totalProcessed += processed;
      }

      if (totalProcessed > 0) {
        console.log(`✅ Strike decay completed: ${totalProcessed} users processed`);
      } else {
        console.log('📊 No users eligible for strike decay');
      }

    } catch (error) {
      console.error('❌ Error in decay processing:', error.message);
    }
  }

  // Process decay for a specific guild
  async processGuildDecay(guildSettings) {
    const guildId = guildSettings.guildId;
    const decaySettings = guildSettings.decaySettings || {};
    const decayDays = decaySettings.decayDays || 30;
    const decayAmount = decaySettings.decayAmount || 0.5;

    console.log(`🔄 Processing decay for guild ${guildId} (${decayDays} day period)`);

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - decayDays);

      // Find users eligible for decay
      const eligibleUsers = await Strike.find({
        guildId: guildId,
        strikes: { $gt: 0 },
        $or: [
          { lastDecay: { $exists: false } },
          { lastDecay: { $lt: cutoffDate } }
        ],
        // Only decay if user hasn't had recent violations
        lastViolation: { $lt: cutoffDate }
      });

      let processedCount = 0;

      for (const userRecord of eligibleUsers) {
        try {
          const newStrikes = Math.max(0, userRecord.strikes - decayAmount);

          if (newStrikes !== userRecord.strikes) {
            await Strike.findOneAndUpdate(
              { userId: userRecord.userId, guildId: guildId },
              {
                $set: { 
                  strikes: newStrikes,
                  lastDecay: new Date()
                },
                $push: {
                  history: {
                    reason: "Strike decay - automatic reduction",
                    strikesAdded: -decayAmount,
                    moderator: 'System (Auto-Decay)',
                    date: new Date()
                  }
                }
              }
            );

            // Send DM notification to user
            await this.notifyUserOfDecay(userRecord.userId, decayAmount, newStrikes, guildId);

            processedCount++;
          }
        } catch (userError) {
          console.error(`❌ Error processing decay for user ${userRecord.userId}: ${userError.message}`);
        }
      }

      return processedCount;

    } catch (error) {
      console.error(`❌ Error in guild decay for ${guildId}: ${error.message}`);
      return 0;
    }
  }

  // Notify user of strike decay
  async notifyUserOfDecay(userId, decayAmount, newStrikes, guildId) {
    try {
      const user = await this.client.users.fetch(userId).catch(() => null);
      const guild = this.client.guilds.cache.get(guildId);

      if (!user || !guild) return;

      const { EmbedBuilder } = require('discord.js');

      const embed = new EmbedBuilder()
        .setTitle('⚖️ Strike Decay Notification')
        .setDescription(`Your strikes have been automatically reduced in **${guild.name}**`)
        .setColor(0x00FF00)
        .addFields(
          { name: 'Strikes Reduced', value: `${decayAmount}`, inline: true },
          { name: 'Current Strikes', value: `${newStrikes}`, inline: true },
          { name: 'Reason', value: 'Good behavior over time', inline: false }
        )
        .setFooter({ text: 'Keep up the good behavior!' })
        .setTimestamp();

      await user.send({ embeds: [embed] }).catch(() => {
        console.log(`Could not DM decay notification to ${user.username}`);
      });

    } catch (error) {
      console.error(`❌ Error notifying user of decay: ${error.message}`);
    }
  }

  // Configure decay settings for a guild
  async configureDecay(guildId, settings) {
    try {
      const updateData = {
        'decaySettings.enabled': settings.enabled !== undefined ? settings.enabled : true,
        'decaySettings.decayDays': settings.decayDays || 30,
        'decaySettings.decayAmount': settings.decayAmount || 0.5,
        updatedAt: new Date()
      };

      await GuildSettings.findOneAndUpdate(
        { guildId },
        { $set: updateData },
        { upsert: true }
      );

      console.log(`✅ Decay settings configured for guild ${guildId}`);
      return { success: true };

    } catch (error) {
      console.error(`❌ Error configuring decay: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Get decay settings for a guild
  async getDecaySettings(guildId) {
    try {
      const guildSettings = await GuildSettings.findOne({ guildId });

      if (!guildSettings || !guildSettings.decaySettings) {
        return {
          enabled: false,
          decayDays: 30,
          decayAmount: 0.5
        };
      }

      return guildSettings.decaySettings;

    } catch (error) {
      console.error(`❌ Error getting decay settings: ${error.message}`);
      return null;
    }
  }

  // Force decay for a specific guild
  async forceDecayForGuild(guildId) {
    try {
      const guildSettings = await GuildSettings.findOne({ guildId });

      if (!guildSettings) {
        return { success: false, message: 'Guild not found' };
      }

      const processed = await this.processGuildDecay(guildSettings);

      return { 
        success: true, 
        message: `Processed ${processed} users for decay` 
      };

    } catch (error) {
      console.error(`❌ Error in forced decay: ${error.message}`);
      return { success: false, message: error.message };
    }
  }
}

module.exports = { StrikeDecayManager };