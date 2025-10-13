# Discord Bot - Project Documentation

## Overview

A full-featured Discord bot built with Discord.js v14 that provides community engagement features including welcome/goodbye messages, a daily check-in system with monthly leaderboards, anti-spam protection, and admin management commands. The bot tracks user participation and automatically rewards top contributors with special roles.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Application Structure

**Bot Framework**: Discord.js v14 with Gateway Intents
- Uses Discord.js client with specific intents: Guilds, GuildMembers, GuildMessages, and MessageContent
- Implements slash commands using Discord's REST API and command registration
- Event-driven architecture handling member joins/leaves, messages, and command interactions

**Data Persistence**: File-based JSON storage
- All data stored in `/data` directory as JSON files
- Three main data stores: checkins.json (user attendance), spam.json (spam tracking), role_assignments.json (role management)
- Utility layer (`utils.js`) provides abstraction for file operations with automatic directory creation
- No database server required - all data persisted to local filesystem

### Core Features Architecture

**Welcome/Goodbye System**
- Event listeners on `guildMemberAdd` and `guildMemberRemove`
- Welcome messages sent to channel ID 1422896794215387277
- Goodbye messages sent to channel ID 1427103506132893776
- Displays member avatar, timestamp, and server statistics
- Color-coded embeds (green for welcome, red for goodbye) configured in `config.json`
- Vietnamese language support for all messages

**Daily Check-in System**
- Slash command `/checkin` allows once-per-day attendance tracking
- Check-in messages posted to dedicated channel ID 1427127028380991538
- User receives ephemeral confirmation, public message goes to check-in channel
- Data structure: userId → { date → timestamp }
- Monthly leaderboard automatically generated using node-cron scheduler
- Top 3 users receive "The Watcher" role for configurable duration (30 days default)
- Automatic role removal after expiration period
- All messages in Vietnamese

**Anti-Spam Protection**
- Message rate limiting using in-memory Map (userMessageTimestamps)
- Configurable thresholds: max messages within time window (5 messages per 5 seconds default)
- Warning system that alerts users when they exceed limits
- Spam incidents tracked in persistent storage for analysis

**Admin Commands**
- `/status` - Displays bot uptime, server count, and check-in statistics (Admin only)
- `/reset-checkin` - Clears all attendance data (Admin only)
- Both commands require Administrator permission OR configured admin roles
- Permission-based access control checked against `adminRoleNames` array in config
- Unauthorized users receive ephemeral permission denied messages

### Configuration Management

Centralized configuration in `config.json`:
- Channel IDs for welcome (1422896794215387277), goodbye (1427103506132893776), and check-in (1427127028380991538) messages
- Role names for rewards and admin access
- Anti-spam thresholds and messages (Vietnamese)
- Check-in system parameters (top user count, role duration)
- Color scheme for all embed messages

**Design Rationale**: Uses channel IDs instead of names for more reliable channel targeting. JSON configuration chosen over environment variables for complex nested settings and easier multi-value management (arrays, objects). Allows non-technical admins to adjust bot behavior without code changes.

### Scheduled Tasks

Uses node-cron for time-based automation:
- End-of-month leaderboard generation and role assignments
- Periodic role expiration checks
- Cron expressions allow precise scheduling (e.g., monthly tasks on last day)

**Alternative Considered**: External task scheduler (like PM2 cron) was considered but node-cron selected for simpler deployment and self-contained operation.

## External Dependencies

### Discord API Integration
- **discord.js** (v14.23.2): Official Discord API wrapper
  - Provides Client, Gateway intents, Embed builders, REST API
  - Handles WebSocket connections and event management
  - Required for all Discord interactions

### Task Scheduling
- **node-cron** (v3.0.3): Cron-based job scheduler
  - Used for monthly leaderboard generation
  - Handles role expiration checks
  - Enables time-based automation without external dependencies

### Environment Variables
- **DISCORD_BOT_TOKEN**: Bot authentication token (stored in Replit Secrets)
  - Required for Discord API authentication
  - Must be kept secure and never committed to repository

### Discord Server Requirements
- Server must have channels matching the IDs in config.json:
  - Welcome channel: 1422896794215387277
  - Goodbye channel: 1427103506132893776
  - Check-in channel: 1427127028380991538
- "The Watcher" role must exist for check-in rewards
- Admin/Moderator roles as configured in `config.json`
- Bot requires specific permissions: Send Messages, Embed Links, Manage Roles, Read Message History
- All bot messages are in Vietnamese language

### File System
- Persistent storage in `/data` directory
- Requires write permissions for JSON file operations
- Data survives across bot restarts through filesystem persistence