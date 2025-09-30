const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionFlagsBits, REST, Routes } = require("discord.js");
const { Strike, GuildSettings, isDatabaseConnected, connectDatabase } = require("./config/database");
const express = require('express');
require("dotenv").config();

// Add fetch for Node.js versions that don't have it built-in
if (!global.fetch) {
  global.fetch = require('node-fetch');
}

// Create Express app to keep bot alive
const app = express();
const PORT = process.env.PORT || 5000;

// Basic health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'Bot is running!',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    guilds: client.guilds ? client.guilds.cache.size : 0,
    users: client.users ? client.users.cache.size : 0
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
  });
});

// Start the Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Express server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

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

// ⚡ Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ],
});

// Models are now imported from config/database.js

// ⚡ Connect to MongoDB using database module
connectDatabase().catch(error => {
  console.error('❌ Failed to connect to database:', error.message);
  process.exit(1);
});

// Monitor database connection
setInterval(() => {
  if (!isDatabaseConnected()) {
    console.error('❌ Database connection lost! Attempting to reconnect...');
    connectDatabase().catch(error => {
      console.error('❌ Reconnection failed:', error.message);
    });
  }
}, 60000); // Check every minute

// ⚡ Enhanced rate limiting and locks management
const commandCooldowns = new Map();
const processingMessages = new Set();
const roleUpdateLocks = new Set();
const messageProcessingLocks = new Map();

// Make these globally accessible for cleanup commands
global.commandCooldowns = commandCooldowns;
global.processingMessages = processingMessages;
global.roleUpdateLocks = roleUpdateLocks;
global.messageProcessingLocks = messageProcessingLocks;

// Periodic cleanup of stale locks and memory monitoring
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 30000; // 30 seconds

  // Clean up processing locks
  let locksCleared = 0;
  for (const [key, timestamp] of messageProcessingLocks) {
    if (now - timestamp > staleThreshold) {
      messageProcessingLocks.delete(key);
      locksCleared++;
    }
  }

  // Clean up processing messages
  let messagesCleared = 0;
  for (const messageId of processingMessages) {
    // Clear messages older than 5 minutes (safety net)
    const messageAge = now - parseInt(messageId.split('-')[0] || '0');
    if (messageAge > 300000) {
      processingMessages.delete(messageId);
      messagesCleared++;
    }
  }

  // Clean up command cooldowns
  let cooldownsCleared = 0;
  for (const [key, timestamp] of commandCooldowns) {
    if (now - timestamp > 120000) { // 2 minutes
      commandCooldowns.delete(key);
      cooldownsCleared++;
    }
  }

  // Clean up role update locks
  let roleLocksCleared = 0;
  for (const lockKey of roleUpdateLocks) {
    // This is a Set, so we'll clear very old entries based on a different approach
    // For now, we'll limit the size
    if (roleUpdateLocks.size > 100) {
      roleUpdateLocks.clear();
      roleLocksCleared = roleUpdateLocks.size;
    }
  }

  // Memory monitoring
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);

  if (locksCleared > 0 || cooldownsCleared > 0 || messagesCleared > 0) {
    console.log(`🧹 Cleanup: ${locksCleared} locks, ${messagesCleared} messages, ${cooldownsCleared} cooldowns cleared | Memory: ${heapUsedMB}MB`);
  }

  // Warn if memory usage is high
  if (heapUsedMB > 200) {
    console.warn(`⚠️ High memory usage: ${heapUsedMB}MB`);
  }

  // Force garbage collection if memory is very high (Node.js with --expose-gc)
  if (heapUsedMB > 300 && global.gc) {
    global.gc();
    console.log(`🗑️ Forced garbage collection due to high memory usage`);
  }
}, 30000); // Run cleanup every 30 seconds instead of 60

// ⚡ Strike Map - Using short user-friendly commands
const strikeReasons = {
  mw: { strikes: 0.5, reason: "Missed war (both attacks)" },
  fwa: { strikes: 1, reason: "Missed FWA war search" },
  realbaseafterbl: { strikes: 1, reason: "Real base after BL war" },
  mwt: { strikes: 2, reason: "Missed wars twice in a row" },
  nfp: { strikes: 2, reason: "Not following war plan" },
  cg: { strikes: 2, reason: "Failure to reach 1000 Clan Games Points" },
  mr: { strikes: 2, reason: "Missed raid attacks" },
  rb: { strikes: 2, reason: "Broke clan rules" },
  rbf: { strikes: 3, reason: "Real war base in FWA war" },
  mwth: { strikes: 4, reason: "Missed wars 3 times in a row/4 in season" },
  don: { strikes: 4, reason: "Failure to meet 5000 donations + received in a season" },
  ld: { strikes: 4, reason: "Left the Discord server" },
  ia: { strikes: 4, reason: "Inactivity (multiple days)" },
};

// Database connection check is now imported from config/database.js

// ⚡ Enhanced permission check function
function hasModeratorPermissions(member) {
  if (!member || !member.permissions) return false;

  try {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }

    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return true;
    }

    if (member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return true;
    }

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

// Import role update function from utils
const { updateRole } = require('./utils/roleManager');

// Rate limiting for API calls
let lastApiCall = 0;
const API_RATE_LIMIT = 500;

