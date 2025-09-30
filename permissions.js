
const { PermissionFlagsBits } = require("discord.js");

// ⚡ Enhanced rate limiting and locks management
const commandCooldowns = new Map();
const processingMessages = new Set();

// ⚡ Enhanced permission check function
function hasModeratorPermissions(member) {
  if (!member || !member.permissions) return false;

  try {
    // Check for Administrator permission
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }

    // Check for Manage Messages permission
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return true;
    }

    // Check for Kick Members permission
    if (member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return true;
    }

    // Check for moderator-related role names
    const moderatorRoleNames = ['mod', 'moderator', 'admin', 'administrator', 'staff'];
    const hasModRole = member.roles.cache.some(role =>
      moderatorRoleNames.some(modRole =>
        role.name.toLowerCase().includes(modRole)
      )
    );

    return hasModRole;
  } catch (error) {
    console.error(`❌ Error checking permissions for ${member?.user?.username}: ${error.message}`);
    return false;
  }
}

// Enhanced cooldown system
function isOnCooldown(userId, command, cooldownTime = 2000) {
  const key = `${userId}-${command}`;
  const now = Date.now();

  if (commandCooldowns.has(key)) {
    const expirationTime = commandCooldowns.get(key) + cooldownTime;
    if (now < expirationTime) {
      return true;
    }
  }

  commandCooldowns.set(key, now);
  return false;
}

// Helper function to get emojis, supporting animated ones if available in guild
function getEmoji(name, guild = null) {
  const emojiMap = {
    check: '✅',
    cross: '❌',
    ban: '🚫',
    danger: '⚠️',
    celebration: '🎉',
  };

  if (guild) {
    const animatedEmoji = guild.emojis.cache.find(emoji => emoji.name === name);
    if (animatedEmoji) {
      return animatedEmoji.toString();
    }
  }
  return emojiMap[name] || '';
}

module.exports = {
  hasModeratorPermissions,
  isOnCooldown,
  getEmoji,
  commandCooldowns,
  processingMessages
};
