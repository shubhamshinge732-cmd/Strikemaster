
const { EmbedBuilder } = require("discord.js");
const { AIBehaviorAnalyzer, NLPViolationDetector } = require("../utils/aiAnalysis");

async function handleRiskAnalysis(message, args, context) {
  const { hasModeratorPermissions } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to use AI risk analysis.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const user = message.mentions.users.first();
  if (!user) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!riskanalysis @user`\n\n**Example:** `!riskanalysis @username`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const analyzer = new AIBehaviorAnalyzer();
    const analysis = await analyzer.analyzeUserRisk(user.id, message.guild.id, message.client);

    const riskLevel = analysis.risk >= 0.7 ? 'HIGH' : analysis.risk >= 0.5 ? 'MODERATE' : analysis.risk >= 0.3 ? 'LOW-MODERATE' : 'LOW';
    const riskColor = analysis.risk >= 0.7 ? 0xFF0000 : analysis.risk >= 0.5 ? 0xFFA500 : analysis.risk >= 0.3 ? 0xFFFF00 : 0x00FF00;

    const embed = new EmbedBuilder()
      .setTitle(`🤖 AI Risk Analysis - ${user.username}`)
      .setDescription(`**Risk Level:** ${riskLevel} (${Math.round(analysis.risk * 100)}%)`)
      .setColor(riskColor)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { 
          name: "📊 Risk Factors", 
          value: analysis.factors.length > 0 ? analysis.factors.join('\n') : 'No significant risk factors identified', 
          inline: false 
        },
        { 
          name: "💡 Recommendations", 
          value: analysis.recommendations.slice(0, 3).join('\n'), 
          inline: false 
        }
      )
      .setFooter({ text: "AI-powered behavioral analysis" })
      .setTimestamp();

    if (analysis.analysis?.strikeHistory?.pattern !== 'clean') {
      embed.addFields({
        name: "📈 Pattern Analysis",
        value: `Detected pattern: **${analysis.analysis.strikeHistory.pattern}**`,
        inline: true
      });
    }

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    console.error(`AI Risk Analysis error: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Analysis Failed")
      .setDescription(`Error performing risk analysis: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

async function handleServerRiskReport(message, args, context) {
  const { hasModeratorPermissions } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to generate server risk reports.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const loadingEmbed = new EmbedBuilder()
    .setTitle("🤖 Generating AI Risk Report...")
    .setDescription("Analyzing all users with strikes...")
    .setColor(0x0099FF);

  const loadingMessage = await message.channel.send({ embeds: [loadingEmbed], allowedMentions: { repliedUser: false } });

  try {
    const analyzer = new AIBehaviorAnalyzer();
    const report = await analyzer.generateServerRiskReport(message.guild.id, message.client);

    if (!report) {
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Report Generation Failed")
        .setDescription("Unable to generate risk report.")
        .setColor(0xFF0000);
      return loadingMessage.edit({ embeds: [errorEmbed] });
    }

    const riskColor = report.overallServerRisk >= 0.7 ? 0xFF0000 : 
                     report.overallServerRisk >= 0.5 ? 0xFFA500 : 
                     report.overallServerRisk >= 0.3 ? 0xFFFF00 : 0x00FF00;

    const embed = new EmbedBuilder()
      .setTitle(`🤖 Server Risk Analysis Report`)
      .setDescription(`**Overall Server Risk:** ${Math.round(report.overallServerRisk * 100)}%`)
      .setColor(riskColor)
      .addFields(
        { 
          name: "📊 Risk Distribution", 
          value: `🔴 **High Risk:** ${report.highRiskUsers} users\n🟡 **Moderate Risk:** ${report.moderateRiskUsers} users\n🟢 **Low Risk:** ${report.lowRiskUsers} users`, 
          inline: true 
        },
        { 
          name: "📈 Total Analysis", 
          value: `**Total Users:** ${report.totalUsers}\n**Users Analyzed:** ${report.topRiskUsers.length}`, 
          inline: true 
        }
      );

    if (report.topRiskUsers.length > 0) {
      const topRiskList = report.topRiskUsers.slice(0, 5).map((user, index) => {
        const riskEmoji = user.risk >= 0.7 ? '🔴' : user.risk >= 0.5 ? '🟡' : '🟠';
        return `${riskEmoji} <@${user.userId}> - ${Math.round(user.risk * 100)}% risk`;
      }).join('\n');

      embed.addFields({
        name: "⚠️ Top Risk Users",
        value: topRiskList,
        inline: false
      });
    }

    embed.setFooter({ text: "AI-powered server analysis" })
         .setTimestamp();

    return loadingMessage.edit({ embeds: [embed] });

  } catch (error) {
    console.error(`Server risk report error: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Report Failed")
      .setDescription(`Error generating server risk report: ${error.message}`)
      .setColor(0xFF0000);
    return loadingMessage.edit({ embeds: [errorEmbed] });
  }
}

// Helper functions for predictions
function generatePrediction(risk, currentStrikes) {
  if (risk >= 0.8) return "Very likely to receive additional strikes";
  if (risk >= 0.6) return "May receive strikes without intervention";
  if (risk >= 0.4) return "Moderate risk of rule violations";
  return "Low risk of future violations";
}

function getPredictionTimeframe(risk) {
  if (risk >= 0.8) return "Within 1-2 weeks";
  if (risk >= 0.6) return "Within 2-4 weeks";
  if (risk >= 0.4) return "Within 1-2 months";
  return "More than 2 months";
}

