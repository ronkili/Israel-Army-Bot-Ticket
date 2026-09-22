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

function saveTicketData() {
  saveJson(TICKET_DATA_FILE, ticketData);
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
    .setTitle("🎫 Israel Army • מרכז טיקטים")
    .setDescription(
      [
        "ברוכים הבאים למרכז התמיכה של **Israel Army**.",
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
    .setFooter({ text: "Israel Army • Ticket System" })
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
      .setFooter({ text: "Israel Army • Role Exam" })
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
    .setFooter({ text: "Israel Army • Ticket System" })
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
  console.log(`✅ Israel Army Bot Ticket online as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
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
