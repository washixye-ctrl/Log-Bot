import { ChannelType, PermissionFlagsBits } from "discord.js";
import { LOG_CATEGORY, LOG_EVENTS, SYSTEM_CATEGORY, SYSTEM_CHANNELS } from "./config.js";

function privateOverwrites(guild, botId) {
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels
      ]
    }
  ];
}

async function ensureCategory(guild, name, overwrites) {
  let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name);
  if (!category) {
    category = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites });
  }
  return category;
}

async function ensureTextChannel(guild, category, name, overwrites) {
  let channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
      topic: "WASHI LOG SYSTEM • บันทึกเหตุการณ์อัตโนมัติ"
    });
  } else if (channel.parentId !== category.id) {
    await channel.setParent(category.id).catch(() => {});
  }
  return channel;
}

export async function setupGuild(guild, db, botId) {
  await guild.channels.fetch();
  const overwrites = privateOverwrites(guild, botId);
  const logCategory = await ensureCategory(guild, LOG_CATEGORY, overwrites);
  const systemCategory = await ensureCategory(guild, SYSTEM_CATEGORY, overwrites);
  let created = 0;
  for (const [eventKey, config] of Object.entries(LOG_EVENTS)) {
    const channel = await ensureTextChannel(guild, logCategory, config.channel, overwrites);
    db.setChannel(guild.id, eventKey, channel.id);
    created++;
  }
  for (const name of SYSTEM_CHANNELS) {
    await ensureTextChannel(guild, systemCategory, name, overwrites);
    created++;
  }
  db.ensureGuild(guild.id);
  return { created, logCategory, systemCategory };
}
