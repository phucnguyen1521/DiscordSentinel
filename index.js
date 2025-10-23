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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
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
client.once('ready', async () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  
// 👋 Gửi lời chào khi bot on
const channel = client.channels.cache.get("866686468437049398"); // 👈 sửa ID kênh text
if (channel) {
  const greetings = [
    "😎 Alo alo, tao on lại rồi nè mấy khứa!",
    "🧟‍♂️ Tao đã sống lại sau cái chết tạm thời 😭",
    "🔥 Restart xong rồi, tiếp tục phá nào!",
    "🫡 Vừa reboot xong, có ai nhớ t không?"
  ];
  channel.send(greetings[Math.floor(Math.random() * greetings.length)]);
}

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


// === Anti-dead server system ===
const boredMessages = [
  "😢 Sao đi hết vậy, 1 mình buồn quá...",
  "😴 Gr này im như tờ, ai còn ở đây hong?",
  "👀 Alo? Có ai không hay server này thành nghĩa địa rồi 😭",
  "😢 Đừng nướng nữa dậy chơi với t đi...",
  "💤 5 tiếng trôi qua mà vẫn im lìm... chắc tôi cũng ngủ đây zzzz",
  "🥲 Hồi xưa đông vui lắm, giờ còn mỗi tôi với mấy con bot..."
];

const aliveMessages = [
  "😳 Ô trời ơi có người rồi!! Tưởng chết hẳn luôn chứ 😭",
  "🥹 Cuối cùng cũng có tiếng người...",
  "😆 Haha mấy con heo nái dậy rồi!",
  "🙌 Server sống lại rồi bà con ơi!!!"
];

const BORED_CHANNEL_ID = "866686468437049398"; // 👈 ĐỔI dòng này nha!
let lastActivity = Date.now();
let serverIsDead = false;

// Cập nhật hoạt động khi có tin nhắn mới
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const now = Date.now();

  // Nếu server đang "dead" mà có người nhắn lại
  if (serverIsDead && now - lastActivity >= 5 * 60 * 60 * 1000) {
    const channel = client.channels.cache.get(BORED_CHANNEL_ID);
    if (channel) {
      const msg = aliveMessages[Math.floor(Math.random() * aliveMessages.length)];
      await channel.send(msg);
    }
    serverIsDead = false;
  }

  lastActivity = now;
});

// Khi có người ra/vào voice
client.on("voiceStateUpdate", (oldState, newState) => {
  if (oldState.channelId !== newState.channelId) {
    lastActivity = Date.now();
    serverIsDead = false;
  }
});

// Kiểm tra định kỳ xem server có "dead" không
setInterval(async () => {
  const now = Date.now();
  const fiveHours = 5 * 60 * 60 * 1000;
  const channel = client.channels.cache.get(BORED_CHANNEL_ID);

  if (!serverIsDead && now - lastActivity >= fiveHours) {
    // Đã im hơn 5 tiếng → gửi thông điệp "dead"
    if (channel) {
      const msg = boredMessages[Math.floor(Math.random() * boredMessages.length)];
      await channel.send(msg);
      serverIsDead = true;
    }
  }
}, 10 * 60 * 1000); // Kiểm tra mỗi 10 phút

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

// -------------------- Nhận tin nhắn & chống spam --------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const now = Date.now();

  // Lấy dữ liệu spam
  const spamData = await getSpamData();
  if (!spamData[userId]) spamData[userId] = { count: 0, lastWarning: null, bannedUntil: 0 };

  // ⚠️ Kiểm tra nếu user đang bị chặn tạm thời
  if (spamData[userId].bannedUntil && now < spamData[userId].bannedUntil) {
    try {
      await message.delete().catch(() => {});
      const remaining = Math.ceil((spamData[userId].bannedUntil - now) / 1000 / 60);
      await message.channel.send({
        content: `<@${userId}> ⛔ Bạn đang bị chặn tạm thời! Vui lòng chờ **${remaining} phút** nữa mới được nhắn lại.`,
      });
    } catch (err) {
      console.error("❌ Error deleting spam message:", err);
    }
    return;
  }

  // Lưu timestamp tin nhắn
  if (!userMessageTimestamps.has(userId)) userMessageTimestamps.set(userId, []);
  const timestamps = userMessageTimestamps.get(userId);
  timestamps.push(now);

  // Lọc tin nhắn trong khoảng thời gian config
  const recentMessages = timestamps.filter(ts => now - ts < config.antiSpam.timeWindowMs);
  userMessageTimestamps.set(userId, recentMessages);

  // Nếu vượt ngưỡng spam
  if (recentMessages.length > config.antiSpam.maxMessages) {
    try {
      const embed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('⚠️ Cảnh báo Spam')
        .setDescription(`${config.antiSpam.warningMessage}\n\n⏳ Bạn bị chặn nhắn trong **5 phút**!`)
        .setFooter({ text: 'Vui lòng tuân thủ quy tắc server' })
        .setTimestamp();

      await message.channel.send({ content: `${message.author}`, embeds: [embed] });

      // Reset tin nhắn của người đó
      userMessageTimestamps.set(userId, []);

      // Ghi log spam
      spamData[userId].count++;
      spamData[userId].lastWarning = now;
      spamData[userId].bannedUntil = now + 5 * 60 * 1000; // ⏰ Cấm 5 phút

      await saveSpamData(spamData);
    } catch (error) {
      console.error('❌ Error sending spam warning:', error);
    }
  }
});


