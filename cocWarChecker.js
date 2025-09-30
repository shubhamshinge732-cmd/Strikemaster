const { EmbedBuilder } = require('discord.js');
const { getCocCurrentWar, getCocClanInfo } = require('./cocApi');
const { Strike, GuildSettings } = require('../config/database');
const { notifyLeadership } = require('./leadershipNotification');

class CocWarChecker {
  constructor(client) {
    this.client = client;
    this.checkInterval = null;
    this.isRunning = false;
  }

  // Start the war checker
  async start() {
    if (this.isRunning) return;

    console.log('⚔️ Starting COC War Checker...');
    this.isRunning = true;

    // Check wars every 30 minutes
    this.checkInterval = setInterval(() => {
      this.checkAllWars().catch(error => {
        console.error('❌ Error in war checking:', error.message);
        console.error('Stack trace:', error.stack);
        // Continue operation despite errors
      });
    }, 30 * 60 * 1000); // 30 minutes

    console.log('✅ COC War Checker started');
  }

  // Stop the war checker
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('⏸️ COC War Checker stopped');
  }

  // Check all wars across guilds
  async checkAllWars() {
    console.log('⚔️ Checking COC wars...');

    try {
      const guildsWithCOC = await GuildSettings.find({
        cocApiKey: { $exists: true, $ne: null },
        cocAutoStrike: true
      });

      if (guildsWithCOC.length === 0) {
        console.log('📊 No guilds have COC auto-strike enabled');
        return;
      }

      let totalChecked = 0;
      for (const guildSettings of guildsWithCOC) {
        try {
          await this.checkGuildWars(guildSettings);
          totalChecked++;
        } catch (guildError) {
          console.error(`❌ Error checking wars for guild ${guildSettings.guildId}: ${guildError.message}`);
        }
      }

      console.log(`✅ War check completed for ${totalChecked} guilds`);

    } catch (error) {
      console.error('❌ Error in war checking:', error.message);
    }
  }

  // Check wars for a specific guild
  async checkGuildWars(guildSettings) {
    const guildId = guildSettings.guildId;
    const guild = this.client.guilds.cache.get(guildId);

    if (!guild) return;

    // Get clan mappings
    const clanMappings = guildSettings.cocClanMappings || new Map();

    if (clanMappings.size === 0) {
      console.log(`📊 No clan mappings configured for ${guild.name}`);
      return;
    }

    for (const [roleName, clanTag] of clanMappings) {
      try {
        await this.checkClanWar(guild, roleName, clanTag, guildSettings);
      } catch (clanError) {
        console.error(`❌ Error checking war for clan ${clanTag}: ${clanError.message}`);
      }
    }
  }

  // Check war for a specific clan
  async checkClanWar(guild, roleName, clanTag, guildSettings) {
    const { decryptApiKey } = require('./cocApi');
    const apiKey = decryptApiKey(guildSettings.cocApiKey);

    if (!apiKey) {
      console.error('❌ Failed to decrypt API key');
      return;
    }

    const warData = await getCocCurrentWar(clanTag, apiKey);

    if (!warData.success) {
      console.log(`📊 No active war for clan ${clanTag}: ${warData.message}`);
      return;
    }

    const war = warData.data;

    // Only process wars that are about to end (within 2 hours)
    if (war.state !== 'inWar') return;

    const endTime = new Date(war.endTime);
    const now = new Date();
    const timeToEnd = endTime - now;
    const twoHours = 2 * 60 * 60 * 1000;

    if (timeToEnd > twoHours) {
      console.log(`⏰ War for ${clanTag} not close to ending (${Math.floor(timeToEnd / (60 * 60 * 1000))}h remaining)`);
      return;
    }

    console.log(`⚔️ Processing war ending soon for clan ${clanTag}`);

    // Find members who missed attacks
    const missedAttackers = this.findMissedAttackers(war.clan.members);

    if (missedAttackers.length === 0) {
      console.log(`✅ All members completed attacks in ${clanTag}`);
      return;
    }

    // Apply auto-strikes
    await this.applyAutoStrikes(guild, missedAttackers, roleName, guildSettings);
  }

  // Find members who missed attacks
  findMissedAttackers(clanMembers) {
    const missedAttackers = [];

    for (const member of clanMembers) {
      const attacksUsed = member.attacks ? member.attacks.length : 0;
      const maxAttacks = 2; // Each member gets 2 attacks
      const missedAttacks = maxAttacks - attacksUsed;

      if (missedAttacks > 0) {
        missedAttackers.push({
          name: member.name,
          tag: member.tag,
          mapPosition: member.mapPosition,
          attacksUsed: attacksUsed,
          attacksMissed: missedAttacks
        });
      }
    }

    return missedAttackers;
  }

  // Apply auto-strikes for missed attacks
  async applyAutoStrikes(guild, missedAttackers, roleName, guildSettings) {
    console.log(`🤖 Applying auto-strikes for ${missedAttackers.length} members in ${guild.name}`);

    for (const attacker of missedAttackers) {
      try {
        // Find Discord member by COC player tag
        const discordMember = await this.findDiscordMember(guild, attacker.tag, guildSettings);

        if (!discordMember) {
          console.log(`⚠️ Could not find Discord member for COC player ${attacker.name} (${attacker.tag})`);
          continue;
        }

        // Calculate strikes based on missed attacks
        const strikeAmount = attacker.attacksMissed === 2 ? 0.5 : 0.25; // 0.5 for both, 0.25 for one
        const reason = attacker.attacksMissed === 2 ? 
          "Missed both war attacks (Auto-Strike)" : 
          "Missed one war attack (Auto-Strike)";

        // Apply the strike
        const updatedRecord = await Strike.findOneAndUpdate(
          { userId: discordMember.id, guildId: guild.id },
          {
            $inc: { strikes: strikeAmount },
            $set: { lastViolation: new Date() },
            $push: {
              history: {
                reason: reason,
                strikesAdded: strikeAmount,
                moderator: 'COC Auto-Strike System',
                date: new Date(),
                cocData: {
                  playerName: attacker.name,
                  playerTag: attacker.tag,
                  attacksUsed: attacker.attacksUsed,
                  attacksMissed: attacker.attacksMissed
                }
              }
            }
          },
          { upsert: true, new: true }
        );

        console.log(`✅ Auto-strike applied: ${discordMember.user.username} (+${strikeAmount} strikes)`);

        // Send notification to user
        await this.notifyUserOfAutoStrike(discordMember.user, attacker, strikeAmount, updatedRecord.strikes, guild);

        // Update roles
        const { updateRole } = require('./roleManager');
        await updateRole(discordMember, updatedRecord.strikes);

        // Notify leadership if necessary
        if (updatedRecord.strikes >= 2) {
          await notifyLeadership(guild, discordMember.user, { reason, strikes: strikeAmount }, updatedRecord.strikes, { tag: 'COC Auto-Strike System' }, roleName);
        }

      } catch (memberError) {
        console.error(`❌ Error applying auto-strike to ${attacker.name}: ${memberError.message}`);
      }
    }
  }

  // Find Discord member by COC player tag
  async findDiscordMember(guild, playerTag, guildSettings) {
    // Check player links
    if (guildSettings.cocPlayerLinks) {
      for (const [discordId, linkedTag] of guildSettings.cocPlayerLinks) {
        if (linkedTag === playerTag) {
          return await guild.members.fetch(discordId).catch(() => null);
        }
      }
    }

    // Could implement name matching as fallback
    return null;
  }

  // Notify user of auto-strike
  async notifyUserOfAutoStrike(user, attackerData, strikeAmount, totalStrikes, guild) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🤖 COC Auto-Strike Applied')
        .setDescription(`You have received an automatic strike for missed war attacks in **${guild.name}**`)
        .setColor(0xFF4500)
        .addFields(
          { name: 'COC Player', value: `${attackerData.name} (${attackerData.tag})`, inline: false },
          { name: 'Attacks Missed', value: `${attackerData.attacksMissed} out of 2`, inline: true },
          { name: 'Strikes Added', value: `+${strikeAmount}`, inline: true },
          { name: 'Total Strikes', value: `${totalStrikes}`, inline: true },
          { name: 'Reason', value: attackerData.attacksMissed === 2 ? 'Missed both war attacks' : 'Missed one war attack', inline: false }
        )
        .setFooter({ text: 'This is an automated system. Contact leadership if you believe this is an error.' })
        .setTimestamp();

      await user.send({ embeds: [embed] }).catch(() => {
        console.log(`Could not DM auto-strike notification to ${user.username}`);
      });

    } catch (error) {
      console.error(`❌ Error notifying user of auto-strike: ${error.message}`);
    }
  }

  // Manual war check for a specific clan
  async manualWarCheck(guild, clanTag, apiKey) {
    try {
      const warData = await getCocCurrentWar(clanTag, apiKey);

      if (!warData.success) {
        return {
          success: false,
          message: warData.message
        };
      }

      const war = warData.data;
      const clanInfo = await getCocClanInfo(clanTag, apiKey);
      const clanName = clanInfo.success ? clanInfo.data.name : clanTag;

      // Find missed attackers
      const missedAttackers = this.findMissedAttackers(war.clan.members);

      return {
        success: true,
        data: {
          war,
          missedAttackers,
          clanName
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `War check failed: ${error.message}`
      };
    }
  }
}

module.exports = { CocWarChecker };