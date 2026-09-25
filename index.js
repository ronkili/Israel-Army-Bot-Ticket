require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  MessageFlags
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const config = require("./config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DATA_DIR = process.env.DATA_DIR || "/app/data";
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const TICKET_DATA_FILE = path.join(DATA_DIR, "tickets.json");

const XP_DATA_FILE = path.join(DATA_DIR, "xp.json");

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error("❌ Failed to load JSON:", error);
    return fallback;
  }
}

function saveJson(file, data) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temp, file);
}

const ticketData = loadJson(TICKET_DATA_FILE, { tickets: {} });

const xpData = loadJson(XP_DATA_FILE, { guilds: {} });

const messageXpCooldowns = new Map();
const casinoCooldowns = new Map();
const blackjackGames = new Map();

function saveTicketData() {
  saveJson(TICKET_DATA_FILE, ticketData);
}


function saveXpData() {
  saveJson(XP_DATA_FILE, xpData);
}

function getGuildXp(guildId) {
  if (!xpData.guilds[guildId]) {
    xpData.guilds[guildId] = { users: {} };
  }

  if (!xpData.guilds[guildId].users) {
    xpData.guilds[guildId].users = {};
  }

  return xpData.guilds[guildId];
}

function getXpProfile(guildId, userId) {
  const guildData = getGuildXp(guildId);

  if (!guildData.users[userId]) {
    guildData.users[userId] = {
      xp: 0,
      messages: 0,
      lastDailyAt: 0
    };
  }

  const profile = guildData.users[userId];

  profile.xp = Math.max(0, Number(profile.xp || 0));
  profile.messages = Math.max(0, Number(profile.messages || 0));
  profile.lastDailyAt = Math.max(0, Number(profile.lastDailyAt || 0));

  return profile;
}

function changeXp(guildId, userId, amount) {
  const profile = getXpProfile(guildId, userId);

  profile.xp = Math.max(
    0,
    profile.xp + Number(amount || 0)
  );

  saveXpData();

  return profile.xp;
}

function randomInt(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

function formatXp(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function casinoCheck(guildId, userId, bet) {
  const amount = Number(bet);

  if (!Number.isInteger(amount) || amount <= 0) {
    return {
      ok: false,
      message:
        "❌ סכום ה־XP חייב להיות מספר שלם וחיובי."
    };
  }

  const maxBet =
    Number(config.maxCasinoBet || 1000);

  if (amount > maxBet) {
    return {
      ok: false,
      message:
        `❌ המקסימום למשחק הוא **${formatXp(maxBet)} XP**.`
    };
  }

  const profile =
    getXpProfile(guildId, userId);

  if (profile.xp < amount) {
    return {
      ok: false,
      message:
        `❌ אין לך מספיק XP. יש לך **${formatXp(profile.xp)} XP**.`
    };
  }

  const key =
    `${guildId}:${userId}`;

  const cooldownMs =
    Number(
      config.casinoCooldownMs ||
      5000
    );

  const last =
    casinoCooldowns.get(key) || 0;

  const left =
    cooldownMs -
    (Date.now() - last);

  if (left > 0) {
    return {
      ok: false,
      message:
        `⏳ חכה עוד **${Math.ceil(left / 1000)} שניות** לפני משחק נוסף.`
    };
  }

  casinoCooldowns.set(
    key,
    Date.now()
  );

  return {
    ok: true,
    bet: amount
  };
}

function casinoInfoEmbed() {
  return new EmbedBuilder()
    .setColor("Gold")
    .setTitle("🎰 The Club Casino")
    .setDescription(
      [
        "ברוכים הבאים לקזינו של **The Club**.",
        "",
        "🎮 כל המשחקים משתמשים ב־**XP וירטואלי בלבד**.",
        "ל־XP אין ערך כספי, אי אפשר לקנות אותו ואין Cashout.",
        "",
        "**פקודות:**",
        "`!xp` / `!balance` — יתרת XP",
        "`!daily` — בונוס יומי",
        "`!coinflip <xp> <heads/tails>`",
        "`!dice <xp> <1-6>`",
        "`!slots <xp>`",
        "`!roulette <xp> <red/black/green>`",
        "`!blackjack <xp>` / `!bj <xp>`",
        "`!leaderboard` / `!lb` — Top 10",
        "`!casino` — המידע הזה",
        "",
        `💰 Max bet: **${formatXp(config.maxCasinoBet || 1000)} XP**`,
        `⏱️ Cooldown: **${Math.ceil(Number(config.casinoCooldownMs || 5000) / 1000)} שניות**`
      ].join("\\n")
    )
    .setFooter({
      text:
        "The Club Casino • Virtual XP only"
    })
    .setTimestamp();
}

function drawCard() {
  const cards = [
    2, 3, 4, 5, 6, 7, 8, 9, 10,
    10, 10, 10, 11
  ];

  return cards[
    Math.floor(
      Math.random() *
      cards.length
    )
  ];
}

function handValue(cards) {
  let total =
    cards.reduce(
      (sum, card) =>
        sum + card,
      0
    );

  let aces =
    cards.filter(
      card => card === 11
    ).length;

  while (
    total > 21 &&
    aces > 0
  ) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function blackjackButtons(userId) {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `bj_hit:${userId}`
          )
          .setLabel("Hit")
          .setEmoji("🃏")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            `bj_stand:${userId}`
          )
          .setLabel("Stand")
          .setEmoji("✋")
          .setStyle(
            ButtonStyle.Success
          )
      )
  ];
}

function blackjackEmbed(game, finishedText = null) {
  const playerTotal =
    handValue(
      game.player
    );

  const dealerTotal =
    handValue(
      game.dealer
    );

  return new EmbedBuilder()
    .setColor(
      finishedText
        ? "Gold"
        : "Blue"
    )
    .setTitle(
      "🃏 The Club Blackjack"
    )
    .setDescription(
      [
        `💰 הימור: **${formatXp(game.bet)} XP**`,
        "",
        `👤 היד שלך: **${game.player.join(" • ")}**`,
        `סה״כ: **${playerTotal}**`,
        "",
        finishedText
          ? `🤖 הדילר: **${game.dealer.join(" • ")}**\\nסה״כ: **${dealerTotal}**`
          : `🤖 הדילר: **${game.dealer[0]} • ?**`,
        "",
        finishedText ||
          "בחר **Hit** או **Stand**."
      ].join("\\n")
    )
    .setFooter({
      text:
        "Virtual XP only • No real money"
    })
    .setTimestamp();
}

