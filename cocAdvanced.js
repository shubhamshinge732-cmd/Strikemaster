
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getCocClanInfo, getCocCurrentWar, getCocPlayer } = require('./cocApi');

class COCWarStrategyAssistant {
  constructor() {
    this.attackStrategies = {
      th13: [
        { name: 'LavaLoon', troops: 'Lava Hound x2, Balloon x28, Minion x5', spells: 'Rage x2, Freeze x2, Haste x2, Poison' },
        { name: 'Hybrid', troops: 'Golem x1, Wizard x8, Hog Rider x12, Miner x12', spells: 'Jump x1, Heal x4, Rage x1, Poison x2' },
        { name: 'Queen Walk Miner', troops: 'Miner x28, Baby Dragon x4, Wizard x4', spells: 'Rage x1, Heal x5, Poison x2' }
      ],
      th12: [
        { name: 'Electro Dragon', troops: 'Electro Dragon x8, Balloon x8, Minion x4', spells: 'Rage x2, Freeze x2, Clone x2' },
        { name: 'Bowitch', troops: 'Bowler x5, Witch x8, Wizard x8, Healer x2', spells: 'Jump x1, Rage x2, Heal x2, Poison x2' }
      ]
    };
  }

  // Generate attack strategy based on enemy base
  async generateAttackStrategy(enemyBase, attackerTH) {
    const strategies = this.attackStrategies[`th${attackerTH}`] || [];
    
    if (strategies.length === 0) {
      return {
        recommended: null,
        alternatives: [],
        note: 'No strategies available for this Town Hall level'
      };
    }

    // Select best strategy based on enemy base analysis
    const recommended = this.selectBestStrategy(enemyBase, strategies);
    const alternatives = strategies.filter(s => s !== recommended).slice(0, 2);

    return {
      recommended,
      alternatives,
      confidence: this.calculateConfidence(enemyBase, recommended),
      notes: this.generateStrategyNotes(enemyBase, recommended)
    };
  }

  // Select best strategy for enemy base
  selectBestStrategy(enemyBase, strategies) {
    // Simple selection logic - would be more sophisticated in practice
    if (enemyBase.baseType === 'war' && enemyBase.defensiveScore > 80) {
      return strategies.find(s => s.name.includes('Hybrid')) || strategies[0];
    }
    
    if (enemyBase.weaknesses.some(w => w.includes('air'))) {
      return strategies.find(s => s.name.includes('Lava') || s.name.includes('Electro')) || strategies[0];
    }

    return strategies[0];
  }

  // Calculate confidence in strategy
  calculateConfidence(enemyBase, strategy) {
    let confidence = 70; // Base confidence

    if (enemyBase.defensiveScore < 60) confidence += 20;
    else if (enemyBase.defensiveScore > 85) confidence -= 15;

    if (enemyBase.weaknesses.length > 3) confidence += 10;
    if (enemyBase.strengths.length > 4) confidence -= 10;

    return Math.max(30, Math.min(95, confidence));
  }

  // Generate strategy-specific notes
  generateStrategyNotes(enemyBase, strategy) {
    const notes = [
      `💡 Focus on exploiting ${enemyBase.weaknesses[0] || 'defensive gaps'}`,
      `⚠️ Watch out for ${enemyBase.strengths[0] || 'strong defenses'}`,
      `🎯 ${strategy.name} is effective against ${enemyBase.baseType} bases`
    ];

    return notes;
  }
}

class COCDonationTracker {
  constructor() {
    this.donationEfficiency = new Map();
    this.requestFulfillment = new Map();
  }

  // Track donation efficiency for clan members
  async trackDonationEfficiency(clanTag, apiKey) {
    try {
      const clanInfo = await getCocClanInfo(clanTag, apiKey);
      if (!clanInfo.success) return null;

      const members = clanInfo.data.memberList || [];
      const efficiency = [];

      for (const member of members) {
        const donated = member.donations || 0;
        const received = member.donationsReceived || 0;
        const ratio = received > 0 ? (donated / received) : donated > 0 ? 999 : 0;

        const memberEfficiency = {
          name: member.name,
          tag: member.tag,
          donated,
          received,
          ratio: ratio === 999 ? '∞' : ratio.toFixed(2),
          status: this.getDonationStatus(donated, received, ratio),
          rank: member.clanRank
        };

        efficiency.push(memberEfficiency);
      }

      // Sort by donation ratio (higher is better)
      efficiency.sort((a, b) => {
        const aRatio = a.ratio === '∞' ? 999 : parseFloat(a.ratio);
        const bRatio = b.ratio === '∞' ? 999 : parseFloat(b.ratio);
        return bRatio - aRatio;
      });

      return {
        clanName: clanInfo.data.name,
        totalMembers: members.length,
        efficiency,
        topDonors: efficiency.slice(0, 5),
        needsHelp: efficiency.filter(m => m.status === 'needs-improvement').slice(0, 5),
        avgRatio: this.calculateAverageRatio(efficiency)
      };
    } catch (error) {
      console.error('Donation tracking error:', error.message);
      return null;
    }
  }

