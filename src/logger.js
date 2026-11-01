import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { LOG_EVENTS } from "./config.js";

const MAX_PREVIEW_IMAGES = 4;

function safeText(value, max = 1000) {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function makeEmbed(guild, eventKey, details = {}) {
  const config = LOG_EVENTS[eventKey] ?? { label: "WASHI LOG", color: 0x5865F2 };
  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle(safeText(details.title ?? config.label, 256))
    .setDescription(safeText(details.description, 4000))
    .setTimestamp(new Date())
    .setFooter({ text: `WASHI LOG SYSTEM • ${guild.name}` });
  if (details.fields?.length) {
    embed.addFields(details.fields.slice(0, 25).map(field => ({
      name: safeText(field.name, 256),
      value: safeText(field.value, 1024),
      inline: Boolean(field.inline)
    })));
  }
  if (details.thumbnail) embed.setThumbnail(details.thumbnail);
  if (details.image) embed.setImage(details.image);
  return embed;
}

function buildPayloads(guild, eventKey, details) {
  const files = (details.files ?? []).slice(0, MAX_PREVIEW_IMAGES);
  const plain = { embeds: [makeEmbed(guild, eventKey, details)], files: [] };
  if (!files.length) return { plain, rich: plain };

  const config = LOG_EVENTS[eventKey] ?? { color: 0x5865F2 };
  const main = makeEmbed(guild, eventKey, { ...details, image: `attachment://${files[0].name}` });
  const extras = files.slice(1).map(file =>
    new EmbedBuilder().setColor(config.color).setImage(`attachment://${file.name}`)
  );
  return { plain, rich: { embeds: [main, ...extras], files } };
}

async function sendToChannel(client, channelId, payloads) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.guild) return false;
  const me = channel.guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (permissions && !permissions.has(["ViewChannel", "SendMessages", "EmbedLinks"])) return false;

  const canAttach = !permissions || permissions.has("AttachFiles");
  if (payloads.rich.files.length && canAttach) {
    try {
      await channel.send({
        embeds: payloads.rich.embeds,
        files: payloads.rich.files.map(file => new AttachmentBuilder(file.buffer, { name: file.name }))
      });
      return true;
    } catch (error) {
      console.warn(`[LOG] send with images failed (${error.message}); retrying without images.`);
    }
  }
  await channel.send({ embeds: payloads.plain.embeds });
  return true;
}

export async function sendLog(client, db, guild, eventKey, details = {}) {
  if (!db.isEnabled(guild.id)) return;

  if (details.record) {
    try {
      db.addLog({ guildId: guild.id, eventKey, ...details.record });
    } catch (error) {
      console.error(`[LOG:${eventKey}] database save failed:`, error.message);
    }
  }

  const payloads = buildPayloads(guild, eventKey, details);
  const localChannelId = db.getChannel(guild.id, eventKey);
  if (localChannelId) {
    try {
      await sendToChannel(client, localChannelId, payloads);
    } catch (error) {
      console.error(`[LOG:${eventKey}] local send failed:`, error.message);
    }
  }

  for (const relay of db.getRelays(guild.id)) {
    let selected = [];
    try { selected = JSON.parse(relay.events); } catch {}
    if (!selected.includes("*") && !selected.includes(eventKey)) continue;
    try {
      const sent = await sendToChannel(client, relay.destination_channel_id, payloads);
      if (!sent) console.warn(`[RELAY:${relay.id}] destination unavailable or missing permissions.`);
    } catch (error) {
      console.error(`[RELAY:${relay.id}] send failed:`, error.message);
    }
  }
}

export async function sendRelayTest(client, db, sourceGuild) {
  const relays = db.getRelays(sourceGuild.id);
  const results = [];
  for (const relay of relays) {
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle("WASHI LOG SYSTEM • Relay Test")
      .setDescription("ทดสอบการส่ง Logs ข้ามเซิร์ฟเวอร์สำเร็จ")
      .addFields(
        { name: "ต้นทาง", value: `${sourceGuild.name}\n${sourceGuild.id}`, inline: true },
        { name: "ปลายทาง", value: relay.destination_guild_id, inline: true },
        { name: "Relay ID", value: String(relay.id), inline: true }
      )
      .setTimestamp()
      .setFooter({ text: "WASHI LOG SYSTEM" });
    const payloads = { plain: { embeds: [embed], files: [] }, rich: { embeds: [embed], files: [] } };
    try {
      results.push({ id: relay.id, ok: await sendToChannel(client, relay.destination_channel_id, payloads) });
    } catch {
      results.push({ id: relay.id, ok: false });
    }
  }
  return results;
}
