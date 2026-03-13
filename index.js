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
client.once('clientReady', async () => {
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

    // ✅ Thêm tất cả file data vào commit
    await execPromise(`
      git add data/checkins.json data/birthdays.json data/spam.json data/roles.json
    `);

    await execPromise(`
      git commit -m "Auto backup data [${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}] [skip ci]" || echo "Không có thay đổi nào"
    `);

    const remote = `https://${process.env.GITHUB_USERNAME}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPO}.git`;
    await execPromise(`git push ${remote} HEAD:main`);

    console.log("✅ Đã đẩy toàn bộ file data lên GitHub!");
  } catch (error) {
    console.error("❌ Lỗi khi push lên GitHub:", error?.message || error);
  }
}


// ========================= CRON TASKS =========================
cron.schedule('0 3 * * *', async () => {
  await pushToGitHub();
  console.log("🕒 Đã push data, chuẩn bị restart bot...");
  setTimeout(() => process.exit(0), 5000);
}, { timezone: "Asia/Ho_Chi_Minh" });
// ========================= GUILD JOIN/LEAVE =========================

// ====== MEMBER JOIN ======
client.on('guildMemberAdd', async (member) => {
  const ch = member.guild.channels.cache.get(config.channels.welcomeChannelId);
  if (!ch) return;

  const guild = member.guild;

  // Đếm thành viên không tính bot
  const memberCount = guild.members.cache.filter(m => !m.user.bot).size;

  // Random message cho vui
  const welcomeMessages = [
    `Xin chào <@${member.user.id}>! Chào mừng bạn đến với **${guild.name}** 😎`,
    `🎉 Hoan nghênh <@${member.user.id}>! Server lại đông thêm một người!`,
    `🔥 <@${member.user.id}> vừa đáp xuống server!`,
    `🚀 Boom! <@${member.user.id}> đã xuất hiện!`,
    `✨ Một thành viên mới đã đến — xin chào <@${member.user.id}>!`
  ];

  const randomWelcome = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];

  const embed = new EmbedBuilder()
    .setColor(config.colors.welcome || "#00FFB3")
    .setTitle('🎉 Chào mừng thành viên mới!')
    .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
    .setDescription(
      `${randomWelcome}\n\n` +
      `👤 **Tên:** ${member.user.username}\n` +
      `#️⃣ **Bạn là thành viên thứ:** ${memberCount}\n` +
      `📅 **Tạo tài khoản:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>\n\n` +
      `✨ Chúc bạn có trải nghiệm tuyệt nhất tại server!`
    )
    .setFooter({ text: `Server: ${guild.name}` })
    .setTimestamp();

  await ch.send({ embeds: [embed] });
});


// ====== MEMBER LEAVE ======
client.on('guildMemberRemove', async (member) => {
  const ch = member.guild.channels.cache.get(config.channels.goodbyeChannelId);
  if (!ch) return;

  // Random message chia tay
  const leaveMessages = [
    `${member.user.username} đã rời server… 😢`,
    `👋 Tạm biệt ${member.user.username}! Mong bạn sẽ quay lại.`,
    `🚪 *Cửa đóng cái “cộc”* — ${member.user.username} rời đi rồi.`,
    `😭 Buồn ghê… ${member.user.username} vừa out.`,
    `💨 Và thế là ${member.user.username} đã biến mất khỏi server.`
  ];

  const randomLeave = leaveMessages[Math.floor(Math.random() * leaveMessages.length)];

  // Đếm thành viên còn lại
  const memberCount = member.guild.members.cache.filter(m => !m.user.bot).size;

  const embed = new EmbedBuilder()
    .setColor(config.colors.goodbye || "#FF6B6B")
    .setTitle('👋 Một thành viên đã rời server')
    .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
    .setDescription(
      `${randomLeave}\n\n` +
      `👤 **Tên:** ${member.user.username}\n` +
      `#️⃣ **Thành viên còn lại:** ${memberCount}\n\n` +
      `Chúc bạn mọi điều tốt đẹp!`
    )
    .setTimestamp();

  await ch.send({ embeds: [embed] });
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
    "Em dành thời gian cho em đi. Em đi ra ngoài đường, kết bạn đi em. Làm một điều gì đó có ý nghĩa, đi kiếm tiền hay giao tiếp với bố mẹ đi. 😩",
    "Sáng sớm mà lò dò on, đúng là rảnh hết phần thiên hạ 😂"
  ],
  chiều: [
    "Chiều on chi nữa, nghỉ xíu đi 😒",
    "Ủa, chiều rồi mà vẫn chưa biến hả, bám server dữ 👀",
    "On chiều mà làm như bận lắm vậy 😏",
    "Em dành thời gian cho em đi. Em đi ra ngoài đường, kết bạn đi em. Làm một điều gì đó có ý nghĩa, đi kiếm tiền hay giao tiếp với bố mẹ đi. 😩",
    "Chiều rồi mà vẫn ngồi đây, chắc không có bạn ngoài đời 😆"
  ],
  tối: [
    "Ê con khùng, tối rồi on chi nữa 😴",
    "Tối rồi mà còn ngồi on, mai khỏi dậy nha 😏",
    "Ủa, tối rồi mà vẫn chưa biến hả, bám dai dữ 👀",
    "Em dành thời gian cho em đi. Em đi ra ngoài đường, kết bạn đi em. Làm một điều gì đó có ý nghĩa, đi kiếm tiền hay giao tiếp với bố mẹ đi. 😩",
    "On tối chi, không ra ngoài kiếm bồ đi 😎"
  ],
  khuya: [
    "Khuya rồi đồ ngu, ngủ đi chứ on chi 😪",
    "Ủa, khuya rồi mà vẫn chưa biến hả, bám dai dữ 👀",
    "Mất ngủ hả con? Khuya zầy còn on 😵",
    "Em dành thời gian cho em đi. Em đi ra ngoài đường, kết bạn đi em. Làm một điều gì đó có ý nghĩa, đi kiếm tiền hay giao tiếp với bố mẹ đi. 😩",
    "Khuya rồi mà on, chắc đang rình drama 🤨"
  ]
};

