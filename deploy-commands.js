require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const config = require("./config");

const commands = [
  new SlashCommandBuilder()
    .setName("setup-verify")
    .setDescription(
      "מגדיר Verify והרשאות Members אוטומטית"
    ),

  new SlashCommandBuilder()
    .setName("verify-panel")
    .setDescription(
      "שולח את פאנל ה־Verify של The Club"
    ),

  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("שולח את פאנל הטיקטים של The Club")
].map(command => command.toJSON());

const rest = new REST({ version: "10" })
  .setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("🔄 Deploying The Club ticket commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        config.clientId,
        config.guildId
      ),
      { body: commands }
    );

    console.log("✅ Slash commands deployed.");
  } catch (error) {
    console.error("❌ Deploy commands error:", error);
    process.exitCode = 1;
  }
})();