async function finishBlackjack(
  interaction,
  game
) {
  while (
    handValue(
      game.dealer
    ) < 17
  ) {
    game.dealer.push(
      drawCard()
    );
  }

  const playerTotal =
    handValue(
      game.player
    );

  const dealerTotal =
    handValue(
      game.dealer
    );

  let resultText;

  if (playerTotal > 21) {
    changeXp(
      game.guildId,
      game.userId,
      -game.bet
    );

    resultText =
      `💥 עברת 21. הפסדת **${formatXp(game.bet)} XP**.`;
  } else if (
    dealerTotal > 21 ||
    playerTotal > dealerTotal
  ) {
    changeXp(
      game.guildId,
      game.userId,
      game.bet
    );

    resultText =
      `🏆 ניצחת וקיבלת **${formatXp(game.bet)} XP**.`;
  } else if (
    playerTotal < dealerTotal
  ) {
    changeXp(
      game.guildId,
      game.userId,
      -game.bet
    );

    resultText =
      `❌ הדילר ניצח. הפסדת **${formatXp(game.bet)} XP**.`;
  } else {
    resultText =
      "🤝 תיקו — ה־XP שלך לא השתנה.";
  }

  blackjackGames.delete(
    `${game.guildId}:${game.userId}`
  );

  return interaction.update({
    embeds: [
      blackjackEmbed(
        game,
        resultText
      )
    ],
    components: []
  });
}

const VERIFY_READ_ONLY_NAME_HINTS = [
  "updates",
  "update",
  "server-updates",
  "announcements",
  "announcement",
  "news",
  "rules",
  "עדכונים",
  "חדשות",
  "חוקים"
];

function normalizeChannelName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function isVerifyReadOnlyChannel(channel) {
  const configuredIds =
    Array.isArray(config.verifyReadOnlyChannelIds)
      ? config.verifyReadOnlyChannelIds
      : [];

  if (configuredIds.includes(channel.id)) {
    return true;
  }

  const normalized =
    normalizeChannelName(channel.name);

  return VERIFY_READ_ONLY_NAME_HINTS.some(
    hint =>
      normalized.includes(
        normalizeChannelName(hint)
      )
  );
}

function canEditChannelPermissions(channel) {
  return Boolean(
    channel &&
    !channel.isThread?.() &&
    channel.permissionOverwrites &&
    typeof channel.permissionOverwrites.edit === "function"
  );
}

async function setupVerifyPermissions(interaction) {
  const guild =
    interaction.guild;

  const verifyChannel =
    interaction.channel;

  if (
    !guild ||
    !verifyChannel ||
    !verifyChannel.isTextBased()
  ) {
    throw new Error(
      "VERIFY_CHANNEL_INVALID"
    );
  }

  if (!config.memberRoleId) {
    throw new Error(
      "MEMBER_ROLE_NOT_CONFIGURED"
    );
  }

  const memberRole =
    await guild.roles
      .fetch(config.memberRoleId)
      .catch(() => null);

  if (!memberRole) {
    throw new Error(
      "MEMBER_ROLE_NOT_FOUND"
    );
  }

  if (memberRole.managed) {
    throw new Error(
      "MEMBER_ROLE_MANAGED"
    );
  }

  const botMember =
    await guild.members
      .fetchMe()
      .catch(() => null);

  if (!botMember) {
    throw new Error(
      "BOT_MEMBER_NOT_FOUND"
    );
  }

  if (
    !botMember.permissions.has(
      PermissionFlagsBits.ManageChannels
    )
  ) {
    throw new Error(
      "BOT_MISSING_MANAGE_CHANNELS"
    );
  }

  if (
    !botMember.permissions.has(
      PermissionFlagsBits.ManageRoles
    )
  ) {
    throw new Error(
      "BOT_MISSING_MANAGE_ROLES"
    );
  }

  if (
    memberRole.position >=
    botMember.roles.highest.position
  ) {
    throw new Error(
      "BOT_ROLE_TOO_LOW"
    );
  }

  const everyoneRole =
    guild.roles.everyone;

  const channels =
    await guild.channels.fetch();

  // Snapshot only channels that are public BEFORE setup.
  // Private Staff/Admin channels are intentionally skipped.
  const publicChannels =
    [...channels.values()]
      .filter(channel => {
        if (
          !canEditChannelPermissions(channel)
        ) {
          return false;
        }

        if (
          channel.id ===
          verifyChannel.id
        ) {
          return false;
        }

        const everyonePermissions =
          channel.permissionsFor(
            everyoneRole
          );

        return Boolean(
          everyonePermissions?.has(
            PermissionFlagsBits.ViewChannel
          )
        );
      });

  // Verify stays visible to @everyone, but read-only.
  await verifyChannel
    .permissionOverwrites
    .edit(
      everyoneRole,
      {
        ViewChannel: true,
        SendMessages: false,
        AddReactions: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false
      },
      {
        reason:
          "The Club automatic Verify setup"
      }
    );

  let lockedChannels = 0;
  let readOnlyChannels = 0;
  let failedChannels = 0;

  const orderedChannels =
    publicChannels.sort(
      (a, b) => {
        const aCategory =
          a.type ===
          ChannelType.GuildCategory
            ? 0
            : 1;

        const bCategory =
          b.type ===
          ChannelType.GuildCategory
            ? 0
            : 1;

        return aCategory - bCategory;
      }
    );

  for (const channel of orderedChannels) {
    try {
      await channel
        .permissionOverwrites
        .edit(
          everyoneRole,
          {
            ViewChannel: false
          },
          {
            reason:
              "The Club automatic Member-only setup"
          }
        );

      const memberPermissions = {
        ViewChannel: true
      };

      const readOnly =
        isVerifyReadOnlyChannel(channel);

      if (readOnly) {
        memberPermissions.SendMessages = false;
        memberPermissions.AddReactions = false;
        memberPermissions.CreatePublicThreads = false;
        memberPermissions.CreatePrivateThreads = false;
        memberPermissions.SendMessagesInThreads = false;
      }

      await channel
        .permissionOverwrites
        .edit(
          memberRole,
          memberPermissions,
          {
            reason:
              readOnly
                ? "The Club Member read-only channel"
                : "The Club Member-only channel"
          }
        );

      lockedChannels += 1;

      if (readOnly) {
        readOnlyChannels += 1;
      }
    } catch (error) {
      failedChannels += 1;

      console.error(
        `❌ Verify setup failed for channel ${channel.id}:`,
        error
      );
    }
  }

  return {
    memberRole,
    verifyChannel,
    lockedChannels,
    readOnlyChannels,
    failedChannels
  };
}

