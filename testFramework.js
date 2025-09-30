const { EmbedBuilder } = require('discord.js');

class BotTestFramework {
  constructor(client, databases) {
    this.client = client;
    this.databases = databases;
    this.testResults = [];
    this.totalTests = 0;
    this.passedTests = 0;
  }

  // Add test result
  addTestResult(testName, passed, message = '', error = null) {
    this.totalTests++;
    if (passed) this.passedTests++;

    this.testResults.push({
      name: testName,
      passed,
      message,
      error: error ? error.message : null,
      timestamp: new Date()
    });

    console.log(`${passed ? '✅' : '❌'} ${testName}: ${message}`);
  }

  // Test database operations
  async testDatabaseOperations() {
    console.log('🧪 Testing database operations...');

    try {
      // Test Strike model
      const testStrike = await this.databases.Strike.findOne({}).limit(1);
      this.addTestResult('Strike Model Access', true, 'Successfully accessed Strike collection');

      // Test GuildSettings model
      const testGuildSettings = await this.databases.GuildSettings.findOne({}).limit(1);
      this.addTestResult('GuildSettings Model Access', true, 'Successfully accessed GuildSettings collection');

      // Test basic query operations
      const strikeCount = await this.databases.Strike.countDocuments({});
      this.addTestResult('Database Query Operations', true, `Found ${strikeCount} strike records`);

    } catch (error) {
      this.addTestResult('Database Operations', false, 'Database connection failed', error);
    }
  }

  // Test permission system
  async testPermissionSystem() {
    console.log('🧪 Testing permission system...');

    try {
      const { hasModeratorPermissions } = require('../utils/permissions');

      if (typeof hasModeratorPermissions === 'function') {
        this.addTestResult('Permission Function', true, 'hasModeratorPermissions function available');
      } else {
        this.addTestResult('Permission Function', false, 'hasModeratorPermissions function not found');
      }

      // Test cooldown system
      const { isOnCooldown } = require('../utils/cooldownManager');
      if (typeof isOnCooldown === 'function') {
        this.addTestResult('Cooldown System', true, 'Cooldown management available');
      } else {
        this.addTestResult('Cooldown System', false, 'Cooldown system not found');
      }

    } catch (error) {
      this.addTestResult('Permission System', false, 'Permission system error', error);
    }
  }

  // Test utility functions
  async testUtilityFunctions() {
    console.log('🧪 Testing utility functions...');

    try {
      // Test logging utility
      const { logAction } = require('../utils/logging');
      this.addTestResult('Logging Utility', typeof logAction === 'function', 
        typeof logAction === 'function' ? 'Log function available' : 'Log function missing');

      // Test role manager
      const { updateRole } = require('../utils/roleManager');
      this.addTestResult('Role Manager', typeof updateRole === 'function',
        typeof updateRole === 'function' ? 'Role update function available' : 'Role manager missing');

      // Test COC API utilities
      const { validateCocApiKey } = require('../utils/cocApi');
      this.addTestResult('COC API Utilities', typeof validateCocApiKey === 'function',
        typeof validateCocApiKey === 'function' ? 'COC API utilities available' : 'COC API missing');

    } catch (error) {
      this.addTestResult('Utility Functions', false, 'Utility function error', error);
    }
  }

  // Test strike system
  async testStrikeSystem() {
    console.log('🧪 Testing strike system...');

    try {
      const { strikeReasons } = require('../config/strikes');

      if (strikeReasons && typeof strikeReasons === 'object') {
        const reasonCount = Object.keys(strikeReasons).length;
        this.addTestResult('Strike Reasons Configuration', true, `${reasonCount} strike reasons configured`);

        // Verify strike reason structure
        let validStructure = true;
        for (const [key, value] of Object.entries(strikeReasons)) {
          if (!value.strikes || !value.reason) {
            validStructure = false;
            break;
          }
        }

        this.addTestResult('Strike Reason Structure', validStructure, 
          validStructure ? 'All strike reasons properly structured' : 'Invalid strike reason structure');

      } else {
        this.addTestResult('Strike Configuration', false, 'Strike reasons not found');
      }

    } catch (error) {
      this.addTestResult('Strike System', false, 'Strike system error', error);
    }
  }

  // Test command system
  async testCommandSystem() {
    console.log('🧪 Testing command system...');

    try {
      const CommandLoader = require('../utils/commandLoader');

      if (CommandLoader) {
        this.addTestResult('Command Loader', true, 'Command loader available');

        // Test command loader instantiation
        const testLoader = new CommandLoader();
        this.addTestResult('Command Loader Instance', true, 'Successfully created command loader instance');

      } else {
        this.addTestResult('Command Loader', false, 'Command loader not found');
      }

      // Test context manager
      const ContextManager = require('../utils/contextManager');
      if (ContextManager) {
        this.addTestResult('Context Manager', true, 'Context manager available');
      } else {
        this.addTestResult('Context Manager', false, 'Context manager not found');
      }

    } catch (error) {
      this.addTestResult('Command System', false, 'Command system error', error);
    }
  }

  // Generate comprehensive report
  generateReport() {
    const failedTests = this.totalTests - this.passedTests;
    const successRate = this.totalTests > 0 ? ((this.passedTests / this.totalTests) * 100).toFixed(1) : 0;

    let color = 0x00FF00; // Green for all pass
    if (failedTests > 0) color = 0xFFFF00; // Yellow for some failures
    if (this.passedTests === 0) color = 0xFF0000; // Red for all failures

    const embed = new EmbedBuilder()
      .setTitle('🧪 Comprehensive Bot Test Report')
      .setDescription(`**Test Summary:**\n✅ **Passed:** ${this.passedTests}\n❌ **Failed:** ${failedTests}\n📊 **Success Rate:** ${successRate}%`)
      .setColor(color)
      .setTimestamp();

    // Add individual test results (limit to 10 for embed size)
    const displayResults = this.testResults.slice(0, 20);

    displayResults.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      let value = test.message;
      if (!test.passed && test.error) {
        value += `\nError: ${test.error.substring(0, 100)}`;
      }

      embed.addFields({
        name: `${status} ${test.name}`,
        value: value,
        inline: true
      });
    });

    // Add summary footer
    if (this.testResults.length > 20) {
      embed.setFooter({ text: `Showing 20 of ${this.testResults.length} tests. Check console for full results.` });
    }

    return embed;
  }

  // Run all tests
  async runAllTests() {
    this.testResults = [];
    this.totalTests = 0;
    this.passedTests = 0;

    console.log('🚀 Starting comprehensive bot tests...');

    try {
      await this.testDatabaseOperations();
      await this.testPermissionSystem();
      await this.testUtilityFunctions();
      await this.testStrikeSystem();
      await this.testCommandSystem();

      console.log(`🎯 Test suite completed: ${this.passedTests}/${this.totalTests} passed`);

    } catch (error) {
      console.error('❌ Test suite error:', error.message);
      this.addTestResult('Test Suite Execution', false, 'Critical test suite error', error);
    }

    return this.generateReport();
  }
}

module.exports = { BotTestFramework };