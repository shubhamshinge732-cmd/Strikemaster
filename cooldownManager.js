
const { GuildSettings } = require("../config/database");

// Enhanced cooldown system with better duplicate prevention
const commandCooldowns = new Map();

function isOnCooldown(userId, command, cooldownTime = 3000) {
  const key = `${userId}-${command}`;
  const now = Date.now();

  if (commandCooldowns.has(key)) {
    const expirationTime = commandCooldowns.get(key) + cooldownTime;
    if (now < expirationTime) {
      return true;
    }
  }

  commandCooldowns.set(key, now);

  // Clean up old cooldowns periodically
  if (commandCooldowns.size > 500) {
    for (const [cooldownKey, timestamp] of commandCooldowns.entries()) {
      if (now - timestamp > 120000) {
        commandCooldowns.delete(cooldownKey);
      }
    }
  }

  return false;
}

// Persistent cooldown functions using database
async function isOnSeasonResetCooldown(guildId) {
  try {
    const guildSettings = await GuildSettings.findOne({ guildId });
    if (!guildSettings || !guildSettings.lastSeasonReset) {
      return { onCooldown: false, daysLeft: 0 };
    }

    const now = Date.now();
    const lastReset = new Date(guildSettings.lastSeasonReset).getTime();
    const cooldownDuration = 20 * 24 * 60 * 60 * 1000;
    const expirationTime = lastReset + cooldownDuration;
    const timeLeft = expirationTime - now;

    if (now < expirationTime) {
      const hoursLeft = Math.ceil(timeLeft / (1000 * 60 * 60));
      const daysLeft = Math.floor(hoursLeft / 24);
      const remainingHours = hoursLeft % 24;

      return {
        onCooldown: true,
        daysLeft: daysLeft,
        hoursLeft: remainingHours,
        totalHours: hoursLeft
      };
    }

    return {
      onCooldown: false,
      daysLeft: 0
    };
  } catch (error) {
    console.error(`❌ Error checking season reset cooldown: ${error.message}`);
    return { onCooldown: false, daysLeft: 0 };
  }
}

async function setSeasonResetCooldown(guildId) {
  try {
    await GuildSettings.findOneAndUpdate(
      { guildId },
      { 
        $set: { 
          lastSeasonReset: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    console.log(`✅ Season reset cooldown set for guild ${guildId}`);
  } catch (error) {
    console.error(`❌ Error setting season reset cooldown: ${error.message}`);
  }
}

module.exports = {
  isOnCooldown,
  isOnSeasonResetCooldown,
  setSeasonResetCooldown,
  commandCooldowns
};
