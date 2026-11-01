import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags
} from "discord.js";
import { LOG_EVENTS } from "./config.js";

const PAGE_SIZE = 8;
const EMBED_COLOR = 0xF472B6;

const clip = (value, max) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const unix = ms => Math.floor(ms / 1000);
const labelOf = key => LOG_EVENTS[key]?.label ?? key;

function readFilter(interaction) {
  const user = interaction.options.getUser("user");
  const rawId = interaction.options.getString("user-id")?.trim();
  const userId = user?.id ?? (rawId && /^\d{15,25}$/.test(rawId) ? rawId : null);
  const days = interaction.options.getInteger("days");
  return {
    invalidUserId: Boolean(rawId) && !userId,
    userId,
    eventKey: interaction.options.getString("event"),
    channelId: interaction.options.getChannel("channel")?.id ?? null,
    keyword: interaction.options.getString("keyword")?.trim() || null,
    days,
    since: days ? Date.now() - days * 86_400_000 : null
  };
}

function describeFilter(filter) {
  const parts = [];
  if (filter.userId) parts.push(`ผู้ใช้ <@${filter.userId}>`);
  if (filter.eventKey) parts.push(`กิจกรรม ${labelOf(filter.eventKey)}`);
  if (filter.channelId) parts.push(`ห้อง <#${filter.channelId}>`);
  if (filter.keyword) parts.push(`คำค้น “${clip(filter.keyword, 40)}”`);
  if (filter.days) parts.push(`ย้อนหลัง ${filter.days} วัน`);
  return parts.length ? parts.join(" • ") : "ทั้งหมด";
}

function formatRow(row) {
  const who = row.user_id ? `<@${row.user_id}>` : clip(row.user_tag, 40) || "—";
  const actor = row.actor_id ? ` ← <@${row.actor_id}>` : "";
  const where = row.channel_id ? ` • <#${row.channel_id}>` : "";
  const media = row.has_media ? " 🖼️" : "";
  const note = row.summary ? `\n> ${clip(row.summary, 110)}` : "";
  return `\`#${row.id}\` <t:${unix(row.created_at)}:f> **${labelOf(row.event_key)}**${media}\n${who}${actor}${where}${note}`;
}

function buildPage(db, guild, filter, page) {
  const { total, rows } = db.searchLogs(guild.id, filter, PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("WASHI LOG SYSTEM • ประวัติ Logs")
    .setDescription(rows.length ? rows.map(formatRow).join("\n\n") : "ไม่พบรายการตามเงื่อนไขที่เลือก")
    .addFields({ name: "ตัวกรอง", value: describeFilter(filter) })
    .setFooter({ text: `หน้า ${page + 1}/${pages} • ทั้งหมด ${total} รายการ • ดูรายละเอียดด้วย /logs entry` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("hist_prev").setLabel("ก่อนหน้า").setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId("hist_next").setLabel("ถัดไป").setStyle(ButtonStyle.Primary).setDisabled(page + 1 >= pages)
  );
  return { embed, row, pages };
}

export async function runHistory(interaction, db) {
  const filter = readFilter(interaction);
  if (filter.invalidUserId) {
    return interaction.reply({ content: "user-id ไม่ถูกต้อง (ต้องเป็นตัวเลข ID ของผู้ใช้)", flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let page = 0;
  let view = buildPage(db, interaction.guild, filter, page);
  const message = await interaction.editReply({ embeds: [view.embed], components: view.pages > 1 ? [view.row] : [] });
  if (view.pages <= 1) return;

  const collector = message.createMessageComponentCollector({
    time: 300_000,
    filter: component => component.user.id === interaction.user.id
  });
  collector.on("collect", async component => {
    page += component.customId === "hist_next" ? 1 : -1;
    page = Math.max(0, Math.min(page, view.pages - 1));
    view = buildPage(db, interaction.guild, filter, page);
    await component.update({ embeds: [view.embed], components: [view.row] }).catch(() => {});
  });
  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}

export async function runStats(interaction, db) {
  const filter = readFilter(interaction);
  if (filter.invalidUserId) {
    return interaction.reply({ content: "user-id ไม่ถูกต้อง (ต้องเป็นตัวเลข ID ของผู้ใช้)", flags: MessageFlags.Ephemeral });
  }
  const byEvent = db.statsByEvent(interaction.guild.id, filter);
  const total = byEvent.reduce((sum, row) => sum + row.n, 0);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("WASHI LOG SYSTEM • สถิติ Logs")
    .addFields({ name: "ตัวกรอง", value: describeFilter(filter) })
    .addFields({
      name: `แยกตามกิจกรรม (รวม ${total})`,
      value: byEvent.length ? byEvent.slice(0, 18).map(row => `${labelOf(row.event_key)} — **${row.n}**`).join("\n") : "ไม่มีข้อมูล"
    });
  if (!filter.userId) {
    const top = db.statsTopUsers(interaction.guild.id, filter);
    if (top.length) {
      embed.addFields({ name: "ผู้ใช้ที่มีกิจกรรมมากที่สุด", value: top.map((row, index) => `${index + 1}. <@${row.user_id}> — **${row.n}**`).join("\n") });
    }
  }
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export async function runEntry(interaction, db) {
  const id = interaction.options.getInteger("id", true);
  const row = db.getLog(interaction.guild.id, id);
  if (!row) return interaction.reply({ content: `ไม่พบรายการ #${id} ในเซิร์ฟเวอร์นี้`, flags: MessageFlags.Ephemeral });
  const embed = new EmbedBuilder()
    .setColor(LOG_EVENTS[row.event_key]?.color ?? EMBED_COLOR)
    .setTitle(`รายการ #${row.id} • ${labelOf(row.event_key)}`)
    .addFields(
      { name: "เวลา", value: `<t:${unix(row.created_at)}:F>`, inline: true },
      { name: "ผู้ใช้", value: row.user_id ? `<@${row.user_id}>\n${row.user_tag ?? ""}\n${row.user_id}` : "—", inline: true },
      { name: "ผู้ดำเนินการ", value: row.actor_id ? `<@${row.actor_id}>\n${row.actor_tag ?? ""}` : "—", inline: true },
      { name: "ห้อง", value: row.channel_id ? `<#${row.channel_id}>` : "—", inline: true },
      { name: "สรุป", value: clip(row.summary, 500) || "—" },
      { name: "รายละเอียด", value: String(row.content ?? "—").slice(0, 1000) || "—" }
    )
    .setFooter({ text: row.has_media ? "รายการนี้มีรูปแนบ (ดูรูปในห้อง Logs เดิม)" : "WASHI LOG SYSTEM" });
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
