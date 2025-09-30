const fs = require('fs').promises;
const path = require('path');

class BackupManager {
  constructor(client, models) {
    this.client = client;
    this.models = models;
    this.backupInterval = null;
    this.backupDir = path.join(__dirname, '../backups');
    this.maxBackups = 30;
  }

  // Start automatic backup system
  async start() {
    console.log('💾 Starting Backup Manager...');

    // Ensure backup directory exists
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      console.error('❌ Failed to create backup directory:', error.message);
    }

    // Run backup every 6 hours
    this.backupInterval = setInterval(() => {
      this.createBackup('automatic').catch(error => {
        console.error('❌ Error in automatic backup:', error.message);
      });
    }, 6 * 60 * 60 * 1000); // 6 hours

    console.log('✅ Backup Manager started (automatic backups every 6 hours)');
  }

  // Stop backup system
  stop() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }
    console.log('⏸️ Backup Manager stopped');
  }

  // Create a backup
  async createBackup(type = 'manual', guildId = null) {
    console.log(`💾 Creating ${type} backup...`);

    try {
      const timestamp = new Date().toISOString();
      const backupData = await this.gatherBackupData(guildId);

      const filename = guildId ?
        `backup_${guildId}_${timestamp.replace(/[:.]/g, '-')}.json` :
        `backup_${timestamp.replace(/[:.]/g, '-')}.json`;

      const backupPath = path.join(this.backupDir, filename);

      const backupContent = {
        metadata: {
          type,
          created: timestamp,
          version: '2.0.0',
          guildId: guildId || 'all',
          botVersion: require('../package.json').version
        },
        data: backupData
      };

      await fs.writeFile(backupPath, JSON.stringify(backupContent, null, 2));

      console.log(`✅ Backup created: ${filename}`);

      // Clean up old backups
      await this.cleanupOldBackups();

      return {
        success: true,
        filename,
        size: JSON.stringify(backupContent).length,
        recordCount: this.countRecords(backupData)
      };

    } catch (error) {
      console.error('❌ Backup creation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Gather data for backup
  async gatherBackupData(guildId = null) {
    const backupData = {
      strikes: [],
      guildSettings: []
    };

    try {
      // Backup strikes
      const strikeQuery = guildId ? { guildId } : {};
      const strikes = await this.models.Strike.find(strikeQuery).lean();
      backupData.strikes = strikes;

      // Backup guild settings
      const guildQuery = guildId ? { guildId } : {};
      const guildSettings = await this.models.GuildSettings.find(guildQuery).lean();
      backupData.guildSettings = guildSettings;

      return backupData;

    } catch (error) {
      console.error('❌ Error gathering backup data:', error.message);
      throw error;
    }
  }

  // Count records in backup data
  countRecords(backupData) {
    return {
      strikes: backupData.strikes.length,
      guildSettings: backupData.guildSettings.length,
      total: backupData.strikes.length + backupData.guildSettings.length
    };
  }

  // List available backups
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(file => file.startsWith('backup_') && file.endsWith('.json'));

      const backups = [];

      for (const file of backupFiles) {
        try {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf8');
          const backupData = JSON.parse(content);

          backups.push({
            filename: file,
            created: backupData.metadata.created,
            type: backupData.metadata.type,
            size: stats.size,
            recordCount: this.countRecords(backupData.data),
            guildId: backupData.metadata.guildId
          });
        } catch (fileError) {
          console.error(`❌ Error reading backup ${file}:`, fileError.message);
        }
      }

      // Sort by creation date (newest first)
      backups.sort((a, b) => new Date(b.created) - new Date(a.created));

      return backups;

    } catch (error) {
      console.error('❌ Error listing backups:', error.message);
      return [];
    }
  }

  // Delete a specific backup
  async deleteBackup(filename) {
    try {
      const backupPath = path.join(this.backupDir, filename);

      // Verify file exists and is a backup file
      if (!filename.startsWith('backup_') || !filename.endsWith('.json')) {
        throw new Error('Invalid backup filename');
      }

      await fs.unlink(backupPath);
      console.log(`🗑️ Backup deleted: ${filename}`);

      return { success: true };

    } catch (error) {
      console.error('❌ Error deleting backup:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Restore from backup
  async restoreBackup(filename, dryRun = false) {
    console.log(`${dryRun ? '👁️ Simulating' : '🔄 Starting'} backup restore: ${filename}`);

    try {
      const backupPath = path.join(this.backupDir, filename);
      const content = await fs.readFile(backupPath, 'utf8');
      const backupData = JSON.parse(content);

      if (!backupData.data) {
        throw new Error('Invalid backup format - no data section found');
      }

      const restoreStats = {
        strikes: { inserted: 0, updated: 0, errors: 0 },
        guildSettings: { inserted: 0, updated: 0, errors: 0 }
      };

      if (!dryRun) {
        // Restore strikes
        for (const strike of backupData.data.strikes) {
          try {
            await this.models.Strike.findOneAndUpdate(
              { userId: strike.userId, guildId: strike.guildId },
              strike,
              { upsert: true }
            );
            restoreStats.strikes.inserted++;
          } catch (error) {
            restoreStats.strikes.errors++;
            console.error(`❌ Error restoring strike for user ${strike.userId}:`, error.message);
          }
        }

        // Restore guild settings
        for (const setting of backupData.data.guildSettings) {
          try {
            await this.models.GuildSettings.findOneAndUpdate(
              { guildId: setting.guildId },
              setting,
              { upsert: true }
            );
            restoreStats.guildSettings.inserted++;
          } catch (error) {
            restoreStats.guildSettings.errors++;
            console.error(`❌ Error restoring guild settings for ${setting.guildId}:`, error.message);
          }
        }
      } else {
        // Dry run - just count what would be restored
        restoreStats.strikes.inserted = backupData.data.strikes.length;
        restoreStats.guildSettings.inserted = backupData.data.guildSettings.length;
      }

      const result = {
        success: true,
        dryRun,
        backupInfo: backupData.metadata,
        restoreStats,
        totalRecords: backupData.data.strikes.length + backupData.data.guildSettings.length
      };

      console.log(`✅ Backup restore ${dryRun ? 'simulation' : ''} completed`);
      return result;

    } catch (error) {
      console.error('❌ Backup restore failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Clean up old backups
  async cleanupOldBackups() {
    try {
      const backups = await this.listBackups();

      if (backups.length <= this.maxBackups) {
        return; // No cleanup needed
      }

      const backupsToDelete = backups.slice(this.maxBackups);
      let deletedCount = 0;

      for (const backup of backupsToDelete) {
        const result = await this.deleteBackup(backup.filename);
        if (result.success) {
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old backups`);
      }

    } catch (error) {
      console.error('❌ Error during backup cleanup:', error.message);
    }
  }

  // Get backup statistics
  async getBackupStats() {
    try {
      const backups = await this.listBackups();
      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);

      const typeStats = backups.reduce((stats, backup) => {
        stats[backup.type] = (stats[backup.type] || 0) + 1;
        return stats;
      }, {});

      return {
        totalBackups: backups.length,
        totalSize: totalSize,
        averageSize: backups.length > 0 ? Math.round(totalSize / backups.length) : 0,
        typeBreakdown: typeStats,
        oldestBackup: backups.length > 0 ? backups[backups.length - 1].created : null,
        newestBackup: backups.length > 0 ? backups[0].created : null
      };

    } catch (error) {
      console.error('❌ Error getting backup stats:', error.message);
      return null;
    }
  }
}

module.exports = { BackupManager };