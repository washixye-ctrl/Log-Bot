import {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder,
  REST, Routes
} from "discord.js";
import { LOG_EVENTS } from "./config.js";
import { setupGuild } from "./setup.js";
import { sendRelayTest } from "./logger.js";

const eventChoices = Object.entries(LOG_EVENTS).map(([value, config]) => ({ name: `${config.label} (${value})`, value }));
const commands = [
  new SlashCommandBuilder()
    .setName("logs").setDescription("จัดการ WASHI LOG SYSTEM")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("setup").setDescription("สร้างหมวดหมู่และห้อง Logs ทั้งหมด"))
    .addSubcommand(s => s.setName("enable").setDescription("เปิดระบบ Logs"))
    .addSubcommand(s => s.setName("disable").setDescription("ปิดระบบ Logs"))
    .addSubcommand(s => s.setName("status").setDescription("ตรวจสอบสถานะ Logs"))
    .addSubcommand(s => s.setName("channel-set").setDescription("กำหนดห้องให้ประเภท Logs")
      .addStringOption(o => o.setName("event").setDescription("ประเภท Logs").setRequired(true).addChoices(...eventChoices))
      .addChannelOption(o => o.setName("channel").setDescription("ห้องปลายทาง").setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName("relay-add").setDescription("เพิ่มเส้นทางส่ง Logs ไปอีกเซิร์ฟเวอร์")
      .addStringOption(o => o.setName("destination-guild-id").setDescription("Server ID ปลายทาง").setRequired(true))
      .addStringOption(o => o.setName("destination-channel-id").setDescription("Channel ID ปลายทาง").setRequired(true))
      .addStringOption(o => o.setName("events").setDescription("event keys คั่นด้วย comma หรือ all").setRequired(true)))
    .addSubcommand(s => s.setName("relay-remove").setDescription("ลบเส้นทาง Relay")
      .addIntegerOption(o => o.setName("id").setDescription("Relay ID").setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName("relay-list").setDescription("ดูเส้นทาง Relay ทั้งหมด"))
    .addSubcommand(s => s.setName("relay-test").setDescription("ทดสอบส่ง Logs ไปทุกปลายทาง"))
];

export async function registerCommands(client, token, clientId, guildId) {
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commands.map(command => command.toJSON());
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    console.log(`Registered slash commands in test guild ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log("Registered global slash commands (may take time to appear).");
  }
}

function isManager(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

export async function handleCommand(interaction, client, db) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "logs") return;
  if (!interaction.guild) return interaction.reply({ content: "คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์", ephemeral: true });
  if (!isManager(interaction)) return interaction.reply({ content: "คุณต้องมีสิทธิ์ Manage Server หรือ Administrator", ephemeral: true });

  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  db.ensureGuild(guild.id);

  if (sub === "setup") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await setupGuild(guild, db, client.user.id);
      return interaction.editReply(`ตั้งค่าห้องสำเร็จแล้ว\n• หมวด LOG SERVER และ SYSTEM\n• ตรวจสอบ/สร้างห้องทั้งหมด ${result.created} ห้อง\n• ระบบ Logs เปิดใช้งานอยู่`);
    } catch (error) {
      console.error("Setup failed:", error);
      return interaction.editReply(`ตั้งค่าไม่สำเร็จ: ${error.message}\nตรวจสอบสิทธิ์ Manage Channels และ View Channel ของบอท`);
    }
  }

  if (sub === "enable" || sub === "disable") {
    const enabled = sub === "enable";
    db.setEnabled(guild.id, enabled);
    return interaction.reply({ content: `ระบบ Logs ${enabled ? "เปิด" : "ปิด"} แล้ว`, ephemeral: true });
  }

  if (sub === "status") {
    const channels = db.getChannels(guild.id);
    const relays = db.getRelays(guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("WASHI LOG SYSTEM • Status")
      .addFields(
        { name: "สถานะ", value: db.isEnabled(guild.id) ? "🟢 เปิดใช้งาน" : "🔴 ปิดใช้งาน", inline: true },
        { name: "ห้อง Logs ที่ตั้งค่า", value: String(channels.length), inline: true },
        { name: "Relay ที่เปิดใช้งาน", value: String(relays.length), inline: true }
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (sub === "channel-set") {
    const event = interaction.options.getString("event", true);
    const channel = interaction.options.getChannel("channel", true);
    db.setChannel(guild.id, event, channel.id);
    return interaction.reply({ content: `ตั้ง ${LOG_EVENTS[event].label} ให้ส่งไปที่ <#${channel.id}> แล้ว`, ephemeral: true });
  }

  if (sub === "relay-add") {
    const destinationGuildId = interaction.options.getString("destination-guild-id", true).trim();
    const destinationChannelId = interaction.options.getString("destination-channel-id", true).trim();
    const rawEvents = interaction.options.getString("events", true).trim().toLowerCase();
    const destinationGuild = client.guilds.cache.get(destinationGuildId) ??
      await client.guilds.fetch(destinationGuildId).catch(() => null);
    if (!destinationGuild) return interaction.reply({ content: "ไม่พบเซิร์ฟเวอร์ปลายทาง หรือบอทยังไม่ได้เข้าเซิร์ฟเวอร์นั้น", ephemeral: true });
    const channel = await destinationGuild.channels.fetch(destinationChannelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.reply({ content: "ไม่พบห้องข้อความปลายทาง หรือ Channel ID ไม่ถูกต้อง", ephemeral: true });
    }
    const me = destinationGuild.members.me ?? await destinationGuild.members.fetchMe().catch(() => null);
    if (!me || !channel.permissionsFor(me)?.has(["ViewChannel", "SendMessages", "EmbedLinks"])) {
      return interaction.reply({ content: "บอทไม่มีสิทธิ์ View Channel, Send Messages และ Embed Links ในห้องปลายทาง", ephemeral: true });
    }
    let events;
    if (rawEvents === "all" || rawEvents === "*") {
      events = ["*"];
    } else {
      events = [...new Set(rawEvents.split(",").map(x => x.trim()).filter(Boolean))];
      const invalid = events.filter(key => !LOG_EVENTS[key]);
      if (!events.length || invalid.length) {
        return interaction.reply({ content: `event key ไม่ถูกต้อง: ${invalid.join(", ") || "ไม่ได้ระบุ"}\nใช้ all หรือเลือกจาก: ${Object.keys(LOG_EVENTS).join(", ")}`, ephemeral: true });
      }
    }
    const id = db.addRelay(guild.id, destinationGuildId, destinationChannelId, events);
    return interaction.reply({
      content: `เพิ่ม Relay #${id} แล้ว\nปลายทาง: **${destinationGuild.name}** / <#${destinationChannelId}>\nEvents: ${events.includes("*") ? "ทั้งหมด" : events.join(", ")}`,
      ephemeral: true
    });
  }

  if (sub === "relay-remove") {
    const id = interaction.options.getInteger("id", true);
    db.removeRelay(guild.id, id);
    return interaction.reply({ content: `ลบ Relay #${id} แล้ว (ถ้ามีรายการนี้)`, ephemeral: true });
  }

  if (sub === "relay-list") {
    const relays = db.getRelays(guild.id);
    if (!relays.length) return interaction.reply({ content: "ยังไม่มีเส้นทาง Relay ในเซิร์ฟเวอร์นี้", ephemeral: true });
    const lines = relays.map(r => `**#${r.id}** → <#${r.destination_channel_id}>\nEvents: ${JSON.parse(r.events).join(", ")}`);
    return interaction.reply({ content: lines.join("\n\n").slice(0, 1900), ephemeral: true });
  }

  if (sub === "relay-test") {
    await interaction.deferReply({ ephemeral: true });
    const results = await sendRelayTest(client, db, guild);
    if (!results.length) return interaction.editReply("ยังไม่มี Relay ที่เปิดใช้งาน");
    return interaction.editReply(results.map(r => `Relay #${r.id}: ${r.ok ? "ส่งสำเร็จ" : "ส่งไม่สำเร็จ — ตรวจสอบสิทธิ์และ Channel ID"}`).join("\n"));
  }
}
