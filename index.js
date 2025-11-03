const { 
  Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, REST, Routes 
} = require('discord.js');
const cron = require('node-cron');
const http = require('http');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const config = require('./config.json');
const {
  getCheckins, saveCheckins,
  getSpamData, saveSpamData,
  getRoleAssignments, saveRoleAssignments,
  getTodayKey, getMonthKey,
  getBirthdays, saveBirthdays
} = require('./utils');

// ---------------------------------- CLIENT ----------------------------------
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

  const now = new Date();
  const hourVN = (now.getUTCHours() + 7) % 24;

  if (hourVN < 3 || hourVN >= 7) {
    const channel = client.channels.cache.get("866686468437049398");
    if (channel) {
      const greetings = [
        "😎 Alo alo, tao on lại rồi nè mấy khứa!",
        "🧟‍♂️ Tao đã sống lại sau cái chết tạm thời 😭",
        "🔥 Restart xong rồi, tiếp tục phá nào!",
        "🫡 Vừa reboot xong, có ai nhớ t không?"
      ];
      channel.send(greetings[Math.floor(Math.random() * greetings.length)]);
    }
  } else {
    console.log("🌙 Bot restart trong khung 3h–7h → không gửi lời chào.");
  }

  // Register slash commands
  const commands = [
    { name: 'checkin', description: 'Điểm danh hàng ngày để theo dõi sự tham gia' },
    { name: 'status', description: 'Hiển thị trạng thái bot và thống kê' },
    { name: 'reset-checkin', description: 'Đặt lại dữ liệu điểm danh (Chỉ Admin)' },
    { 
      name: 'birthday', 
      description: 'Đăng ký ngày sinh của bạn',
      options: [
        {
          name: 'date',
          description: 'Nhập ngày sinh của bạn (định dạng DD-MM)',
          type: 3,
          required: true
        }
      ]
    }
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    for (const guild of client.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
    }
    console.log('✅ Slash commands registered!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }

  scheduleTasks();
});

// -------------------- Push data lên GitHub --------------------
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

// -------------------- Các nhiệm vụ tự động --------------------
cron.schedule('0 3 * * *', async () => {
  const channel = client.channels.cache.get("866686468437049398");
  if (channel) await channel.send("😴 Bái bai bây t đi ngủ đây... mai gặp lại mấy khứa 😪");
  await pushToGitHub();
  console.log("🕒 Đã push data, chuẩn bị restart bot...");
  setTimeout(() => process.exit(0), 5000);
});

cron.schedule('0 7 * * *', async () => {
  const channel = client.channels.cache.get("866686468437049398");
  if (channel) await channel.send("🌞 Dậy làm việc tiếp thôi nào mấy khứa ơi!!!");
});

// === Anti-dead system ===
const BORED_CHANNEL_ID = "866686468437049398";
const boredMessages = [
  "😢 Sao đi hết vậy, 1 mình buồn quá...",
  "😴 Gr này im như tờ, ai còn ở đây hong?",
  "👀 Alo? Có ai không hay server này thành nghĩa địa rồi 😭",
];
const aliveMessages = [
  "😳 Ô trời ơi có người rồi!! Tưởng chết hẳn luôn chứ 😭",
  "🥹 Cuối cùng cũng có tiếng người...",
];
let lastActivity = Date.now();
let serverIsDead = false;

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const now = Date.now();
  if (serverIsDead && now - lastActivity >= 5 * 60 * 60 * 1000) {
    const channel = client.channels.cache.get(BORED_CHANNEL_ID);
    if (channel) await channel.send(aliveMessages[Math.floor(Math.random() * aliveMessages.length)]);
    serverIsDead = false;
  }
  lastActivity = now;
});

setInterval(async () => {
  const now = Date.now();
  const channel = client.channels.cache.get(BORED_CHANNEL_ID);
  if (!serverIsDead && now - lastActivity >= 5 * 60 * 60 * 1000 && channel) {
    await channel.send(boredMessages[Math.floor(Math.random() * boredMessages.length)]);
    serverIsDead = true;
  }
}, 10 * 60 * 1000);

// -------------------- Guild member join/leave --------------------
client.on('guildMemberAdd', async (member) => {
  const ch = member.guild.channels.cache.get(config.channels.welcomeChannelId);
  if (!ch) return;
  const e = new EmbedBuilder()
    .setColor(config.colors.welcome)
    .setTitle('🎉 Chào mừng đến với Server!')
    .setDescription(`Xin chào ${member}!`)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
  await ch.send({ embeds: [e] });
});

client.on('guildMemberRemove', async (member) => {
  const ch = member.guild.channels.cache.get(config.channels.goodbyeChannelId);
  if (!ch) return;
  const e = new EmbedBuilder()
    .setColor(config.colors.goodbye)
    .setTitle('👋 Tạm biệt!')
    .setDescription(`${member.user.tag} đã rời khỏi server.`)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
  await ch.send({ embeds: [e] });
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
// -------------------- Slash commands handler --------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, member } = interaction;

  if (commandName === 'checkin') await handleCheckin(interaction);
  else if (commandName === 'status') await handleStatus(interaction);
  else if (commandName === 'reset-checkin') await handleResetCheckin(interaction, member);
  else if (commandName === 'birthday') {
    const date = interaction.options.getString('date');
    const regex = /^([0-2][0-9]|3[0-1])-(0[1-9]|1[0-2])$/;
    if (!regex.test(date))
      return interaction.reply({ content: '❌ Sai định dạng DD-MM', ephemeral: true });
    const b = await getBirthdays();
    b[interaction.user.id] = date;
    await saveBirthdays(b);
    await interaction.reply({ content: `✅ Lưu ngày sinh: **${date}** 🎂`, ephemeral: true });
  }
});

// -------------------- Handle Checkin --------------------
async function handleCheckin(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const userId = interaction.user.id;
  const today = getTodayKey();
  const month = getMonthKey();
  const checkins = await getCheckins();
  if (!checkins[month]) checkins[month] = {};
  if (!checkins[month][userId]) checkins[month][userId] = { dates: [], total: 0 };
  if (checkins[month][userId].dates.includes(today))
    return interaction.editReply('⚠️ Bạn đã điểm danh hôm nay!');
  checkins[month][userId].dates.push(today);
  checkins[month][userId].total++;
  await saveCheckins(checkins);
  await pushToGitHub();
  await interaction.editReply('✅ Điểm danh thành công!');
}

// -------------------- Handle Status --------------------
async function handleStatus(interaction) {
  const uptime = Date.now() - botStartTime;
  const h = Math.floor(uptime / 3600000);
  const m = Math.floor((uptime % 3600000) / 60000);
  const s = Math.floor((uptime % 60000) / 1000);
  const embed = new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle('🤖 Trạng thái Bot')
    .setDescription(`Bot đang hoạt động ${h}h ${m}m ${s}s`)
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

// -------------------- Handle Reset Checkin --------------------
async function handleResetCheckin(interaction, member) {
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdmin)
    return interaction.reply({ content: '❌ Cần quyền quản trị viên!', ephemeral: true });
  await saveCheckins({});
  await interaction.reply('✅ Đã reset dữ liệu điểm danh!');
}

// -------------------- Scheduled Tasks --------------------
function scheduleTasks() {
  cron.schedule('0 0 * * *', () => console.log('⏰ Daily maintenance check'));
}

// -------------------- Login --------------------
if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('❌ ERROR: DISCORD_BOT_TOKEN is not set!');
  process.exit(1);
}
client.login(process.env.DISCORD_BOT_TOKEN);
