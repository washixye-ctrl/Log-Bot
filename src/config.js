const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const SETTINGS = {
  logRetentionDays: number(process.env.LOG_RETENTION_DAYS, 90),
  mediaCacheEnabled: (process.env.MEDIA_CACHE ?? "true").toLowerCase() !== "false",
  mediaMaxMb: number(process.env.MEDIA_MAX_MB, 8),
  mediaCacheHours: number(process.env.MEDIA_CACHE_HOURS, 72)
};

export const LOG_EVENTS = {
  member_join: { label: "สมาชิกเข้าเซิร์ฟเวอร์", channel: "📒・member-join", color: 0x57F287 },
  member_leave: { label: "สมาชิกออกเซิร์ฟเวอร์", channel: "📒・member-leave", color: 0xED4245 },
  member_kick: { label: "สมาชิกถูกเตะออก", channel: "📒・member-kick", color: 0xED4245 },
  message_delete: { label: "ข้อความถูกลบ", channel: "📒・message-delete", color: 0xFEE75C },
  message_update: { label: "ข้อความถูกแก้ไข", channel: "📒・message-edit", color: 0x5865F2 },
  role_create: { label: "สร้างยศ", channel: "📒・role-create", color: 0x57F287 },
  role_delete: { label: "ลบยศ", channel: "📒・role-delete", color: 0xED4245 },
  role_update: { label: "แก้ไขยศ", channel: "📒・role-update", color: 0xFEE75C },
  channel_create: { label: "สร้างห้อง", channel: "📒・channel-create", color: 0x57F287 },
  channel_delete: { label: "ลบห้อง", channel: "📒・channel-delete", color: 0xED4245 },
  channel_update: { label: "แก้ไขห้อง", channel: "📒・channel-update", color: 0xFEE75C },
  voice_join: { label: "เข้า voice", channel: "📒・voice-join", color: 0x57F287 },
  voice_leave: { label: "ออก voice", channel: "📒・voice-leave", color: 0xED4245 },
  voice_move: { label: "ย้าย voice", channel: "📒・voice-move", color: 0xFEE75C },
  ban_add: { label: "แบนสมาชิก", channel: "📒・member-ban", color: 0xED4245 },
  ban_remove: { label: "ปลดแบน", channel: "📒・member-unban", color: 0x57F287 },
  nickname_update: { label: "เปลี่ยนชื่อเล่น", channel: "📒・nickname-change", color: 0x5865F2 },
  timeout_update: { label: "Timeout", channel: "📒・timeout", color: 0xFEE75C }
};

export const SYSTEM_CHANNELS = [
  "💬・staff-chat",
  "🖼️・media-archive",
  "🔗・invite-archive",
  "📋・copy-emoji",
  "⚙️・setup-bot",
  "🤖・automod"
];

export const LOG_CATEGORY = "📂・LOG SERVER";
export const SYSTEM_CATEGORY = "📂・SYSTEM";
