
const { PermissionFlagsBits } = require("discord.js");

// Rate limiting for API calls
let lastApiCall = 0;
const API_RATE_LIMIT = 500;
// Use global locks if available, otherwise create local set
const roleUpdateLocks = global.roleUpdateLocks || new Set();
if (!global.roleUpdateLocks) {
  global.roleUpdateLocks = roleUpdateLocks;
}

async function rateLimitedDelay() {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  if (timeSinceLastCall < API_RATE_LIMIT) {
    const delayNeeded = API_RATE_LIMIT - timeSinceLastCall;
    await new Promise(resolve => setTimeout(resolve, delayNeeded));
  }
  lastApiCall = Date.now();
}

// Auto role update function
async function updateRole(member, strikes) {
  const lockKey = `${member.guild.id}-${member.id}`;
  if (roleUpdateLocks.has(lockKey)) {
    console.log(`⏸️ Role update already in progress for ${member.user.username}`);
    return;
  }

  roleUpdateLocks.add(lockKey);
  
  // Add timeout protection
  const timeoutId = setTimeout(() => {
    roleUpdateLocks.delete(lockKey);
    console.warn(`⚠️ Role update lock timeout for ${member.user.username}`);
  }, 30000); // 30 second timeout

  try {
    await rateLimitedDelay();

    const botMember = member.guild.members.me;
    if (!botMember) {
      console.error(`❌ Bot member not found in guild ${member.guild.name}`);
      return;
    }

    const botHighestRole = botMember.roles.highest;

    // Role mapping configuration
    const roleMapping = {
      ban: {
        names: ["🚫 4 Strikes", "4 Strikes", "Ban"],
        color: 0xFF0000,
        permissions: []
      },
      block: {
        names: ["⛔ 3 Strikes", "3 Strikes", "Block"],
        color: 0xFFA500,
        permissions: []
      },
      warn: {
        names: ["⚠️ 2 Strikes", "2 Strikes", "Warn"],
        color: 0xFFFF00,
        permissions: []
      }
    };

    // Find existing roles
    let banRole = member.guild.roles.cache.find(r => roleMapping.ban.names.includes(r.name));
    let blockRole = member.guild.roles.cache.find(r => roleMapping.block.names.includes(r.name));
    let warnRole = member.guild.roles.cache.find(r => roleMapping.warn.names.includes(r.name));

    // Create missing roles with error handling
    if (!banRole) {
      try {
        await rateLimitedDelay();
        banRole = await member.guild.roles.create({
          name: "🚫 4 Strikes",
          color: roleMapping.ban.color,
          permissions: roleMapping.ban.permissions,
          position: Math.max(1, botHighestRole.position - 3),
          reason: "Auto-created by StrikeMaster bot"
        });
        console.log(`✅ Created ban role: ${banRole.name}`);
      } catch (createError) {
        console.error(`❌ Failed to create ban role: ${createError.message}`);
        if (createError.code === 50013) {
          console.error(`❌ Missing permissions to create roles`);
          return;
        }
      }
    }

    if (!blockRole) {
      try {
        await rateLimitedDelay();
        blockRole = await member.guild.roles.create({
          name: "⛔ 3 Strikes",
          color: roleMapping.block.color,
          permissions: roleMapping.block.permissions,
          position: Math.max(1, botHighestRole.position - 2),
          reason: "Auto-created by StrikeMaster bot"
        });
        console.log(`✅ Created block role: ${blockRole.name}`);
      } catch (createError) {
        console.error(`❌ Failed to create block role: ${createError.message}`);
      }
    }

    if (!warnRole) {
      try {
        await rateLimitedDelay();
        warnRole = await member.guild.roles.create({
          name: "⚠️ 2 Strikes",
          color: roleMapping.warn.color,
          permissions: roleMapping.warn.permissions,
          position: Math.max(1, botHighestRole.position - 1),
          reason: "Auto-created by StrikeMaster bot"
        });
        console.log(`✅ Created warn role: ${warnRole.name}`);
      } catch (createError) {
        console.error(`❌ Failed to create warn role: ${createError.message}`);
      }
    }

    // Remove existing strike roles
    const rolesToRemove = [];
    if (warnRole && member.roles.cache.has(warnRole.id)) rolesToRemove.push(warnRole);
    if (blockRole && member.roles.cache.has(blockRole.id)) rolesToRemove.push(blockRole);
    if (banRole && member.roles.cache.has(banRole.id)) rolesToRemove.push(banRole);

    if (rolesToRemove.length > 0) {
      try {
        await rateLimitedDelay();
        await member.roles.remove(rolesToRemove, "Strike role update");
        console.log(`🗑️ Removed ${rolesToRemove.length} strike roles from ${member.user.username}`);
      } catch (removeError) {
        console.error(`❌ Failed to remove roles from ${member.user.username}: ${removeError.message}`);
      }
    }

    // Add appropriate role based on strikes
    let roleToAdd = null;
    if (strikes >= 4 && banRole) {
      roleToAdd = banRole;
    } else if (strikes >= 3 && blockRole) {
      roleToAdd = blockRole;
    } else if (strikes >= 2 && warnRole) {
      roleToAdd = warnRole;
    }

    if (roleToAdd) {
      try {
        await rateLimitedDelay();
        await member.roles.add(roleToAdd, "Strike role assignment");
        console.log(`✅ Added ${roleToAdd.name} to ${member.user.username} (${strikes} strikes)`);
      } catch (addError) {
        console.error(`❌ Failed to add role to ${member.user.username}: ${addError.message}`);
      }
    } else {
      console.log(`✅ No strike role needed for ${member.user.username} (${strikes} strikes)`);
    }

  } catch (error) {
    console.error(`❌ Role update error for ${member.user.username}: ${error.message}`);
  } finally {
    clearTimeout(timeoutId);
    roleUpdateLocks.delete(lockKey);
  }
}

module.exports = {
  updateRole,
  roleUpdateLocks
};