const shufflers = {
  sáng: createShuffler(greetings.sáng),
  chiều: createShuffler(greetings.chiều),
  tối: createShuffler(greetings.tối),
  khuya: createShuffler(greetings.khuya)
};

let greetedUsers = new Set();
let currentPeriod = null;

function getPeriod() {
  const now = new Date();
  const hour = (now.getUTCHours() + 7) % 24;
  if (hour >= 5 && hour < 12) return 'sáng';
  if (hour >= 12 && hour < 18) return 'chiều';
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
  const { commandName } = interaction;

  if (commandName === 'checkin') await handleCheckin(interaction);
  else if (commandName === 'status') await handleStatus(interaction);
  else if (commandName === 'reset-checkin') await handleResetCheckin(interaction, interaction.member);
  else if (commandName === 'birthday') {
    const date = interaction.options.getString('date');
    const regex = /^([0-2][0-9]|3[0-1])-(0[1-9]|1[0-2])$/;
    if (!regex.test(date)) {
      return interaction.reply({ content: '❌ Sai định dạng DD-MM', flags: 64 }); // 64 = EPHEMERAL
    }

    await interaction.deferReply({ flags: 64 }); // EPHEMERAL

    const b = await getBirthdays();
    b[interaction.user.id] = date;
    await saveBirthdays(b);

    await interaction.editReply({ content: `✅ Lưu ngày sinh: **${date}** 🎂` });
  }
});

