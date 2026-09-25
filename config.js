module.exports = {
  // =====================
  // THE CLUB BOT
  // =====================

  clientId: "1551852885594083479",
  guildId: "1552972450264911903",

  // =====================
  // VERIFY
  // =====================

  // הרול שמקבלים בלחיצה על Verify
  memberRoleId: "1552972923189334040",

  // רק החדרים האלה יהיו Read Only ל-Members
  // Members יכולים לראות אותם אבל לא לכתוב בהם
  verifyReadOnlyChannelIds: [
    "1552972948585848883",
    "1552972939438202902",
    "1552985038771978311"
  ],

  // =====================
  // XP + CASINO
  // Virtual XP only — no real money / no purchases / no cashout.
  // =====================

  xpPrefix: "!",

  xpPerMessageMin: 5,
  xpPerMessageMax: 15,
  xpMessageCooldownMs: 60 * 1000,

  dailyXpMin: 250,
  dailyXpMax: 500,

  maxCasinoBet: 1000,
  casinoCooldownMs: 5 * 1000,

  // =====================
  // TICKETS
  // =====================

  // הקטגוריה שבה כל הטיקטים ייפתחו
  ticketCategoryId: "1552972931179618425",

  // רול הצוות שמטפל בשאלה + דיווח על משתמש
  ticketStaffRoleId: "1552972917250461786",

  // רול שמטפל בטיקט "בחינה לתפקיד"
  examStaffRoleId: "1552972917250461786",

  // חדר לוגים לסגירת טיקטים + Transcript
  ticketLogsChannelId: "1552983402913861742"
};
