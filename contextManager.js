/**
 * Context Manager
 * Provides consistent context and utilities to all command groups
 */
class ContextManager {
  constructor(client, models, utils) {
    this.client = client;
    this.models = models;
    this.utils = utils;
  }

  /**
   * Create execution context for command
   */
  createContext(message) {
    return {
      // Core Discord.js client
      client: this.client,

      // Database models
      Strike: this.models.Strike,
      GuildSettings: this.models.GuildSettings,

      // Utility functions
      hasModeratorPermissions: this.utils.hasModeratorPermissions,
      isOnCooldown: this.utils.isOnCooldown,
      updateRole: this.utils.updateRole,
      logAction: this.utils.logAction,
      rateLimitedDelay: this.utils.rateLimitedDelay,

      // Strike system
      strikeReasons: this.utils.strikeReasons,
      handleStrikeApplication: this.utils.handleStrikeApplication,
      handleStrikeRemoval: this.utils.handleStrikeRemoval,

      // Season reset functions
      isOnSeasonResetCooldown: this.utils.isOnSeasonResetCooldown,
      setSeasonResetCooldown: this.utils.setSeasonResetCooldown,

      // COC API functions (if configured)
      validateCocApiKey: this.utils.validateCocApiKey,
      getCocClanInfo: this.utils.getCocClanInfo,
      encryptApiKey: this.utils.encryptApiKey,
      decryptApiKey: this.utils.decryptApiKey,

      // Helper functions
      createHelpCategoryEmbed: this.utils.createHelpCategoryEmbed,
      isDatabaseConnected: this.utils.isDatabaseConnected,

      // Advanced systems
      strikeDecayManager: this.utils.strikeDecayManager,
      backupManager: this.utils.backupManager,
      cocWarChecker: this.utils.cocWarChecker,
      advancedNotifications: this.utils.advancedNotifications,

      // Guild and message context
      guild: message.guild,
      channel: message.channel,
      author: message.author,
      member: message.member,

      // Persistence Manager
      persistenceManager: this.utils.persistenceManager
    };
  }

  /**
   * Add new utility to context
   */
  addUtility(name, utility) {
    this.utils[name] = utility;
  }

  /**
   * Add new model to context
   */
  addModel(name, model) {
    this.models[name] = model;
  }
}

module.exports = ContextManager;