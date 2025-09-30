
class PersistenceManager {
  constructor(client, databases) {
    this.client = client;
    this.Strike = databases.Strike;
    this.GuildSettings = databases.GuildSettings;
    this.recoveryInterval = null;
    this.isRecovering = false;
  }

  // Start the persistence recovery system
  async start() {
    console.log('🔄 Starting Persistence Recovery System...');
    
    // Check for incomplete operations on startup
    await this.recoverIncompleteOperations();
    
    // Set up periodic recovery checks
    this.recoveryInterval = setInterval(() => {
      this.recoverIncompleteOperations().catch(error => {
        console.error('❌ Error in persistence recovery:', error.message);
      });
    }, 5 * 60 * 1000); // Check every 5 minutes
    
    console.log('✅ Persistence Recovery System started');
  }

  // Stop the persistence system
  stop() {
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }
    console.log('⏸️ Persistence Recovery System stopped');
  }

  // Create a recovery point for any major operation
  async createRecoveryPoint(guildId, operationType, operationData, metadata = {}) {
    try {
      const recoveryId = `${operationType}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      await this.GuildSettings.findOneAndUpdate(
        { guildId },
        {
          $set: {
            [`activeOperations.${operationType}`]: {
              recoveryId,
              operationType,
              status: 'in_progress',
              startTime: new Date(),
              data: operationData,
              metadata,
              lastHeartbeat: new Date()
            },
            updatedAt: new Date()
          }
        },
        { upsert: true, maxTimeMS: 10000 } // Add timeout
      );

      console.log(`🔐 Created recovery point: ${operationType} for guild ${guildId}`);
      return recoveryId;
    } catch (error) {
      console.error(`❌ Failed to create recovery point: ${error.message}`);
      return null;
    }
  }

  // Update heartbeat for ongoing operation
  async updateHeartbeat(guildId, operationType, progress = null) {
    try {
      const updateData = {
        [`activeOperations.${operationType}.lastHeartbeat`]: new Date(),
        updatedAt: new Date()
      };

      if (progress !== null) {
        updateData[`activeOperations.${operationType}.progress`] = progress;
      }

      await this.GuildSettings.findOneAndUpdate(
        { guildId },
        { $set: updateData }
      );
    } catch (error) {
      console.error(`❌ Failed to update heartbeat: ${error.message}`);
    }
  }

  // Mark operation as completed
  async markOperationComplete(guildId, operationType, result = {}) {
    try {
      await this.GuildSettings.findOneAndUpdate(
        { guildId },
        {
          $unset: { [`activeOperations.${operationType}`]: "" },
          $set: {
            [`completedOperations.${operationType}_${Date.now()}`]: {
              operationType,
              completedAt: new Date(),
              result
            },
            updatedAt: new Date()
          }
        }
      );

      console.log(`✅ Marked operation complete: ${operationType} for guild ${guildId}`);
    } catch (error) {
      console.error(`❌ Failed to mark operation complete: ${error.message}`);
    }
  }

  // Recover incomplete operations across all guilds
  async recoverIncompleteOperations() {
    if (this.isRecovering) {
      console.log('⚠️ Recovery already in progress, skipping...');
      return;
    }

    this.isRecovering = true;
    console.log('🔄 Checking for incomplete operations...');

    try {
      const guildsWithActiveOps = await this.GuildSettings.find({
        activeOperations: { $exists: true, $ne: {} }
      });

      let recoveredCount = 0;
      const staleCutoff = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes

      for (const guildSettings of guildsWithActiveOps) {
        const guildId = guildSettings.guildId;
        const activeOps = guildSettings.activeOperations || {};

        for (const [operationType, operation] of Object.entries(activeOps)) {
          const lastHeartbeat = new Date(operation.lastHeartbeat || operation.startTime);
          
          // Check if operation is stale (no heartbeat for 10+ minutes)
          if (lastHeartbeat < staleCutoff) {
            console.log(`🔄 Recovering stale operation: ${operationType} in guild ${guildId}`);
            
            const recovered = await this.recoverSpecificOperation(guildId, operationType, operation);
            if (recovered) {
              recoveredCount++;
            }
          }
        }
      }

      if (recoveredCount > 0) {
        console.log(`✅ Recovered ${recoveredCount} incomplete operations`);
      } else {
        console.log('📊 No incomplete operations found');
      }

    } catch (error) {
      console.error(`❌ Error during recovery check: ${error.message}`);
    } finally {
      this.isRecovering = false;
    }
  }

  // Recover a specific operation based on type
  async recoverSpecificOperation(guildId, operationType, operation) {
    try {
      console.log(`🔧 Attempting to recover: ${operationType} for guild ${guildId}`);

      switch (operationType) {
        case 'seasonReset':
          return await this.recoverSeasonReset(guildId, operation);
        
        case 'strikeDecay':
          return await this.recoverStrikeDecay(guildId, operation);
        
        case 'roleSync':
          return await this.recoverRoleSync(guildId, operation);
        
        case 'bulkStrikeOperation':
          return await this.recoverBulkStrikeOperation(guildId, operation);
        
        case 'databaseCleanup':
          return await this.recoverDatabaseCleanup(guildId, operation);
        
        case 'cocWarCheck':
          return await this.recoverCocWarCheck(guildId, operation);
        
        default:
          console.log(`⚠️ Unknown operation type for recovery: ${operationType}`);
          await this.markOperationComplete(guildId, operationType, { recovered: false, reason: 'unknown_type' });
          return false;
      }
    } catch (error) {
      console.error(`❌ Failed to recover operation ${operationType}: ${error.message}`);
      
      // Mark as failed but completed to prevent infinite recovery attempts
      await this.markOperationComplete(guildId, operationType, { 
        recovered: false, 
        error: error.message,
        recoveryAttemptAt: new Date()
      });
      
      return false;
    }
  }

  // Recover season reset operation
  async recoverSeasonReset(guildId, operation) {
    try {
      const { data, metadata } = operation;
      const processedUsers = data.processedUsers || 0;
      const totalUsers = data.totalUsers || 0;
      
      console.log(`🔄 Resuming season reset: ${processedUsers}/${totalUsers} users processed`);

      // Get remaining users to process
      const allStrikes = await this.Strike.find({ 
        guildId, 
        strikes: { $gt: 0 },
        lastSeasonReset: { $ne: data.resetId }
      });

      let resumedCount = 0;
      for (const userRecord of allStrikes) {
        try {
          const newStrikes = Math.max(0, userRecord.strikes - 0.5);
          
          await this.Strike.findOneAndUpdate(
            { userId: userRecord.userId, guildId },
            {
              $set: { 
                strikes: newStrikes,
                lastSeasonReset: data.resetId
              },
              $push: {
                history: {
                  reason: "Season reset - recovered operation",
                  strikesAdded: -0.5,
                  moderator: `System Recovery (Original: ${metadata.moderator})`,
                  date: new Date(),
                  recoveryNote: "Operation recovered after bot restart"
                }
              }
            }
          );

          resumedCount++;
          
          // Update progress periodically
          if (resumedCount % 10 === 0) {
            await this.updateHeartbeat(guildId, 'seasonReset', {
              processedUsers: processedUsers + resumedCount,
              totalUsers
            });
          }

        } catch (userError) {
          console.error(`❌ Error recovering season reset for user ${userRecord.userId}: ${userError.message}`);
        }
      }

      await this.markOperationComplete(guildId, 'seasonReset', {
        recovered: true,
        originalProcessed: processedUsers,
        recoveredUsers: resumedCount,
        totalProcessed: processedUsers + resumedCount
      });

      console.log(`✅ Season reset recovery completed: ${resumedCount} additional users processed`);
      return true;

    } catch (error) {
      console.error(`❌ Season reset recovery failed: ${error.message}`);
      return false;
    }
  }

  // Recover strike decay operation
  async recoverStrikeDecay(guildId, operation) {
    try {
      const { data } = operation;
      
      console.log(`🔄 Resuming strike decay for guild ${guildId}`);

      // Re-run decay process
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (data.decayDays || 30));

      const eligibleUsers = await this.Strike.find({
        guildId,
        strikes: { $gt: 0 },
        $or: [
          { lastDecay: { $exists: false } },
          { lastDecay: { $lt: cutoffDate } }
        ]
      });

      let processedCount = 0;
      for (const userRecord of eligibleUsers) {
        try {
          const newStrikes = Math.max(0, userRecord.strikes - 0.5);
          
          if (newStrikes !== userRecord.strikes) {
            await this.Strike.findOneAndUpdate(
              { userId: userRecord.userId, guildId },
              {
                $set: { 
                  strikes: newStrikes,
                  lastDecay: new Date()
                },
                $push: {
                  history: {
                    reason: "Strike decay - recovered operation",
                    strikesAdded: -0.5,
                    moderator: 'System Recovery (Auto-Decay)',
                    date: new Date()
                  }
                }
              }
            );
            processedCount++;
          }
        } catch (userError) {
          console.error(`❌ Error in decay recovery for user ${userRecord.userId}: ${userError.message}`);
        }
      }

      await this.markOperationComplete(guildId, 'strikeDecay', {
        recovered: true,
        processedUsers: processedCount
      });

      console.log(`✅ Strike decay recovery completed: ${processedCount} users processed`);
      return true;

    } catch (error) {
      console.error(`❌ Strike decay recovery failed: ${error.message}`);
      return false;
    }
  }

  // Recover role sync operation
  async recoverRoleSync(guildId, operation) {
    try {
      console.log(`🔄 Resuming role sync for guild ${guildId}`);

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        console.log(`⚠️ Guild ${guildId} not found, skipping role sync recovery`);
        await this.markOperationComplete(guildId, 'roleSync', { recovered: false, reason: 'guild_not_found' });
        return false;
      }

      const usersWithStrikes = await this.Strike.find({ 
        guildId, 
        strikes: { $gt: 0 } 
      });

      let syncedCount = 0;
      for (const userRecord of usersWithStrikes) {
        try {
          const member = await guild.members.fetch(userRecord.userId).catch(() => null);
          if (member) {
            // Import updateRole function
            const { updateRole } = require('./roleManager');
            await updateRole(member, userRecord.strikes);
            syncedCount++;
          }
        } catch (roleError) {
          console.error(`❌ Error syncing role for ${userRecord.userId}: ${roleError.message}`);
        }
      }

      await this.markOperationComplete(guildId, 'roleSync', {
        recovered: true,
        syncedUsers: syncedCount
      });

      console.log(`✅ Role sync recovery completed: ${syncedCount} users synced`);
      return true;

    } catch (error) {
      console.error(`❌ Role sync recovery failed: ${error.message}`);
      return false;
    }
  }

  // Recover bulk strike operations
  async recoverBulkStrikeOperation(guildId, operation) {
    try {
      const { data } = operation;
      
      console.log(`🔄 Resuming bulk strike operation for guild ${guildId}`);

      // The bulk operation data should contain information about what was being processed
      if (!data.userList || !data.operationType) {
        console.log(`⚠️ Insufficient data for bulk operation recovery`);
        await this.markOperationComplete(guildId, 'bulkStrikeOperation', { recovered: false, reason: 'insufficient_data' });
        return false;
      }

      // Resume processing from where it left off
      const processedUsers = data.processedUsers || [];
      const remainingUsers = data.userList.filter(userId => !processedUsers.includes(userId));

      let recoveredCount = 0;
      for (const userId of remainingUsers) {
        try {
          // Apply the strike operation that was interrupted
          if (data.operationType === 'add') {
            await this.Strike.findOneAndUpdate(
              { userId, guildId },
              {
                $inc: { strikes: data.strikeAmount },
                $push: {
                  history: {
                    reason: `${data.reason} - recovered operation`,
                    strikesAdded: data.strikeAmount,
                    moderator: `System Recovery (Original: ${data.moderator})`,
                    date: new Date()
                  }
                }
              },
              { upsert: true }
            );
          } else if (data.operationType === 'remove') {
            const userRecord = await this.Strike.findOne({ userId, guildId });
            const currentStrikes = userRecord ? userRecord.strikes : 0;
            const newStrikes = Math.max(0, currentStrikes - data.strikeAmount);
            
            await this.Strike.findOneAndUpdate(
              { userId, guildId },
              {
                $set: { strikes: newStrikes },
                $push: {
                  history: {
                    reason: `Strike removal - recovered operation`,
                    strikesAdded: -data.strikeAmount,
                    moderator: `System Recovery (Original: ${data.moderator})`,
                    date: new Date()
                  }
                }
              },
              { upsert: true }
            );
          }

          recoveredCount++;

        } catch (userError) {
          console.error(`❌ Error in bulk operation recovery for user ${userId}: ${userError.message}`);
        }
      }

      await this.markOperationComplete(guildId, 'bulkStrikeOperation', {
        recovered: true,
        originalProcessed: processedUsers.length,
        recoveredUsers: recoveredCount,
        totalProcessed: processedUsers.length + recoveredCount
      });

      console.log(`✅ Bulk strike operation recovery completed: ${recoveredCount} users processed`);
      return true;

    } catch (error) {
      console.error(`❌ Bulk strike operation recovery failed: ${error.message}`);
      return false;
    }
  }

  // Recover database cleanup operation
  async recoverDatabaseCleanup(guildId, operation) {
    try {
      console.log(`🔄 Database cleanup recovery - marking as completed (cleanup operations are typically safe to restart)`);
      
      await this.markOperationComplete(guildId, 'databaseCleanup', {
        recovered: true,
        note: 'Cleanup operations are safe to restart if needed'
      });

      return true;
    } catch (error) {
      console.error(`❌ Database cleanup recovery failed: ${error.message}`);
      return false;
    }
  }

  // Recover COC war check operation
  async recoverCocWarCheck(guildId, operation) {
    try {
      console.log(`🔄 COC war check recovery - marking as completed (war checks are periodic and safe to restart)`);
      
      await this.markOperationComplete(guildId, 'cocWarCheck', {
        recovered: true,
        note: 'War checks are periodic and will resume on next cycle'
      });

      return true;
    } catch (error) {
      console.error(`❌ COC war check recovery failed: ${error.message}`);
      return false;
    }
  }

  // Get operation status
  async getOperationStatus(guildId, operationType) {
    try {
      const guildSettings = await this.GuildSettings.findOne({ guildId });
      
      if (!guildSettings || !guildSettings.activeOperations) {
        return { active: false };
      }

      const operation = guildSettings.activeOperations[operationType];
      if (!operation) {
        return { active: false };
      }

      return {
        active: true,
        ...operation,
        isStale: new Date() - new Date(operation.lastHeartbeat || operation.startTime) > 10 * 60 * 1000
      };
    } catch (error) {
      console.error(`❌ Error getting operation status: ${error.message}`);
      return { active: false, error: error.message };
    }
  }

  // Clean up old completed operations (keep last 10 per type)
  async cleanupOldOperations() {
    try {
      console.log('🧹 Cleaning up old completed operations...');
      
      const guilds = await this.GuildSettings.find({
        completedOperations: { $exists: true }
      });

      for (const guildSettings of guilds) {
        const completed = guildSettings.completedOperations || {};
        const operationsByType = {};

        // Group operations by type
        for (const [key, operation] of Object.entries(completed)) {
          const type = operation.operationType;
          if (!operationsByType[type]) {
            operationsByType[type] = [];
          }
          operationsByType[type].push({ key, ...operation });
        }

        // Keep only the 10 most recent for each type
        let removedCount = 0;
        const toRemove = {};

        for (const [type, operations] of Object.entries(operationsByType)) {
          if (operations.length > 10) {
            const sorted = operations.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
            const toDelete = sorted.slice(10);
            
            for (const op of toDelete) {
              toRemove[`completedOperations.${op.key}`] = "";
              removedCount++;
            }
          }
        }

        if (removedCount > 0) {
          await this.GuildSettings.findOneAndUpdate(
            { guildId: guildSettings.guildId },
            { $unset: toRemove }
          );
          console.log(`🧹 Cleaned up ${removedCount} old operations for guild ${guildSettings.guildId}`);
        }
      }

    } catch (error) {
      console.error(`❌ Error cleaning up old operations: ${error.message}`);
    }
  }
}

module.exports = { PersistenceManager };
