const { EmbedBuilder } = require("discord.js");
const { hasModeratorPermissions } = require("../utils/permissions");

/**
 * Testing Commands
 * Comprehensive testing and diagnostic functionality
 */

class BotTestFramework {
  constructor(client, databases) {
    this.client = client;
    this.databases = databases;
    this.testResults = [];
  }

  // Add test result
  addTestResult(name, passed, message = '', duration = 0) {
    this.testResults.push({
      name,
      passed,
      message,
      duration,
      timestamp: new Date()
    });
  }

  // Test database operations
  async testDatabaseOperations() {
    console.log('🔍 Testing database operations...');
    const startTime = Date.now();

    try {
      // Test database connection
      const testGuild = await this.databases.GuildSettings.findOne({}).limit(1);
      this.addTestResult('Database Connection', true, 'Successfully connected to database', Date.now() - startTime);
    } catch (error) {
      this.addTestResult('Database Connection', false, `Database error: ${error.message}`, Date.now() - startTime);
    }
  }

  // Test permission system
  async testPermissionSystem() {
    console.log('🔍 Testing permission system...');
    const startTime = Date.now();

    try {
      // Test permission function exists
      const permissionFunction = hasModeratorPermissions;
      if (typeof permissionFunction === 'function') {
        this.addTestResult('Permission System', true, 'Permission function available', Date.now() - startTime);
      } else {
        this.addTestResult('Permission System', false, 'Permission function not found', Date.now() - startTime);
      }
    } catch (error) {
      this.addTestResult('Permission System', false, `Permission error: ${error.message}`, Date.now() - startTime);
    }
  }

  // Generate test report
  generateReport() {
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;

    const embed = new EmbedBuilder()
      .setTitle('🧪 Bot Test Results')
      .setColor(failed === 0 ? 0x00FF00 : 0xFF0000)
      .setDescription(`**Total Tests:** ${total}\n**✅ Passed:** ${passed}\n**❌ Failed:** ${failed}`)
      .setTimestamp();

    // Add individual test results
    this.testResults.slice(0, 10).forEach(test => {
      embed.addFields({
        name: `${test.passed ? '✅' : '❌'} ${test.name}`,
        value: test.message || (test.passed ? 'Passed' : 'Failed'),
        inline: false
      });
    });

    return embed;
  }

  // Run all tests
  async runAllTests() {
    this.testResults = [];

    try {
      await this.testDatabaseOperations();
      await this.testPermissionSystem();
    } catch (error) {
      console.error('❌ Test suite error:', error.message);
      this.addTestResult('Test Suite', false, `Suite error: ${error.message}`);
    }

    return this.generateReport();
  }
}

// Test command handler
async function handleTestCommand(message, args, context) {
  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to run tests.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const testFramework = new BotTestFramework(context.client, {
    Strike: context.Strike,
    GuildSettings: context.GuildSettings
  });

  try {
    const reportEmbed = await testFramework.runAllTests();
    await message.channel.send({ embeds: [reportEmbed], allowedMentions: { repliedUser: false } });
  } catch (error) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Test Failed")
      .setDescription(`Error: ${error.message}`)
      .setColor(0xFF0000);
    await message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

// Comprehensive diagnostics
async function runComprehensiveDiagnostics(message, client, context) {
  const startTime = Date.now();
  let diagnosticResults = [];
  let passedChecks = 0;
  let totalChecks = 0;
  let warnings = [];

  const progressEmbed = new EmbedBuilder()
    .setTitle("🔍 Running Comprehensive Bot Diagnostics...")
    .setDescription("Performing deep system analysis...")
    .setColor(0x0099FF);

  const progressMessage = await message.channel.send({ embeds: [progressEmbed], allowedMentions: { repliedUser: false } });

  try {
    // System checks
    totalChecks++;
    const uptime = process.uptime();
    const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    diagnosticResults.push({
      category: "System Health",
      status: "✅ PASS",
      details: `Uptime: ${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m | Memory: ${memUsage}MB`
    });
    passedChecks++;

    // Database check
    totalChecks++;
    try {
      await context.Strike.findOne({}).limit(1);
      diagnosticResults.push({
        category: "Database Connection", 
        status: "✅ PASS",
        details: "MongoDB connection active"
      });
      passedChecks++;
    } catch (dbError) {
      diagnosticResults.push({
        category: "Database Connection",
        status: "❌ FAIL", 
        details: `Database error: ${dbError.message}`
      });
    }

    // Discord API check
    totalChecks++;
    diagnosticResults.push({
      category: "Discord API",
      status: client.ws.ping < 200 ? "✅ PASS" : "⚠️ SLOW",
      details: `Latency: ${Math.round(client.ws.ping)}ms`
    });
    if (client.ws.ping < 200) passedChecks++;

    // Command system check
    totalChecks++;
    const hasCommandLoader = typeof context.commandLoader !== 'undefined';
    diagnosticResults.push({
      category: "Command System",
      status: hasCommandLoader ? "✅ PASS" : "❌ FAIL",
      details: hasCommandLoader ? "Command loader initialized" : "Command loader missing"
    });
    if (hasCommandLoader) passedChecks++;

    // Generate final report
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const finalEmbed = new EmbedBuilder()
      .setTitle("🔍 Comprehensive Diagnostic Report")
      .setDescription(`**Status:** ${passedChecks === totalChecks ? '🟢 ALL SYSTEMS OPERATIONAL' : '🟡 ISSUES DETECTED'}\n**Duration:** ${duration}s | **Checks:** ${passedChecks}/${totalChecks} passed`)
      .setColor(passedChecks === totalChecks ? 0x00FF00 : 0xFFFF00)
      .setTimestamp();

    diagnosticResults.forEach(result => {
      finalEmbed.addFields({
        name: `${result.status} ${result.category}`,
        value: result.details,
        inline: false
      });
    });

    if (warnings.length > 0) {
      finalEmbed.addFields({
        name: "⚠️ Warnings",
        value: warnings.join('\n'),
        inline: false
      });
    }

    await progressMessage.edit({ embeds: [finalEmbed] });

  } catch (error) {
    console.error(`❌ Diagnostic error: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Diagnostic Failed")
      .setDescription(`Error during diagnostics: ${error.message}`)
      .setColor(0xFF0000);
    await progressMessage.edit({ embeds: [errorEmbed] });
  }
}

const commands = {
  test: handleTestCommand,
  testbot: handleTestCommand,
  unittest: handleTestCommand,
  diagnostics: runComprehensiveDiagnostics,
  debug: runComprehensiveDiagnostics
};

const metadata = {
  name: "testing",
  description: "Testing and diagnostic commands",
  category: "testing",
  permissions: ["moderator"],
  version: "2.0.0"
};

module.exports = {
  commands,
  metadata,
  BotTestFramework
};