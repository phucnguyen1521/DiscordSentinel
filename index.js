// ========================= IMPORTS =========================
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionFlagsBits,
  REST,
  Routes
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

// ========================= CLIENT SETUP =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
  partials: ['USER', 'GUILD_MEMBER']
});

const botStartTime = Date.now();
const userMessageTimestamps = new Map();

// ========================= DUMMY SERVER (Render keepalive) =========================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!\n');
}).listen(PORT, () => console.log(`🌐 Dummy server listening on port ${PORT}`));

// ========================= BOT READY =========================
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

  // ==== Đăng Slash Commands ====
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
    const guilds = await client.guilds.fetch();
    await Promise.all([...guilds.values()].map(async g => {
      try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, g.id), { body: commands });
        console.log(`✅ Registered commands for guild ${g.id}`);
      } catch (e) {
        console.warn(`⚠️ Không thể register commands cho guild ${g.id}:`, e.message);
      }
    }));
    console.log('✅ Slash commands registered!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }

  scheduleTasks();
});

// ========================= PUSH TO GITHUB =========================
async function pushToGitHub() {
  if (!process.env.GITHUB_USERNAME || !process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) {
    console.warn('⚠️ Bỏ qua pushToGitHub: thiếu biến môi trường GITHUB_*');
    return;
  }
  try {
    console.log("📤 Đang đẩy dữ liệu lên GitHub...");
    await execPromise(`git config user.email "bot@render.com"`);
    await execPromise(`git config user.name "Render Bot"`);
    await execPromise(`git add data/checkins.json`);
    await execPromise(`git commit -m "Auto update checkins.json [skip ci]" || echo "Không có thay đổi nào"`);
    const remote = `https://${process.env.GITHUB_USERNAME}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}.git`;
    await execPromise(`git push ${remote} HEAD:main`);
    console.log("✅ Đã đẩy file lên GitHub!");
  } catch (error) {
    console.error("❌ Lỗi khi push lên GitHub:", error?.message || error);
  }
}

// ========================= CRON TASKS =========================
cron.schedule('0 3 * * *', async () => {
  const channel = client.channels.cache.get("866686468437049398");
  if (channel) await channel.send("😴 Bái bai bây t đi ngủ đây... mai gặp lại mấy khứa 😪");
  await pushToGitHub();
  console.log("🕒 Đã push data, chuẩn bị restart bot...");
  setTimeout(() => process.exit(0), 5000);
}, { timezone: "Asia/Ho_Chi_Minh" });

cron.schedule('0 7 * * *', async () => {
  const channel = client.channels.cache.get("866686468437049398");
  if (channel) await channel.send("🌞 Dậy làm việc tiếp thôi nào mấy khứa ơi!!!");
}, { timezone: "Asia/Ho_Chi_Minh" });