function verifySetupResultEmbed(result) {
  return new EmbedBuilder()
    .setColor(
      result.failedChannels
        ? "Orange"
        : "Green"
    )
    .setTitle(
      "✅ Verify Setup הושלם"
    )
    .setDescription(
      [
        `🔐 **${result.lockedChannels}** חדרים ציבוריים הפכו ל־Members בלבד.`,
        `📢 **${result.readOnlyChannels}** חדרים הוגדרו לקריאה בלבד.`,
        `⚠️ **${result.failedChannels}** חדרים לא עודכנו בגלל הרשאות/שגיאה.`,
        "",
        `✅ חדר ה־Verify נשאר פתוח לכולם: ${result.verifyChannel}`,
        `👥 רול Member: ${result.memberRole}`,
        "",
        "חדרי Staff/Admin שכבר היו פרטיים לא נפתחו ל־Members."
      ].join("\n")
    )
    .setFooter({
      text:
        "The Club • Automatic Verify Setup"
    })
    .setTimestamp();
}

function buildVerifyPanel() {
  const embed =
    new EmbedBuilder()
      .setColor("Green")
      .setTitle(
        "✅ The Club • Verify"
      )
      .setDescription(
        [
          "ברוכים הבאים ל־**The Club**!",
          "",
          "לחצו על הכפתור **Verify** כדי לקבל גישה לשרת.",
          "",
          "לאחר האימות תקבלו אוטומטית את רול ה־Member."
        ].join("\n")
      )
      .setFooter({
        text:
          "The Club • Verification System"
      })
      .setTimestamp();

  if (client.user) {
    embed.setThumbnail(
      client.user.displayAvatarURL({
        size: 256
      })
    );
  }

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "verify_member"
          )
          .setLabel("Verify")
          .setEmoji("✅")
          .setStyle(
            ButtonStyle.Success
          )
      );

  return {
    embeds: [embed],
    components: [row]
  };
}

function canSendPanel(member, guild) {
  return Boolean(
    member?.id === guild?.ownerId ||
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    (
      config.ticketStaffRoleId &&
      member?.roles?.cache?.has(config.ticketStaffRoleId)
    )
  );
}

function isTicketStaff(member, ticketType) {
  if (!member) return false;

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (
    ticketType === "role_exam" &&
    config.examStaffRoleId &&
    member.roles.cache.has(config.examStaffRoleId)
  ) {
    return true;
  }

  return Boolean(
    config.ticketStaffRoleId &&
    member.roles.cache.has(config.ticketStaffRoleId)
  );
}

function getTicketTypeFromChannel(channel) {
  const match = String(channel?.topic || "").match(/ticketType:([a-z_]+)/);
  return match ? match[1] : null;
}

function getTicketOwnerFromChannel(channel) {
  const match = String(channel?.topic || "").match(/ticketOwner:(\d+)/);
  return match ? match[1] : null;
}

function getTicketClaimedBy(channel) {
  const match = String(channel?.topic || "").match(/claimedBy:(\d+)/);
  return match ? match[1] : null;
}

function withClaimedBy(topic, userId) {
  const base = String(topic || "")
    .replace(/\s*\|\s*claimedBy:\d+/g, "");

  return userId
    ? `${base} | claimedBy:${userId}`
    : base;
}

function ticketTypeInfo(type) {
  const map = {
    question: {
      emoji: "❓",
      name: "שאלה",
      color: "Blue",
      staffRoleId: config.ticketStaffRoleId
    },
    report_user: {
      emoji: "⚠️",
      name: "דיווח על משתמש",
      color: "Orange",
      staffRoleId: config.ticketStaffRoleId
    },
    role_exam: {
      emoji: "📖",
      name: "בחינה לתפקיד",
      color: "Purple",
      staffRoleId: config.examStaffRoleId || config.ticketStaffRoleId
    }
  };

  return map[type] || null;
}

function safeChannelName(username) {
  return String(username || "user")
    .toLowerCase()
    .replace(/[^a-z0-9א-ת_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 24);
}

function buildTicketPanel() {
  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle("🎫 The Club • מרכז טיקטים")
    .setDescription(
      [
        "ברוכים הבאים למרכז התמיכה של **The Club**.",
        "",
        "בחרו את סוג הפנייה שמתאים לכם באמצעות הכפתורים למטה.",
        "",
        "❓ **שאלה**",
        "לשאלות כלליות, מידע ועזרה.",
        "",
        "⚠️ **דיווח על משתמש**",
        "לדיווח על משתמש שעובר על החוקים או מפריע בשרת.",
        "",
        "📖 **בחינה לתפקיד**",
        "לפתיחת טיקט בחינה לתפקיד בשרת.",
        "",
        "⚠️ פתיחת טיקט ללא סיבה או ספאם עלולה להוביל לסגירת הטיקט."
      ].join("\n")
    )
    .setFooter({ text: "The Club • Ticket System" })
    .setTimestamp();

  if (client.user) {
    embed.setThumbnail(client.user.displayAvatarURL({ size: 256 }));
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open:question")
      .setLabel("שאלה")
      .setEmoji("❓")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("ticket_open:report_user")
      .setLabel("דיווח על משתמש")
      .setEmoji("⚠️")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("ticket_open:role_exam")
      .setLabel("בחינה לתפקיד")
      .setEmoji("📖")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row] };
}

