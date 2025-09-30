
const { EmbedBuilder } = require('discord.js');
const { Strike, GuildSettings } = require('../config/database');

class AIBehaviorAnalyzer {
  constructor() {
    this.riskFactors = {
      messagePattern: 0.3,
      activityPattern: 0.2,
      strikeHistory: 0.4,
      timePattern: 0.1
    };
  }

  // Analyze user behavior patterns to predict violation risk
  async analyzeUserRisk(userId, guildId, client) {
    try {
      // Input validation
      if (!userId || !guildId || !client) {
        console.warn('AI Analysis: Missing required parameters');
        return { risk: 0, factors: [], recommendations: ['Invalid input parameters'] };
      }

      const userRecord = await Strike.findOne({ userId, guildId });
      const guild = client.guilds.cache.get(guildId);
      
      if (!guild) {
        console.warn(`AI Analysis: Guild ${guildId} not found`);
        return { risk: 0, factors: [], recommendations: ['Guild not accessible'] };
      }

      const member = await guild.members.fetch(userId).catch(() => null);

      if (!member) {
        console.warn(`AI Analysis: Member ${userId} not found in guild ${guildId}`);
        return { risk: 0, factors: ['Member not found'], recommendations: ['User may have left the server'] };
      }

      const analysis = {
        strikeHistory: this.analyzeStrikeHistory(userRecord),
        activityPattern: await this.analyzeActivityPattern(member),
        messagePattern: await this.analyzeMessagePatterns(member),
        timePattern: this.analyzeTimePatterns(userRecord)
      };

      const riskScore = this.calculateRiskScore(analysis);
      const recommendations = this.generateRecommendations(riskScore, analysis);

      return {
        risk: Math.min(1, Math.max(0, riskScore)), // Ensure risk is between 0 and 1
        factors: this.identifyRiskFactors(analysis),
        recommendations,
        analysis
      };
    } catch (error) {
      console.error(`AI Analysis error for user ${userId}:`, error.message);
      return { 
        risk: 0, 
        factors: ['Analysis error'], 
        recommendations: [`Error in analysis: ${error.message.substring(0, 100)}`] 
      };
    }
  }

  // Analyze strike history patterns
  analyzeStrikeHistory(userRecord) {
    if (!userRecord || !userRecord.history) return { score: 0, pattern: 'clean' };

    const history = userRecord.history;
    const recentStrikes = history.filter(h => 
      new Date() - new Date(h.date) < 30 * 24 * 60 * 60 * 1000
    );

    const patterns = {
      frequency: recentStrikes.length > 3 ? 1 : recentStrikes.length / 3,
      severity: userRecord.strikes / 4,
      escalation: this.detectEscalation(history),
      repeatOffenses: this.detectRepeatOffenses(history)
    };

    return {
      score: Math.min(1, (patterns.frequency + patterns.severity + patterns.escalation + patterns.repeatOffenses) / 4),
      pattern: this.classifyPattern(patterns),
      details: patterns
    };
  }

  // Analyze user activity patterns
  async analyzeActivityPattern(member) {
    const joinedRecently = Date.now() - member.joinedAt < 7 * 24 * 60 * 60 * 1000;
    const hasRoles = member.roles.cache.size > 1;
    const isActive = member.presence?.status !== 'offline';

    const patterns = {
      newMember: joinedRecently ? 0.8 : 0,
      roleEngagement: hasRoles ? 0 : 0.5,
      presence: isActive ? 0 : 0.3
    };

    return {
      score: Math.min(1, Object.values(patterns).reduce((a, b) => a + b, 0) / 3),
      patterns
    };
  }

  // Analyze message patterns (placeholder for future NLP integration)
  async analyzeMessagePatterns(member) {
    // This would integrate with message history analysis
    // For now, returning basic metrics
    return {
      score: 0.1, // Low default risk
      toxicity: 0,
      spam: 0,
      ruleViolations: 0
    };
  }

  // Analyze time-based patterns
  analyzeTimePatterns(userRecord) {
    if (!userRecord?.history) return { score: 0 };

    const violations = userRecord.history.map(h => new Date(h.date));
    const timeGaps = [];

    for (let i = 1; i < violations.length; i++) {
      timeGaps.push(violations[i] - violations[i - 1]);
    }

    const averageGap = timeGaps.length > 0 ? timeGaps.reduce((a, b) => a + b, 0) / timeGaps.length : 0;
    const shortGaps = timeGaps.filter(gap => gap < 24 * 60 * 60 * 1000).length;

    return {
      score: shortGaps > 2 ? 0.8 : 0.2,
      patterns: { averageGap, shortGaps }
    };
  }

  // Calculate overall risk score
  calculateRiskScore(analysis) {
    return Math.min(1, 
      analysis.strikeHistory.score * this.riskFactors.strikeHistory +
      analysis.activityPattern.score * this.riskFactors.activityPattern +
      analysis.messagePattern.score * this.riskFactors.messagePattern +
      analysis.timePattern.score * this.riskFactors.timePattern
    );
  }