// -------------------- Chào người khi họ online --------------------

// 🌀 Tạo hàm shuffler để tránh trùng lặp lời chào
function createShuffler(arr) {
  const original = Array.isArray(arr) ? [...arr] : [];
  let pool = [...original];
  return function getOne() {
    if (pool.length === 0) pool = [...original];
    const idx = Math.floor(Math.random() * pool.length);
    const [item] = pool.splice(idx, 1);
    return item;
  };
}

// 💬 Danh sách lời chào phân theo thời gian trong ngày
const greetings = {
  sáng: [
    "Chào buổi sáng tốt lành ☀️",
    "Ê con ngu kia, on sớm zậy định phá server hả 😤",
    "Một vị cao nhân từng nói: dậy xớm có làm thì mới có ăn không làm mà đòi có ăn thì ăn đầu BUỒI ăn CỨT thế cho nó dễ 😤",
    "Ủa, onl sớm dữ, tính đi làm người giàu hả nhưng mà mày vẫn nghèo 😏",
    "Em bước ra ngoài, kết bạn đi, làm điều gì đó có ý nghĩa, đi kiếm tiền. Dành nhiều thời gian như vậy cho tao để làm gì? Em không có ước mơ hả? 😩",
    "Sáng sớm mà lò dò on, đúng là rảnh hết phần thiên hạ 😂",
    "Bình minh rất đẹp. Giống mày bây giờ tuy đẹp mà không có Não 😂",
    "Chào.... ủa là mày hả? đồ ngu đồ ăn hại. Cút mẹ mày đi 😩"
  ],
  trưa: [
    "Chào buổi trưa nè 🌤️",
    "Trưa on chi, không lo ăn lo ngủ, đúng đồ nghiện game 😤",
    "Ủa, trưa mà on chi? Mày không có đời sống hả 😂",
    "Trưa on là biết rảnh quá rồi đó nha 😎",
    "On trưa mà than buồn ngủ là tao chửi đó nghe 😏",
    "Chào.... ủa là mày hả? đồ ngu đồ ăn hại. Cút mẹ mày đi 😩"
  ],
  chiều: [
    "Chiều on chi nữa, nghỉ xíu đi 😒",
    "Ủa, chiều rồi mà vẫn chưa biến hả, bám server dữ 👀",
    "On chiều mà làm như bận lắm vậy 😏",
    "Chiều rồi mà vẫn ngồi đây, chắc không có bạn ngoài đời 😆",
    "Trời ơi chiều nào cũng thấy on, bỏ điện thoại xuống giao tiếp với người nhà đi em 😩",
    "Chiều rồi đó, đi ra ngoài hít khí trời chạm cỏ đi đồ nghiện 😜",
    "Hoàng hôn rất đẹp. Giống mày bây giờ tuy đẹp mà không có Não 😂",
    "Ủa chiều mà chưa ăn gì à, nhìn đói thấy thương luôn 😂"
  ],
  tối: [
    "Ê con khùng, tối rồi on chi nữa 😴",
    "Tối rồi mà còn ngồi on, mai khỏi dậy nha 😏",
    "Ủa, tối rồi mà vẫn chưa biến hả, bám dai dữ 👀",
    "Tối nào cũng thấy mày on, server này của mày hả 😤",
    "Trời ơi, tối rồi mà vẫn ráng muốn ăn chửi à 😈",
    "On tối chi, không ra ngoài kiếm bồ đi 😎",
    "Còn chưa tắm mà on, bốc mùi online kìa 🤢",
    "Trời đêm đầy sao rất đẹp. Giống mày bây giờ tuy đẹp mà không có Não 😂",
    "Ê đồ điên, tối rồi mà on, rảnh quá hả 😂"
  ],
  khuya: [
    "Khuya rồi đồ ngu, ngủ đi chứ on chi 😪",
    "Ủa, khuya rồi mà vẫn chưa biến hả, bám dai dữ 👀",
    "Mất ngủ hả con? Khuya zầy còn on 😵",
    "Khuya rồi mà on, chắc đang rình drama 🤨",
    "Ủa, định làm cú đêm luôn hả, server không phát cháo khuya đâu 😤",
    "Khuya rồi ngủ với mẹ đi em không mẹ buồn đó 🤦‍♂️"
  ]
};

