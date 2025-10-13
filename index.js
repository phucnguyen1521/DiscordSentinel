const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, REST, Routes } = require('discord.js');
const cron = require('node-cron');
const http = require('http'); // Dummy server để Render free tier không báo lỗi port
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

// -------------------- Dummy server để Render free tier --------------------
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!\n');
}).listen(PORT, () => console.log(`Dummy server listening on port ${PORT}`));

// -------------------- Khi bot ready --------------------
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

  scheduleTasks();
});

// -------------------- Sự kiện member join --------------------
client.on('guildMemberAdd', async (member) => {
  const welcomeChannel = member.guild.channels.cache.get(config.channels.welcomeChannelId);
  if (!welcomeChannel) return console.log(`⚠️ Welcome channel ID ${config.channels.welcomeChannelId} not found`);

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

  try { await welcomeChannel.send({ embeds: [embed] }); }
  catch (error) { console.error('❌ Error sending welcome message:', error); }
});

// -------------------- Sự kiện member leave --------------------
client.on('guildMemberRemove', async (member) => {
  const goodbyeChannel = member.guild.channels.cache.get(config.channels.goodbyeChannelId);
  if (!goodbyeChannel) return console.log(`⚠️ Goodbye channel ID ${config.channels.goodbyeChannelId} not found`);

  const embed = new EmbedBuilder()
    .setColor(config.colors.goodbye)
    .setTitle('👋 Tạm biệt!')
    .setDescription(`**${member.user.tag}** đã rời khỏi server.`)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: '📅 Rời đi', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setTimestamp();

  try { await goodbyeChannel.send({ embeds: [embed] }); }
  catch (error) { console.error('❌ Error sending goodbye message:', error); }
});

// -------------------- Chống spam --------------------
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
    } catch (error) { console.error('❌ Error sending spam warning:', error); }
  }
});

// -------------------- Slash commands --------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member } = interaction;

  try {
    if (commandName === 'checkin') await handleCheckin(interaction);
    else if (commandName === 'status') await handleStatus(interaction);
    else if (commandName === 'reset-checkin') await handleResetCheckin(interaction, member);
  } catch (err) {
    console.error('❌ Interaction handler error:', err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Đã có lỗi xảy ra', ephemeral: true });
    }
  }
});

