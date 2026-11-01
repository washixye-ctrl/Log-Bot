import { AuditLogEvent } from "discord.js";
import { sendLog } from "../logger.js";
import { cacheMessageImages, releaseMessageMedia, takeMessageMedia } from "../media.js";

const userTag = user => user ? `${user.tag} (${user.id})` : "ไม่ทราบ";
const channelTag = channel => channel ? `#${channel.name} (${channel.id})` : "ไม่ทราบ";
const roleTag = role => role ? `${role.name} (${role.id})` : "ไม่ทราบ";
const clip = (value, max = 900) => !value ? "—" : String(value).slice(0, max);

function person(user, actor) {
  return {
    userId: user?.id, userTag: user?.tag,
    actorId: actor?.id, actorTag: actor?.tag
  };
}

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
      ],
      record: { ...person(member.user), summary: "เข้าร่วมเซิร์ฟเวอร์" }
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
      ],
      record: {
        ...person(member.user ?? { id: member.id }, audit?.executor),
        summary: kicked ? "ถูกเตะออกจากเซิร์ฟเวอร์" : "ออกจากเซิร์ฟเวอร์",
        content: kicked ? audit.reason : null
      }
    });
  });

  client.on("messageCreate", message => {
    if (!message.guild || message.author?.bot || !message.attachments?.size) return;
    cacheMessageImages(db, message).catch(error => console.warn("[MEDIA] cache error:", error.message));
  });

  client.on("messageDelete", async message => {
    if (!message.guild || message.author?.bot) return;
    const media = takeMessageMedia(db, message.id);
    const first = media.rows[0];
    const authorId = message.author?.id ?? first?.author_id ?? null;
    const authorLabel = message.author ? userTag(message.author) : first?.author_tag ? `${first.author_tag} (${first.author_id})` : "ไม่ทราบ";
    const channelId = message.channelId ?? first?.channel_id ?? null;
    const channelLabel = message.channel ? channelTag(message.channel) : channelId ? `<#${channelId}>` : "ไม่ทราบ";

    const attachmentNames = message.attachments?.size
      ? [...message.attachments.values()].map(a => a.name)
      : media.rows.map(r => r.file_name);
    const previewNote = media.files.length ? `\n🖼️ แสดงรูปที่ถูกลบด้านล่าง (${media.files.length} รูป)` : "";
    const content = message.content || (message.partial ? "ข้อความ partial; ไม่มีเนื้อหาใน cache" : "ไม่มีข้อความ");

    await sendLog(client, db, message.guild, "message_delete", {
      title: "ข้อความถูกลบ",
      description: `ข้อความใน ${channelLabel} ถูกลบ${previewNote}`,
      files: media.files,
      fields: [
        { name: "ผู้เขียน", value: authorLabel },
        { name: "ห้อง", value: channelLabel },
        { name: "เนื้อหา", value: clip(content) },
        { name: "ไฟล์แนบ", value: attachmentNames.length ? attachmentNames.join("\n").slice(0, 1000) : "ไม่มี" }
      ],
      record: {
        userId: authorId, userTag: message.author?.tag ?? first?.author_tag,
        channelId, channelName: message.channel?.name,
        summary: attachmentNames.length ? `ลบข้อความพร้อมไฟล์แนบ ${attachmentNames.length} ไฟล์` : "ลบข้อความ",
        content: message.content || null,
        hasMedia: media.files.length > 0
      }
    });
    if (media.rows.length) releaseMessageMedia(db, message.id);
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
      ],
      record: {
        ...person(newMessage.author),
        channelId: newMessage.channelId, channelName: newMessage.channel?.name,
        summary: "แก้ไขข้อความ",
        content: `ก่อน: ${clip(oldMessage.content || "ไม่อยู่ใน cache", 900)}\nหลัง: ${clip(newMessage.content, 900)}`
      }
    });
  });

  client.on("roleCreate", role => sendLog(client, db, role.guild, "role_create", {
    title: "สร้างยศใหม่", description: `สร้างยศ ${roleTag(role)}`,
    fields: [{ name: "สี", value: role.hexColor, inline: true }, { name: "Role ID", value: role.id, inline: true }],
    record: { summary: `สร้างยศ ${role.name}` }
  }));

  client.on("roleDelete", role => sendLog(client, db, role.guild, "role_delete", {
    title: "ลบยศ", description: `ลบยศ ${roleTag(role)}`,
    fields: [{ name: "Role ID", value: role.id }],
    record: { summary: `ลบยศ ${role.name}` }
  }));

  client.on("roleUpdate", (oldRole, newRole) => {
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push({ name: "ชื่อ", value: `${oldRole.name} → ${newRole.name}` });
    if (oldRole.hexColor !== newRole.hexColor) changes.push({ name: "สี", value: `${oldRole.hexColor} → ${newRole.hexColor}` });
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push({ name: "Permissions", value: "มีการเปลี่ยนแปลงสิทธิ์" });
    if (!changes.length) return;
    sendLog(client, db, newRole.guild, "role_update", {
      title: "แก้ไขยศ", description: roleTag(newRole), fields: changes,
      record: { summary: `แก้ไขยศ ${newRole.name}`, content: changes.map(c => `${c.name}: ${c.value}`).join("\n") }
    });
  });

  client.on("channelCreate", channel => {
    if (!channel.guild) return;
    sendLog(client, db, channel.guild, "channel_create", {
      title: "สร้างห้องใหม่", description: channelTag(channel),
      fields: [{ name: "ประเภท", value: String(channel.type), inline: true }, { name: "Channel ID", value: channel.id, inline: true }],
      record: { channelId: channel.id, channelName: channel.name, summary: `สร้างห้อง ${channel.name}` }
    });
  });

  client.on("channelDelete", channel => {
    if (!channel.guild) return;
    sendLog(client, db, channel.guild, "channel_delete", {
      title: "ลบห้อง", description: channelTag(channel),
      fields: [{ name: "Channel ID", value: channel.id }],
      record: { channelId: channel.id, channelName: channel.name, summary: `ลบห้อง ${channel.name}` }
    });
  });

  client.on("channelUpdate", (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    const changes = [];
    if (oldChannel.name !== newChannel.name) changes.push({ name: "ชื่อห้อง", value: `${oldChannel.name} → ${newChannel.name}` });
    if (oldChannel.parentId !== newChannel.parentId) changes.push({ name: "หมวดหมู่", value: `${oldChannel.parent?.name ?? "ไม่มี"} → ${newChannel.parent?.name ?? "ไม่มี"}` });
    if (!changes.length) return;
    sendLog(client, db, newChannel.guild, "channel_update", {
      title: "แก้ไขห้อง", description: channelTag(newChannel), fields: changes,
      record: {
        channelId: newChannel.id, channelName: newChannel.name,
        summary: `แก้ไขห้อง ${newChannel.name}`, content: changes.map(c => `${c.name}: ${c.value}`).join("\n")
      }
    });
  });

  client.on("voiceStateUpdate", (oldState, newState) => {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;
    const base = { ...person(member.user) };
    if (!oldState.channelId && newState.channelId) {
      sendLog(client, db, member.guild, "voice_join", {
        title: "สมาชิกเข้า Voice", description: `${userTag(member.user)} เข้าห้อง ${channelTag(newState.channel)}`,
        fields: [{ name: "ห้องเสียง", value: channelTag(newState.channel) }],
        record: { ...base, channelId: newState.channelId, channelName: newState.channel?.name, summary: `เข้า ${newState.channel?.name}` }
      });
    } else if (oldState.channelId && !newState.channelId) {
      sendLog(client, db, member.guild, "voice_leave", {
        title: "สมาชิกออก Voice", description: `${userTag(member.user)} ออกจากห้อง ${channelTag(oldState.channel)}`,
        fields: [{ name: "ห้องเสียง", value: channelTag(oldState.channel) }],
        record: { ...base, channelId: oldState.channelId, channelName: oldState.channel?.name, summary: `ออกจาก ${oldState.channel?.name}` }
      });
    } else if (oldState.channelId !== newState.channelId) {
      sendLog(client, db, member.guild, "voice_move", {
        title: "สมาชิกย้ายห้อง Voice", description: userTag(member.user),
        fields: [
          { name: "จาก", value: channelTag(oldState.channel) },
          { name: "ไปยัง", value: channelTag(newState.channel) }
        ],
        record: {
          ...base, channelId: newState.channelId, channelName: newState.channel?.name,
          summary: `ย้ายจาก ${oldState.channel?.name} ไป ${newState.channel?.name}`
        }
      });
    }
  });

  client.on("guildBanAdd", async ban => {
    const audit = await findRecentAudit(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    sendLog(client, db, ban.guild, "ban_add", {
      title: "สมาชิกถูกแบน", description: userTag(ban.user),
      fields: [
        ...(audit ? [{ name: "ผู้ดำเนินการ", value: userTag(audit.executor) }] : []),
        { name: "เหตุผล", value: clip(ban.reason ?? audit?.reason) }
      ],
      record: { ...person(ban.user, audit?.executor), summary: "ถูกแบน", content: ban.reason ?? audit?.reason }
    });
  });

  client.on("guildBanRemove", async ban => {
    const audit = await findRecentAudit(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    sendLog(client, db, ban.guild, "ban_remove", {
      title: "สมาชิกถูกปลดแบน", description: userTag(ban.user),
      fields: audit ? [{ name: "ผู้ดำเนินการ", value: userTag(audit.executor) }] : [],
      record: { ...person(ban.user, audit?.executor), summary: "ถูกปลดแบน" }
    });
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (oldMember.nickname !== newMember.nickname) {
      sendLog(client, db, newMember.guild, "nickname_update", {
        title: "เปลี่ยนชื่อเล่น",
        description: userTag(newMember.user),
        fields: [
          { name: "ชื่อเดิม", value: oldMember.nickname ?? oldMember.user.username },
          { name: "ชื่อใหม่", value: newMember.nickname ?? newMember.user.username }
        ],
        record: {
          ...person(newMember.user), summary: "เปลี่ยนชื่อเล่น",
          content: `${oldMember.nickname ?? oldMember.user.username} → ${newMember.nickname ?? newMember.user.username}`
        }
      });
    }
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp ?? null;
    const newTimeout = newMember.communicationDisabledUntilTimestamp ?? null;
    if (oldTimeout !== newTimeout) {
      const audit = await findRecentAudit(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
      sendLog(client, db, newMember.guild, "timeout_update", {
        title: "เปลี่ยนสถานะ Timeout",
        description: userTag(newMember.user),
        fields: [
          { name: "สถานะ", value: newTimeout ? "ถูก Timeout" : "ยกเลิก Timeout" },
          { name: "หมดเวลา", value: newTimeout ? `<t:${Math.floor(newTimeout / 1000)}:F>` : "—" },
          ...(audit ? [{ name: "ผู้ดำเนินการ", value: userTag(audit.executor) }] : [])
        ],
        record: {
          ...person(newMember.user, audit?.executor),
          summary: newTimeout ? "ถูก Timeout" : "ยกเลิก Timeout",
          content: newTimeout ? `หมดเวลา ${new Date(newTimeout).toISOString()}` : null
        }
      });
    }
  });
}
