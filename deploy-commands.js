require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const config = require("./config");

const commands = [
  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("שולח את פאנל הטיקטים של Israel Army")
].map(command => command.toJSON());

const rest = new REST({ version: "10" })
  .setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("🔄 Deploying Israel Army ticket commands...");

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