function ticketControls(claimedBy = null) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(claimedBy ? "ticket_release" : "ticket_claim")
        .setLabel(claimedBy ? "שחרור טיקט" : "לקיחת טיקט")
        .setEmoji(claimedBy ? "🔓" : "🙋")
        .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("ticket_add_user")
        .setLabel("הוספת משתמש")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ticket_remove_user")
        .setLabel("הסרת משתמש")
        .setEmoji("➖")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("סגירת טיקט")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildRoleExamEmbeds() {
  return [
    new EmbedBuilder()
      .setColor("Purple")
      .setTitle("📖 בחינה לתפקיד — חלק 1")
      .setDescription(
        [
          "ענה על השאלות בצורה מסודרת ומפורטת.",
          "",
          "**1. מה השם / הכינוי שלך בדיסקורד?**",
          "",
          "**2. בן/בת כמה אתה?**",
          "",
          "**3. לאיזה תפקיד אתה רוצה להתקבל?**",
          "",
          "**4. למה אתה רוצה את התפקיד הזה?**",
          "",
          "**5. האם יש לך ניסיון קודם? אם כן — פרט.**"
        ].join("\n")
      ),

    new EmbedBuilder()
      .setColor("Purple")
      .setTitle("📖 בחינה לתפקיד — חלק 2")
      .setDescription(
        [
          "**6. כמה זמן אתה יכול להשקיע בשרת ביום?**",
          "",
          "**7. איך היית מתמודד עם משתמש שעובר על החוקים?**",
          "",
          "**8. איך אתה עובד בצוות?**",
          "",
          "**9. מה לדעתך הופך בעל תפקיד לטוב ואחראי?**",
          "",
          "**10. למה דווקא אתה מתאים לתפקיד?**",
          "",
          "✅ לאחר שסיימת לענות, המתן לצוות."
        ].join("\n")
      )
      .setFooter({ text: "The Club • Role Exam" })
      .setTimestamp()
  ];
}