// -------------------- Handle Check-in --------------------
async function handleCheckin(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const today = getTodayKey();
  const month = getMonthKey();
  const checkins = await getCheckins();

  if (!checkins[month]) checkins[month] = {};
  if (!checkins[month][userId]) checkins[month][userId] = { dates: [], total: 0 };

  if (checkins[month][userId].dates.includes(today)) {
    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle('⚠️ Đã điểm danh rồi')
      .setDescription(`Bạn đã điểm danh hôm nay rồi!`)
      .addFields(
        { name: '📅 Hôm nay', value: today, inline: true },
        { name: '✅ Tháng này', value: `${checkins[month][userId].total} ngày`, inline: true }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  checkins[month][userId].dates.push(today);
  checkins[month][userId].total++;
  await saveCheckins(checkins);

  const checkinChannel = interaction.guild.channels.cache.get(config.channels.checkinChannelId);
  const embed = new EmbedBuilder()
    .setColor(config.colors.checkin)
    .setTitle('✅ Điểm danh thành công!')
    .setDescription(`${interaction.user} đã điểm danh hôm nay!`)
    .addFields(
      { name: '📅 Ngày', value: today, inline: true },
      { name: '🔥 Tháng này', value: `${checkins[month][userId].total} ngày`, inline: true }
    )
    .setFooter({ text: 'Tiếp tục phát huy!' })
    .setTimestamp();

  if (checkinChannel) {
    try { await checkinChannel.send({ embeds: [embed] }); }
    catch (error) { console.error('❌ Error sending checkin message to channel:', error); }

  }

  await interaction.editReply({ content: '✅ Điểm danh thành công!', embeds: [embed] });
}

// -------------------- Handle Status --------------------
async function handleStatus(interaction) {
  const hasAdminRole = config.adminRoleNames.some(roleName =>
    interaction.member.roles.cache.some(role => role.name === roleName)
  );
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || hasAdminRole;

  if (!isAdmin) return interaction.reply({ content: '❌ Bạn cần quyền quản trị viên', ephemeral: true });

  const uptime = Date.now() - botStartTime;
  const hours = Math.floor(uptime / 3600000);
  const minutes = Math.floor((uptime % 3600000) / 60000);
  const seconds = Math.floor((uptime % 60000) / 1000);

  const month = getMonthKey();
  const checkins = await getCheckins();
  const monthData = checkins[month] || {};
  const totalCheckins = Object.values(monthData).reduce((sum, user) => sum + user.total, 0);
  const activeUsers = Object.keys(monthData).length;

  const embed = new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle('🤖 Trạng thái Bot')
    .setDescription(`**${client.user.tag}** đang hoạt động!`)
    .addFields(
      { name: '⏱️ Thời gian hoạt động', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
      { name: '👥 Servers', value: `${client.guilds.cache.size}`, inline: true },
      { name: '📊 Tổng người dùng', value: `${client.users.cache.size}`, inline: true },
      { name: '✅ Điểm danh (Tháng này)', value: `${totalCheckins}`, inline: true },
      { name: '👤 Người dùng hoạt động', value: `${activeUsers}`, inline: true },
      { name: '📅 Tháng hiện tại', value: month, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// -------------------- Handle Reset Checkin --------------------
async function handleResetCheckin(interaction, member) {
  const hasAdminRole = config.adminRoleNames.some(roleName =>
    member.roles.cache.some(role => role.name === roleName)
  );
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || hasAdminRole;

  if (!isAdmin) return interaction.reply({ content: '❌ Bạn cần quyền quản trị viên', ephemeral: true });

  await saveCheckins({});
  const embed = new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle('✅ Đã đặt lại dữ liệu điểm danh')
    .setDescription('Tất cả dữ liệu điểm danh đã được xóa thành công.')
    .setFooter({ text: `Đặt lại bởi ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
  console.log(`🔄 Check-in data reset by ${interaction.user.tag}`);
}

// -------------------- Scheduled Tasks --------------------
function scheduleTasks() {
  cron.schedule('0 0 1 * *', async () => { // 1st day of month
    console.log('📅 Running monthly leaderboard task...');
    await assignWatcherRoles();
  });

  cron.schedule('0 0 * * *', async () => { // every day at midnight
    console.log('🔍 Checking role assignments...');
    await removeExpiredRoles();
  });

  console.log('⏰ Scheduled tasks initialized');
}

async function assignWatcherRoles() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  const checkins = await getCheckins();
  const monthData = checkins[monthKey];
  if (!monthData) return console.log('📊 No check-in data for last month');

  const leaderboard = Object.entries(monthData)
    .map(([userId, data]) => ({ userId, total: data.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, config.checkin.topUsersCount);

  if (leaderboard.length === 0) return console.log('📊 No users to assign roles');

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
          userId, guildId: guild.id, roleId: role.id,
          assignedAt: Date.now(), expiresAt: expiryDate.getTime(), checkins: total
        });
      } catch (error) { console.error(`❌ Error assigning role to user ${userId}:`, error); }
    }
  }

  await saveRoleAssignments(assignments);
}

async function removeExpiredRoles() {
  const assignments = await getRoleAssignments();
  const now = Date.now();
  const remaining = [];

  for (const assignment of assignments) {
    if (assignment.expiresAt > now) { remaining.push(assignment); continue; }
    try {
      const guild = client.guilds.cache.get(assignment.guildId);
      if (!guild) continue;
      const member = await guild.members.fetch(assignment.userId);
      const role = guild.roles.cache.get(assignment.roleId);
      if (member && role) await member.roles.remove(role);
    } catch (error) { console.error(`❌ Error removing role from user ${assignment.userId}:`, error); }
  }

  await saveRoleAssignments(remaining);
}

// -------------------- Login --------------------
if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('❌ ERROR: DISCORD_BOT_TOKEN is not set!');
  process.exit(1);
}

client.login(process.env.DISCORD_BOT_TOKEN);