  // Get donation status based on ratios
  getDonationStatus(donated, received, ratio) {
    if (donated === 0 && received === 0) return 'inactive';
    if (ratio >= 2) return 'excellent';
    if (ratio >= 1) return 'good';
    if (ratio >= 0.5) return 'fair';
    return 'needs-improvement';
  }

  // Calculate average donation ratio for clan
  calculateAverageRatio(efficiency) {
    const validRatios = efficiency
      .filter(m => m.ratio !== '∞' && m.received > 0)
      .map(m => parseFloat(m.ratio));

    if (validRatios.length === 0) return 0;
    return (validRatios.reduce((sum, ratio) => sum + ratio, 0) / validRatios.length).toFixed(2);
  }
}

class COCLiveCommentary {
  constructor() {
    this.warEvents = [];
    this.lastCheck = null;
  }

  // Generate live war commentary
  async generateWarCommentary(clanTag, apiKey) {
    try {
      const warData = await getCocCurrentWar(clanTag, apiKey);
      if (!warData.success) return null;

      const war = warData.data;
      const commentary = {
        warStatus: war.state,
        timeRemaining: this.calculateTimeRemaining(war.endTime),
        currentScore: `${war.clan.stars} - ${war.opponent.stars}`,
        recentAttacks: this.analyzeRecentAttacks(war.clan.members, war.opponent.members),
        predictions: this.generateWarPredictions(war),
        keyMoments: this.identifyKeyMoments(war),
        nextRecommendations: this.getNextRecommendations(war)
      };

      return commentary;
    } catch (error) {
      console.error('War commentary error:', error.message);
      return null;
    }
  }

  // Calculate time remaining in war
  calculateTimeRemaining(endTime) {
    if (!endTime) return 'Unknown';
    
    const now = new Date();
    const end = new Date(endTime);
    const remaining = end - now;

    if (remaining <= 0) return 'War Ended';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }

  // Analyze recent attacks
  analyzeRecentAttacks(clanMembers, opponentMembers) {
    const recentAttacks = [];
    
    // This would analyze attack timestamps and results
    // For now, providing structure for implementation
    
    return {
      totalAttacks: 0,
      recentAttacks: recentAttacks.slice(-5),
      avgStars: 0,
      lastAttackTime: null
    };
  }

  // Generate war predictions
  generateWarPredictions(war) {
    const clanStars = war.clan.stars;
    const opponentStars = war.opponent.stars;
    const clanAttacksUsed = war.clan.attacks || 0;
    const opponentAttacksUsed = war.opponent.attacks || 0;
    const totalMembers = war.teamSize;

    // Simple prediction logic
    const clanPotential = totalMembers * 2; // Max possible stars
    const opponentPotential = totalMembers * 2;

    const clanWinChance = this.calculateWinChance(clanStars, opponentStars, clanAttacksUsed, opponentAttacksUsed, totalMembers);

    return {
      clanWinChance: clanWinChance,
      opponentWinChance: 100 - clanWinChance,
      predictedFinalScore: this.predictFinalScore(war),
      keyFactors: this.identifyKeyFactors(war)
    };
  }

  // Calculate win chance
  calculateWinChance(clanStars, opponentStars, clanAttacks, opponentAttacks, totalMembers) {
    let winChance = 50; // Base 50/50

    // Adjust based on current star difference
    const starDiff = clanStars - opponentStars;
    winChance += starDiff * 10;

    // Adjust based on attacks remaining
    const clanAttacksRemaining = (totalMembers * 2) - clanAttacks;
    const opponentAttacksRemaining = (totalMembers * 2) - opponentAttacks;
    const attackAdvantage = clanAttacksRemaining - opponentAttacksRemaining;
    winChance += attackAdvantage * 2;

    return Math.max(5, Math.min(95, Math.round(winChance)));
  }

  // Predict final score
  predictFinalScore(war) {
    // Simple prediction - would be more sophisticated in practice
    const clanProjected = war.clan.stars + Math.floor(Math.random() * 10);
    const opponentProjected = war.opponent.stars + Math.floor(Math.random() * 10);

    return `${clanProjected} - ${opponentProjected}`;
  }

  // Identify key factors
  identifyKeyFactors(war) {
    return [
      'Attack efficiency of top players',
      'Remaining attacks distribution',
      'Base difficulty matching',
      'Time pressure factor'
    ];
  }

  // Identify key moments in war
  identifyKeyMoments(war) {
    return [
      'War started with strong opening attacks',
      'Mid-war momentum shift detected',
      'Critical attacks coming up in next hour'
    ];
  }

  // Get recommendations for next phase
  getNextRecommendations(war) {
    return [
      'Focus on 3-star attempts on lower bases',
      'Save top attackers for difficult targets',
      'Coordinate attack timing with clan leadership',
      'Review base analysis for optimal strategy'
    ];
  }
}

module.exports = {
  COCWarStrategyAssistant,
  COCDonationTracker,
  COCLiveCommentary
};