async function openTicket(interaction, type) {
  const info = ticketTypeInfo(type);

  if (!info) {
    return interaction.reply({
      content: "❌ סוג הטיקט לא קיים.",
      flags: MessageFlags.Ephemeral
    });
  }

  const existing = interaction.guild.channels.cache.find(channel =>
    channel.topic?.includes(`ticketOwner:${interaction.user.id}`)
  );

  if (existing) {
    return interaction.reply({
      content: `❌ כבר יש לך טיקט פתוח: ${existing}`,
      flags: MessageFlags.Ephemeral
    });
  }

  const category = interaction.guild.channels.cache.get(config.ticketCategoryId);

  if (!category || category.type !== ChannelType.GuildCategory) {
    return interaction.reply({
      content: "❌ קטגוריית הטיקטים לא מוגדרת נכון ב־config.js.",
      flags: MessageFlags.Ephemeral
    });
  }

  const overwrites = [
    {
      id: interaction.guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  if (info.staffRoleId) {
    overwrites.push({
      id: info.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }

  const channel = await interaction.guild.channels.create({
    name: `${info.emoji}-${safeChannelName(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `ticketOwner:${interaction.user.id} | ticketType:${type}`,
    permissionOverwrites: overwrites
  });

  ticketData.tickets[channel.id] = {
    ownerId: interaction.user.id,
    type,
    openedAt: Date.now(),
    claimedBy: null
  };

  saveTicketData();

  const embed = new EmbedBuilder()
    .setColor(info.color)
    .setTitle(`${info.emoji} ${info.name}`)
    .setDescription(
      [
        `שלום ${interaction.user}, הטיקט שלך נפתח בהצלחה.`,
        "",
        `📌 **סוג הפנייה:** ${info.name}`,
        "",
        "כתוב כאן את כל הפרטים הרלוונטיים כדי שהצוות יוכל לעזור לך במהירות.",
        "",
        "⏳ איש צוות יגיע בהקדם."
      ].join("\n")
    )
    .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: "The Club • Ticket System" })
    .setTimestamp();

  await channel.send({
    content: info.staffRoleId ? `<@&${info.staffRoleId}>` : undefined,
    embeds: [embed],
    components: ticketControls(null),
    allowedMentions: {
      roles: info.staffRoleId ? [info.staffRoleId] : []
    }
  });

  if (type === "role_exam") {
    await channel.send({ embeds: buildRoleExamEmbeds() });
  }

  return interaction.reply({
    content: `✅ הטיקט נפתח: ${channel}`,
    flags: MessageFlags.Ephemeral
  });
}

async function createTranscript(channel) {
  const collected = [];
  let before = null;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;

    collected.push(...batch.values());
    before = batch.last().id;

    if (batch.size < 100) break;
  }

  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = [
    `Transcript: #${channel.name}`,
    `Channel ID: ${channel.id}`,
    `Created: ${new Date(channel.createdTimestamp).toLocaleString()}`,
    ""
  ];

  for (const message of collected) {
    lines.push(
      `[${message.createdAt.toLocaleString()}] ${message.author.tag}: ${message.content || "[No text]"}`
    );

    for (const attachment of message.attachments.values()) {
      lines.push(`Attachment: ${attachment.url}`);
    }
  }

  return Buffer.from(lines.join("\n"), "utf8");
}

async function closeTicket(interaction, reason) {
  const channel = interaction.channel;
  const type = getTicketTypeFromChannel(channel);

  if (!isTicketStaff(interaction.member, type)) {
    return interaction.reply({
      content: "❌ רק צוות יכול לסגור טיקט.",
      flags: MessageFlags.Ephemeral
    });
  }

  const ownerId = getTicketOwnerFromChannel(channel);

  await interaction.reply({
    content: "🔒 הטיקט נסגר. שומר Transcript...",
    flags: MessageFlags.Ephemeral
  });

  const transcript = await createTranscript(channel).catch(() => null);
  const logs = config.ticketLogsChannelId
    ? interaction.guild.channels.cache.get(config.ticketLogsChannelId)
    : null;

  if (logs && logs.isTextBased()) {
    const files = [];

    if (transcript) {
      files.push(
        new AttachmentBuilder(transcript, {
          name: `${channel.name}-transcript.txt`
        })
      );
    }

    await logs.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("🔒 טיקט נסגר")
          .addFields(
            {
              name: "🎫 חדר",
              value: `#${channel.name}`,
              inline: true
            },
            {
              name: "👤 נפתח על ידי",
              value: ownerId ? `<@${ownerId}>` : "לא ידוע",
              inline: true
            },
            {
              name: "🛡️ נסגר על ידי",
              value: `${interaction.user}`,
              inline: true
            },
            {
              name: "📝 סיבה",
              value: reason || "לא צוינה סיבה"
            }
          )
          .setTimestamp()
      ],
      files
    }).catch(() => {});
  }

  delete ticketData.tickets[channel.id];
  saveTicketData();

  setTimeout(() => {
    channel.delete(`Ticket closed by ${interaction.user.tag}`).catch(() => {});
  }, 2500);
}

client.once(Events.ClientReady, readyClient => {
  console.log(`✅ The Club Bot online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (
        interaction.commandName ===
        "setup-verify"
      ) {
        if (
          !canSendPanel(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ אין לך גישה להריץ את Setup ה־Verify.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        if (
          !interaction.channel?.isTextBased()
        ) {
          return interaction.reply({
            content:
              "❌ תריץ את `/setup-verify` בתוך חדר ה־Verify.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        try {
          const result =
            await setupVerifyPermissions(
              interaction
            );

          await interaction.channel.send(
            buildVerifyPanel()
          );

          return interaction.editReply({
            embeds: [
              verifySetupResultEmbed(
                result
              )
            ]
          });
        } catch (error) {
          console.error(
            "❌ setup-verify error:",
            error
          );

          const errors = {
            MEMBER_ROLE_NOT_CONFIGURED:
              "❌ חסר `memberRoleId` ב־config.js.",
            MEMBER_ROLE_NOT_FOUND:
              "❌ לא מצאתי את רול ה־Member שהוגדר.",
            MEMBER_ROLE_MANAGED:
              "❌ רול ה־Member הוא Managed Role ואי אפשר להשתמש בו.",
            BOT_MEMBER_NOT_FOUND:
              "❌ לא הצלחתי לטעון את הבוט בשרת.",
            BOT_MISSING_MANAGE_CHANNELS:
              "❌ לבוט חסרה הרשאת `Manage Channels`.",
            BOT_MISSING_MANAGE_ROLES:
              "❌ לבוט חסרה הרשאת `Manage Roles`.",
            BOT_ROLE_TOO_LOW:
              "❌ רול The Club Bot נמוך מדי. תעלה אותו מעל רול ה־Member.",
            VERIFY_CHANNEL_INVALID:
              "❌ תריץ את הפקודה בתוך חדר טקסט שישמש כחדר Verify."
          };

          return interaction.editReply({
            content:
              errors[error.message] ||
              "❌ הייתה שגיאה בזמן הגדרת מערכת ה־Verify."
          });
        }
      }

      if (
        interaction.commandName ===
        "verify-panel"
      ) {
        if (
          !canSendPanel(
            interaction.member,
            interaction.guild
          )
        ) {
          return interaction.reply({
            content:
              "❌ אין לך גישה לשלוח את פאנל ה־Verify.",
            flags:
              MessageFlags.Ephemeral
          });
        }

        await interaction.channel.send(
          buildVerifyPanel()
        );

        return interaction.reply({
          content:
            "✅ פאנל ה־Verify נשלח.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      if (interaction.commandName === "ticket-panel") {
        if (!canSendPanel(interaction.member, interaction.guild)) {
          return interaction.reply({
            content: "❌ אין לך גישה לשלוח את הפאנל.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.channel.send(buildTicketPanel());

        return interaction.reply({
          content: "✅ פאנל הטיקטים נשלח.",
          flags: MessageFlags.Ephemeral
        });
      }
    }

    if (
      interaction.isButton() &&
      (
        interaction.customId.startsWith("bj_hit:") ||
        interaction.customId.startsWith("bj_stand:")
      )
    ) {
      const ownerId =
        interaction.customId.split(":")[1];

      if (
        interaction.user.id !==
        ownerId
      ) {
        return interaction.reply({
          content:
            "❌ זה לא משחק ה־Blackjack שלך.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      const key =
        `${interaction.guild.id}:${ownerId}`;

      const game =
        blackjackGames.get(key);

      if (!game) {
        return interaction.update({
          content:
            "❌ המשחק כבר הסתיים או שפג תוקפו.",
          embeds: [],
          components: []
        });
      }

      if (
        interaction.customId.startsWith(
          "bj_hit:"
        )
      ) {
        game.player.push(
          drawCard()
        );

        const playerTotal =
          handValue(
            game.player
          );

        if (
          playerTotal >= 21
        ) {
          return finishBlackjack(
            interaction,
            game
          );
        }

        blackjackGames.set(
          key,
          game
        );

        return interaction.update({
          embeds: [
            blackjackEmbed(game)
          ],
          components:
            blackjackButtons(
              ownerId
            )
        });
      }

      return finishBlackjack(
        interaction,
        game
      );
    }

    if (
      interaction.isButton() &&
      interaction.customId ===
        "verify_member"
    ) {
      if (!config.memberRoleId) {
        return interaction.reply({
          content:
            "❌ חסר `memberRoleId` ב־config.js.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      const member =
        await interaction.guild.members
          .fetch(
            interaction.user.id
          )
          .catch(() => null);

      const botMember =
        await interaction.guild.members
          .fetchMe()
          .catch(() => null);

      const role =
        await interaction.guild.roles
          .fetch(
            config.memberRoleId
          )
          .catch(() => null);

      if (!member || !botMember) {
        return interaction.reply({
          content:
            "❌ לא הצלחתי לטעון את המשתמש או הבוט.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      if (!role) {
        return interaction.reply({
          content:
            "❌ לא מצאתי את רול ה־Member שהוגדר.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      if (
        member.roles.cache.has(
          role.id
        )
      ) {
        return interaction.reply({
          content:
            "✅ אתה כבר מאומת.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      if (role.managed) {
        return interaction.reply({
          content:
            "❌ רול ה־Member הוא Managed Role ואי אפשר לתת אותו ידנית.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      if (
        !botMember.permissions.has(
          PermissionFlagsBits.ManageRoles
        )
      ) {
        return interaction.reply({
          content:
            "❌ לבוט אין הרשאת `Manage Roles`.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      if (
        role.position >=
        botMember.roles.highest.position
      ) {
        return interaction.reply({
          content:
            "❌ רול The Club Bot חייב להיות מעל רול ה־Member.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      try {
        await member.roles.add(
          role,
          "The Club Verify completed"
        );
      } catch (error) {
        console.error(
          "❌ Verify role add error:",
          error
        );

        return interaction.reply({
          content:
            "❌ לא הצלחתי לתת את רול ה־Member.",
          flags:
            MessageFlags.Ephemeral
        });
      }

      return interaction.reply({
        content:
          "✅ אומתת בהצלחה! קיבלת גישה לשרת.",
        flags:
          MessageFlags.Ephemeral
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("ticket_open:")
    ) {
      const type = interaction.customId.split(":")[1];
      return openTicket(interaction, type);
    }

    if (
      interaction.isButton() &&
      interaction.customId === "ticket_claim"
    ) {
      const type = getTicketTypeFromChannel(interaction.channel);

      if (!isTicketStaff(interaction.member, type)) {
        return interaction.reply({
          content: "❌ רק צוות יכול לקחת טיקט.",
          flags: MessageFlags.Ephemeral
        });
      }

      const claimedBy = getTicketClaimedBy(interaction.channel);

      if (claimedBy) {
        return interaction.reply({
          content: `❌ הטיקט כבר נלקח על ידי <@${claimedBy}>.`,
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.channel.setTopic(
        withClaimedBy(interaction.channel.topic, interaction.user.id)
      );

      if (ticketData.tickets[interaction.channel.id]) {
        ticketData.tickets[interaction.channel.id].claimedBy =
          interaction.user.id;
        saveTicketData();
      }

      return interaction.update({
        embeds: interaction.message.embeds,
        components: ticketControls(interaction.user.id)
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId === "ticket_release"
    ) {
      const type = getTicketTypeFromChannel(interaction.channel);

      if (!isTicketStaff(interaction.member, type)) {
        return interaction.reply({
          content: "❌ רק צוות יכול לשחרר טיקט.",
          flags: MessageFlags.Ephemeral
        });
      }

      const claimedBy = getTicketClaimedBy(interaction.channel);

      if (
        claimedBy &&
        claimedBy !== interaction.user.id &&
        !interaction.member.permissions.has(
          PermissionFlagsBits.Administrator
        )
      ) {
        return interaction.reply({
          content:
            "❌ רק מי שלקח את הטיקט או Administrator יכול לשחרר אותו.",
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.channel.setTopic(
        withClaimedBy(interaction.channel.topic, null)
      );

      if (ticketData.tickets[interaction.channel.id]) {
        ticketData.tickets[interaction.channel.id].claimedBy = null;
        saveTicketData();
      }

      return interaction.update({
        embeds: interaction.message.embeds,
        components: ticketControls(null)
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId === "ticket_add_user"
    ) {
      const type = getTicketTypeFromChannel(interaction.channel);

      if (!isTicketStaff(interaction.member, type)) {
        return interaction.reply({
          content: "❌ רק צוות יכול להוסיף משתמש.",
          flags: MessageFlags.Ephemeral
        });
      }

      const modal = new ModalBuilder()
        .setCustomId("ticket_add_user_modal")
        .setTitle("הוספת משתמש לטיקט");

      const input = new TextInputBuilder()
        .setCustomId("user_id")
        .setLabel("User ID")
        .setPlaceholder("הדבק כאן ID של משתמש")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(input)
      );

      return interaction.showModal(modal);
    }

    if (
      interaction.isButton() &&
      interaction.customId === "ticket_remove_user"
    ) {
      const type = getTicketTypeFromChannel(interaction.channel);

      if (!isTicketStaff(interaction.member, type)) {
        return interaction.reply({
          content: "❌ רק צוות יכול להסיר משתמש.",
          flags: MessageFlags.Ephemeral
        });
      }

      const modal = new ModalBuilder()
        .setCustomId("ticket_remove_user_modal")
        .setTitle("הסרת משתמש מהטיקט");

      const input = new TextInputBuilder()
        .setCustomId("user_id")
        .setLabel("User ID")
        .setPlaceholder("הדבק כאן ID של משתמש")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(input)
      );

      return interaction.showModal(modal);
    }

    if (
      interaction.isButton() &&
      interaction.customId === "ticket_close"
    ) {
      const type = getTicketTypeFromChannel(interaction.channel);

      if (!isTicketStaff(interaction.member, type)) {
        return interaction.reply({
          content: "❌ רק צוות יכול לסגור טיקט.",
          flags: MessageFlags.Ephemeral
        });
      }

      const modal = new ModalBuilder()
        .setCustomId("ticket_close_modal")
        .setTitle("סגירת טיקט");

      const reason = new TextInputBuilder()
        .setCustomId("close_reason")
        .setLabel("סיבת סגירה")
        .setPlaceholder("כתוב את סיבת הסגירה")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(reason)
      );

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "ticket_close_modal") {
        const reason = interaction.fields.getTextInputValue("close_reason");
        return closeTicket(interaction, reason);
      }

      if (interaction.customId === "ticket_add_user_modal") {
        const userId = interaction.fields
          .getTextInputValue("user_id")
          .trim();

        if (!/^\d{17,20}$/.test(userId)) {
          return interaction.reply({
            content: "❌ ה־User ID לא תקין.",
            flags: MessageFlags.Ephemeral
          });
        }

        const member = await interaction.guild.members
          .fetch(userId)
          .catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ המשתמש לא נמצא בשרת.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.channel.permissionOverwrites.edit(member.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        });

        return interaction.reply({
          content: `✅ ${member} נוסף לטיקט.`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.customId === "ticket_remove_user_modal") {
        const userId = interaction.fields
          .getTextInputValue("user_id")
          .trim();

        if (!/^\d{17,20}$/.test(userId)) {
          return interaction.reply({
            content: "❌ ה־User ID לא תקין.",
            flags: MessageFlags.Ephemeral
          });
        }

        const ownerId = getTicketOwnerFromChannel(interaction.channel);

        if (userId === ownerId) {
          return interaction.reply({
            content: "❌ אי אפשר להסיר את פותח הטיקט.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.channel.permissionOverwrites
          .delete(userId)
          .catch(() => {});

        return interaction.reply({
          content: `✅ <@${userId}> הוסר מהטיקט.`,
          flags: MessageFlags.Ephemeral
        });
      }
    }
  } catch (error) {
    console.error("❌ Interaction error:", error);

    if (interaction.isRepliable()) {
      const payload = {
        content: "❌ קרתה שגיאה. נסה שוב.",
        flags: MessageFlags.Ephemeral
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
});

client.on(
  Events.MessageCreate,
  async message => {
    if (
      !message.guild ||
      message.author.bot
    ) {
      return;
    }

    const guildId =
      message.guild.id;

    const userId =
      message.author.id;

    // XP from normal messages.
    const cooldownKey =
      `${guildId}:${userId}`;

    const lastXp =
      messageXpCooldowns.get(
        cooldownKey
      ) || 0;

    const xpCooldownMs =
      Number(
        config.xpMessageCooldownMs ||
        60000
      );

    if (
      Date.now() - lastXp >=
      xpCooldownMs
    ) {
      const min =
        Number(
          config.xpPerMessageMin ||
          5
        );

      const max =
        Number(
          config.xpPerMessageMax ||
          15
        );

      const profile =
        getXpProfile(
          guildId,
          userId
        );

      profile.xp +=
        randomInt(
          Math.min(min, max),
          Math.max(min, max)
        );

      profile.messages += 1;

      messageXpCooldowns.set(
        cooldownKey,
        Date.now()
      );

      saveXpData();
    }

    const prefix =
      String(
        config.xpPrefix ||
        "!"
      );

    if (
      !message.content.startsWith(
        prefix
      )
    ) {
      return;
    }

    const parts =
      message.content
        .slice(prefix.length)
        .trim()
        .split(/\s+/);

    const command =
      String(
        parts.shift() ||
        ""
      ).toLowerCase();

    if (!command) {
      return;
    }

    const profile =
      getXpProfile(
        guildId,
        userId
      );

    if (
      command === "xp" ||
      command === "balance" ||
      command === "bal"
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Blue")
            .setTitle(
              "💰 XP Balance"
            )
            .setDescription(
              `${message.author}, יש לך **${formatXp(profile.xp)} XP**.`
            )
            .setFooter({
              text:
                "The Club • Virtual XP"
            })
        ]
      });
    }

    if (command === "casino") {
      return message.reply({
        embeds: [
          casinoInfoEmbed()
        ]
      });
    }

    if (command === "daily") {
      const now =
        Date.now();

      const dailyMs =
        24 * 60 * 60 * 1000;

      const left =
        dailyMs -
        (
          now -
          Number(
            profile.lastDailyAt ||
            0
          )
        );

      if (left > 0) {
        const hours =
          Math.floor(
            left /
            (60 * 60 * 1000)
          );

        const minutes =
          Math.ceil(
            (
              left %
              (60 * 60 * 1000)
            ) /
            (60 * 1000)
          );

        return message.reply(
          `⏳ כבר לקחת Daily. חזור בעוד **${hours} שעות ו־${minutes} דקות**.`
        );
      }

      const min =
        Number(
          config.dailyXpMin ||
          250
        );

      const max =
        Number(
          config.dailyXpMax ||
          500
        );

      const reward =
        randomInt(
          Math.min(min, max),
          Math.max(min, max)
        );

      profile.lastDailyAt =
        now;

      profile.xp +=
        reward;

      saveXpData();

      return message.reply(
        `🎁 קיבלת **${formatXp(reward)} XP**! עכשיו יש לך **${formatXp(profile.xp)} XP**.`
      );
    }

    if (
      command === "leaderboard" ||
      command === "lb"
    ) {
      const guildData =
        getGuildXp(guildId);

      const top =
        Object.entries(
          guildData.users
        )
          .sort(
            (a, b) =>
              Number(
                b[1].xp || 0
              ) -
              Number(
                a[1].xp || 0
              )
          )
          .slice(0, 10);

      if (!top.length) {
        return message.reply(
          "📊 עדיין אין נתוני XP."
        );
      }

      const lines =
        top.map(
          (
            [id, data],
            index
          ) =>
            `**${index + 1}.** <@${id}> — **${formatXp(data.xp)} XP**`
        );

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Gold")
            .setTitle(
              "🏆 The Club XP Leaderboard"
            )
            .setDescription(
              lines.join("\\n")
            )
            .setTimestamp()
        ]
      });
    }

    if (
      command === "coinflip"
    ) {
      const check =
        casinoCheck(
          guildId,
          userId,
          parts[0]
        );

      if (!check.ok) {
        return message.reply(
          check.message
        );
      }

      const choice =
        String(
          parts[1] || ""
        ).toLowerCase();

      const normalized =
        {
          "heads": "heads",
          "head": "heads",
          "עץ": "heads",
          "tails": "tails",
          "tail": "tails",
          "פלי": "tails"
        }[choice];

      if (!normalized) {
        casinoCooldowns.delete(
          `${guildId}:${userId}`
        );

        return message.reply(
          `❌ שימוש: \`${prefix}coinflip <xp> <heads/tails>\``
        );
      }

      const result =
        Math.random() < 0.5
          ? "heads"
          : "tails";

      const won =
        result ===
        normalized;

      changeXp(
        guildId,
        userId,
        won
          ? check.bet
          : -check.bet
      );

      return message.reply(
        `${won ? "🏆" : "❌"} יצא **${result}** — ${
          won
            ? `ניצחת ${formatXp(check.bet)} XP`
            : `הפסדת ${formatXp(check.bet)} XP`
        }.`
      );
    }

    if (command === "dice") {
      const check =
        casinoCheck(
          guildId,
          userId,
          parts[0]
        );

      if (!check.ok) {
        return message.reply(
          check.message
        );
      }

      const guess =
        Number(parts[1]);

      if (
        !Number.isInteger(guess) ||
        guess < 1 ||
        guess > 6
      ) {
        casinoCooldowns.delete(
          `${guildId}:${userId}`
        );

        return message.reply(
          `❌ שימוש: \`${prefix}dice <xp> <1-6>\``
        );
      }

      const result =
        randomInt(1, 6);

      const won =
        result === guess;

      const change =
        won
          ? check.bet * 5
          : -check.bet;

      changeXp(
        guildId,
        userId,
        change
      );

      return message.reply(
        `🎲 יצא **${result}** — ${
          won
            ? `🏆 פגעת במספר וקיבלת ${formatXp(check.bet * 5)} XP`
            : `❌ הפסדת ${formatXp(check.bet)} XP`
        }.`
      );
    }

    if (command === "slots") {
      const check =
        casinoCheck(
          guildId,
          userId,
          parts[0]
        );

      if (!check.ok) {
        return message.reply(
          check.message
        );
      }

      const symbols = [
        "🍒",
        "🍋",
        "🔔",
        "⭐",
        "💎"
      ];

      const spin = [
        symbols[
          randomInt(
            0,
            symbols.length - 1
          )
        ],
        symbols[
          randomInt(
            0,
            symbols.length - 1
          )
        ],
        symbols[
          randomInt(
            0,
            symbols.length - 1
          )
        ]
      ];

      const allSame =
        spin[0] === spin[1] &&
        spin[1] === spin[2];

      const pair =
        spin[0] === spin[1] ||
        spin[0] === spin[2] ||
        spin[1] === spin[2];

      let change;
      let text;

      if (allSame) {
        change =
          check.bet * 3;

        text =
          `🏆 JACKPOT! קיבלת **${formatXp(change)} XP**.`;
      } else if (pair) {
        change =
          check.bet;

        text =
          `✨ זוג! קיבלת **${formatXp(change)} XP**.`;
      } else {
        change =
          -check.bet;

        text =
          `❌ הפסדת **${formatXp(check.bet)} XP**.`;
      }

      changeXp(
        guildId,
        userId,
        change
      );

      return message.reply(
        `🎰 ${spin.join(" | ")}\\n${text}`
      );
    }

    if (command === "roulette") {
      const check =
        casinoCheck(
          guildId,
          userId,
          parts[0]
        );

      if (!check.ok) {
        return message.reply(
          check.message
        );
      }

      const choice =
        String(
          parts[1] || ""
        ).toLowerCase();

      if (
        ![
          "red",
          "black",
          "green"
        ].includes(choice)
      ) {
        casinoCooldowns.delete(
          `${guildId}:${userId}`
        );

        return message.reply(
          `❌ שימוש: \`${prefix}roulette <xp> <red/black/green>\``
        );
      }

      const roll =
        randomInt(0, 36);

      let result;

      if (roll === 0) {
        result = "green";
      } else {
        result =
          roll % 2 === 0
            ? "black"
            : "red";
      }

      const won =
        choice === result;

      const reward =
        choice === "green"
          ? check.bet * 14
          : check.bet;

      changeXp(
        guildId,
        userId,
        won
          ? reward
          : -check.bet
      );

      return message.reply(
        `🎡 יצא **${roll} • ${result}** — ${
          won
            ? `🏆 קיבלת ${formatXp(reward)} XP`
            : `❌ הפסדת ${formatXp(check.bet)} XP`
        }.`
      );
    }

    if (
      command === "blackjack" ||
      command === "bj"
    ) {
      const check =
        casinoCheck(
          guildId,
          userId,
          parts[0]
        );

      if (!check.ok) {
        return message.reply(
          check.message
        );
      }

      const key =
        `${guildId}:${userId}`;

      if (
        blackjackGames.has(key)
      ) {
        casinoCooldowns.delete(
          key
        );

        return message.reply(
          "❌ כבר יש לך משחק Blackjack פעיל."
        );
      }

      const game = {
        guildId,
        userId,
        bet:
          check.bet,
        player: [
          drawCard(),
          drawCard()
        ],
        dealer: [
          drawCard(),
          drawCard()
        ]
      };

      blackjackGames.set(
        key,
        game
      );

      if (
        handValue(
          game.player
        ) >= 21
      ) {
        const sent =
          await message.reply({
            embeds: [
              blackjackEmbed(
                game
              )
            ],
            components:
              blackjackButtons(
                userId
              )
          });

        return sent;
      }

      return message.reply({
        embeds: [
          blackjackEmbed(game)
        ],
        components:
          blackjackButtons(
            userId
          )
      });
    }
  }
);

client.on("error", error => {
  console.error("❌ Discord client error:", error);
});

client.on("warn", warning => {
  console.warn("⚠️ Discord warning:", warning);
});

process.on("unhandledRejection", error => {
  console.error("❌ Unhandled rejection:", error);
});

async function loginWithRetry() {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      console.log(`🔌 Discord login attempt ${attempt}...`);
      await client.login(process.env.TOKEN);
      return;
    } catch (error) {
      console.error("❌ Discord login/network error:", error);

      const delay = Math.min(60_000, attempt * 10_000);

      console.log(
        `🔁 Retrying Discord login in ${delay / 1000}s...`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

loginWithRetry();
