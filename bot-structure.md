
# 🤖 StrikeMaster Bot - Organized Structure

## 📁 Project Organization

```
📦 StrikeMaster Bot
├── 📁 commands/           # Command Groups (Organized by functionality)
│   ├── basic.js          # Basic user commands (ping, mystatus, help)
│   ├── strikes.js        # Strike management (all strike commands)
│   ├── reports.js        # Reports & analytics (allstrikes, leaderboard, history)
│   ├── achievements.js   # Positive reinforcement (cgachievement, donations)
│   ├── admin.js          # Administration (setlogchannel, syncroles, debug)
│   ├── coc.js           # COC integration (cocsetup, cocstats, coclink)
│   └── seasonReset.js   # Season reset functionality
│
├── 📁 config/            # Configuration & Data Models
│   ├── database.js      # MongoDB schemas & connection
│   └── strikes.js       # Strike reasons & values
│
├── 📁 utils/             # Utility Functions
│   ├── permissions.js   # Permission checks & cooldowns
│   ├── roleManager.js   # Automatic role updates
│   ├── logging.js       # Action logging system
│   ├── seasonReset.js   # Season reset cooldown management
│   ├── cocApi.js        # COC API utilities
│   ├── cooldownManager.js
│   └── leadershipNotification.js
│
└── index.js             # Main bot file & command router
```

## 🎯 Command Groups Overview

### 1. **Basic Commands** (`commands/basic.js`)
- `!ping` - Bot latency test
- `!mystatus` - Check your strikes
- `!help [category]` - Command help system

### 2. **Strike Management** (`commands/strikes.js`)
**Minor Violations (0.5-1 strikes):**
- `!mw @user` - Missed war (0.5)
- `!fwa @user` - Missed FWA search (1)
- `!realbaseafterbl @user` - Real base after BL (1)

**Moderate Violations (2 strikes):**
- `!mwt @user` - Missed wars twice
- `!nfp @user` - Not following plan
- `!cg @user` - Clan Games failure
- `!mr @user` - Missed raids
- `!rb @user` - Rule violations

**Serious Violations (3 strikes):**
- `!rbf @user` - Real base in FWA

**Major Violations (4 strikes - Ban Threshold):**
- `!mwth @user` - Missed wars 3+ times
- `!don @user` - Donation failures
- `!ld @user` - Left Discord
- `!ia @user` - Inactivity

**Strike Management:**
- `!checkstrikes @user` - Check user strikes
- `!removestrike @user [amount]` - Remove strikes

### 3. **Reports & Analytics** (`commands/reports.js`)
- `!allstrikes [clan] [page]` - View all strikes with pagination
- `!leaderboard` - Top strikers hall of fame
- `!history @user [page]` - Detailed strike history
- `!analytics [clan]` - Server health dashboard

### 4. **Achievements** (`commands/achievements.js`)
- `!cgachievement @user` - 4000+ Clan Games (-1 strike)
- `!donationachievement @user` - 10000+ donations (-1 strike)
- `!seasonreset` - Reduce all strikes by 0.5 (20-day cooldown)

### 5. **Administration** (`commands/admin.js`)
- `!setlogchannel [#channel]` - Configure default log channel
- `!setclanlog <clan_role> [#channel]` - Clan-specific logging
- `!setleader <clan_role> <leader_role>` - Leadership configuration
- `!listclans` - View clan configurations
- `!syncroles` - Force role synchronization
- `!debug` - Bot status & diagnostics

### 6. **COC Integration** (`commands/coc.js`)
- `!cocsetup <api_key>` - Configure COC API
- `!cocstats [clan_tag]` - Clan statistics
- `!coclink <player_tag>` - Link COC account
- `!cocprofile [@user]` - View COC profile
- `!cocsetclan <role> <clan_tag>` - Map Discord roles to clans

## 🔧 Key Features

### 🎯 **Smart Multi-Clan Support**
- Auto-detects user clan roles
- Clan-specific log channels
- Leadership notifications by clan
- Context-aware commands

### 🔒 **Advanced Security**
- Moderator permission checks
- Command cooldowns & rate limiting
- Duplicate prevention system
- Confirmation system for strikes

### 📊 **Comprehensive Logging**
- All actions logged with moderator info
- Clan-specific or default log channels
- Complete audit trail
- Leadership notifications at ban threshold

### 🏆 **Role Management**
- Automatic role assignment based on strikes
- ⚠️ 2 Strikes (Warn)
- ⛔ 3 Strikes (Block) 
- 🚫 4 Strikes (Ban)

### ⚔️ **COC Integration**
- Full API integration
- Player linking & verification
- Clan statistics & member tracking
- War monitoring (planned)

## 🚀 **Recent Enhancements**
- Modular command structure
- Enhanced error handling
- Smart clan detection
- Leadership notification system
- Season reset with cooldowns
- Achievement system for positive reinforcement
