# Discord Bot

A full-featured Discord bot with welcome/goodbye messages, daily check-in system, anti-spam protection, and admin commands.

## Features

### 1. Welcome & Goodbye Messages
- Sends beautiful embed messages when members join or leave
- Welcome messages sent to channel ID: **1422896794215387277**
- Goodbye messages sent to channel ID: **1427103506132893776**
- Includes member avatar, join time, and member count

### 2. Daily Check-in System
- Users can type `/checkin` once per day to record attendance
- Check-in messages sent to channel ID: **1427127028380991538**
- Tracks check-ins throughout the month
- Shows monthly leaderboard at the end of each month
- Top 3 users automatically receive "The Watcher" role for 30 days

### 3. Anti-Spam Protection
- Detects when users send too many messages quickly
- Configurable thresholds in `config.json`
- Sends warning messages to spammers
- Tracks spam incidents

### 4. Admin Commands (Admin Only)
- `/status` - Shows bot uptime, server count, and check-in statistics (Admin only)
- `/reset-checkin` - Clears all check-in data (Admin only)

Both commands require either Administrator permissions or one of the configured admin roles.

## Setup Instructions

### 1. Create a Discord Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Enable these Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent
5. Copy the bot token

### 2. Add Bot Token to Replit
1. Open the Secrets panel in Replit (lock icon in the sidebar)
2. Add a new secret:
   - Key: `DISCORD_BOT_TOKEN`
   - Value: Your bot token from step 1

### 3. Invite Bot to Your Server
1. In Discord Developer Portal, go to "OAuth2" > "URL Generator"
2. Select these scopes:
   - `bot`
   - `applications.commands`
3. Select these bot permissions:
   - Send Messages
   - Embed Links
   - Manage Roles
   - Read Message History
   - View Channels
4. Copy the generated URL and open it in your browser
5. Select your server and authorize the bot

### 4. Configure Your Server
The bot uses specific channel IDs configured in `config.json`:
- Welcome channel ID: 1422896794215387277
- Goodbye channel ID: 1427103506132893776
- Checkin channel ID: 1427127028380991538

Also ensure:
1. Create a role named **The Watcher** (the bot will assign this automatically)
2. Make sure the bot's role is higher than "The Watcher" role in the role hierarchy
3. Update the channel IDs in `config.json` if you want to use different channels

### 5. Run the Bot
The bot will start automatically in Replit. Check the console for status messages.

## Configuration

Edit `config.json` to customize:

- **channels.welcomeChannelId**: Channel ID for welcome messages (default: "1422896794215387277")
- **channels.goodbyeChannelId**: Channel ID for goodbye messages (default: "1427103506132893776")
- **channels.checkinChannelId**: Channel ID for check-in messages (default: "1427127028380991538")
- **watcherRoleName**: Role name for top check-in users (default: "The Watcher")
- **adminRoleNames**: Roles that can use admin commands
- **antiSpam**: Configure spam detection thresholds
- **checkin**: Configure leaderboard and role duration
- **colors**: Customize embed colors

## File Structure

```
├── index.js              # Main bot file
├── utils.js              # Data storage utilities
├── config.json           # Configuration file
├── package.json          # Dependencies
├── data/                 # Data storage (auto-created)
│   ├── checkins.json     # Check-in records
│   ├── spam.json         # Spam tracking
│   └── role_assignments.json  # Role expiry tracking
└── README.md            # This file
```

## How It Works

### Check-in System
1. Users run `/checkin` command once per day
2. Bot records the check-in with today's date
3. At the end of each month (1st day at midnight), bot calculates top 3 users
4. Top 3 users receive "The Watcher" role for 30 days
5. Bot automatically removes the role after 30 days

### Anti-Spam
- Tracks message timestamps per user
- If a user sends more than 5 messages in 5 seconds (configurable), they get a warning
- Warning is sent as an embed message
- Spam incidents are logged

## Troubleshooting

### Bot is offline
- Check that `DISCORD_BOT_TOKEN` is set correctly in Secrets
- Make sure the bot is running (check console for errors)

### Welcome/Goodbye/Checkin messages not working
- Verify the channel IDs in `config.json` match your Discord server channels
- Check bot has permission to send messages in those channels
- Check console logs for "channel not found" errors

### Slash commands not appearing
- Wait a few minutes after bot starts (Discord can take time to register commands)
- Try kicking and re-inviting the bot

### Role assignment not working
- Make sure "The Watcher" role exists
- Ensure bot's role is higher than "The Watcher" in role hierarchy
- Check bot has "Manage Roles" permission

## Support

For issues or questions, check the console logs for error messages. The bot provides detailed logging for debugging.
