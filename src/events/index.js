import { AuditLogEvent, EmbedBuilder } from "discord.js";
import { sendLog } from "../logger.js";

const userTag = user => user ? `${user.tag} (${user.id})` : "ไม่ทราบ";
const channelTag = channel => channel ? `#${channel.name} (${channel.id})` : "ไม่ทราบ";
const roleTag = role => role ? `${role.name} (${role.id})` : "ไม่ทราบ";
const clip = (value, max = 900) => !value ? "—" : String(value).slice(0, max);

async function findRecentAudit(guild, type, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    return logs.entries.find(entry =>
      entry.target?.id === targetId && Date.now() - entry.createdTimestamp < 15_000
    ) ?? null;
  } catch {
    return null;
  }
}

export function registerEvents(client, db) {
  client.on("guildCreate", guild => {
    db.ensureGuild(guild.id);
    console.log(`Joined ${guild.name} (${guild.id}). Run /logs setup there.`);
  });

  client.on("guildMemberAdd", member => {
    sendLog(client, db, member.guild, "member_join", {
      title: "สมาชิกเข้าเซิร์ฟเวอร์",
      description: `${member.user} เข้าร่วมเซิร์ฟเวอร์`,
      thumbnail: member.user.displayAvatarURL(),
      fields: [
        { name: "ผู้ใช้", value: userTag(member.user) },
        { name: "บัญชีสร้างเมื่อ", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>` },
        { name: "จำนวนสมาชิก", value: String(member.guild.memberCount), inline: true }
      ]
    });
  });

  client.on("guildMemberRemove", async member => {
    const audit = await findRecentAudit(member.guild, AuditLogEvent.MemberKick, member.id);
    const kicked = Boolean(audit);
    sendLog(client, db, member.guild, kicked ? "member_kick" : "member_leave", {
      title: kicked ? "สมาชิกถูกเตะออก" : "สมาชิกออกจากเซิร์ฟเวอร์",
      description: `${member.user?.tag ?? member.id} ${kicked ? "ถูกเตะออก" : "ออกจากเซิร์ฟเวอร์"}`,
      thumbnail: member.user?.displayAvatarURL(),
      fields: [
        { name: "ผู้ใช้", value: userTag(member.user) },
        ...(kicked ? [{ name: "ผู้ดำเนินการ", value: userTag(audit.executor) }, { name: "เหตุผล", value: clip(audit.reason) }] : []),
        { name: "จำนวนสมาชิก", value: String(member.guild.memberCount), inline: true }
      ]
    });
  });

  client.on("messageDelete", message => {
    if (!message.guild || message.author?.bot) return;
    sendLog(client, db, message.guild, "message_delete", {
      title: "ข้อความถูกลบ",
      description: `ข้อความใน ${channelTag(message.channel)} ถูกลบ`,
      fields: [
        { name: "ผู้เขียน", value: userTag(message.author) },
        { name: "ห้อง", value: channelTag(message.channel) },
        { name: "เนื้อหา", value: clip(message.content || (message.partial ? "ข้อความ partial; ไม่มีเนื้อหาใน cache" : "ไม่มีข้อความ")) },
        { name: "ไฟล์แนบ", value: message.attachments?.size ? [...message.attachments.values()].map(a => a.url).join("\n").slice(0, 1000) : "ไม่มี" }
      ]
    });
  });

  client.on("messageUpdate", (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    sendLog(client, db, newMessage.guild, "message_update", {
      title: "ข้อความถูกแก้ไข",
      description: `ข้อความใน ${channelTag(newMessage.channel)} ถูกแก้ไข`,
      fields: [
        { name: "ผู้เขียน", value: userTag(newMessage.author) },
        { name: "ก่อนแก้ไข", value: clip(oldMessage.content || "ไม่อยู่ใน cache") },
        { name: "หลังแก้ไข", value: clip(newMessage.content) },
        { name: "ลิงก์ข้อความ", value: newMessage.url }
      ]
    });
  });

  client.on("roleCreate", role => sendLog(client, db, role.guild, "role_create", {
    title: "สร้างยศใหม่", description: `สร้างยศ ${roleTag(role)}`,
    fields: [{ name: "สี", value: role.hexColor, inline: true }, { name: "Role ID", value: role.id, inline: true }]
  }));

  client.on("roleDelete", role => sendLog(client, db, role.guild, "role_delete", {
    title: "ลบยศ", description: `ลบยศ ${roleTag(role)}`,
    fields: [{ name: "Role ID", value: role.id }]
  }));

  client.on("roleUpdate", (oldRole, newRole) => {
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push({ name: "ชื่อ", value: `${oldRole.name} → ${newRole.name}` });
    if (oldRole.hexColor !== newRole.hexColor) changes.push({ name: "สี", value: `${oldRole.hexColor} → ${newRole.hexColor}` });
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push({ name: "Permissions", value: "มีการเปลี่ยนแปลงสิทธิ์" });
    if (changes.length) sendLog(client, db, newRole.guild, "role_update", { title: "แก้ไขยศ", description: roleTag(newRole), fields: changes });
  });

  client.on("channelCreate", channel => {
    if (!channel.guild) return;
    sendLog(client, db, channel.guild, "channel_create", {
      title: "สร้างห้องใหม่", description: channelTag(channel),
      fields: [{ name: "ประเภท", value: String(channel.type), inline: true }, { name: "Channel ID", value: channel.id, inline: true }]
    });
  });

  client.on("channelDelete", channel => {
    if (!channel.guild) return;
    sendLog(client, db, channel.guild, "channel_delete", {
      title: "ลบห้อง", description: channelTag(channel),
      fields: [{ name: "Channel ID", value: channel.id }]
    });
  });

  client.on("channelUpdate", (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    const changes = [];
    if (oldChannel.name !== newChannel.name) changes.push({ name: "ชื่อห้อง", value: `${oldChannel.name} → ${newChannel.name}` });
    if (oldChannel.parentId !== newChannel.parentId) changes.push({ name: "หมวดหมู่", value: `${oldChannel.parent?.name ?? "ไม่มี"} → ${newChannel.parent?.name ?? "ไม่มี"}` });
    if (changes.length) sendLog(client, db, newChannel.guild, "channel_update", { title: "แก้ไขห้อง", description: channelTag(newChannel), fields: changes });
  });

  client.on("voiceStateUpdate", (oldState, newState) => {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;
    if (!oldState.channelId && newState.channelId) {
      sendLog(client, db, member.guild, "voice_join", {
        title: "สมาชิกเข้า Voice", description: `${userTag(member.user)} เข้าห้อง ${channelTag(newState.channel)}`,
        fields: [{ name: "ห้องเสียง", value: channelTag(newState.channel) }]
      });
    } else if (oldState.channelId && !newState.channelId) {
      sendLog(client, db, member.guild, "voice_leave", {
        title: "สมาชิกออก Voice", description: `${userTag(member.user)} ออกจากห้อง ${channelTag(oldState.channel)}`,
        fields: [{ name: "ห้องเสียง", value: channelTag(oldState.channel) }]
      });
    } else if (oldState.channelId !== newState.channelId) {
      sendLog(client, db, member.guild, "voice_move", {
        title: "สมาชิกย้ายห้อง Voice", description: userTag(member.user),
        fields: [
          { name: "จาก", value: channelTag(oldState.channel) },
          { name: "ไปยัง", value: channelTag(newState.channel) }
        ]
      });
    }
  });

  client.on("guildBanAdd", ban => sendLog(client, db, ban.guild, "ban_add", {
    title: "สมาชิกถูกแบน", description: userTag(ban.user),
    fields: [{ name: "เหตุผล", value: clip(ban.reason) }]
  }));

  client.on("guildBanRemove", ban => sendLog(client, db, ban.guild, "ban_remove", {
    title: "สมาชิกถูกปลดแบน", description: userTag(ban.user)
  }));

  client.on("guildMemberUpdate", (oldMember, newMember) => {
    if (oldMember.nickname !== newMember.nickname) {
      sendLog(client, db, newMember.guild, "nickname_update", {
        title: "เปลี่ยนชื่อเล่น",
        description: userTag(newMember.user),
        fields: [
          { name: "ชื่อเดิม", value: oldMember.nickname ?? oldMember.user.username },
          { name: "ชื่อใหม่", value: newMember.nickname ?? newMember.user.username }
        ]
      });
    }
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp ?? null;
    const newTimeout = newMember.communicationDisabledUntilTimestamp ?? null;
    if (oldTimeout !== newTimeout) {
      sendLog(client, db, newMember.guild, "timeout_update", {
        title: "เปลี่ยนสถานะ Timeout",
        description: userTag(newMember.user),
        fields: [
          { name: "สถานะ", value: newTimeout ? "ถูก Timeout" : "ยกเลิก Timeout" },
          { name: "หมดเวลา", value: newTimeout ? `<t:${Math.floor(newTimeout / 1000)}:F>` : "—" }
        ]
      });
    }
  });
}
