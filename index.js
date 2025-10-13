const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, REST, Routes } = require('discord.js');
const cron = require('node-cron');
const config = require('./config.json');
const {
  getCheckins,
  saveCheckins,
  getSpamData,
  saveSpamData,
  getRoleAssignments,
  saveRoleAssignments,
  getTodayKey,
  getMonthKey
} = require('./utils');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const botStartTime = Date.now();
const userMessageTimestamps = new Map();

// -------------------- Các hàm xử lý --------------------

// Hàm scheduleTasks
function scheduleTasks() {
  cron.schedule('0 0 1 * *', async () => {
    console.log('📅 Running monthly leaderboard task...');
    await assignWatcherRoles();
  });

  cron.schedule('0 0 * * *', async () => {
    console.log('🔍 Checking role assignments...');
    await removeExpiredRoles();
  });

  console.log('⏰ Scheduled tasks initialized');
}

// Hàm assignWatcherRoles
async function assignWatcherRoles() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  const checkins = await getCheckins();
  const monthData = checkins[monthKey];

  if (!monthData) {
    console.log('📊 No check-in data for last month');
    return;
  }

  const leaderboard = Object.entries(monthData)
    .map(([userId, data]) => ({ userId, total: data.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, config.checkin.topUsersCount);

  if (leaderboard.length === 0) {
    console.log('📊 No users to assign roles');
    return;
  }

  const assignments = await getRoleAssignments();
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + config.checkin.roleDurationDays);

  for (const guild of client.guilds.cache.values()) {
    const role = guild.roles.cache.find(r => r.name === config.watcherRoleName);
    if (!role) continue;

    for (const { userId, total } of leaderboard) {
      try {
        const member = await guild.members.fetch(userId);
        await member.roles.add(role);

        assignments.push({
          userId,
          guildId: guild.id,
          roleId: role.id,
          assignedAt: Date.now(),
          expiresAt: expiryDate.getTime(),
          checkins: total
        });

        console.log(`✅ Assigned "${config.watcherRoleName}" to ${member.user.tag} (${total} check-ins)`);
      } catch (error) {
        console.error(`❌ Error assigning role to user ${userId}:`, error);
      }
    }
  }

  await saveRoleAssignments(assignments);
}

// Hàm removeExpiredRoles
async function removeExpiredRoles() {
  const assignments = await getRoleAssignments();
  const now = Date.now();
  const remaining = [];

  for (const assignment of assignments) {
    if (assignment.expiresAt > now) {
      remaining.push(assignment);
      continue;
    }

    try {
      const guild = client.guilds.cache.get(assignment.guildId);
      if (!guild) continue;

      const member = await guild.members.fetch(assignment.userId);
      const role = guild.roles.cache.get(assignment.roleId);

      if (member && role) {
        await member.roles.remove(role);
        console.log(`🔄 Removed expired "${role.name}" role from ${member.user.tag}`);
      }
    } catch (error) {
      console.error(`❌ Error removing role from user ${assignment.userId}:`, error);
    }
  }

  await saveRoleAssignments(remaining);
}

// -------------------- Event clientReady --------------------
client.once('clientReady', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);

  // Register slash commands
  const commands = [
    { name: 'checkin', description: 'Điểm danh hàng ngày để theo dõi sự tham gia' },
    { name: 'status', description: 'Hiển thị trạng thái bot và thống kê' },
    { name: 'reset-checkin', description: 'Đặt lại dữ liệu điểm danh (Chỉ Admin)' }
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  try {
    console.log('🔄 Registering slash commands...');
    for (const guild of client.guilds.cache.values()) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        { body: commands }
      );
    }
    console.log('✅ Slash commands registered successfully!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }

  // Start scheduled tasks
  scheduleTasks();
});

// -------------------- Các event Discord --------------------
client.on('guildMemberAdd', async (member) => {
  const welcomeChannel = member.guild.channels.cache.get(config.channels.welcomeChannelId);
  if (!welcomeChannel) return;

  const embed = new EmbedBuilder()
    .setColor(config.colors.welcome)
    .setTitle('🎉 Chào mừng đến với Server!')
    .setDescription(`Xin chào ${member}! Chào mừng bạn đến với **${member.guild.name}**!`)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '👤 Thành viên', value: member.user.tag, inline: true },
      { name: '📅 Tham gia', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true }
    )
    .setFooter({ text: `Thành viên #${member.guild.memberCount}` })
    .setTimestamp();

  try { await welcomeChannel.send({ embeds: [embed] }); } catch (error) { console.error(error); }
});

client.on('guildMemberRemove', async (member) => {
  const goodbyeChannel = member.guild.channels.cache.get(config.channels.goodbyeChannelId);
  if (!goodbyeChannel) return;

  const embed = new EmbedBuilder()
    .setColor(config.colors.goodbye)
    .setTitle('👋 Tạm biệt!')
    .setDescription(`**${member.user.tag}** đã rời khỏi server.`)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: '📅 Rời đi', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true })
    .setTimestamp();

  try { await goodbyeChannel.send({ embeds: [embed] }); } catch (error) { console.error(error); }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const now = Date.now();
  if (!userMessageTimestamps.has(userId)) userMessageTimestamps.set(userId, []);
  const timestamps = userMessageTimestamps.get(userId);
  timestamps.push(now);

  const recentMessages = timestamps.filter(ts => now - ts < config.antiSpam.timeWindowMs);
  userMessageTimestamps.set(userId, recentMessages);

  if (recentMessages.length > config.antiSpam.maxMessages) {
    try {
      const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('⚠️ Cảnh báo Spam')
        .setDescription(config.antiSpam.warningMessage)
        .setFooter({ text: 'Vui lòng tuân thủ quy tắc server' })
        .setTimestamp();

      await message.channel.send({ content: `${message.author}`, embeds: [embed] });
      userMessageTimestamps.set(userId, []);

      const spamData = await getSpamData();
      if (!spamData[userId]) spamData[userId] = { count: 0, lastWarning: null };
      spamData[userId].count++;
      spamData[userId].lastWarning = now;
      await saveSpamData(spamData);
    } catch (error) { console.error(error); }
  }
});

// -------------------- interactionCreate --------------------
// Giữ nguyên các hàm handleCheckin, handleStatus, handleResetCheckin
// Copy y nguyên từ file cũ

// -------------------- Dummy server để Render free tier --------------------
const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.end("Bot is running");
}).listen(PORT, () => {
  console.log(`Dummy server listening on port ${PORT}`);
});

// -------------------- Kiểm tra token và login --------------------
if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('❌ ERROR: DISCORD_BOT_TOKEN is not set!');
  process.exit(1);
}

client.login(process.env.DISCORD_BOT_TOKEN);