async function handleSmartPrediction(message, args, context) {
  const { hasModeratorPermissions, Strike } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to use smart predictions.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    // Get users who might be at risk
    const usersWithStrikes = await Strike.find({ 
      guildId: message.guild.id, 
      strikes: { $gte: 2 } 
    }).sort({ strikes: -1 }).limit(10);

    if (usersWithStrikes.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle("🤖 Smart Predictions")
        .setDescription("✅ No users currently at elevated risk levels!")
        .setColor(0x00FF00);
      return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }

    const analyzer = new AIBehaviorAnalyzer();
    const predictions = [];

    for (const userRecord of usersWithStrikes.slice(0, 5)) {
      const analysis = await analyzer.analyzeUserRisk(userRecord.userId, message.guild.id, message.client);
      const user = await message.client.users.fetch(userRecord.userId).catch(() => null);
      
      if (analysis.risk > 0.4 && user) {
        predictions.push({
          user,
          currentStrikes: userRecord.strikes,
          risk: analysis.risk,
          prediction: generatePrediction(analysis.risk, userRecord.strikes),
          timeframe: getPredictionTimeframe(analysis.risk)
        });
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🤖 Smart Strike Predictions")
      .setDescription("AI-powered predictions based on behavior analysis")
      .setColor(0x0099FF);

    if (predictions.length === 0) {
      embed.addFields({
        name: "✅ Good News!",
        value: "No users show elevated risk patterns for future violations.",
        inline: false
      });
    } else {
      for (const prediction of predictions) {
        const riskEmoji = prediction.risk >= 0.7 ? '🚨' : prediction.risk >= 0.5 ? '⚠️' : '📊';
        embed.addFields({
          name: `${riskEmoji} ${prediction.user.username}`,
          value: `**Current:** ${prediction.currentStrikes} strikes\n**Risk Level:** ${Math.round(prediction.risk * 100)}%\n**Prediction:** ${prediction.prediction}\n**Timeframe:** ${prediction.timeframe}`,
          inline: true
        });
      }
    }

    embed.setFooter({ text: "Predictions are based on behavioral patterns and historical data" })
         .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    console.error(`Smart prediction error: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Prediction Failed")
      .setDescription(`Error generating predictions: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

// Helper function to get recommendation text
function getRecommendationText(recommendation) {
  const recommendations = {
    'immediate-action': '🚨 Immediate moderation required',
    'warning-required': '⚠️ Issue warning to user',
    'monitor-closely': '👁️ Monitor user closely',
    'note-behavior': '📝 Note for future reference',
    'no-action': '✅ No action required'
  };
  return recommendations[recommendation] || 'Unknown recommendation';
}

async function handleMessageAnalysis(message, args, context) {
  const { hasModeratorPermissions } = context;

  if (!hasModeratorPermissions(message.member)) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Permission Denied")
      .setDescription("You don't have permission to use message analysis.")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  const messageToAnalyze = args.join(' ');
  if (!messageToAnalyze) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid Usage")
      .setDescription("**Usage:** `!analyzemessage <message content>`\n\n**Example:** `!analyzemessage Hey stupid, shut up!`")
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });
  }

  try {
    const detector = new NLPViolationDetector();
    const analysis = detector.analyzeMessage(messageToAnalyze);

    const severityColor = analysis.overallSeverity >= 0.8 ? 0xFF0000 :
                         analysis.overallSeverity >= 0.6 ? 0xFFA500 :
                         analysis.overallSeverity >= 0.4 ? 0xFFFF00 :
                         analysis.overallSeverity >= 0.2 ? 0x0099FF : 0x00FF00;

    const embed = new EmbedBuilder()
      .setTitle("🤖 Message Analysis Results")
      .setDescription(`**Overall Severity:** ${Math.round(analysis.overallSeverity * 100)}%`)
      .setColor(severityColor)
      .addFields(
        { 
          name: "📝 Analyzed Message", 
          value: `\`${messageToAnalyze.substring(0, 200)}${messageToAnalyze.length > 200 ? '...' : ''}\``, 
          inline: false 
        },
        { 
          name: "🎯 Violation Status", 
          value: analysis.hasViolations ? "⚠️ Violations Detected" : "✅ No Violations Found", 
          inline: true 
        },
        { 
          name: "🤖 Recommendation", 
          value: getRecommendationText(analysis.recommendation), 
          inline: true 
        }
      );

    if (analysis.violations.length > 0) {
      const violationsList = analysis.violations.map(v => 
        `• **${v.type}** (${Math.round(v.severity * 100)}%) - ${v.matches} matches`
      ).join('\n');

      embed.addFields({
        name: "⚠️ Detected Violations",
        value: violationsList,
        inline: false
      });
    }

    embed.setFooter({ text: "AI-powered natural language processing" })
         .setTimestamp();

    return message.channel.send({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    console.error(`Message analysis error: ${error.message}`);
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Analysis Failed")
      .setDescription(`Error analyzing message: ${error.message}`)
      .setColor(0xFF0000);
    return message.channel.send({ embeds: [errorEmbed], allowedMentions: { repliedUser: false } });
  }
}

const commands = {
  riskanalysis: handleRiskAnalysis,
  serverrisk: handleServerRiskReport,
  smartpredict: handleSmartPrediction,
  analyzemessage: handleMessageAnalysis
};

const metadata = {
  name: "ai",
  description: "AI-powered behavior analysis and predictions",
  category: "ai",
  permissions: ["moderator"],
  version: "1.0.0"
};

module.exports = {
  commands,
  metadata
};