  // Generate risk-based recommendations
  generateRecommendations(riskScore, analysis) {
    const recommendations = [];

    if (riskScore > 0.7) {
      recommendations.push('🚨 High risk user - Consider proactive intervention');
      recommendations.push('👮 Assign temporary moderation watch');
    } else if (riskScore > 0.5) {
      recommendations.push('⚠️ Moderate risk - Monitor activity closely');
      recommendations.push('💬 Consider reaching out with guidance');
    } else if (riskScore > 0.3) {
      recommendations.push('📊 Low-moderate risk - Regular monitoring');
    } else {
      recommendations.push('✅ Low risk user');
    }

    if (analysis.strikeHistory.score > 0.6) {
      recommendations.push('📈 Pattern of escalating violations detected');
    }

    return recommendations;
  }

  // Identify specific risk factors
  identifyRiskFactors(analysis) {
    const factors = [];

    if (analysis.strikeHistory.score > 0.5) factors.push('Strike History Pattern');
    if (analysis.activityPattern.score > 0.5) factors.push('Activity Pattern Concerns');
    if (analysis.messagePattern.score > 0.5) factors.push('Message Pattern Analysis');
    if (analysis.timePattern.score > 0.5) factors.push('Time-based Violation Pattern');

    return factors;
  }

  // Detect escalation patterns
  detectEscalation(history) {
    if (history.length < 3) return 0;

    const recentHistory = history.slice(-5);
    let escalationCount = 0;

    for (let i = 1; i < recentHistory.length; i++) {
      if (recentHistory[i].strikesAdded > recentHistory[i - 1].strikesAdded) {
        escalationCount++;
      }
    }

    return escalationCount / (recentHistory.length - 1);
  }

  // Detect repeat offenses
  detectRepeatOffenses(history) {
    const reasons = history.map(h => h.reason.toLowerCase());
    const uniqueReasons = new Set(reasons);
    return 1 - (uniqueReasons.size / reasons.length);
  }

  // Classify behavior pattern
  classifyPattern(patterns) {
    if (patterns.frequency > 0.7) return 'frequent-offender';
    if (patterns.escalation > 0.5) return 'escalating';
    if (patterns.repeatOffenses > 0.5) return 'repeat-offender';
    if (patterns.severity > 0.7) return 'severe-violations';
    return 'standard';
  }

  // Generate server-wide risk report
  async generateServerRiskReport(guildId, client) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return null;

      const allStrikes = await Strike.find({ guildId });
      const riskAnalysis = [];

      for (const userRecord of allStrikes) {
        if (userRecord.strikes > 0) {
          const analysis = await this.analyzeUserRisk(userRecord.userId, guildId, client);
          if (analysis.risk > 0.3) {
            riskAnalysis.push({
              userId: userRecord.userId,
              currentStrikes: userRecord.strikes,
              ...analysis
            });
          }
        }
      }

      // Sort by risk score
      riskAnalysis.sort((a, b) => b.risk - a.risk);

      return {
        totalUsers: allStrikes.length,
        highRiskUsers: riskAnalysis.filter(u => u.risk > 0.7).length,
        moderateRiskUsers: riskAnalysis.filter(u => u.risk > 0.5 && u.risk <= 0.7).length,
        lowRiskUsers: riskAnalysis.filter(u => u.risk > 0.3 && u.risk <= 0.5).length,
        topRiskUsers: riskAnalysis.slice(0, 10),
        overallServerRisk: riskAnalysis.length > 0 ? riskAnalysis.reduce((sum, u) => sum + u.risk, 0) / riskAnalysis.length : 0
      };
    } catch (error) {
      console.error('Server risk report error:', error.message);
      return null;
    }
  }
}

// Natural Language Processing for violation detection (placeholder)
class NLPViolationDetector {
  constructor() {
    this.violationPatterns = [
      // Harassment patterns
      { pattern: /\b(stupid|idiot|moron|dumb)\b/gi, type: 'harassment', severity: 0.6 },
      { pattern: /\b(shut up|stfu|gtfo)\b/gi, type: 'harassment', severity: 0.7 },
      
      // Spam patterns
      { pattern: /(.)\1{10,}/g, type: 'spam', severity: 0.8 },
      { pattern: /[!@#$%^&*]{5,}/g, type: 'spam', severity: 0.6 },
      
      // Profanity patterns (basic example)
      { pattern: /\b(damn|hell|crap)\b/gi, type: 'profanity', severity: 0.3 },
      
      // Rule violation hints
      { pattern: /\b(ban|kick|mute)\s+(me|him|her)\b/gi, type: 'rule-violation', severity: 0.5 }
    ];
  }

  // Analyze message content for violations
  analyzeMessage(content) {
    const violations = [];
    let maxSeverity = 0;

    for (const { pattern, type, severity } of this.violationPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        violations.push({
          type,
          severity,
          matches: matches.length,
          pattern: pattern.source
        });
        maxSeverity = Math.max(maxSeverity, severity);
      }
    }

    return {
      hasViolations: violations.length > 0,
      violations,
      overallSeverity: maxSeverity,
      recommendation: this.getRecommendation(maxSeverity)
    };
  }

  // Get recommendation based on severity
  getRecommendation(severity) {
    if (severity > 0.8) return 'immediate-action';
    if (severity > 0.6) return 'warning-required';
    if (severity > 0.4) return 'monitor-closely';
    if (severity > 0.2) return 'note-behavior';
    return 'no-action';
  }
}

module.exports = {
  AIBehaviorAnalyzer,
  NLPViolationDetector
};