// 🧩 Tạo shuffler riêng cho từng buổi
const shufflers = {
  sáng: createShuffler(greetings.sáng),
  trưa: createShuffler(greetings.trưa),
  chiều: createShuffler(greetings.chiều),
  tối: createShuffler(greetings.tối),
  khuya: createShuffler(greetings.khuya)
};

// 🕗 Danh sách người đã được chào trong mỗi buổi
let greetedUsers = new Set();
let currentPeriod = null;

// 🔁 Xác định buổi hiện tại (theo giờ VN)
function getPeriod() {
  const now = new Date();
  const hour = (now.getUTCHours() + 7) % 24; // UTC+7 (giờ VN)
  if (hour >= 5 && hour < 11) return 'sáng';
  if (hour >= 11 && hour < 13) return 'trưa';
  if (hour >= 13 && hour < 18) return 'chiều';
  if (hour >= 18 && hour < 22) return 'tối';
  return 'khuya';
}

// 🎯 Sự kiện chào khi online
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  try {
    if (!newPresence || !newPresence.user || newPresence.user.bot) return;

    const member = newPresence.member;
    const userId = newPresence.user.id;
    const oldStatus = oldPresence?.status;
    const newStatus = newPresence.status;

    // Khi người dùng vừa chuyển từ offline → online
    const wentOnline =
      (oldStatus === 'offline' || oldStatus === 'invisible' || oldStatus === undefined) &&
      newStatus === 'online';
    const resumedFromIdleOrDnd =
      (oldStatus === 'idle' || oldStatus === 'dnd') && newStatus === 'online';
    if (!wentOnline && !resumedFromIdleOrDnd) return;

    // 🕐 Xác định buổi hiện tại
    const period = getPeriod();

    // 🧹 Nếu sang buổi mới → reset danh sách người đã được chào
    if (period !== currentPeriod) {
      currentPeriod = period;
      greetedUsers.clear();
      console.log(`🕒 Đã chuyển sang buổi "${period}" — reset danh sách chào.`);
    }

    // 🚫 Nếu người này đã được chào trong buổi này → bỏ qua
    if (greetedUsers.has(userId)) return;
    greetedUsers.add(userId);

    // 🎲 Lấy lời chào ngẫu nhiên
    const getGreeting = shufflers[period];
    const chosen = getGreeting();

    // 🔊 Gửi lời chào vào kênh cấu hình
    const greetingChannelId = config.channels.greetingChannelId;
    const channel = member.guild.channels.cache.get(greetingChannelId);
    if (!channel)
      return console.warn(`⚠️ Greeting channel ID ${greetingChannelId} not found.`);

    await channel.send(`👋 <@${userId}> ${chosen}`);
    console.log(`✅ Gửi lời chào ${member.user.tag} (${period}): ${chosen}`);
  } catch (err) {
    console.error('❌ Lỗi khi gửi lời chào:', err);
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
// -------------------- Push checkin.json lên GitHub --------------------
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function pushToGitHub() {
  try {
    console.log("📤 Đang đẩy dữ liệu lên GitHub...");
    await execPromise(`git config user.email "bot@render.com"`);
    await execPromise(`git config user.name "Render Bot"`);
    await execPromise(`git add data/checkins.json`);
    await execPromise(`git commit -m "Auto update checkins.json [skip ci]" || echo "Không có thay đổi nào"`);
    await execPromise(`git push https://${process.env.GITHUB_USERNAME}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}.git HEAD:main`);
    console.log("✅ Đã đẩy file lên GitHub!");
  } catch (error) {
    console.error("❌ Lỗi khi push lên GitHub:", error.message);
  }
}

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
  await pushToGitHub(); // Đẩy file lên GitHub

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

async function handleExit(signal) {
  console.log(`[!] Received ${signal}, shutting down gracefully...`);
  const channel = client.channels.cache.get("866686468437049398"); // 👈 sửa ID kênh text
  if (channel) {
    await channel.send("🥺 Bot sắp off rồi mấy khứa ơi... nhớ tui nha!.....Thằng code sửa t lẹ coiiiii!!!");
  }
  process.exit(0);
}

process.on("SIGINT", () => handleExit("SIGINT"));
process.on("SIGTERM", () => handleExit("SIGTERM"));

process.on("uncaughtException", async (err) => {
  console.error("[!] Uncaught Exception:", err);
  const channel = client.channels.cache.get("866686468437049398"); // 👈 sửa ID kênh text
  if (channel) {
    await channel.send("💀 T bị lỗi gì đó rồi nên sắp đi đây... cầu nguyện cho t restart lại đi 🪦....Thằng code sửa t lẹ coiiiii!!!");
  }
  process.exit(1);
});