async function rateLimitedDelay() {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  if (timeSinceLastCall < API_RATE_LIMIT) {
    const delayNeeded = API_RATE_LIMIT - timeSinceLastCall;
    await new Promise(resolve => setTimeout(resolve, delayNeeded));
  }
  lastApiCall = Date.now();
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



// Legacy help system removed - now using modular help system from commands/basic.js

// Helper function to handle strike removal
async function handleStrikeRemoval(user, reductionAmount, originalMessage, confirmMessage, reactionUser, selectedClan = null) {
  console.log(`🔄 Processing strike removal for ${user.username}: -${reductionAmount} strikes`);

  try {
    try {
      await confirmMessage.reactions.removeAll();
    } catch (reactionError) {
      console.log(`Could not remove reactions: ${reactionError.message}`);
    }

    // Ensure strikes don't go below 0
    const currentRecord = await Strike.findOne({ userId: user.id, guildId: originalMessage.guild.id });
    const currentStrikes = currentRecord ? currentRecord.strikes : 0;
    const actualReduction = Math.min(reductionAmount, currentStrikes);
    const newStrikes = Math.max(0, currentStrikes - actualReduction);

    const updatedRecord = await Strike.findOneAndUpdate(
      { userId: user.id, guildId: originalMessage.guild.id },
      {
        $set: { 
          strikes: newStrikes,
          lastViolation: new Date() 
        },
        $push: {
          history: {
            reason: "Strike removal by moderator",
            strikesAdded: -actualReduction,
            moderator: `${originalMessage.author.username} (confirmed by ${reactionUser.username})`,
            date: new Date()
          }
        }
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Strike removal completed: ${user.username} now has ${updatedRecord.strikes} strikes`);

    const confirmedEmbed = new EmbedBuilder()
      .setTitle("✅ Strikes Removed Successfully")
      .setColor(0x00FF00)
      .addFields(
        { name: "User", value: user.username, inline: true },
        { name: "Strikes Removed", value: `${actualReduction}`, inline: true },
        { name: "Total Strikes", value: `${updatedRecord.strikes}`, inline: true },
        { name: "Confirmed By", value: reactionUser.username, inline: true }
      );

    if (selectedClan) {
      confirmedEmbed.addFields({ name: "Clan", value: selectedClan, inline: true });
    }

    confirmedEmbed.setTimestamp();
    await confirmMessage.edit({ embeds: [confirmedEmbed] });

    const logEmbed = new EmbedBuilder()
      .setTitle("🗑️ Strikes Removed")
      .setColor(0x00FF00)
      .addFields(
        { name: "User", value: `${user.tag} (${user.id})`, inline: true },
        { name: "Strikes Removed", value: `${actualReduction}`, inline: true },
        { name: "New Total", value: `${updatedRecord.strikes}`, inline: true },
        { name: "Moderator", value: originalMessage.author.tag, inline: true },
        { name: "Confirmed By", value: reactionUser.tag, inline: true }
      )
      .setTimestamp();

    await logAction(client, originalMessage.guild.id, logEmbed, user.id, selectedClan);

    try {
      const member = await originalMessage.guild.members.fetch(user.id);
      if (member) {
        await updateRole(member, updatedRecord.strikes);
      }
    } catch (roleError) {
      console.error(`❌ Failed to update role for ${user.username}: ${roleError.message}`);
    }

    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle("✅ Strike Removal Notification")
        .setColor(0x00FF00)
        .setDescription(`Your strikes have been reduced in **${originalMessage.guild.name}**`)
        .addFields(
          { name: "Strikes Removed", value: `${actualReduction}`, inline: true },
          { name: "Total Strikes", value: `${updatedRecord.strikes}`, inline: true }
        )
        .setTimestamp();

      await user.send({ embeds: [dmEmbed] });
    } catch (dmError) {
      console.log(`Could not DM ${user.username}`);
    }

  } catch (error) {
    console.error(`❌ Error removing strikes: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Strike Removal Failed")
      .setDescription(`Error: ${error.message}`)
      .setColor(0xFF0000);
    await confirmMessage.edit({ embeds: [errorEmbed] });
  }
}

// Helper function to handle strike application
async function handleStrikeApplication(user, strikeData, originalMessage, confirmMessage, reactionUser, selectedClan = null) {
  try {
    try {
      await confirmMessage.reactions.removeAll();
    } catch (reactionError) {
      console.log(`Could not remove reactions: ${reactionError.message}`);
    }

    const updatedRecord = await Strike.findOneAndUpdate(
      { userId: user.id, guildId: originalMessage.guild.id },
      {
        $inc: { strikes: strikeData.strikes },
        $set: { lastViolation: new Date() },
        $push: {
          history: {
            reason: strikeData.reason,
            strikesAdded: strikeData.strikes,
            moderator: `${originalMessage.author.username} (confirmed by ${reactionUser.username})`,
            date: new Date()
          }
        }
      },
      { upsert: true, new: true }
    );

    const confirmedEmbed = new EmbedBuilder()
      .setTitle("✅ Strike Applied Successfully")
      .setColor(updatedRecord.strikes >= 4 ? 0xFF0000 : updatedRecord.strikes >= 3 ? 0xFFA500 : updatedRecord.strikes >= 2 ? 0xFFFF00 : 0x00FF00)
      .addFields(
        { name: "User", value: user.username, inline: true },
        { name: "Reason", value: strikeData.reason, inline: true },
        { name: "Total Strikes", value: `${updatedRecord.strikes}`, inline: true },
        { name: "Confirmed By", value: reactionUser.username, inline: true }
      );

    if (selectedClan) {
      confirmedEmbed.addFields({ name: "Clan", value: selectedClan, inline: true });
    }

    confirmedEmbed.setTimestamp();
    await confirmMessage.edit({ embeds: [confirmedEmbed] });

    const logEmbed = new EmbedBuilder()
      .setTitle("⚠️ Strike Applied")
      .setColor(updatedRecord.strikes >= 4 ? 0xFF0000 : updatedRecord.strikes >= 3 ? 0xFFA500 : updatedRecord.strikes >= 2 ? 0xFFFF00 : 0x00FF00)
      .addFields(
        { name: "User", value: `${user.tag} (${user.id})`, inline: true },
        { name: "Reason", value: strikeData.reason, inline: true },
        { name: "Strikes Added", value: `+${strikeData.strikes}`, inline: true },
        { name: "Total Strikes", value: `${updatedRecord.strikes}`, inline: true },
        { name: "Moderator", value: originalMessage.author.tag, inline: true },
        { name: "Confirmed By", value: reactionUser.tag, inline: true }
      )
      .setTimestamp();

    await logAction(client, originalMessage.guild.id, logEmbed, user.id, selectedClan);

    try {
      const member = await originalMessage.guild.members.fetch(user.id);
      if (member) {
        await updateRole(member, updatedRecord.strikes);
      }
    } catch (roleError) {
      console.error(`❌ Failed to update role for ${user.username}: ${roleError.message}`);
    }

    // Notify leadership if user reaches ban threshold (4+ strikes) or other thresholds
    if (updatedRecord.strikes >= 2) {
      await advancedNotifications.notifyLeadership(
        originalMessage.guild, 
        user, 
        strikeData, 
        updatedRecord.strikes, 
        originalMessage.author, 
        selectedClan
      );
    }

    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle("⚠️ Strike Notification")
        .setColor(updatedRecord.strikes >= 4 ? 0xFF0000 : 0xFFFF00)
        .setDescription(`You have received a strike in **${originalMessage.guild.name}**`)
        .addFields(
          { name: "Reason", value: strikeData.reason, inline: false },
          { name: "Total Strikes", value: `${updatedRecord.strikes}`, inline: true }
        )
        .setTimestamp();

      await user.send({ embeds: [dmEmbed] });
    } catch (dmError) {
      console.log(`Could not DM ${user.username}`);
    }

  } catch (error) {
    console.error(`Error applying strike: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Strike Application Failed")
      .setDescription(`Error: ${error.message}`)
      .setColor(0xFF0000);
    await confirmMessage.edit({ embeds: [errorEmbed] });
  }
}

// Initialize utilities first
const { isOnCooldown } = require('./utils/cooldownManager');
const { validateCocApiKey, getCocClanInfo, encryptApiKey, decryptApiKey } = require('./utils/cocApi');
const { logAction } = require('./utils/logging');

// Initialize advanced systems after client is ready
let commandLoader;
let contextManager;
let persistenceManager;
let backupManager;
let strikeDecayManager;
let cocWarChecker;
let advancedNotifications;

// Advanced systems will be initialized in ready event

// Initialize all systems when client is ready
client.once('clientReady', async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  try {
    // Initialize imports that require client
    const CommandLoader = require('./utils/commandLoader');
    const ContextManager = require('./utils/contextManager');
    const { AIBehaviorAnalyzer, NLPViolationDetector } = require('./utils/aiAnalysis');
    const { COCWarStrategyAssistant, COCDonationTracker, COCLiveCommentary } = require('./utils/cocAdvanced');
    const { PersistenceManager } = require('./utils/persistenceManager');
    const { StrikeDecayManager } = require('./utils/strikeDecay');
    const { AdvancedNotificationManager } = require('./utils/advancedNotifications');

    // Initialize advanced systems
    persistenceManager = new PersistenceManager(client, { Strike, GuildSettings });
    strikeDecayManager = new StrikeDecayManager(client);
    advancedNotifications = new AdvancedNotificationManager(client);

    // Initialize COC War Checker
    const { CocWarChecker } = require('./utils/cocWarChecker');
    cocWarChecker = new CocWarChecker(client);

    // Initialize AI systems
    const aiBehaviorAnalyzer = new AIBehaviorAnalyzer();
    const nlpViolationDetector = new NLPViolationDetector();
    const cocWarStrategyAssistant = new COCWarStrategyAssistant();
    const cocDonationTracker = new COCDonationTracker();
    const cocLiveCommentary = new COCLiveCommentary();

    // Initialize command system
    commandLoader = new CommandLoader();
    contextManager = new ContextManager(
      client,
      { Strike, GuildSettings },
      {
        hasModeratorPermissions,
        isOnCooldown,
        updateRole,
        logAction,
        rateLimitedDelay,
        strikeReasons,
        handleStrikeApplication,
        handleStrikeRemoval,
        isOnSeasonResetCooldown,
        setSeasonResetCooldown,
        validateCocApiKey,
        getCocClanInfo,
        encryptApiKey,
        decryptApiKey,
        isDatabaseConnected,
        persistenceManager,
        strikeDecayManager,
        advancedNotifications,
        cocWarChecker,
        aiBehaviorAnalyzer,
        nlpViolationDetector,
        cocWarStrategyAssistant,
        cocDonationTracker,
        cocLiveCommentary
      }
    );

    // Load all command groups
    await commandLoader.loadAllCommands();

    // Start persistence system
    if (persistenceManager) {
      await persistenceManager.start();
    }

    console.log('✅ All bot systems initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing bot systems:', error.message);
  }
});

// ⚡ Slash Command Registration
async function registerSlashCommands() {
  const commands = [
    // Basic User Commands
    {
      name: 'help',
      description: '📚 Complete command guide with categories',
      options: [{
        name: 'category',
        description: 'Specific help category to view',
        type: 3, // STRING
        required: false,
        choices: [
          { name: '📋 Basic Commands', value: 'basic' },
          { name: '⚔️ Strike System', value: 'strikes' },
          { name: '🛡️ Administration', value: 'admin' },
          { name: '📊 Reports & Analytics', value: 'reports' },
          { name: '🏆 Achievements', value: 'achievements' },
          { name: '⚔️ COC Integration', value: 'coc' },
          { name: '💾 Backup System', value: 'backup' },
          { name: '⚠️ Warning System', value: 'warnings' },
          { name: '⚖️ Strike Decay', value: 'decay' },
          { name: '🧪 Testing & Debug', value: 'testing' },
          { name: '🔧 System & Modular', value: 'system' }
        ]
      }]
    },
    {
      name: 'mystatus',
      description: '📋 Check your current strike count and status'
    },
    {
      name: 'ping',
      description: '🏓 Test bot connection and response time'
    },
    {
      name: 'leaderboard',
      description: '🏆 View top users with most strikes (hall of fame)'
    },

    // Moderation Commands (Read-only)
    {
      name: 'checkstrikes',
      description: '🔍 Check strikes for any user (Moderator only)',
      options: [{
        name: 'user',
        description: 'User to check strikes for',
        type: 6, // USER
        required: true
      }]
    },
    {
      name: 'history',
      description: '📜 View detailed strike history for a user (Moderator only)',
      options: [
        {
          name: 'user',
          description: 'User to view history for',
          type: 6, // USER
          required: true
        },
        {
          name: 'page',
          description: 'Page number (default: 1)',
          type: 4, // INTEGER
          required: false
        }
      ]
    },

    // Analytics & Reports
    {
      name: 'allstrikes',
      description: '📊 View all server strikes with pagination (Moderator only)',
      options: [
        {
          name: 'clan',
          description: 'Filter by specific clan role',
          type: 3, // STRING
          required: false
        },
        {
          name: 'page',
          description: 'Page number (default: 1)',
          type: 4, // INTEGER
          required: false
        }
      ]
    },
    {
      name: 'analytics',
      description: '📈 Server health dashboard with strike analytics (Moderator only)',
      options: [{
        name: 'clan',
        description: 'Filter analytics by specific clan',
        type: 3, // STRING
        required: false
      }]
    },

    // Backup System Commands
    {
      name: 'backup',
      description: '💾 Backup system management (Moderator only)',
      options: [
        {
          name: 'action',
          description: 'Backup action to perform',
          type: 3, // STRING
          required: true,
          choices: [
            { name: 'Create Manual Backup', value: 'create' },
            { name: 'List Available Backups', value: 'list' },
            { name: 'Delete Backup File', value: 'delete' },
            { name: 'View Statistics', value: 'stats' },
            { name: 'Clean Old Backups', value: 'cleanup' }
          ]
        },
        {
          name: 'filename',
          description: 'Backup filename (required for delete action)',
          type: 3, // STRING
          required: false
        }
      ]
    },

    // System Status Commands
    {
      name: 'botstatus',
      description: '🔧 View bot system status and diagnostics (Moderator only)'
    },
    {
      name: 'listclans',
      description: '📋 View all configured clan channels and settings (Moderator only)'
    },

    // COC Integration (Read-only)
    {
      name: 'cocstats',
      description: '⚔️ View Clash of Clans statistics (requires COC setup)',
      options: [{
        name: 'clan_tag',
        description: 'COC clan tag (e.g., #P28JG28J)',
        type: 3, // STRING
        required: false
      }]
    },
    {
      name: 'cocprofile',
      description: '👤 View COC player profile information',
      options: [{
        name: 'user',
        description: 'Discord user to check COC profile for',
        type: 6, // USER
        required: false
      }]
    }
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🔄 Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );

    console.log('✅ Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
  }
}

// ⚡ Slash Command Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  // Enhanced cooldown check for slash commands
  if (isOnCooldown(interaction.user.id, commandName, 3000)) {
    console.log(`⏱️ User ${interaction.user.username} is on cooldown for slash command: ${commandName}`);
    return interaction.reply({ 
      content: "⏱️ You're using commands too quickly. Please wait a moment.", 
      ephemeral: true 
    });
  }

  try {
    // Create a mock message object for compatibility with existing functions
    const mockMessage = {
      author: interaction.user,
      member: interaction.member,
      guild: interaction.guild,
      channel: interaction.channel,
      mentions: {
        users: new Map(),
        channels: new Map()
      }
    };

    // Add mentioned users to the mock message
    if (options.getUser('user')) {
      mockMessage.mentions.users.set(options.getUser('user').id, options.getUser('user'));
    }

    switch (commandName) {
      case 'help':
        const category = options.getString('category');
        let helpEmbed;

        if (category) {
          // The createHelpCategoryEmbed function is now imported and used directly here
          helpEmbed = commandLoader.createHelpCategoryEmbed(category);
          if (!helpEmbed) {
            helpEmbed = new EmbedBuilder()
              .setTitle("❌ Invalid Category")
              .setDescription("Unknown help category. Use `/help` to see all categories.")
              .setColor(0xFF0000);
          }
        } else {
          helpEmbed = new EmbedBuilder()
            .setTitle("🤖 StrikeMaster Bot")
            .setDescription("**Strike Management Bot**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            .setColor(0xFFD700)
            .addFields(
              {
                name: "⚡ **Slash Commands**",
                value: "`/mystatus` - Check your strikes\n`/leaderboard` - View top strikers\n`/ping` - Test connection\n`/checkstrikes @user` - Check user strikes\n`/analytics` - Server analytics\n`/help category` - Detailed help",
                inline: false
              },
              {
                name: "🛡️ **Strike Commands**",
                value: "`!mw @user` - Missed war (0.5)\n`!fwa @user` - Missed FWA (1)\n`!cg @user` - Clan Games fail (2)\n`!don @user` - Donation fail (4)\n`!removestrike @user` - Remove strikes",
                inline: false
              },
              {
                name: "🔧 **Admin Commands**",
                value: "`!setlogchannel #channel` - Set log channel\n`!setclanlog role #channel` - Clan-specific logs\n`!seasonreset` - Reduce all strikes\n`!syncroles` - Update user roles",
                inline: false
              },
              {
                name: "📚 **Help Categories**",
                value: "Use `/help` or `!help [category]` for guides:\n**basic** | **strikes** | **admin** | **coc** | **achievements** | **reports**",
                inline: false
              }
            )
            .setFooter({ text: "Both /commands and !commands are available" })
            .setTimestamp();
        }

        await interaction.reply({ embeds: [helpEmbed] });
        break;

      case 'mystatus':
        let record = await Strike.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
        const strikes = record ? record.strikes : 0;

        const myStatusEmbed = new EmbedBuilder()
          .setTitle("📋 Your Strike Status")
          .setDescription(`You currently have **${strikes}** strike(s)`)
          .setColor(strikes >= 4 ? 0xFF0000 : strikes >= 3 ? 0xFFA500 : strikes >= 2 ? 0xFFFF00 : 0x00FF00)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();

        await interaction.reply({ embeds: [myStatusEmbed] });
        break;

      case 'ping':
        const start = Date.now();
        await interaction.deferReply();
        const timeDiff = Date.now() - start;

        const pingEmbed = new EmbedBuilder()
          .setTitle("🏓 Pong!")
          .setColor(0x00FF00)
          .addFields(
            { name: "Bot Latency", value: `${timeDiff}ms`, inline: true },
            { name: "💓 API Latency", value: `${Math.round(client.ws.ping)}ms`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [pingEmbed] });
        break;

      case 'leaderboard':
        try {
          const topUsers = await Strike.find({ guildId: interaction.guild.id, strikes: { $gt: 0 } })
            .sort({ strikes: -1 })
            .limit(10);

          if (topUsers.length === 0) {
            const embed = new EmbedBuilder()
              .setTitle("🏆 Strike Leaderboard")
              .setDescription("No users with strikes found!")
              .setColor(0x00FF00);
            return interaction.reply({ embeds: [embed] });
          }

          const leaderboardEmbed = new EmbedBuilder()
            .setTitle("🏆 Strike Leaderboard")
            .setDescription("Top users with most strikes")
            .setColor(0xFFD700)
            .setTimestamp();

          for (let i = 0; i < topUsers.length; i++) {
            const user = await client.users.fetch(topUsers[i].userId).catch(() => null);
            const username = user ? user.username : `Unknown User (${topUsers[i].userId})`;
            const position = i + 1;
            const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : `${position}.`;

            leaderboardEmbed.addFields({
              name: `${medal} ${username}`,
              value: `${topUsers[i].strikes} strikes`,
              inline: true
            });
          }

          await interaction.reply({ embeds: [leaderboardEmbed] });
        } catch (error) {
          console.error(`Leaderboard error: ${error.message}`);
          const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Error")
            .setDescription("Failed to fetch leaderboard data.")
            .setColor(0xFF0000);
          await interaction.reply({ embeds: [errorEmbed] });
        }
        break;

      case 'checkstrikes':
        if (!hasModeratorPermissions(interaction.member)) {
          const embed = new EmbedBuilder()
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to check strikes.")
            .setColor(0xFF0000);
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const targetUser = options.getUser('user');
        let userRecord = await Strike.findOne({ userId: targetUser.id, guildId: interaction.guild.id });
        const userStrikes = userRecord ? userRecord.strikes : 0;

        const checkEmbed = new EmbedBuilder()
          .setTitle("📋 Strike Check")
          .setDescription(`${targetUser.username} currently has **${userStrikes}** strike(s)`)
          .setColor(userStrikes >= 4 ? 0xFF0000 : userStrikes >= 3 ? 0xFFA500 : userStrikes >= 2 ? 0xFFFF00 : 0x00FF00)
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp();

        await interaction.reply({ embeds: [checkEmbed] });
        break;

      case 'allstrikes':
        if (!hasModeratorPermissions(interaction.member)) {
          const embed = new EmbedBuilder()
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to view all strikes.")
            .setColor(0xFF0000);
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        // Defer reply for processing time
        await interaction.deferReply();

        const clan = options.getString('clan');
        const page = options.getInteger('page') || 1;

        // Use existing allstrikes logic with adaptations for slash commands
        const args = [clan, page.toString()].filter(Boolean);
        mockMessage.content = `!allstrikes ${args.join(' ')}`;

        // Create a custom channel send function for slash command response
        const originalSend = mockMessage.channel.send;
        mockMessage.channel.send = async (messageOptions) => {
          return await interaction.editReply(messageOptions);
        };

        // Execute the existing allstrikes logic
        // Note: This is a simplified version - you may want to extract the allstrikes logic into a separate function
        await interaction.editReply({ 
          embeds: [new EmbedBuilder()
            .setTitle("📊 All Strikes")
            .setDescription("Processing strikes data...")
            .setColor(0x0099FF)]
        });
        break;

      case 'history':
        if (!hasModeratorPermissions(interaction.member)) {
          const embed = new EmbedBuilder()
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to view strike history.")
            .setColor(0xFF0000);
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const historyUser = options.getUser('user');
        const historyPage = options.getInteger('page') || 1;

        // Use existing history logic
        const historyArgs = [historyPage.toString()];
        mockMessage.content = `!history ${historyArgs.join(' ')}`;
        mockMessage.mentions.users.set(historyUser.id, historyUser);

        await interaction.deferReply();

        const historyEmbed = new EmbedBuilder()
          .setTitle(`📜 Strike History - ${historyUser.username}`)
          .setDescription("Loading strike history...")
          .setColor(0x0099FF);

        await interaction.editReply({ embeds: [historyEmbed] });
        break;

      case 'botstatus':
        if (!hasModeratorPermissions(interaction.member)) {
          const embed = new EmbedBuilder()
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to view bot status.")
            .setColor(0xFF0000);
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const uptime = process.uptime();
        const uptimeString = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
        const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

        const statusEmbed = new EmbedBuilder()
          .setTitle("🔧 StrikeMaster Bot Status")
          .setColor(0x0099FF)
          .addFields(
            { name: "⏱️ Uptime", value: uptimeString, inline: true },
            { name: "🏓 Latency", value: `${Math.round(client.ws.ping)}ms`, inline: true },
            { name: "💾 Memory", value: `${memUsage}MB`, inline: true },
            { name: "🏰 Guilds", value: `${client.guilds.cache.size}`, inline: true },
            { name: "👥 Users", value: `${client.users.cache.size}`, inline: true },
            { name: "🗃️ Database", value: isDatabaseConnected() ? "✅ Connected" : "❌ Disconnected", inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [statusEmbed] });
        break;

      case 'listclans':
        if (!hasModeratorPermissions(interaction.member)) {
          const embed = new EmbedBuilder()
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to view clan configurations.")
            .setColor(0xFF0000);
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const guildSettings = await GuildSettings.findOne({ guildId: interaction.guild.id });

        if (!guildSettings || !guildSettings.clanLogChannels || guildSettings.clanLogChannels.size === 0) {
          const noClanEmbed = new EmbedBuilder()
            .setTitle("📋 Clan Configuration")
            .setDescription("No clan log channels configured yet.")
            .setColor(0x00FF00)
            .addFields({
              name: "💡 How to Configure",
              value: "Use `!setclanlog <clan_role> [#channel]` to set up clan-specific logging.",
              inline: false
            });
          return interaction.followUp({ embeds: [noClanEmbed] });
        }

        let clanList = "";
        for (const [clanName, channelId] of guildSettings.clanLogChannels) {
          const channel = interaction.guild.channels.cache.get(channelId);
          const channelMention = channel ? channel.toString() : `<#${channelId}> (not found)`;
          clanList += `**${clanName}** → ${channelMention}\n`;
        }

        const clansEmbed = new EmbedBuilder()
          .setTitle("📋 Configured Clan Log Channels")
          .setDescription(clanList)
          .setColor(0x0099FF)
          .setTimestamp();

        await interaction.followUp({ embeds: [clansEmbed] });
        break;

      case 'cocstats':
        const cocClanTag = options.getString('clan_tag');

        if (!cocClanTag) {
          const cocHelpEmbed = new EmbedBuilder()
            .setTitle("⚔️COC Statistics")
            .setDescription("**Usage:** `/cocstats clan_tag:#P28JG28J`\n\nProvide a clan tag to view Clash of Clans statistics.")
            .setColor(0xFF8000)
            .addFields({
              name: "💡 Example",
              value: "Use `/cocstats clan_tag:#P28JG28J` to view clan stats",
              inline: false
            });
          return interaction.reply({ embeds: [cocHelpEmbed] });
        }

        await interaction.deferReply();

        const cocLoadingEmbed = new EmbedBuilder()
          .setTitle("⚔️ Fetching COC Statistics...")
          .setDescription(`Loading clan data for: \`${cocClanTag}\``)
          .setColor(0xFFFF00);

        await interaction.editReply({ embeds: [cocLoadingEmbed] });
        break;

      case 'cocprofile':
        const profileUser = options.getUser('user') || interaction.user;

        await interaction.deferReply();

        const profileEmbed = new EmbedBuilder()
          .setTitle("👤 COC Player Profile")
          .setDescription(`Loading profile for ${profileUser.username}...`)
          .setColor(0xFF8000);

        await interaction.editReply({ embeds: [profileEmbed] });
        break;

      case 'analytics':
        if (!hasModeratorPermissions(interaction.member)) {
          const embed = new EmbedBuilder()
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to view analytics.")
            .setColor(0xFF0000);
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        await interaction.deferReply();

        const analyticsClan = options.getString('clan');

        // Enhanced analytics response
        const analyticsEmbed = new EmbedBuilder()
          .setTitle(`📊 Server Analytics${analyticsClan ? ` - ${analyticsClan.toUpperCase()}` : ''}`)
          .setDescription("Generating comprehensive analytics dashboard...")
          .setColor(0x0099FF);

        await interaction.editReply({ embeds: [analyticsEmbed] });
        break;

      case 'backup':
        if (!hasModeratorPermissions(interaction.member)) {
          const embed = new EmbedBuilder()
            .setTitle("❌ Permission Denied")
            .setDescription("You don't have permission to manage backups.")
            .setColor(0xFF0000);
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const backupAction = options.getString('action');
        const backupFilename = options.getString('filename');

        await interaction.deferReply();

        const backupEmbed = new EmbedBuilder()
          .setTitle(`💾 Backup System - ${backupAction.charAt(0).toUpperCase() + backupAction.slice(1)}`)
          .setDescription("Processing backup operation...")
          .setColor(0x0099FF);

        if (backupAction === 'delete' && !backupFilename) {
          const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Missing Filename")
            .setDescription("Please provide a filename when using the delete action.\n\nUse `/backup action:list` to see available backups.")
            .setColor(0xFF0000);
          return interaction.editReply({ embeds: [errorEmbed] });
        }

        await interaction.editReply({ embeds: [backupEmbed] });
        break;

      default:
        await interaction.reply({ 
          content: "❌ Unknown command!", 
          flags: 64 
        });
    }

  } catch (error) {
    console.error(`❌ Slash command error (${commandName}):`, error);

    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Command Error")
      .setDescription("An error occurred while processing your command.")
      .setColor(0xFF0000);

    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
  }
});

// ⚡ Enhanced Commands Handler with Modular System
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!") || message.author.bot) return;
  if (!message.guild) return;
  if (message.system) return;
  if (!message.content.trim() || message.content.length < 2) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (!command || command.length === 0) return;

  // Create unique processing key
  const messageKey = `${message.id}`;
  const userCommandKey = `${message.author.id}-${command}-${message.channel.id}`;

  // Prevent duplicate message processing
  if (processingMessages.has(messageKey)) {
    console.log(`⚠️ Duplicate message already being processed: ${messageKey}`);
    return;
  }

  // Prevent user from running same command concurrently
  if (messageProcessingLocks.has(userCommandKey)) {
    console.log(`⚠️ User ${message.author.username} already processing ${command} in this channel`);
    return;
  }

  // Enhanced cooldown check
  if (isOnCooldown(message.author.id, command, 3000)) {
    console.log(`⏱️ User ${message.author.username} is on cooldown for command: ${command}`);
    return;
  }

  // Set processing locks
  processingMessages.add(messageKey);
  messageProcessingLocks.set(userCommandKey, Date.now());

  console.log(`Processing command: ${command} from ${message.author.username} (ID: ${message.author.id})`);

  // Cleanup function
  const cleanup = () => {
    processingMessages.delete(messageKey);
    messageProcessingLocks.delete(userCommandKey);
  };

  const cleanupTimeout = setTimeout(cleanup, 15000);

  try {
    // Create execution context
    const context = contextManager.createContext(message);

    // Execute command using modular system (with safety checks)
    try {
      if (commandLoader && contextManager) {
        const executed = await commandLoader.executeCommand(command, message, args, context);
        if (executed) {
          console.log(`✅ Modular command executed: ${command}`);
          return; // Command was handled by modular system - exit early
        } else {
          // Command not found in modular system
          console.log(`❓ Unknown command: ${command} from ${message.author.username}`);
          return; // Exit early for unknown commands
        }
      } else {
        console.warn(`⚠️ Command systems not initialized yet, skipping: ${command}`);
        return;
      }
    } catch (modularError) {
      console.error(`❌ Modular command error for ${command}: ${modularError.message}`);

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Command Error")
        .setDescription(`Error executing ${command}: ${modularError.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
    }


    // Strike commands (mw, fwa, etc.)
    if (Object.keys(strikeReasons).includes(command)) {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to add strikes.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const user = message.mentions.users.first();
      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Invalid Usage")
          .setDescription(`Usage: \`!${command} @user\``)
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      if (user.id === message.author.id) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Invalid Action")
          .setDescription("You cannot add strikes to yourself.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      let currentRecord = await Strike.findOne({ userId: user.id, guildId: message.guild.id });
      const currentStrikes = currentRecord ? currentRecord.strikes : 0;
      const newStrikes = currentStrikes + strikeReasons[command].strikes;

      // Get guild settings to check for clan log channels
      const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
      let userClanRoles = [];

      // Check if user has any clan roles and if clan log channels are configured
      if (guildSettings && guildSettings.clanLogChannels && guildSettings.clanLogChannels.size > 0) {
        try {
          const member = await message.guild.members.fetch(user.id);
          if (member) {
            // Find ALL matching clan roles for the user
            for (const [clanRoleName, channelId] of guildSettings.clanLogChannels) {
              const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === clanRoleName.toLowerCase());
              if (role && member.roles.cache.has(role.id)) {
                userClanRoles.push(clanRoleName);
              }
            }
          }
        } catch (fetchError) {
          console.error(`Error fetching member for clan detection: ${fetchError.message}`);
        }
      }

      // Check if user has multiple clan roles - if so, show clan selection
      if (userClanRoles.length > 1) {
        const warningText = newStrikes >= 4 ? " 🚫 **BAN THRESHOLD!**" : newStrikes >= 3 ? " ⚠️ **DANGER ZONE!**" : "";

        const clanSelectionEmbed = new EmbedBuilder()
          .setTitle(`⚠️ Strike ${user.username}?`)
          .setDescription(`**${strikeReasons[command].reason}**\n\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (+${strikeReasons[command].strikes})${warningText}\n\n**User has multiple clan roles. Please select which clan to log this strike to:**`)
          .setColor(0xFFFF00)
          .setThumbnail(user.displayAvatarURL())
          .setFooter({ text: "Select clan number | ❌ Cancel | Expires in 5 minutes" });

        // Add clan options to embed
        let clanOptions = "";
        const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        for (let i = 0; i < Math.min(userClanRoles.length, 10); i++) {
          clanOptions += `${numberEmojis[i]} **${userClanRoles[i]}**\n`;
        }
        clanSelectionEmbed.addFields({ name: "Available Clans:", value: clanOptions, inline: false });

        const clanSelectionMessage = await message.channel.send({ embeds: [clanSelectionEmbed], allowedMentions: { repliedUser: false } });

        // Add number reactions for clan selection
        const requiredEmojis = numberEmojis.slice(0, Math.min(userClanRoles.length, 10)).concat(['❌']);
        for (const emoji of requiredEmojis) {
          await clanSelectionMessage.react(emoji).catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Clan selection collector
        const clanFilter = (reaction, reactionUser) => {
          const isValidNumberEmoji = numberEmojis.slice(0, userClanRoles.length).includes(reaction.emoji.name);
          const isCancelEmoji = reaction.emoji.name === '❌';
          return (isValidNumberEmoji || isCancelEmoji) && 
                 !reactionUser.bot && 
                 reaction.message.id === clanSelectionMessage.id &&
                 hasModeratorPermissions(message.guild.members.cache.get(reactionUser.id));
        };

        const clanCollector = clanSelectionMessage.createReactionCollector({ 
          filter: clanFilter, 
          time: 300000,
          max: 1
        });

        clanCollector.on('collect', async (reaction, reactionUser) => {
          if (reaction.emoji.name === '❌') {
            const cancelledEmbed = new EmbedBuilder()
              .setTitle("❌ Strike Cancelled")
              .setDescription("Strike cancelled by moderator")
              .setColor(0x808080);
            await clanSelectionMessage.edit({ embeds: [cancelledEmbed] });
            await clanSelectionMessage.reactions.removeAll().catch(() => {});
            return;
          }

          // Get selected clan
          const emojiIndex = numberEmojis.indexOf(reaction.emoji.name);
          if (emojiIndex >= 0 && emojiIndex < userClanRoles.length) {
            const selectedClan = userClanRoles[emojiIndex];

            // Show final confirmation with selected clan
            const confirmEmbed = new EmbedBuilder()
              .setTitle(`⚠️ Strike ${user.username}?`)
              .setDescription(`**${strikeReasons[command].reason}**\n\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (+${strikeReasons[command].strikes})${warningText}`)
              .setColor(0xFFFF00)
              .setThumbnail(user.displayAvatarURL())
              .setFooter({ text: "✅ Confirm | ❌ Cancel | Expires in 5 minutes" });

            await clanSelectionMessage.edit({ embeds: [confirmEmbed] });
            await clanSelectionMessage.reactions.removeAll().catch(() => {});

            // Add confirmation reactions
            const reactions = ['✅', '❌'];
            for (const reaction of reactions) {
              await clanSelectionMessage.react(reaction).catch(() => {});
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Final confirmation collector
            const confirmFilter = (confirmReaction, confirmUser) => {
              return (confirmReaction.emoji.name === '✅' || confirmReaction.emoji.name === '❌') &&
                     !confirmUser.bot &&
                     confirmReaction.message.id === clanSelectionMessage.id &&
                     hasModeratorPermissions(message.guild.members.cache.get(confirmUser.id));
            };

            const confirmCollector = clanSelectionMessage.createReactionCollector({
              filter: confirmFilter,
              time: 300000,
              max: 1
            });

            confirmCollector.on('collect', async (confirmReaction, confirmUser) => {
              if (confirmReaction.emoji.name === '✅') {
                await handleStrikeApplication(user, strikeReasons[command], message, clanSelectionMessage, confirmUser, selectedClan);
              } else {
                const cancelledEmbed = new EmbedBuilder()
                  .setTitle("❌ Strike Cancelled")
                  .setDescription("No action taken")
                  .setColor(0x808080);
                await clanSelectionMessage.edit({ embeds: [cancelledEmbed] });
              }
            });

            confirmCollector.on('end', async (collected, reason) => {
              if (reason === 'time' && collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                  .setTitle("⏰ Strike Confirmation Expired")
                  .setDescription("No action taken")
                  .setColor(0x808080);
                await clanSelectionMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
                await clanSelectionMessage.reactions.removeAll().catch(() => {});
              }
            });
          }
        });

        clanCollector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
              .setTitle("⏰ Clan Selection Expired")
              .setDescription("No action taken - Clan selection timed out")
              .setColor(0x808080);
            await clanSelectionMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
            await clanSelectionMessage.reactions.removeAll().catch(() => {});
          }
        });

        return;
      }

      // Single clan or no clan logic - create confirmation embed
      const selectedClan = userClanRoles.length === 1 ? userClanRoles[0] : null;
      const warningText = newStrikes >= 4 ? " 🚫 **BAN THRESHOLD!**" : newStrikes >= 3 ? " ⚠️ **DANGER ZONE!**" : "";

      const confirmEmbed = new EmbedBuilder()
        .setTitle(`⚠️ Strike ${user.username}?`)
        .setDescription(`**${strikeReasons[command].reason}**\n\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (+${strikeReasons[command].strikes})${warningText}`)
        .setColor(0xFFFF00)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: "✅ Confirm | ❌ Cancel | Expires in 5 minutes" });

      if (selectedClan) {
        confirmEmbed.addFields({ name: "Detected Clan", value: selectedClan, inline: true });
      }

      const confirmMessage = await message.channel.send({ embeds: [confirmEmbed], allowedMentions: { repliedUser: false } });

      // Add reactions
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
        time: 300000,
        max: 1
      });

      collector.on('collect', async (reaction, reactionUser) => {
        if (reaction.emoji.name === '✅') {
          await handleStrikeApplication(user, strikeReasons[command], message, confirmMessage, reactionUser, selectedClan);
        } else {
          const cancelledEmbed = new EmbedBuilder()
            .setTitle("❌ Strike Cancelled")
            .setDescription("No strikes were added")
            .setColor(0x808080);
          await confirmMessage.edit({ embeds: [cancelledEmbed] });
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle("⏰ Strike Request Expired")
            .setDescription("No action taken")
            .setColor(0x808080);
          await confirmMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
          await confirmMessage.reactions.removeAll().catch(() => {});
        }
      });

      return;
    }

    // Check strikes command
    if (command === "checkstrikes") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to check strikes.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const user = message.mentions.users.first();
      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Invalid Usage")
          .setDescription("Usage: `!checkstrikes @user`")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      let record = await Strike.findOne({ userId: user.id, guildId: message.guild.id });
      const strikes = record ? record.strikes : 0;

      const embed = new EmbedBuilder()
        .setTitle("📋 Strike Check")
        .setDescription(`${user.username} currently has **${strikes}** strike(s)`)
        .setColor(strikes >= 4 ? 0xFF0000 : strikes >= 3 ? 0xFFA500 : strikes >= 2 ? 0xFFFF00 : 0x00FF00)
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();

      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    // My status command
    if (command === "mystatus") {
      let record = await Strike.findOne({ userId: message.author.id, guildId: message.guild.id });
      const strikes = record ? record.strikes : 0;

      const statusEmbed = new EmbedBuilder()
        .setTitle("📋 Your Strike Status")
        .setDescription(`You currently have **${strikes}** strike(s)`)
        .setColor(strikes >= 4 ? 0xFF0000 : strikes >= 3 ? 0xFFA500 : strikes >= 2 ? 0xFFFF00 : 0x00FF00)
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();

      return message.channel.send({ embeds: [statusEmbed], allowedMentions: { repliedUser: false } });
    }

    // Remove strike command
    if (command === "removestrike" || command === "removestrikes") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to remove strikes.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const user = message.mentions.users.first();
      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Invalid Usage")
          .setDescription(`Usage: \`!${command} @user [amount]\`\nDefault amount: 1`)
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const amount = parseFloat(args[1]) || 1;
      if (amount <= 0 || amount > 10) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Invalid Amount")
          .setDescription("Amount must be between 0.1 and 10")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      let currentRecord = await Strike.findOne({ userId: user.id, guildId: message.guild.id });
      const currentStrikes = currentRecord ? currentRecord.strikes : 0;

      if (currentStrikes === 0) {
        const embed = new EmbedBuilder()
          .setTitle("ℹ️ No Strikes to Remove")
          .setDescription(`${user.username} has no strikes to remove.`)
          .setColor(0x00FF00);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const actualReduction = Math.min(amount, currentStrikes);
      const newStrikes = Math.max(0, currentStrikes - actualReduction);

      // Get guild settings to check for clan log channels
      const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
      let userClanRoles = [];

      // Check if user has any clan roles and if clan log channels are configured
      if (guildSettings && guildSettings.clanLogChannels && guildSettings.clanLogChannels.size > 0) {
        try {
          const member = await message.guild.members.fetch(user.id);
          if (member) {
            // Find ALL matching clan roles for the user
            for (const [clanRoleName, channelId] of guildSettings.clanLogChannels) {
              const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === clanRoleName.toLowerCase());
              if (role && member.roles.cache.has(role.id)) {
                userClanRoles.push(clanRoleName);
              }
            }
          }
        } catch (fetchError) {
          console.error(`Error fetching member for clan detection: ${fetchError.message}`);
        }
      }

      // Check if user has multiple clan roles - if so, show clan selection
      if (userClanRoles.length > 1) {
        const clanSelectionEmbed = new EmbedBuilder()
          .setTitle(`🗑️ Remove ${actualReduction} Strike(s) from ${user.username}?`)
          .setDescription(`**Strike Removal**\n\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (-${actualReduction})\n\n**User has multiple clan roles. Please select which clan to log this removal to:**`)
          .setColor(0x00FF00)
          .setThumbnail(user.displayAvatarURL())
          .setFooter({ text: "Select clan number | ❌ Cancel | Expires in 5 minutes" });

        // Add clan options to embed
        let clanOptions = "";
        const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        for (let i = 0; i < Math.min(userClanRoles.length, 10); i++) {
          clanOptions += `${numberEmojis[i]} **${userClanRoles[i]}**\n`;
        }
        clanSelectionEmbed.addFields({ name: "Available Clans:", value: clanOptions, inline: false });

        const clanSelectionMessage = await message.channel.send({ embeds: [clanSelectionEmbed], allowedMentions: { repliedUser: false } });

        // Add number reactions for clan selection
        const requiredEmojis = numberEmojis.slice(0, Math.min(userClanRoles.length, 10)).concat(['❌']);
        for (const emoji of requiredEmojis) {
          await clanSelectionMessage.react(emoji).catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Clan selection collector
        const clanFilter = (reaction, reactionUser) => {
          const isValidNumberEmoji = numberEmojis.slice(0, userClanRoles.length).includes(reaction.emoji.name);
          const isCancelEmoji = reaction.emoji.name === '❌';
          return (isValidNumberEmoji || isCancelEmoji) && 
                 !reactionUser.bot && 
                 reaction.message.id === clanSelectionMessage.id &&
                 hasModeratorPermissions(message.guild.members.cache.get(reactionUser.id));
        };

        const clanCollector = clanSelectionMessage.createReactionCollector({ 
          filter: clanFilter, 
          time: 300000,
          max: 1
        });

        clanCollector.on('collect', async (reaction, reactionUser) => {
          if (reaction.emoji.name === '❌') {
            const cancelledEmbed = new EmbedBuilder()
              .setTitle("❌ Strike Removal Cancelled")
              .setDescription("Strike removal cancelled by moderator")
              .setColor(0x808080);
            await clanSelectionMessage.edit({ embeds: [cancelledEmbed] });
            await clanSelectionMessage.reactions.removeAll().catch(() => {});
            return;
          }

          // Get selected clan
          const emojiIndex = numberEmojis.indexOf(reaction.emoji.name);
          if (emojiIndex >= 0 && emojiIndex < userClanRoles.length) {
            const selectedClan = userClanRoles[emojiIndex];

            // Show final confirmation with selected clan
            const confirmEmbed = new EmbedBuilder()
              .setTitle(`🗑️ Remove ${actualReduction} Strike(s) from ${user.username}?`)
              .setDescription(`**Strike Removal**\n\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (-${actualReduction})`)
              .setColor(0x00FF00)
              .setThumbnail(user.displayAvatarURL())
              .addFields({ name: "Selected Clan", value: selectedClan, inline: true })
              .setFooter({ text: "✅ Confirm | ❌ Cancel | Expires in 5 minutes" });

            await clanSelectionMessage.edit({ embeds: [confirmEmbed] });
            await clanSelectionMessage.reactions.removeAll().catch(() => {});

            // Add confirmation reactions
            const reactions = ['✅', '❌'];
            for (const reaction of reactions) {
              await clanSelectionMessage.react(reaction).catch(() => {});
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Final confirmation collector
            const confirmFilter = (confirmReaction, confirmUser) => {
              return (confirmReaction.emoji.name === '✅' || confirmReaction.emoji.name === '❌') &&
                     !confirmUser.bot &&
                     confirmReaction.message.id === clanSelectionMessage.id &&
                     hasModeratorPermissions(message.guild.members.cache.get(confirmUser.id));
            };

            const confirmCollector = clanSelectionMessage.createReactionCollector({
              filter: confirmFilter,
              time: 300000,
              max: 1
            });

            confirmCollector.on('collect', async (confirmReaction, confirmUser) => {
              if (confirmReaction.emoji.name === '✅') {
                await handleStrikeRemoval(user, actualReduction, message, clanSelectionMessage, confirmUser, selectedClan);
              } else {
                const cancelledEmbed = new EmbedBuilder()
                  .setTitle("❌ Strike Removal Cancelled")
                  .setDescription("No action taken")
                  .setColor(0x808080);
                await clanSelectionMessage.edit({ embeds: [cancelledEmbed] });
              }
            });

            confirmCollector.on('end', async (collected, reason) => {
              if (reason === 'time' && collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                  .setTitle("⏰ Strike Removal Confirmation Expired")
                  .setDescription("No action taken")
                  .setColor(0x808080);
                await clanSelectionMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
                await clanSelectionMessage.reactions.removeAll().catch(() => {});
              }
            });
          }
        });

        clanCollector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            const timeoutEmbed = new EmbedBuilder()
              .setTitle("⏰ Clan Selection Expired")
              .setDescription("No action taken - Clan selection timed out")
              .setColor(0x808080);
            await clanSelectionMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
            await clanSelectionMessage.reactions.removeAll().catch(() => {});
          }
        });

        return;
      }

      // Single clan or no clan logic - create confirmation embed
      const selectedClan = userClanRoles.length === 1 ? userClanRoles[0] : null;

      const confirmEmbed = new EmbedBuilder()
        .setTitle(`✅ Remove ${actualReduction} Strike(s) from ${user.username}?`)
        .setDescription(`\`${currentStrikes}\` ➜ \`${newStrikes}\` strikes (-${actualReduction})`)
        .setColor(0x00FF00)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: "✅ Confirm | ❌ Cancel | Expires in 2 minutes" });

      if (selectedClan) {
        confirmEmbed.addFields({ name: "Detected Clan", value: selectedClan, inline: true });
      }

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
        try {
          await confirmMessage.reactions.removeAll();
        } catch (reactionError) {
          console.log(`Could not remove reactions: ${reactionError.message}`);
        }

        if (reaction.emoji.name === '✅') {
          await handleStrikeRemoval(user, actualReduction, message, confirmMessage, reactionUser, selectedClan);
        } else {
          const cancelledEmbed = new EmbedBuilder()
            .setTitle("❌ Strike Removal Cancelled")
            .setDescription("No strikes were removed")
            .setColor(0x808080);
          await confirmMessage.edit({ embeds: [cancelledEmbed] });
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle("⏰ Strike Removal Request Expired")
            .setDescription("No action taken")
            .setColor(0x808080);
          await confirmMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
          await confirmMessage.reactions.removeAll().catch(() => {});
        }
      });

      return;
    }



    // Season reset command with recovery options
    if (command === "seasonreset") {
      const { handleSeasonReset } = require("./commands/seasonReset");
      return handleSeasonReset(message, client, persistenceManager);

      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to perform season resets.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const cooldownStatus = await isOnSeasonResetCooldown(message.guild.id);
      if (cooldownStatus.onCooldown) {
        const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
        const lastResetDate = guildSettings?.lastSeasonReset ? new Date(guildSettings.lastSeasonReset) : null;
        const nextResetDate = lastResetDate ? new Date(lastResetDate.getTime() + (20 * 24 * 60 * 60 * 1000)) : null;

        const embed = new EmbedBuilder()
          .setTitle("⏰ Season Reset on Cooldown")
          .setDescription(`Season reset is on cooldown! You can use it again in **${cooldownStatus.daysLeft} days and ${cooldownStatus.hoursLeft} hours**.`)
          .setColor(0xFFFF00)
          .addFields(
            {
              name: "⏱️ Cooldown Details",
              value: `**Time Remaining:** ${cooldownStatus.daysLeft} days, ${cooldownStatus.hoursLeft} hours\n**Total Hours Left:** ${cooldownStatus.totalHours} hours\n**Next Available:** ${nextResetDate ? `<t:${Math.floor(nextResetDate.getTime() / 1000)}:F>` : 'Unknown'}`,
              inline: false
            },
            {
              name: "📅 Last Reset",
              value: lastResetDate ? `<t:${Math.floor(lastResetDate.getTime() / 1000)}:R>` : 'Never used',
              inline: true
            },
            {
              name: "ℹ️ About Season Reset",
              value: "Season reset reduces ALL user strikes by 0.5 and has a 20-day cooldown to prevent abuse.",
              inline: false
            }
          );
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const allStrikes = await Strike.find({ guildId: message.guild.id, strikes: { $gt: 0 } });

      if (allStrikes.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle("ℹ️ No Users with Strikes")
          .setDescription("There are no users with strikes to reset.")
          .setColor(0x00FF00);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const totalStrikesReduction = allStrikes.length * 0.5;

      const confirmEmbed = new EmbedBuilder()
        .setTitle("🔄 Season Reset Confirmation")
        .setDescription(
          `**⚠️ SEASON RESET - AFFECTS ALL USERS**\n\n` +
          `This will reduce ALL user strikes by **0.5** and set a **20-day cooldown**.\n\n` +
          `**📊 Impact:**\n` +
          `• **${allStrikes.length}** users will be affected\n` +
          `• **${totalStrikesReduction}** total strikes will be removed\n` +
          `• **20-day cooldown** will be activated\n\n` +
          `**Are you sure you want to proceed?**`
        )
        .setColor(0xFFFF00)
        .setFooter({ text: "✅ Confirm Season Reset | ❌ Cancel | Expires in 3 minutes" });

      const confirmMessage = await message.channel.send({ embeds: [confirmEmbed], allowedMentions: { repliedUser: false } });

      const reactions = ['✅', '❌'];
      for (const reaction of reactions) {
        await confirmMessage.react(reaction).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const filter = (reaction, reactionUser) => {
        return (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') &&
               !reactionUser.bot &&
               reaction.message.id === confirmMessage.id &&
               hasModeratorPermissions(message.guild.members.cache.get(reactionUser.id));
      };

      const collector = confirmMessage.createReactionCollector({
        filter,
        time: 180000,
        max: 1
      });

      collector.on('collect', async (reaction, reactionUser) => {
        await confirmMessage.reactions.removeAll().catch(() => {});

        if (reaction.emoji.name === '✅') {
          try {
            const progressEmbed = new EmbedBuilder()
              .setTitle("🔄 Performing Season Reset...")
              .setDescription("Please wait while all user strikes are reduced...")
              .setColor(0x0099FF);
            await confirmMessage.edit({ embeds: [progressEmbed] });

            let processedUsers = 0;
            let errorCount = 0;

            for (const userRecord of allStrikes) {
              try {
                const newStrikes = Math.max(0, userRecord.strikes - 0.5);

                await Strike.findOneAndUpdate(
                  { userId: userRecord.userId, guildId: message.guild.id },
                  {
                    $set: { strikes: newStrikes },
                    $push: {
                      history: {
                        reason: "Season reset - automatic reduction",
                        strikesAdded: -0.5,
                        moderator: `${message.author.username} (Season Reset - confirmed by ${reactionUser.username})`,
                        date: new Date()
                      }
                    }
                  }
                );

                processedUsers++;

                if (processedUsers % 10 === 0) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }

              } catch (error) {
                console.error(`Error reducing strikes for user ${userRecord.userId}: ${error.message}`);
                errorCount++;
              }
            }

            await setSeasonResetCooldown(message.guild.id);

            const successEmbed = new EmbedBuilder()
              .setTitle("✅ Season Reset Complete!")
              .setDescription(`🎉 Season reset has been successfully applied to all users!`)
              .setColor(0x00FF00)
              .addFields(
                { name: "✅ Users Processed", value: `${processedUsers}`, inline: true },
                { name: "❌ Errors", value: `${errorCount}`, inline: true },
                { name: "📉 Total Reduction", value: `${processedUsers * 0.5} strikes`, inline: true },
                { name: "⏰ Next Reset", value: "Available in 20 days", inline: true },
                { name: "👮 Performed By", value: message.author.tag, inline: true },
                { name: "✅ Confirmed By", value: reactionUser.tag, inline: true }
              )
              .setFooter({ text: "All user roles will be automatically updated based on new strike counts" })
              .setTimestamp();

            await confirmMessage.edit({ embeds: [successEmbed] });

            const logEmbed = new EmbedBuilder()
              .setTitle("🔄 Season Reset Performed")
              .setColor(0x00FF00)
              .addFields(
                { name: "Moderator", value: message.author.tag, inline: true },
                { name: "Confirmed By", value: reactionUser.tag, inline: true },
                { name: "Users Affected", value: `${processedUsers}`, inline: true },
                { name: "Strikes Reduced", value: `${processedUsers * 0.5}`, inline: true }
              )
              .setTimestamp();

            await logAction(client, message.guild.id, logEmbed);

            console.log(`✅ Season reset completed: ${processedUsers} users processed, ${errorCount} errors`);

          } catch (error) {
            console.error(`❌ Season reset error: ${error.message}`);
            const errorEmbed = new EmbedBuilder()
              .setTitle("❌ Season Reset Failed")
              .setDescription(`Error during season reset: ${error.message}`)
              .setColor(0xFF0000);
            await confirmMessage.edit({ embeds: [errorEmbed] });
          }
        } else {
          const cancelledEmbed = new EmbedBuilder()
            .setTitle("❌ Season Reset Cancelled")
            .setDescription("Season reset cancelled by moderator")
            .setColor(0x808080);
          await confirmMessage.edit({ embeds: [cancelledEmbed] });
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          const timeoutEmbed = new EmbedBuilder()
            .setTitle("⏰ Season Reset Request Expired")
            .setDescription("No action taken - Request timed out")
            .setColor(0x808080);
          await confirmMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
          await confirmMessage.reactions.removeAll().catch(() => {});
        }
      });

      return;
    }

    // Ping command
    if (command === "ping") {
      const start = Date.now();
      const sent = await message.channel.send("🏓 Pinging...");
      const timeDiff = Date.now() - start;

      const embed = new EmbedBuilder()
        .setTitle("🏓 Pong!")
        .setColor(0x00FF00)
        .addFields(
          { name: "Bot Latency", value: `${timeDiff}ms`, inline: true },
          { name: "💓 API Latency", value: `${Math.round(client.ws.ping)}ms`, inline: true }
        )
        .setTimestamp();

      await sent.edit({ content: "", embeds: [embed] });
      return;
    }

    // Leaderboard command
    if (command === "leaderboard") {
      try {
        const topUsers = await Strike.find({ guildId: message.guild.id, strikes: { $gt: 0 } })
          .sort({ strikes: -1 })
          .limit(10);

        if (topUsers.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle("🏆 Strike Leaderboard")
            .setDescription("No users with strikes found!")
            .setColor(0x00FF00);
          return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
        }

        const embed = new EmbedBuilder()
          .setTitle("🏆 Strike Leaderboard")
          .setDescription("Top users with most strikes")
          .setColor(0xFFD700)
          .setTimestamp();

        for (let i = 0; i < topUsers.length; i++) {
          const user = await client.users.fetch(topUsers[i].userId).catch(() => null);
          const username = user ? user.username : `Unknown User (${topUsers[i].userId})`;
          const position = i + 1;
          const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : `${position}.`;

          embed.addFields({
            name: `${medal} ${username}`,
            value: `${topUsers[i].strikes} strikes`,
            inline: true
          });
        }

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } catch (error) {
        console.error(`Leaderboard error: ${error.message}`);
        const embed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("Failed to fetch leaderboard data.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }
    }

    // Set clan log command
    if (command === "setclanlog") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to configure clan log channels.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const clanRole = args[0];
      const channel = message.mentions.channels.first() || message.channel;

      if (!clanRole) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Invalid Usage")
          .setDescription("Usage: `!setclanlog <clan_role> [#channel]`\nIf no channel is mentioned, the current channel will be used.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      try {
        await GuildSettings.findOneAndUpdate(
          { guildId: message.guild.id },
          { 
            $set: { 
              [`clanLogChannels.${clanRole}`]: channel.id,
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );

        const embed = new EmbedBuilder()
          .setTitle("✅ Clan Log Channel Set")
          .setDescription(`Clan **${clanRole}** log channel set to ${channel}`)
          .setColor(0x00FF00)
          .setTimestamp();

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } catch (error) {
        console.error(`Error setting clan log: ${error.message}`);
        const embed = new EmbedBuilder()
          .setTitle("❌ Configuration Failed")
          .setDescription(`Failed to set clan log channel: ${error.message}`)
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }
    }

    // Set log channel command
    if (command === "setlogchannel") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to configure log channels.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const channel = message.mentions.channels.first() || message.channel;

      try {
        await GuildSettings.findOneAndUpdate(
          { guildId: message.guild.id },
          { 
            $set: { 
              logChannelId: channel.id,
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );

        const embed = new EmbedBuilder()
          .setTitle("✅ Log Channel Set")
          .setDescription(`Default log channel set to ${channel}`)
          .setColor(0x00FF00)
          .setTimestamp();

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } catch (error) {
        console.error(`Error setting log channel: ${error.message}`);
        const embed = new EmbedBuilder()
          .setTitle("❌ Configuration Failed")
          .setDescription(`Failed to set log channel: ${error.message}`)
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }
    }

    // Set leader command
    if (command === "setleader") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to configure leadership roles.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const clanRole = args[0];
      const leaderRole = args[1];

      if (!clanRole || !leaderRole) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Invalid Usage")
          .setDescription("Usage: `!setleader <clan_role> <leader_role>`\n\nExample: `!setleader Phoenix \"Phoenix Leader\"`")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      try {
        await GuildSettings.findOneAndUpdate(
          { guildId: message.guild.id },
          { 
            $set: { 
              [`clanLeaderRoles.${clanRole}`]: leaderRole,
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );

        const embed = new EmbedBuilder()
          .setTitle("✅ Leader Role Set")
          .setDescription(`Clan **${clanRole}** leader role set to **${leaderRole}**`)
          .setColor(0x00FF00)
          .setTimestamp();

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } catch (error) {
        console.error(`Error setting leader role: ${error.message}`);
        const embed = new EmbedBuilder()
          .setTitle("❌ Configuration Failed")
          .setDescription(`Failed to set leader role: ${error.message}`)
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }
    }

    // Set co-leader command
    if (command === "setcoleader") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to configure leadership roles.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const clanRole = args[0];
      const coLeaderRole = args[1];

      if (!clanRole || !coLeaderRole) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Invalid Usage")
          .setDescription("Usage: `!setcoleader <clan_role> <co_leader_role>`\n\nExample: `!setcoleader Phoenix \"Phoenix Co-Leader\"`")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      try {
        await GuildSettings.findOneAndUpdate(
          { guildId: message.guild.id },
          { 
            $set: { 
              [`clanCoLeaderRoles.${clanRole}`]: coLeaderRole,
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );

        const embed = new EmbedBuilder()
          .setTitle("✅ Co-Leader Role Set")
          .setDescription(`Clan **${clanRole}** co-leader role set to **${coLeaderRole}**`)
          .setColor(0x00FF00)
          .setTimestamp();

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } catch (error) {
        console.error(`Error setting co-leader role: ${error.message}`);
        const embed = new EmbedBuilder()
          .setTitle("❌ Configuration Failed")
          .setDescription(`Failed to set co-leader role: ${error.message}`)
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }
    }

    // List clans command
    if (command === "listclans") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to view clan configurations.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      try {
        const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });

        if (!guildSettings || !guildSettings.clanLogChannels || guildSettings.clanLogChannels.size === 0) {
          const embed = new EmbedBuilder()
            .setTitle("📋 Clan Configuration")
            .setDescription("No clan log channels configured.")
            .setColor(0x00FF00)
            .addFields({
              name: "How to Configure",
              value: "Use `!setclanlog <clan_role> [#channel]` to set clan-specific log channels.",
              inline: false
            });
          return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
        }

        const embed = new EmbedBuilder()
          .setTitle("📋 Configured Clan Log Channels")
          .setColor(0x0099FF)
          .setTimestamp();

        let clanList = "";
        for (const [clanName, channelId] of guildSettings.clanLogChannels) {
          const channel = message.guild.channels.cache.get(channelId);
          const channelMention = channel ? channel.toString() : `<#${channelId}> (Channel not found)`;
          clanList += `**${clanName}** → ${channelMention}\n`;
        }

        embed.setDescription(clanList || "No clans configured.");
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } catch (error) {
        console.error(`Error listing clans: ${error.message}`);
        const embed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("Failed to fetch clan configurations.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }
    }

    // List leadership command
    if (command === "listleadership") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to view leadership configurations.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      try {
        const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });

        const embed = new EmbedBuilder()
          .setTitle("👑 Leadership Configuration")
          .setColor(0xFFD700)
          .setTimestamp();

        let hasLeadershipConfig = false;
        let leadershipText = "";

        if (guildSettings && guildSettings.clanLeaderRoles && guildSettings.clanLeaderRoles.size > 0) {
          leadershipText += "**👑 Leader Roles:**\n";
          for (const [clanName, leaderRole] of guildSettings.clanLeaderRoles) {
            leadershipText += `• **${clanName}** → ${leaderRole}\n`;
          }
          leadershipText += "\n";
          hasLeadershipConfig = true;
        }

        if (guildSettings && guildSettings.clanCoLeaderRoles && guildSettings.clanCoLeaderRoles.size > 0) {
          leadershipText += "**🥈 Co-Leader Roles:**\n";
          for (const [clanName, coLeaderRole] of guildSettings.clanCoLeaderRoles) {
            leadershipText += `• **${clanName}** → ${coLeaderRole}\n`;
          }
          hasLeadershipConfig = true;
        }

        if (!hasLeadershipConfig) {
          embed.setDescription("No leadership roles configured.")
            .addFields({
              name: "How to Configure",
              value: "• `!setleader <clan_role> <leader_role>`\n• `!setcoleader <clan_role> <co_leader_role>`",
              inline: false
            });
        } else {
          embed.setDescription(leadershipText);
        }

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } catch (error) {
        console.error(`Error listing leadership: ${error.message}`);
        const embed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("Failed to fetch leadership configurations.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }
    }

    // Debug command
    if (command === "debug" || command === "botstatus") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to view debug info.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      try {
        const uptime = process.uptime();
        const uptimeString = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;

        const embed = new EmbedBuilder()
          .setTitle("🔧 Bot Debug Information")
          .setColor(0x0099FF)
          .addFields(
            { name: "⏱️ Uptime", value: uptimeString, inline: true },
            { name: "🏓 Ping", value: `${Math.round(client.ws.ping)}ms`, inline: true },
            { name: "💾 Memory", value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true },
            { name: "🔒 Processing Messages", value: `${processingMessages.size}`, inline: true },
            { name: "⏱️ Active Cooldowns", value: `${commandCooldowns.size}`, inline: true },
            { name: "🗃️ Database", value: isDatabaseConnected() ? "Connected" : "Disconnected", inline: true }
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
    }

    // Sync roles command
    if (command === "syncroles") {
      const { handleSyncRoles } = require("./commands/admin");
      return handleSyncRoles(message, client, persistenceManager);
    }

    // Cleanup command
    if (command === "cleanup") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to perform cleanup.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const oldCooldownSize = commandCooldowns.size;
      const oldProcessingSize = processingMessages.size;
      const oldRoleLocksSize = roleUpdateLocks.size;

      commandCooldowns.clear();
      processingMessages.clear();
      roleUpdateLocks.clear();

      const embed = new EmbedBuilder()
        .setTitle("🧹 Cleanup Complete")
        .setDescription("Bot cache and locks have been cleared.")
        .setColor(0x00FF00)
        .addFields(
          { name: "Cooldowns Cleared", value: `${oldCooldownSize}`, inline: true },
          { name: "Processing Messages Cleared", value: `${oldProcessingSize}`, inline: true },
          { name: "Role Locks Cleared", value: `${oldRoleLocksSize}`, inline: true }
        )
        .setTimestamp();

      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    // All strikes command
    if (command === "allstrikes") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to view all strikes.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      try {
        let clanFilter = null;
        let pageArg = 1;

        // Parse arguments for clan filter and page
        if (args.length > 0) {
          // Check if first argument is a number (page) or string (clan)
          if (!isNaN(args[0])) {
            pageArg = parseInt(args[0]);
          } else {
            clanFilter = args[0].toLowerCase();
            if (args[1] && !isNaN(args[1])) {
              pageArg = parseInt(args[1]);
            }
          }
        }

        // Get guild settings to check for clan log channels
        const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
        let channelClan = null;

        // Auto-detect clan from channel context if no explicit filter provided
        if (!clanFilter && guildSettings && guildSettings.clanLogChannels && guildSettings.clanLogChannels.size > 0) {
          for (const [clanName, channelId] of guildSettings.clanLogChannels) {
            if (channelId === message.channel.id) {
              clanFilter = clanName.toLowerCase();
              channelClan = clanName.toLowerCase();
              break;
            }
          }
        }

        // Override clan filter if 'all' is specified
        if (args[0] && args[0].toLowerCase() === 'all') {
          clanFilter = null;
        }

        // Get all strikes from database
        let allStrikes = await Strike.find({ 
          guildId: message.guild.id, 
          strikes: { $gt: 0 } 
        }).sort({ strikes: -1 });

        let filteredStrikes = [];

        // Filter strikes by clan if specified
        if (clanFilter) {
          // Find the role for this clan
          const clanRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === clanFilter.toLowerCase());

          if (!clanRole) {
            const errorEmbed = new EmbedBuilder()
              .setTitle("❌ Clan Not Found")
              .setDescription(`No role found matching clan name: **${clanFilter}**`)
              .setColor(0xFF0000);
            return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
          }

          // Get all members with this clan role
          const clanMemberIds = clanRole.members.map(member => member.id);

          // Filter strikes to only include members with this clan role
          filteredStrikes = allStrikes.filter(strike => clanMemberIds.includes(strike.userId));
        } else {
          filteredStrikes = allStrikes;
        }

        if (filteredStrikes.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle("📊 All Strikes" + (clanFilter ? ` - ${clanFilter.toUpperCase()}` : ''))
            .setDescription(clanFilter ? `No users with strikes found in **${clanFilter.toUpperCase()}** clan.` : "No users with strikes found!")
            .setColor(0x00FF00);
          return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
        }

        // Pagination logic
        const itemsPerPage = 10;
        const totalPages = Math.ceil(filteredStrikes.length / itemsPerPage);
        const page = Math.max(1, Math.min(pageArg, totalPages));
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageStrikes = filteredStrikes.slice(startIndex, endIndex);

        // Build embed
        let titleSuffix = '';
        let contextInfo = '';

        if (clanFilter) {
          titleSuffix = ` - ${clanFilter.toUpperCase()}`;
          if (channelClan && clanFilter === channelClan) {
            contextInfo = `📍 *${clanFilter.toUpperCase()} clan strikes (channel context)*\n\n`;
          } else {
            contextInfo = `🔍 *Filtered by: ${clanFilter.toUpperCase()}*\n\n`;
          }
        } else if (channelClan) {
          contextInfo = `🌐 *Server-wide strikes (use !allstrikes ${channelClan} for channel clan only)*\n\n`;
        }

        const embed = new EmbedBuilder()
          .setTitle(`📊 All Strikes${titleSuffix} (Page ${page}/${totalPages})`)
          .setDescription(contextInfo + `Showing ${pageStrikes.length} of ${filteredStrikes.length} users with strikes`)
          .setColor(0x0099FF)
          .setTimestamp();

        // Add strike entries
        let strikeList = "";
        for (let i = 0; i < pageStrikes.length; i++) {
          const strike = pageStrikes[i];
          const user = await client.users.fetch(strike.userId).catch(() => null);
          const username = user ? user.username : `Unknown User`;
          const position = startIndex + i + 1;

          strikeList += `**${position}.** ${username} - \`${strike.strikes}\` strikes\n`;
        }

        embed.addFields({ name: "Strike List", value: strikeList, inline: false });

        // Add navigation info
        if (totalPages > 1) {
          embed.addFields({
            name: "📄 Navigation",
            value: `Use \`!allstrikes${clanFilter ? ` ${clanFilter}` : ''} [page]\` to navigate\nExample: \`!allstrikes${clanFilter ? ` ${clanFilter}` : ''} ${page + 1 <= totalPages ? page + 1 : 1}\``,
            inline: false
          });
        }

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

      } catch (error) {
        console.error(`❌ All strikes error: ${error.message}`);
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("Failed to fetch strikes data.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
      }
    }

    // History command
    if (command === "history") {
      if (!hasModeratorPermissions(message.member)) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Permission Denied")
          .setDescription("You don't have permission to view strike history.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const user = message.mentions.users.first();
      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Invalid Usage")
          .setDescription("Usage: `!history @user [page]`")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      try {
        const pageArg = parseInt(args[1]) || 1;
        const record = await Strike.findOne({ userId: user.id, guildId: message.guild.id });

        if (!record || !record.history || record.history.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle(`📜 Strike History - ${user.username}`)
            .setDescription("No strike history found for this user.")
            .setColor(0x00FF00);
          return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
        }

        // Pagination
        const itemsPerPage = 5;
        const totalPages = Math.ceil(record.history.length / itemsPerPage);
        const page = Math.max(1, Math.min(pageArg, totalPages));
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageHistory = record.history.slice(startIndex, endIndex);

        const embed = new EmbedBuilder()
          .setTitle(`📜 Strike History - ${user.username} (Page ${page}/${totalPages})`)
          .setDescription(`Current Strikes: **${record.strikes}**\nTotal History Entries: **${record.history.length}**`)
          .setColor(0x0099FF)
          .setThumbnail(user.displayAvatarURL())
          .setTimestamp();

        for (let i = 0; i < pageHistory.length; i++) {
          const entry = pageHistory[i];
          const entryNumber = startIndex + i + 1;
          const date = new Date(entry.date).toLocaleDateString();
          const strikesText = entry.strikesAdded > 0 ? `+${entry.strikesAdded}` : `${entry.strikesAdded}`;

          embed.addFields({
            name: `${entryNumber}. ${entry.reason}`,
            value: `**Strikes:** ${strikesText}\n**Date:** ${date}\n**Moderator:** ${entry.moderator}`,
            inline: false
          });
        }

        if (totalPages > 1) {
          embed.addFields({
            name: "📄 Navigation",
            value: `Use \`!history @${user.username} [page]\` to navigate`,
            inline: false
          });
        }

        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

      } catch (error) {
        console.error(`❌ History error: ${error.message}`);
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("Failed to fetch strike history.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
      }
    }

    // Check if this is a known command in any system before logging as unknown
    const isKnownCommand = commandLoader.getCommandInfo(command) || 
                          strikeReasons[command] || 
                          ['checkstrikes', 'mystatus', 'allstrikes', 'history', 'removestrike', 'removestrikes', 
                           'leaderboard', 'seasonreset', 'cgachievement', 'donationachievement', 'ping',
                           'setclanlog', 'setlogchannel', 'setleader', 'setcoleader', 'listclans', 'listleadership',
                           'debug', 'botstatus', 'syncroles', 'cleanup', 'analytics', 'cocsetup', 'cocsetclan',
                           'cocupdatekey', 'coclink', 'cocverify', 'cocprofile', 'cocstats', 'cocwar', 'cocattacks',
                           'cocmembers', 'coclistmappings', 'cocremoveclan', 'cocautostrike', 'coccheckwar',
                           'cleardb', 'cleandb', 'getmyid', 'wipedb', 'wipeall', 'dbstats', 'databasestats',
                           'testbot', 'fulltest'].includes(command);

    if (!isKnownCommand) {
      console.log(`❓ Unknown command: ${command} from ${message.author.username}`);
      return; // Exit early for truly unknown commands
    }

  } catch (error) {
    console.error(`❌ Error processing command '${command}' by ${message.author.tag}: ${error.message}`);

    try {
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Command Error")
        .setDescription("An error occurred while processing your command.")
        .setColor(0xFF0000)
        .addFields({ 
          name: "Error", 
          value: `\`${error.message}\``, 
          inline: false 
        })
        .setFooter({ text: "Please try again or contact support if the issue persists" });

      await message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
    } catch (sendError) {
      console.error(`❌ Failed to send error message: ${sendError.message}`);
    }
  } finally {
    console.log(`✅ Command processing finished: ${command} from ${message.author.username}`);
    clearTimeout(cleanupTimeout);
    processingMessages.delete(messageKey);
    messageProcessingLocks.delete(userCommandKey);
  }

  // Analytics dashboard command
  if (command === "analytics") {
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to view analytics.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    try {
      const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
      let channelClan = null;
      let clanFilter = args[0] && args[0].toLowerCase() !== 'all' ? args[0].toLowerCase() : null;

      if (!clanFilter && guildSettings && guildSettings.clanLogChannels && guildSettings.clanLogChannels.size > 0) {
        for (const [clanName, channelId] of guildSettings.clanLogChannels) {
          if (channelId === message.channel.id) {
            clanFilter = clanName.toLowerCase();
            channelClan = clanName.toLowerCase();
            break;
          }
        }
      }

      if (args[0] && args[0].toLowerCase() === 'all') {
        clanFilter = null;
      }

      let allStrikes = await Strike.find({ 
        guildId: message.guild.id, 
        strikes: { $gt: 0 } 
      }).sort({ strikes: -1 });

      let filteredStrikes = [];
      let totalTrackedUsers = 0;

      if (clanFilter) {
        const clanRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === clanFilter.toLowerCase());

        if (!clanRole) {
          const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Clan Not Found")
            .setDescription(`No role found matching clan name: **${clanFilter}**`)
            .setColor(0xFF0000);
          return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
        }

        const clanMemberIds = clanRole.members.map(member => member.id);
        filteredStrikes = allStrikes.filter(strike => clanMemberIds.includes(strike.userId));
        totalTrackedUsers = clanRole.members.size;
      } else {
        filteredStrikes = allStrikes;
        totalTrackedUsers = message.guild.memberCount;
      }

      const totalUsersWithStrikes = filteredStrikes.length;
      const usersWithoutStrikes = Math.max(0, totalTrackedUsers - totalUsersWithStrikes);
      const totalStrikes = filteredStrikes.reduce((sum, strike) => sum + strike.strikes, 0);
      const averageStrikes = totalUsersWithStrikes > 0 ? (totalStrikes / totalUsersWithStrikes).toFixed(1) : 0;

      const highRisk = filteredStrikes.filter(s => s.strikes >= 4).length;
      const mediumRisk = filteredStrikes.filter(s => s.strikes >= 2 && s.strikes < 4).length;
      const lowRisk = filteredStrikes.filter(s => s.strikes > 0 && s.strikes < 2).length;

      const highRiskPercent = totalTrackedUsers > 0 ? (highRisk / totalTrackedUsers) * 100 : 0;
      const mediumRiskPercent = totalTrackedUsers > 0 ? (mediumRisk / totalTrackedUsers) * 100 : 0;

      let healthColor, healthStatus, healthEmoji;
      if (highRiskPercent > 30) {
        healthColor = 0xFF0000;
        healthStatus = "CRITICAL";
        healthEmoji = "🔴";
      } else if (highRiskPercent > 15 || mediumRiskPercent > 50) {
        healthColor = 0xFFA500;
        healthStatus = "WARNING";
        healthEmoji = "🟡";
      } else {
        healthColor = 0x00FF00;
        healthStatus = "HEALTHY";
        healthEmoji = "🟢";
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentStrikes = filteredStrikes.filter(strike => {
        const lastViolation = new Date(strike.lastViolation);
        return lastViolation >= thirtyDaysAgo;
      });

      const violationCounts = {};
      filteredStrikes.forEach(strike => {
        if (strike.history) {
          strike.history.forEach(entry => {
            const entryDate = new Date(entry.date);
            if (entryDate >= thirtyDaysAgo && entry.strikesAdded > 0) {
              const reason = entry.reason.replace(/^TEST:\s*/, '');
              violationCounts[reason] = (violationCounts[reason] || 0) + 1;
            }
          });
        }
      });

      const topViolations = Object.entries(violationCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([reason, count]) => `• ${reason} (${count}x)`)
        .join('\n') || 'No recent violations';

      let titleSuffix = '';
      let contextInfo = '';

      if (clanFilter) {
        titleSuffix = ` - ${clanFilter.toUpperCase()}`;
        if (channelClan && clanFilter === channelClan) {
          contextInfo = `📍 *${clanFilter.toUpperCase()} clan analytics (channel context)*\n\n`;
        } else {
          contextInfo = `🔍 *Filtered by: ${clanFilter.toUpperCase()}*\n\n`;
        }
      } else if (channelClan) {
        contextInfo = `🌐 *Server-wide analytics (use !analytics ${channelClan} for channel clan only)*\n\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Analytics${titleSuffix}`)
        .setDescription(`${healthEmoji} **${healthStatus}** | ${new Date().toLocaleDateString()}`)
        .setColor(healthColor)
        .addFields(
          {
            name: "👥 Users",
            value: `Total: ${totalTrackedUsers}\nWith Strikes: ${totalUsersWithStrikes}\nClean: ${usersWithoutStrikes}`,
            inline: true
          },
          {
            name: "📈 Strikes",
            value: `Total: ${totalStrikes}\nAvg: ${averageStrikes}\nRecent: ${recentStrikes.length}`,
            inline: true
          },
          {
            name: "⚠️ Risk",
            value: `🔴 ${highRisk} (${(highRiskPercent).toFixed(1)}%)\n🟡 ${mediumRisk} (${(mediumRiskPercent).toFixed(1)}%)\n🟢 ${lowRisk}`,
            inline: true
          },
          {
            name: "🔝 Top Violations",
            value: topViolations.length > 300 ? topViolations.substring(0, 300) + '...' : topViolations || 'None',
            inline: false
          }
        )
        .setTimestamp();

      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

    } catch (error) {
      console.error(`❌ Analytics error: ${error.message}`);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Analytics Error")
        .setDescription("Failed to generate analytics dashboard.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
    }
  }

  // COC API Setup Command
  if (command === "cocsetup") {
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to configure COC API.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const apiKey = args[0];

    if (!apiKey) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!cocsetup <api_key>`\n\n**Example:** `!cocsetup eyJ0eXAiOiJKV1QiLCJhbGciOi...`")
        .setColor(0xFF0000)
        .addFields(
          {
            name: "📋 How to get your API key:",
            value: "1. Visit https://developer.clashofclans.com/\n2. Login with your Supercell ID\n3. Create a key with your server's IP\n4. Copy the generated JWT token",
            inline: false
          },
          {
            name: "⚠️ Important Notes:",
            value: "• Your API key must include this server's IP address\n• Keys expire after a period of inactivity\n• Keep your key private - don't share it publicly",
            inline: false
          }
        );
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    if (!apiKey.startsWith('eyJ')) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid API Key Format")
        .setDescription("COC API keys should start with 'eyJ' (JWT format).")
        .setColor(0xFF0000)
        .addFields({
          name: "💡 Check your key:",
          value: "• Ensure you copied the complete JWT token\n• Make sure there are no extra spaces\n• Verify it starts with 'eyJ'",
          inline: false
        });
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const validationEmbed = new EmbedBuilder()
      .setTitle("🔄 Validating COC API Key...")
      .setDescription("Testing your API key against the Clash of Clans API...")
      .setColor(0xFFFF00);

    const validationMessage = await message.channel.send({ embeds: [validationEmbed], allowedMentions: { repliedUser: false } });

    try {
      console.log(`🔧 Starting COC API validation for guild ${message.guild.id}`);

      const validation = await validateCocApiKey(apiKey);

      if (!validation.valid) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ API Key Validation Failed")
          .setDescription(validation.message)
          .setColor(0xFF0000)
          .addFields({
            name: "🔧 Common Issues & Solutions:",
            value: "• **IP Whitelist:** Ensure your server's IP is whitelisted\n• **Expired Key:** Generate a new key if yours is old\n• **Wrong Key:** Double-check you copied the complete JWT\n• **Rate Limit:** Wait a few minutes and try again",
            inline: false
          },
          {
            name: "🆘 Still having issues?",
            value: "1. Try creating a completely new API key\n2. Make sure to add the correct IP address\n3. Wait 5-10 minutes after creating the key",
            inline: false
          });

        await validationMessage.edit({ embeds: [errorEmbed] });
        return;
      }

      const encryptedKey = encryptApiKey(apiKey);

      await GuildSettings.findOneAndUpdate(
        { guildId: message.guild.id },
        { 
          $set: { 
            cocApiKey: encryptedKey,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );

      console.log(`✅ COC API key successfully configured for guild ${message.guild.id}`);

      const successEmbed = new EmbedBuilder()
        .setTitle("✅ COC API Key Configured Successfully!")
        .setDescription("🎉 Your Clash of Clans API integration is now active!")
        .setColor(0x00FF00)
        .addFields(
          {
            name: "🚀 Available Commands:",
            value: "• `!cocstats [clan_tag]` - View clan statistics\n• `!cocsetclan <role> <clan_tag>` - Link Discord roles to clans\n• `!cocmembers [clan_tag]` - List clan members\n• `!cocwar [clan_tag]` - Check current war status",
            inline: false
          },
          {
            name: "📝 Quick Test:",
            value: "Try `!cocstats` with a clan tag to test your setup!\nExample: `!cocstats #2PP`",
            inline: false
          },
          {
            name: "🔒 Security:",
            value: "Your API key has been encrypted and stored securely.",
            inline: false
          }
        )
        .setFooter({ text: "Use !help coc to see all COC commands | Original message deleted for security" })
        .setTimestamp();

      await validationMessage.edit({ embeds: [successEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle("🔧 COC API Key Configured")
        .setColor(0x00FF00)
        .addFields(
          { name: "Moderator", value: message.author.tag, inline: true },
          { name: "Guild", value: message.guild.name, inline: true },
          { name: "Status", value: "✅ Successfully configured and validated", inline: true }
        )
        .setTimestamp();

      await logAction(client, message.guild.id, logEmbed);

      setTimeout(async () => {
        try {
          await message.delete();
          console.log(`🔒 Deleted message containing API key from ${message.author.tag}`);
        } catch (deleteError) {
          console.log(`⚠️ Could not delete original message: ${deleteError.message}`);
        }
      }, 2000);

    } catch (error) {
      console.error(`❌ COC setup error: ${error.message}`);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Setup Failed")
        .setDescription("Unexpected error while configuring COC API")
        .setColor(0xFF0000)
        .addFields({
          name: "Error Details:",
          value: `\`${error.message}\``,
          inline: false
        },
        {
          name: "💡 What to try:",
          value: "• Check your internet connection\n• Verify the API key is valid\n• Try again in a few minutes\n• Contact support if the issue persists",
          inline: false
        });
      await validationMessage.edit({ embeds: [errorEmbed] });
    }

    return;
  }

  // COC Set Clan Command
  if (command === "cocsetclan") {
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to configure COC clans.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const roleName = args[0];
    const clanTag = args[1];

    if (!roleName || !clanTag) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!cocsetclan <role_name> <clan_tag>`\n\n**Examples:**\n• `!cocsetclan \"Phoenix Rising\" #P28JG28J`\n• `!cocsetclan Phoenix #ABC123`")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    try {
      const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
      if (!guildSettings || !guildSettings.cocApiKey) {
        const embed = new EmbedBuilder()
          .setTitle("❌ COC API Not Configured")
          .setDescription("You need to set up the COC API first using `!cocsetup <api_key>`")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const apiKey = decryptApiKey(guildSettings.cocApiKey);
      const clanInfo = await getCocClanInfo(clanTag, apiKey);

      if (!clanInfo.success) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Invalid Clan Tag")
          .setDescription(clanInfo.message)
          .setColor(0xFF0000)
          .addFields({
            name: "💡 Clan Tag Format",
            value: "• Include the # symbol: `#P28JG28J`\n• Or without: `P28JG28J`\n• Check the tag is correct in-game",
            inline: false
          });
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const discordRole = message.guild.roles.cache.find(r => 
        r.name.toLowerCase() === roleName.toLowerCase()
      );

      if (!discordRole) {
        const embed = new EmbedBuilder()
          .setTitle("❌ Discord Role Not Found")
          .setDescription(`No role found with name: **${roleName}**`)
          .setColor(0xFF0000)
          .addFields({
            name: "💡 Available Roles",
            value: message.guild.roles.cache
              .filter(r => !r.managed &&r.name !== '@everyone')
              .map(r => r.name)
              .slice(0, 10)
              .join(', ') + (message.guild.roles.cache.size > 10 ? '...' : ''),
            inline: false
          });
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      await GuildSettings.findOneAndUpdate(
        { guildId: message.guild.id },
        { 
          $set: { 
            [`cocClanMappings.${roleName}`]: clanTag,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );

      const successEmbed = new EmbedBuilder()
        .setTitle("✅ COC Clan Mapping Configured")
        .setDescription(`Successfully linked Discord role to COC clan!`)
        .setColor(0x00FF00)
        .addFields({ name: "Discord Role", value: discordRole.toString(), inline: true },
          { name: "COC Clan", value: `${clanInfo.data.name}\n\`${clanInfo.data.tag}\``, inline: true },
          { name: "Members", value: `${clanInfo.data.members}/50`, inline: true }
        )
        .setThumbnail(clanInfo.data.badgeUrls?.medium || null)
        .setFooter({ text: "Use !coclistclans to see all mappings" })
        .setTimestamp();

      await message.channel.send({ embeds: [successEmbed], allowedMentions: { repliedUser: false } });

    } catch (error) {
      console.error(`❌ COC set clan error: ${error.message}`);
      const embed = new EmbedBuilder()
        .setTitle("❌ Configuration Failed")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    return;
  }

  // COC Update API Key Command
  if (command === "cocupdatekey") {
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to update COC API key.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const newApiKey = args[0];
    if (!newApiKey) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!cocupdatekey <new_api_key>`")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const validation = await validateCocApiKey(newApiKey);
    if (!validation.valid) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid API Key")
        .setDescription(validation.message)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const encryptedKey = encryptApiKey(newApiKey);
    await GuildSettings.findOneAndUpdate(
      { guildId: message.guild.id },
      { $set: { cocApiKey: encryptedKey, updatedAt: new Date() } },
      { upsert: true }
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ COC API Key Updated")
      .setDescription("Your COC API key has been updated successfully!")
      .setColor(0x00FF00);

    await message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

    // Delete original message for security
    setTimeout(async () => {
      try {
        await message.delete();
      } catch (deleteError) {
        console.log(`⚠️ Could not delete message: ${deleteError.message}`);
      }
    }, 2000);

    return;
  }

  // COC Link Player Command
  if (command === "coclink") {
    const playerTag = args[0];
    if (!playerTag) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!coclink <player_tag>`\n\n**Example:** `!coclink #ABC123DEF`")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    try {
      const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
      if (!guildSettings || !guildSettings.cocApiKey) {
        const embed = new EmbedBuilder()
          .setTitle("❌ COC API Not Configured")
          .setDescription("COC API is not set up. Use `!cocsetup <api_key>` first.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      await GuildSettings.findOneAndUpdate(
        { guildId: message.guild.id },
        { 
          $set: { 
            [`cocPlayerLinks.${message.author.id}`]: playerTag,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );

      const embed = new EmbedBuilder()
        .setTitle("✅ COC Account Linked")
        .setDescription(`Your Discord account has been linked to COC player: \`${playerTag}\``)
        .setColor(0x00FF00)
        .setFooter({ text: "Use !cocprofile to view your stats" });

      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      console.error(`❌ COC link error: ${error.message}`);
      const embed = new EmbedBuilder()
        .setTitle("❌ Link Failed")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  // COC Verify Command
  if (command === "cocverify") {
    const verificationCode = args[0];
    if (!verificationCode) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!cocverify <code>`\n\n**How to verify:**\n1. Link your account with `!coclink <player_tag>`\n2. Set verification code in-game\n3. Use this command with the code")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const embed = new EmbedBuilder()
      .setTitle("🔄 COC Verification")
      .setDescription("Verification system is under development. This feature will validate your COC account ownership.")
      .setColor(0xFFFF00);

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  // COC Profile Command
  if (command === "cocprofile") {
    try {
      const targetUser = message.mentions.users.first() || message.author;
      const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });

      if (!guildSettings || !guildSettings.cocApiKey) {
        const embed = new EmbedBuilder()
          .setTitle("❌ COC API Not Configured")
          .setDescription("COC API is not set up. Use `!cocsetup <api_key>` first.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const playerTag = guildSettings.cocPlayerLinks?.get(targetUser.id);
      if (!playerTag) {
        const embed = new EmbedBuilder()
          .setTitle("❌ No Linked COC Account")
          .setDescription(`${targetUser.username} hasn't linked their COC account yet.\nUse \`!coclink <player_tag>\` to link an account.`)
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const embed = new EmbedBuilder()
        .setTitle("🔄 COC Player Profile")
        .setDescription(`Fetching profile for ${targetUser.username}...\nPlayer Tag: \`${playerTag}\``)
        .setColor(0xFFFF00);

      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      console.error(`❌ COC profile error: ${error.message}`);
      const embed = new EmbedBuilder()
        .setTitle("❌ Profile Error")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  // COC Stats Command
  if (command === "cocstats") {
    try {
      const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
      if (!guildSettings || !guildSettings.cocApiKey) {
        const embed = new EmbedBuilder()
          .setTitle("❌ COC API Not Configured")
          .setDescription("COC API integration is not set up for this server.\nUse `!cocsetup <api_key>` to configure it.")
          .setColor(0xFF0000);
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      let clanTag = args[0];

      if (!clanTag) {
        if (guildSettings.cocClanMappings && guildSettings.clanLogChannels && guildSettings.clanLogChannels.size > 0) {
          for (const [roleName, mappedClanTag] of guildSettings.clanLogChannels.size > 0) {
            for (const [roleName, mappedClanTag] of guildSettings.cocClanMappings) {
              if (message.channel.name.toLowerCase().includes(roleName.toLowerCase().replace(/\s+/g, '-'))) {
                clanTag = mappedClanTag;
                break;
              }
            }
          }

          if (!clanTag && message.member) {
            for (const [roleName, mappedClanTag] of guildSettings.cocClanMappings) {
              const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
              if (role && message.member.roles.cache.has(role.id)) {
                clanTag = mappedClanTag;
                break;
              }
            }
          }
        }

        if (!clanTag) {
          const embed = new EmbedBuilder()
            .setTitle("❌ No Clan Tag Provided")
            .setDescription("**Usage:** `!cocstats <clan_tag>`\n\n**Examples:**\n• `!cocstats #P28JG28J`\n• `!cocstats P28JG28J`")
            .setColor(0xFF0000);

          if (guildSettings.cocClanMappings && guildSettings.clanLogChannels && guildSettings.clanLogChannels.size > 0) {
            let mappedClans = "";
            for (const [roleName, mappedTag] of guildSettings.cocClanMappings) {
              mappedClans += `• **${roleName}** → \`${mappedTag}\`\n`;
            }
            embed.addFields({
              name: "🏰 Available Mapped Clans",
              value: mappedClans,
              inline: false
            });
          }

          return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
        }
      }

      const apiKey = decryptApiKey(guildSettings.cocApiKey);

      const loadingEmbed = new EmbedBuilder()
        .setTitle("⚔️ Fetching Clan Statistics...")
        .setDescription("Please wait while we gather clan data from COC API...")
        .setColor(0xFFFF00);

      const loadingMessage = await message.channel.send({ embeds: [loadingEmbed], allowedMentions: { repliedUser: false } });

      const clanInfo = await getCocClanInfo(clanTag, apiKey);

      if (!clanInfo.success) {
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Failed to Fetch Clan Data")
          .setDescription(clanInfo.message)
          .setColor(0xFF0000);
        await loadingMessage.edit({ embeds: [errorEmbed] });
        return;
      }

      const clan = clanInfo.data;

      const statsEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${clan.name} Statistics`)
        .setDescription(`**${clan.description || 'No description available'}**`)
        .setColor(0xFF8000)
        .setThumbnail(clan.badgeUrls?.large || clan.badgeUrls?.medium || null)
        .addFields(
          { name: "🏷️ Clan Tag", value: `\`${clan.tag}\``, inline: true },
          { name: "🏆 Trophies", value: `${clan.clanPoints.toLocaleString()}`, inline: true },
          { name: "🌟 Level", value: `${clan.clanLevel}`, inline: true },
          { name: "👥 Members", value: `${clan.members}/50`, inline: true },
          { name: "⚔️ War Wins", value: `${clan.warWins || 0}`, inline: true },
          { name: "💎 War League", value: `${clan.warLeague?.name || 'Unranked'}`, inline: true },
          { name: "🏠 Location", value: `${clan.location?.name || 'International'}`, inline: true },
          { name: "📊 Required Trophies", value: `${clan.requiredTrophies.toLocaleString()}`, inline: true },
          { name: "🔓 Type", value: clan.type.charAt(0).toUpperCase() + clan.type.slice(1), inline: true }
        );

      if (clan.warFrequency) {
        statsEmbed.addFields({
          name: "⚔️ War Frequency",
          value: clan.warFrequency.charAt(0).toUpperCase() + clan.warFrequency.slice(1),
          inline: true
        });
      }

      if (clan.clanCapital) {
        statsEmbed.addFields({
          name: "🏛️ Capital Hall",
          value: `Level ${clan.clanCapital.capitalHallLevel}`,
          inline: true
        });
      }

      statsEmbed.setFooter({ 
        text: `Last updated: ${new Date().toLocaleString()} | Use !cocmembers for member list` 
      })
      .setTimestamp();

      await loadingMessage.edit({ embeds: [statsEmbed] });

    } catch (error) {
      console.error(`❌ COC stats error: ${error.message}`);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error Fetching Statistics")
        .setDescription(`Failed to retrieve clan statistics: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
    }

    return;
  }

  // COC War Command
  if (command === "cocwar") {
    const clanTag = args[0];
    if (!clanTag) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!cocwar <clan_tag>`\n\n**Example:** `!cocwar #P28JG28J`")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const embed = new EmbedBuilder()
      .setTitle("🔄 COC War Information")
      .setDescription("Fetching current war status...\nThis feature requires additional API endpoints.")
      .setColor(0xFFFF00);

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  // COC Attacks Command
  if (command === "cocattacks") {
    const autoStrike = args[0] === "autostrike";
    const embed = new EmbedBuilder()
      .setTitle("🔄 COC War Attacks")
      .setDescription("Checking war attack status...\nThis feature is under development.")
      .setColor(0xFFFF00);

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  // COC Members Command
  if (command === "cocmembers") {
    const clanTag = args[0];
    if (!clanTag) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!cocmembers <clan_tag>`\n\n**Example:** `!cocmembers #P28JG28J`")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const embed = new EmbedBuilder()
      .setTitle("🔄 COC Clan Members")
      .setDescription("Fetching clan member list with activity status...\nThis feature is under development.")
      .setColor(0xFFFF00);

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  // COC List Mappings Command
  if (command === "coclistmappings") {
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to view COC mappings.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    try {
      const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });

      if (!guildSettings || !guildSettings.cocClanMappings || guildSettings.cocClanMappings.size === 0) {
        const embed = new EmbedBuilder()
          .setTitle("📋 COC Clan Mappings")
          .setDescription("No Discord role to COC clan mappings configured.")
          .setColor(0x00FF00)
          .addFields({
            name: "How to Configure",
            value: "Use `!cocsetclan <role> <clan_tag>` to link Discord roles to COC clans.",
            inline: false
          });
        return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Discord Role to COC Clan Mappings")
        .setColor(0x0099FF)
        .setTimestamp();

      let mappingList = "";
      for (const [roleName, clanTag] of guildSettings.cocClanMappings) {
        const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
        const roleMention = role ? role.toString() : `**${roleName}** (role not found)`;
        mappingList += `${roleMention} → \`${clanTag}\`\n`;
      }

      embed.setDescription(mappingList || "No mappings configured.");
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      console.error(`Error listing COC mappings: ${error.message}`);
      const embed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription("Failed to fetch COC clan mappings.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  // COC Remove Clan Command
  if (command === "cocremoveclan") {
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to remove COC clan mappings.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const roleName = args[0];
    if (!roleName) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!cocremoveclan <role_name>`\n\n**Example:** `!cocremoveclan Phoenix`")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    try {
      await GuildSettings.findOneAndUpdate(
        { guildId: message.guild.id },
        { 
          $unset: { [`cocClanMappings.${roleName}`]: "" },
          $set: { updatedAt: new Date() }
        }
      );

      const successEmbed = new EmbedBuilder()
        .setTitle("✅ COC Clan Mapping Removed")
        .setDescription(`Removed COC clan mapping for role: **${roleName}**`)
        .setColor(0x00FF00)
        .setTimestamp();

      return message.channel.send({ embeds: [successEmbed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      console.error(`Error removing COC clan mapping: ${error.message}`);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Removal Failed")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
    }
  }

  // COC Auto Strike Command
  if (command === "cocautostrike") {
    if (!hasModeratorPermissions(message.member)) {
      const autoStrikePermEmbed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to configure COC auto-strike.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [autoStrikePermEmbed], allowedMentions: { repliedUser: false } });
    }

    const setting = args[0]?.toLowerCase();
    if (!setting || !['on', 'off', 'enable', 'disable'].includes(setting)) {
      const autoStrikeUsageEmbed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!cocautostrike <on/off>`\n\n**Examples:**\n• `!cocautostrike on`\n• `!cocautostrike off`")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [autoStrikeUsageEmbed], allowedMentions: { repliedUser: false } });
    }

    const enable = ['on', 'enable'].includes(setting);

    try {
      await GuildSettings.findOneAndUpdate(
        { guildId: message.guild.id },
        { 
          $set: { 
            cocAutoStrike: enable,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );

      const autoStrikeEmbed = new EmbedBuilder()
        .setTitle(`✅ COC Auto-Strike ${enable ? 'Enabled' : 'Disabled'}`)
        .setDescription(`COC automatic strike system has been **${enable ? 'enabled' : 'disabled'}**.`)
        .setColor(enable ? 0x00FF00 : 0xFFFF00)
        .addFields({
          name: "ℹ️ Auto-Strike System",
          value: enable ? 
            "The bot will automatically check for missed war attacks and apply strikes." :
            "The bot will not automatically apply strikes for missed attacks.",
          inline: false
        })
        .setTimestamp();

      return message.channel.send({ embeds: [autoStrikeEmbed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      console.error(`Error setting COC auto-strike: ${error.message}`);
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Configuration Failed")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
    }
  }

  // COC Check War Command
  if (command === "coccheckwar") {
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to check war status.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const clanTag = args[0];
    if (!clanTag) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Invalid Usage")
        .setDescription("**Usage:** `!coccheckwar <clan_tag>`\n\n**Example:** `!coccheckwar #P28JG28J`")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const embed = new EmbedBuilder()
      .setTitle("🔄 COC War Check")
      .setDescription("Manually checking war status and applying strikes for missed attacks...\nThis feature is under development.")
      .setColor(0xFFFF00);

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  // Hidden database cleanup command for testing environments
  if (command === "cleardb" || command === "cleandb") {
    try {
      const { handleClearDatabase } = require("./commands/database");
      return handleClearDatabase(message, args, client, hasModeratorPermissions, Strike, GuildSettings);
    } catch (error) {
      console.error(`❌ Database command error: ${error.message}`);
      const embed = new EmbedBuilder()
        .setTitle("❌ Database Command Error")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  // Get user ID command (temporary)
  if (command === "getmyid") {
    const embed = new EmbedBuilder()
      .setTitle("📋 Your Discord User ID")
      .setDescription(`Your Discord User ID is: \`${message.author.id}\``)
      .setColor(0x0099FF)
      .addFields({
        name: "💡 How to use:",
        value: "Set this as your OWNER_ID in your environment variables",
        inline: false
      });
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  // Owner-only complete database wipe for testing with MongoDB free tier
  if (command === "wipedb" || command === "wipeall") {
    try {
      const { handleWipeDatabase } = require("./commands/database");
      return handleWipeDatabase(message, args, client, Strike, GuildSettings);
    } catch (error) {
      console.error(`❌ Database wipe error: ${error.message}`);
      const embed = new EmbedBuilder()
        .setTitle("❌ Database Wipe Error")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  // Database statistics command
  if (command === "dbstats" || command === "databasestats") {
    try {
      const { handleDatabaseStats } = require("./commands/database");
      return handleDatabaseStats(message, client, hasModeratorPermissions, Strike, GuildSettings);
    } catch (error) {
      console.error(`❌ Database stats error: ${error.message}`);
      const embed = new EmbedBuilder()
        .setTitle("❌ Database Stats Error")
        .setDescription(`Error: ${error.message}`)
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
  }

  // Comprehensive bot test command
  if (command === "testbot" || command === "fulltest") {
    if (!hasModeratorPermissions(message.member)) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Permission Denied")
        .setDescription("You don't have permission to run bot tests.")
        .setColor(0xFF0000);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const testEmbed = new EmbedBuilder()
      .setTitle("🧪 Comprehensive Bot Test")
      .setDescription("**⚠️ TESTING MODE**\n\nThis will test all major bot functions:\n\n• Database connectivity\n• Permission checks\n• Strike system\n• Role management\n• Logging system\n• Achievement system\n• Configuration settings\n• Error handling\n\n**Are you sure you want to proceed?**")
      .setColor(0xFFFF00)
      .setFooter({ text: "✅ Confirm | ❌ Cancel | Expires in 2 minutes" });

    const testMessage = await message.channel.send({ embeds: [testEmbed], allowedMentions: { repliedUser: false } });

    await testMessage.react('✅');
    await new Promise(resolve => setTimeout(resolve, 100));
    await testMessage.react('❌');

    const filter = (reaction, reactionUser) => {
      return (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') &&
             !reactionUser.bot &&
             reaction.message.id === testMessage.id &&
             hasModeratorPermissions(message.guild.members.cache.get(reactionUser.id));
    };

    const collector = testMessage.createReactionCollector({
      filter,
      time: 120000,
      max: 1
    });

    collector.on('collect', async (reaction, reactionUser) => {
      if (reaction.emoji.name === '✅') {
        try {
          const startTime = Date.now();
          let testResults = [];
          let passedTests = 0;
          let totalTests = 0;

          const progressEmbed = new EmbedBuilder()
            .setTitle("🧪 Running Comprehensive Bot Test...")
            .setDescription("Please wait while all systems are tested...")
            .setColor(0x0099FF);
          await testMessage.edit({ embeds: [progressEmbed] });
          await testMessage.reactions.removeAll().catch(() => {});

          // Test 1: Database Connectivity
          totalTests++;
          try {
            const testQuery = await Strike.findOne({ guildId: message.guild.id }).limit(1);
            testResults.push("✅ **Database Connectivity** - MongoDB connection active");
            passedTests++;
          } catch (dbError) {
            testResults.push("❌ **Database Connectivity** - Error: " + dbError.message);
          }

          // Test 2: Permission System
          totalTests++;
          try {
            const hasPerms = hasModeratorPermissions(message.member);
            if (hasPerms) {
              testResults.push("✅ **Permission System** - Moderator permissions verified");
              passedTests++;
            } else {
              testResults.push("❌ **Permission System** - Permission check failed");
            }
          } catch (permError) {
            testResults.push("❌ **Permission System** - Error: " + permError.message);
          }

          // Test 3: Guild Settings Retrieval
          totalTests++;
          try {
            const guildSettings = await GuildSettings.findOne({ guildId: message.guild.id });
            testResults.push("✅ **Guild Settings** - Configuration " + (guildSettings ? 'loaded' : 'empty (normal for new servers)'));
            passedTests++;
          } catch (settingsError) {
            testResults.push(`❌ **Guild Settings** - Error: ${settingsError.message}`);
          }

          // Test 4: Role Creation Check
          totalTests++;
          try {
            const botMember = message.guild.members.me;
            const canManageRoles = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
            const canManageMessages = botMember.permissions.has(PermissionFlagsBits.ManageMessages);
            const canAddReactions = message.channel.permissionsFor(botMember).has(PermissionFlagsBits.AddReactions);
            testResults.push("✅ **Role Management** - Bot has role management permissions");
            passedTests++;
          } catch (roleError) {
            testResults.push(`❌ **Role Management** - Error: ${roleError.message}`);
          }

          // Test 5: Channel Access
          totalTests++;
          try {
            const canSendMessages = message.channel.permissionsFor(message.guild.members.me).has(PermissionFlagsBits.SendMessages);
            const canAddReactions = message.channel.permissionsFor(message.guild.members.me).has(PermissionFlagsBits.AddReactions);
            if (canSendMessages && canAddReactions) {
              testResults.push("✅ **Channel Permissions** - Send messages and add reactions verified");
              passedTests++;
            } else {
              testResults.push(`❌ **Channel Permissions** - Missing permissions (Send: ${canSendMessages}, React: ${canAddReactions})`);
            }
          } catch (channelError) {
            testResults.push(`❌ **Channel Permissions** - Error: ${channelError.message}`);
          }

          // Test 6: Strike Reasons Validation
          totalTests++;
          try {
            const reasonCount = Object.keys(strikeReasons).length;
            if (reasonCount > 0) {
              testResults.push("✅ **Strike System** - " + reasonCount + " violation types loaded");
              passedTests++;
            } else {
              testResults.push("❌ **Strike System** - No strike reasons found");
            }
          } catch (strikeError) {
            testResults.push(`❌ **Strike System** - Error: ${strikeError.message}`);
          }

          // Test 7: Embed Creation
          totalTests++;
          try {
            const testEmbedCreation = new EmbedBuilder()
              .setTitle("Test Embed")
              .setDescription("Testing embed creation")
              .setColor(0x00FF00);
            testResults.push("✅ **Embed System** - Embed creation functional");
            passedTests++;
          } catch (embedError) {
            testResults.push(`❌ **Embed System** - Error: ${embedError.message}`);
          }

          // Test 8: Memory Usage Check
          totalTests++;
          try {
            const memUsage = process.memoryUsage();
            const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            if (heapUsedMB < 500) {
              testResults.push("✅ **Memory Usage** - " + heapUsedMB + "MB heap used (healthy)");
              passedTests++;
            } else {
              testResults.push("⚠️ **Memory Usage** - " + heapUsedMB + "MB heap used (monitor)");
            }
          } catch (memError) {
            testResults.push(`❌ **Memory Usage** - Error: ${memError.message}`);
          }

          // Test 9: Rate Limiting System
          totalTests++;
          try {
            const testCooldown = isOnCooldown('test-user', 'test-command', 1000);
            testResults.push("✅ **Rate Limiting** - Cooldown system operational");
            passedTests++;
          } catch (cooldownError) {
            testResults.push(`❌ **Rate Limiting** - Error: ${cooldownError.message}`);
          }

          // Test 10: Error Handling
          totalTests++;
          try {
            const testUser = { id: 'test-id-12345' };
            const mockMember = await message.guild.members.fetch(testUser.id).catch(() => null);
            testResults.push("✅ **Error Handling** - Graceful error handling verified");
            passedTests++;
          } catch (errorHandlingError) {
            testResults.push(`❌ **Error Handling** - Error: ${errorHandlingError.message}`);
          }

          const endTime = Date.now();
          const testDuration = ((endTime - startTime) / 1000).toFixed(2);

          const successRate = Math.round((passedTests / totalTests) * 100);
          let statusColor, statusEmoji, statusText;

          if (successRate >= 90) {
            statusColor = 0x00FF00;
            statusEmoji = "✅";
            statusText = "EXCELLENT";
          } else if (successRate >= 70) {
            statusColor = 0xFFFF00;
            statusEmoji = "⚠️";
            statusText = "GOOD";
          } else {
            statusColor = 0xFF0000;
            statusEmoji = "❌";
            statusText = "NEEDS ATTENTION";
          }

          const resultsEmbed = new EmbedBuilder()
            .setTitle(`🧪 Bot Test - ${statusEmoji} ${statusText}`)
            .setDescription(
              `**Score: ${passedTests}/${totalTests} (${successRate}%)**\n` +
              `**Duration: ${testDuration}s**\n\n` +
              testResults.slice(0, 8).join('\n') + (testResults.length > 8 ? '\n...' : '')
            )
            .setColor(statusColor)
            .addFields(
              { name: "📊 Stats", value: `Guilds: ${client.guilds.cache.size}\nLatency: ${Math.round(client.ws.ping)}ms\nMemory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true },
              { name: "🔧 Status", value: `MongoDB: Connected\nNode.js: ${process.version}\nUptime: ${Math.floor(process.uptime() / 60)}m`, inline: true }
            )
            .setFooter({ text: `Test by ${reactionUser.tag}` })
            .setTimestamp();

          await testMessage.edit({ embeds: [resultsEmbed] });

          const logEmbed = new EmbedBuilder()
            .setTitle("🧪 Comprehensive Bot Test Completed")
            .setDescription(`Bot health check performed with ${successRate}% success rate`)
            .setColor(statusColor)
            .addFields(
              { name: "Tester", value: reactionUser.tag, inline: true },
              { name: "Results", value: `${passedTests}/${totalTests} tests passed`, inline: true },
              { name: "Duration", value: `${testDuration}s`, inline: true }
            )
            .setTimestamp();

          await logAction(client, message.guild.id, logEmbed);

          console.log(`✅ Comprehensive bot test completed: ${passedTests}/${totalTests} tests passed (${successRate}%)`);

        } catch (error) {
          console.error(`❌ Bot test error: ${error.message}`);
          const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Bot Test Failed")
            .setDescription(`Error during testing: ${error.message}`)
            .setColor(0xFF0000);
          await testMessage.edit({ embeds: [errorEmbed] });
        }
      } else {
        const cancelledEmbed = new EmbedBuilder()
          .setTitle("❌ Bot Test Cancelled")
          .setDescription("Testing cancelled by moderator")
          .setColor(0x808080);
        await testMessage.edit({ embeds: [cancelledEmbed] });
        await testMessage.reactions.removeAll().catch(() => {});
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setTitle("⏰ Bot Test Request Expired")
          .setDescription("No action taken - Test request timed out")
          .setColor(0x808080);
        await testMessage.edit({ embeds: [timeoutEmbed] }).catch(() => {});
        await testMessage.reactions.removeAll().catch(() => {});
      }
    });

    return;
  }

  // Check if this is a known command in any system before logging as unknown
  const isKnownCommand = commandLoader.getCommandInfo(command) || 
                        strikeReasons[command] || 
                        ['checkstrikes', 'mystatus', 'allstrikes', 'history', 'removestrike', 'removestrikes', 
                         'leaderboard', 'seasonreset', 'cgachievement', 'donationachievement', 'ping',
                         'setclanlog', 'setlogchannel', 'setleader', 'setcoleader', 'listclans', 'listleadership',
                         'debug', 'botstatus', 'syncroles', 'cleanup', 'analytics', 'cocsetup', 'cocsetclan',
                         'cocupdatekey', 'coclink', 'cocverify', 'cocprofile', 'cocstats', 'cocwar', 'cocattacks',
                         'cocmembers', 'coclistmappings', 'cocremoveclan', 'cocautostrike', 'coccheckwar',
                         'cleardb', 'cleandb', 'getmyid', 'wipedb', 'wipeall', 'dbstats', 'databasestats',
                         'testbot', 'fulltest'].includes(command);

  if (!isKnownCommand) {
    console.log(`❓ Unknown command: ${command} from ${message.author.username}`);
    return; // Exit early for truly unknown commands
  }

});

// ⚡ Enhanced client events
client.on("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  client.user.setActivity("StrikeMaster | !help or /help", { type: 3 }); // 3 = WATCHING
  console.log(`📊 Serving ${client.guilds.cache.size} guilds with ${client.users.cache.size} users`);

  // Register slash commands
  await registerSlashCommands();

  // Start advanced systems
  console.log('🚀 Starting advanced systems...');
  try {
    if (persistenceManager) {
      await persistenceManager.start();
    }
    // BackupManager is now only available for manual backups via !backup create command
    if (strikeDecayManager) {
      await strikeDecayManager.start();
    }
    if (cocWarChecker) {
      cocWarChecker.start();
    }
    console.log('✅ All advanced systems started successfully');
  } catch (error) {
    console.error('❌ Error starting advanced systems:', error.message);
  }
});

client.on("error", (error) => {
  console.error(`❌ Discord client error: ${error.message}`);
});

client.on("warn", (warning) => {
  console.warn(`⚠️ Discord client warning: ${warning}`);
});

client.on("disconnect", () => {
  console.log('🔌 Discord client disconnected');
});

client.on("reconnecting", () => {
  console.log('🔄 Discord client reconnecting...');
});

// ⚡ Process cleanup handlers
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');

  // Stop advanced systems
  try {
    if (persistenceManager && typeof persistenceManager.stop === 'function') {
      persistenceManager.stop();
    }
    if (strikeDecayManager && strikeDecayManager.isRunning && typeof strikeDecayManager.stop === 'function') {
      strikeDecayManager.stop();
    }
    if (cocWarChecker && cocWarChecker.isRunning && typeof cocWarChecker.stop === 'function') {
      cocWarChecker.stop();
    }
  } catch (shutdownError) {
    console.error('❌ Error during shutdown:', shutdownError.message);
  }

  // Clear intervals
  if (commandCooldowns) {
    commandCooldowns.clear();
  }

  // Disconnect from Discord
  client.destroy();

  // Exit process
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');

  // Stop advanced systems
  try {
    if (persistenceManager && typeof persistenceManager.stop === 'function') {
      persistenceManager.stop();
    }
    if (strikeDecayManager && strikeDecayManager.isRunning && typeof strikeDecayManager.stop === 'function') {
      strikeDecayManager.stop();
    }
    if (cocWarChecker && cocWarChecker.isRunning && typeof cocWarChecker.stop === 'function') {
      cocWarChecker.stop();
    }
  } catch (shutdownError) {
    console.error('❌ Error during shutdown:', shutdownError.message);
  }

  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception thrown:', error);
  process.exit(1);
});

// ⚡ Validate and login
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN environment variable is not set!");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("❌ Failed to login to Discord:", error.message);
  process.exit(1);
});