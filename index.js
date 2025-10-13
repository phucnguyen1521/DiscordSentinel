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

// -------------------- Thay 'ready' bằng 'clientReady' --------------------
client.once('clientReady', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  
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

// -------------------- Các event khác giữ nguyên --------------------
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

  try { await welcomeChannel.send({ embeds: [embed] }); } 
  catch (error) { console.error(error); }
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

  try { await goodbyeChannel.send({ embeds: [embed] }); } 
  catch (error) { console.error(error); }
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

// -------------------- interactionCreate và các hàm xử lý giữ nguyên --------------------
// handleCheckin, handleStatus, handleResetCheckin, scheduleTasks, assignWatcherRoles, removeExpiredRoles
// Bạn chỉ cần giữ nguyên các hàm này từ file cũ

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
