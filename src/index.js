import "dotenv/config";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { Database } from "./db.js";
import { registerCommands, handleCommand } from "./commands.js";
import { registerEvents } from "./events/index.js";

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID. Copy .env.example to .env and fill them in.");
  process.exit(1);
}

const db = await Database.open();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User]
});

registerEvents(client, db);

client.once("ready", async readyClient => {
  console.log(`WASHI LOG SYSTEM online as ${readyClient.user.tag}`);
  try {
    await registerCommands(readyClient, DISCORD_TOKEN, CLIENT_ID, GUILD_ID || null);
  } catch (error) {
    console.error("Slash command registration failed:", error);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    await handleCommand(interaction, client, db);
  } catch (error) {
    console.error("Interaction error:", error);
    const message = "เกิดข้อผิดพลาดระหว่างทำคำสั่ง กรุณาตรวจสอบ Console";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  db.close();
  client.destroy();
  process.exit(0);
});
process.on("SIGTERM", () => {
  db.close();
  client.destroy();
  process.exit(0);
});

client.login(DISCORD_TOKEN);
