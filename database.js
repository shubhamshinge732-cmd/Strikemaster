const mongoose = require("mongoose");

// ⚡ MongoDB Schema
const strikeSchema = new mongoose.Schema({
  userId: String,
  guildId: String,
  strikes: { type: Number, default: 0 },
  lastViolation: { type: Date, default: Date.now },
  history: [
    {
      reason: String,
      strikesAdded: Number,
      date: { type: Date, default: Date.now },
      moderator: String
    },
  ],
  warnings: [
    {
      reason: String,
      moderator: String,
      date: { type: Date, default: Date.now }
    }
  ]
});

// ⚡ Guild Settings Schema
const guildSettingsSchema = new mongoose.Schema({
  guildId: String,
  logChannelId: String,
  backupLogChannelId: String,
  clanLogChannels: {
    type: Map,
    of: String,
    default: new Map()
  },
  clanLeaderRoles: {
    type: Map,
    of: String,
    default: new Map()
  },
  clanCoLeaderRoles: {
    type: Map,
    of: String,
    default: new Map()
  },
  cocApiKey: String,
  cocClanMappings: {
    type: Map,
    of: String,
    default: new Map()
  },
  cocPlayerLinks: {
    type: Map,
    of: String,
    default: new Map()
  },
  cocAutoStrike: { type: Boolean, default: false },
  cocLastWarCheck: { type: Date, default: null },
  cocPlayerVerifications: {
    type: Map,
    of: {
      verified: { type: Boolean, default: false },
      verificationCode: String,
      verifiedAt: Date
    },
    default: new Map()
  },
  lastSeasonReset: { type: Date, default: null },
  lastSeasonResetCompleted: {
    moderator: String,
    confirmedBy: String,
    completedAt: Date,
    totalUsers: Number,
    errorsCount: Number
  },
  seasonResetInProgress: {
    moderator: String,
    confirmedBy: String,
    startTime: Date,
    totalUsers: Number,
    processedUsers: { type: Number, default: 0 },
    status: { type: String, default: 'in_progress' }
  },
  strikeDecayEnabled: { type: Boolean, default: false },
  strikeDecayDays: { type: Number, default: 30 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

strikeSchema.index({ userId: 1, guildId: 1 });
guildSettingsSchema.index({ guildId: 1 });

const Strike = mongoose.model("Strike", strikeSchema);
const GuildSettings = mongoose.model("GuildSettings", guildSettingsSchema);

// ⚡ Database connection check helper
function isDatabaseConnected() {
  return mongoose.connection.readyState === 1; // 1 = connected
}

// ⚡ Connect MongoDB with enhanced error handling
async function connectDatabase() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI environment variable is not set!");
    console.error("Please set your MongoDB connection string in the Secrets tab");
    throw new Error("MONGO_URI not configured");
  }

  console.log("🔄 Attempting to connect to MongoDB...");

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      bufferCommands: false
    });
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB initial connection failed:", err.message);
    console.error("🔧 Troubleshooting tips:");
    console.error("   1. Check if your MongoDB URI is correct in Secrets");
    console.error("   2. Ensure your MongoDB Atlas cluster is running (not paused)");
    console.error("   3. Verify network access is allowed for your cluster");
    console.error("   4. Check if your database user has proper permissions");
    throw err;
  }

  // Enhanced MongoDB connection monitoring with better retry logic
  mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected - attempting to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected successfully');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
    if (err.message.includes('Server selection timed out')) {
      console.error('💡 This usually means:');
      console.error('   - MongoDB cluster is sleeping (Atlas free tier)');
      console.error('   - Incorrect connection string');
      console.error('   - Network access restrictions');
    }
  });

  mongoose.connection.on('connecting', () => {
    console.log('🔄 MongoDB connecting...');
  });

  mongoose.connection.on('connected', () => {
    console.log('🔗 MongoDB connection established');
  });
}

module.exports = {
  Strike,
  GuildSettings,
  isDatabaseConnected,
  connectDatabase
};