// ========================= ANTI-DEAD SYSTEM =========================
const BORED_CHANNEL_ID = "866686468437049398";
const boredMessages = [
  "😢 Sao đi hết vậy, 1 mình buồn quá...",
  "😴 Gr này im như tờ, ai còn ở đây hong?",
  "👀 Alo? Có ai không hay server này thành nghĩa địa rồi 😭"
];
const aliveMessages = [
  "😳 Ô trời ơi có người rồi!! Tưởng chết hẳn luôn chứ 😭",
  "🥹 Cuối cùng cũng có tiếng người..."
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

// ========================= GUILD JOIN/LEAVE =========================
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

// ========================= GREETING SYSTEM =========================
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

const greetings = {
  sáng: [
    "Chào buổi sáng tốt lành ☀️",
    "Ê con ngu kia, on sớm zậy định phá server hả 😤",
    "Một vị cao nhân từng nói: dậy xớm có làm thì mới có ăn không làm mà đòi có ăn thì ăn đầu BUỒI ăn CỨT thế cho nó dễ 😤",
    "Ủa, onl sớm dữ, tính đi làm người giàu hả nhưng mà mày vẫn nghèo 😏",
    "Em bước ra ngoài, kết bạn đi, làm điều gì đó có ý nghĩa... 😩",
    "Sáng sớm mà lò dò on, đúng là rảnh hết phần thiên hạ 😂"
  ],
  trưa: [
    "Chào buổi trưa nè 🌤️",
    "Trưa on chi, không lo ăn lo ngủ, đúng đồ nghiện game 😤",
    "Ủa, trưa mà on chi? Mày không có đời sống hả 😂",
    "Trưa on là biết rảnh quá rồi đó nha 😎"
  ],
  chiều: [
    "Chiều on chi nữa, nghỉ xíu đi 😒",
    "Ủa, chiều rồi mà vẫn chưa biến hả, bám server dữ 👀",
    "On chiều mà làm như bận lắm vậy 😏",
    "Chiều rồi mà vẫn ngồi đây, chắc không có bạn ngoài đời 😆"
  ],
  tối: [
    "Ê con khùng, tối rồi on chi nữa 😴",
    "Tối rồi mà còn ngồi on, mai khỏi dậy nha 😏",
    "Ủa, tối rồi mà vẫn chưa biến hả, bám dai dữ 👀",
    "On tối chi, không ra ngoài kiếm bồ đi 😎"
  ],
  khuya: [
    "Khuya rồi đồ ngu, ngủ đi chứ on chi 😪",
    "Ủa, khuya rồi mà vẫn chưa biến hả, bám dai dữ 👀",
    "Mất ngủ hả con? Khuya zầy còn on 😵",
    "Khuya rồi mà on, chắc đang rình drama 🤨"
  ]
};

const shufflers = {
  sáng: createShuffler(greetings.sáng),
  trưa: createShuffler(greetings.trưa),
  chiều: createShuffler(greetings.chiều),
  tối: createShuffler(greetings.tối),
  khuya: createShuffler(greetings.khuya)
};

let greetedUsers = new Set();
let currentPeriod = null;

function getPeriod() {
  const now = new Date();
  const hour = (now.getUTCHours() + 7) % 24;
  if (hour >= 5 && hour < 11) return 'sáng';
  if (hour >= 11 && hour < 13) return 'trưa';
  if (hour >= 13 && hour < 18) return 'chiều';
  if (hour >= 18 && hour < 22) return 'tối';
  return 'khuya';
}

client.on('presenceUpdate', async (oldPresence, newPresence) => {
  try {
    if (!newPresence) return;
    const userId = newPresence.userId || newPresence.user?.id;
    if (!userId) return;
    if (client.users.cache.get(userId)?.bot) return;

    let member = newPresence.member;
    if (!member) {
      const guild = client.guilds.cache.get(newPresence.guild?.id || newPresence.guildId);
      if (guild) member = await guild.members.fetch(userId).catch(() => null);
    }
    if (!member) return;

    const oldStatus = oldPresence?.status;
    const newStatus = newPresence.status;
    const wentOnline =
      (oldStatus === 'offline' || oldStatus === 'invisible' || oldStatus === undefined) &&
      newStatus === 'online';
    const resumedFromIdleOrDnd =
      (oldStatus === 'idle' || oldStatus === 'dnd') && newStatus === 'online';
    if (!wentOnline && !resumedFromIdleOrDnd) return;

    const period = getPeriod();
    if (period !== currentPeriod) {
      currentPeriod = period;
      greetedUsers.clear();
      console.log(`🕒 Đã chuyển sang buổi "${period}" — reset danh sách chào.`);
    }

    if (greetedUsers.has(userId)) return;
    greetedUsers.add(userId);

    const getGreeting = shufflers[period] || (() => 'Chào bạn!');
    const chosen = getGreeting();
    const greetingChannelId = config.channels.greetingChannelId;
    if (!greetingChannelId) return console.warn('⚠️ greetingChannelId chưa cấu hình!');

    const channel =
      member.guild.channels.cache.get(greetingChannelId) ||
      await member.guild.channels.fetch(greetingChannelId).catch(() => null);
    if (!channel) return;

    await channel.send(`👋 <@${userId}> ${chosen}`);
    console.log(`✅ Gửi lời chào ${member.user.tag} (${period}): ${chosen}`);
  } catch (err) {
    console.error('❌ Lỗi khi xử lý presenceUpdate:', err);
  }
});

// ========================= SLASH COMMAND HANDLER =========================
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

// ========================= CHECKIN / STATUS / RESET =========================
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

async function handleResetCheckin(interaction, member) {
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  if (!isAdmin)
    return interaction.reply({ content: '❌ Cần quyền quản trị viên!', ephemeral: true });
  await saveCheckins({});
  await interaction.reply('✅ Đã reset dữ liệu điểm danh!');
}

// ========================= SCHEDULED TASKS =========================
function scheduleTasks() {
  cron.schedule('0 0 * * *', () => console.log('⏰ Daily maintenance check'), {
    timezone: "Asia/Ho_Chi_Minh"
  });
}

// ========================= ERROR HANDLING =========================
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Unhandled Rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
});

// ========================= LOGIN =========================
if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('❌ ERROR: DISCORD_BOT_TOKEN is not set!');
  process.exit(1);
}
client.login(process.env.DISCORD_BOT_TOKEN);