// ========================= CRON SINH NHẬT & NGÀY LỄ =========================
cron.schedule('0 8 * * *', async () => {
  try {
    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const todayStr = `${day}-${month}`;
    const channel = client.channels.cache.get("866686468437049398"); // Thay ID kênh nếu cần
    if (!channel) return;

    // ===== Sinh nhật người dùng =====
    const birthdays = await getBirthdays();
    const usersWithBirthday = Object.entries(birthdays)
      .filter(([_, date]) => date === todayStr)
      .map(([id]) => id);

    const birthdayMessages = [
      "🎉 **Chúc mừng sinh nhật {user}!** Hôm nay là ngày đặc biệt của bạn, hãy tận hưởng trọn vẹn nhé 🎂💖",
      "🎂 **Happy Birthday {user}!** Chúc bạn tuổi mới thật nhiều niềm vui, may mắn và bánh kem 🍰🥳",
      "🎁 **{user} ơi sinh nhật vui vẻ nha!** Mong mọi điều tốt đẹp nhất sẽ đến với bạn 💫🎈",
      "🥳 **Chúc mừng sinh nhật {user}!** Một năm mới tràn ngập năng lượng, cười thật tươi nhe 😆💐",
      "💖 **{user} sinh nhật vui vẻ nhé!** Hôm nay bạn chính là main character đó 🌟🎉",
      "🍰 **{user}, sinh nhật mà không có bánh là sai nha!** Chúc bạn một ngày thật ngọt ngào 😜",
      "🎈 **Happy birthday {user}!** Cười thật nhiều, yêu thật lâu, và ngủ nướng thật sâu 😴🎂"
    ];

    for (const userId of usersWithBirthday) {
      const member = await channel.guild.members.fetch(userId).catch(() => null);
      if (member) {
        const msg = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)]
          .replace("{user}", `<@${member.id}>`);
        await channel.send(msg);
      }
    }

    // ===== Ngày lễ dương lịch cố định =====
    const specialEvents = {
      "01-01": "🎆 **Chúc mừng năm mới!** Năm nay nhất định sẽ là năm tuyệt vời của chúng ta 🥳✨",
      "14-02": "💘 **Valentine’s Day!** Gửi thật nhiều yêu thương đến những trái tim đang rung động 💞",
      "08-03": "🌸 **Ngày Quốc tế Phụ nữ!** Chúc những bông hoa xinh đẹp luôn rạng rỡ và hạnh phúc 💐",
      "01-06": "🧸 **Ngày Quốc tế Thiếu nhi!** Chúc ai còn “bé trong tim” luôn vui tươi, hồn nhiên 😆🍭",
      "20-10": "🌷 **Ngày Phụ nữ Việt Nam 20/10!** Chúc các chị em luôn xinh đẹp, tự tin và ngập tràn yêu thương 💝",
      "24-12": "🎄 **Giáng sinh an lành!** Chúc bạn một mùa Noel ấm áp, tràn tiếng cười và quà đầy tay 🎁🎅"
    };
    if (specialEvents[todayStr]) {
  await channel.send(`@everyone ${specialEvents[todayStr]}`);
}

    // ===== Tết âm & Trung Thu (3 năm tới) =====
    // Cập nhật dễ dàng: chỉ thêm/xóa entry theo format "YYYY-MM-DD"
    const lunarSpecialEvents = {
      "2026-02-10": "🧧 **Chúc mừng Tết Nguyên Đán 2026!** Cầu mong năm mới an khang, vạn sự như ý 🍊🐉",
      "2026-09-29": "🌕 **Trung Thu 2026!** Chúc bạn đêm rằm thật đẹp, có bánh nướng, có trà, có người thương 🌝🍵",
      "2027-01-30": "🧧 **Chúc mừng Tết Nguyên Đán 2027!** Năm mới hạnh phúc, bình an và thịnh vượng 🐲🎉",
      "2027-09-18": "🌕 **Trung Thu 2027!** Chúc bạn đêm rằm thật đẹp, sum vầy bên gia đình 🌝🍵",
      "2028-02-18": "🧧 **Chúc mừng Tết Nguyên Đán 2028!** Năm mới phát tài phát lộc, vui khỏe, vạn sự như ý 🍊🐲",
      "2028-10-06": "🌕 **Trung Thu 2028!** Chúc bạn đêm rằm thật đẹp, đầy bánh nướng, trà ngon và hạnh phúc 🌝🍵"
    };
    const todayISO = today.toISOString().slice(0, 10); // YYYY-MM-DD
    if (lunarSpecialEvents[todayISO]) {
  await channel.send(`@everyone ${lunarSpecialEvents[todayISO]}`);
}

  } catch (err) {
    console.error("❌ Lỗi khi chúc mừng ngày đặc biệt:", err);
  }
}, { timezone: "Asia/Ho_Chi_Minh" });

// ========================= CHECKIN / STATUS / RESET =========================
async function handleCheckin(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const today = getTodayKey(); // YYYY-MM-DD
  const month = getMonthKey();
  const checkins = await getCheckins();

  if (!checkins[month]) checkins[month] = {};
  if (!checkins[month][userId]) checkins[month][userId] = { dates: [], total: 0 };

  if (checkins[month][userId].dates.includes(today))
    return interaction.editReply('⚠️ Bạn đã điểm danh hôm nay!');

  // Lưu dữ liệu check-in
  checkins[month][userId].dates.push(today);
  checkins[month][userId].total++;
  await saveCheckins(checkins);
  await pushToGitHub();

  // Format ngày kiểu DD/MM/YYYY
  const [y, m, d] = today.split("-");
  const displayVNDate = `${d}/${m}/${y}`;

  const embed = new EmbedBuilder()
    .setColor('#00FFB3')
    .setTitle('✅ Điểm danh thành công!')
    .setDescription(
      `**<@${userId}> đã điểm danh hôm nay!**\n\n` +
      `📅 **Ngày:** ${displayVNDate}\n` +
      `🔥 **Tháng này:** ${checkins[month][userId].total} ngày\n\n` +
      `Tiếp tục phát huy!`
    )
    .setFooter({
      text: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
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
