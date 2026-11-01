import fs from "node:fs";
import path from "node:path";
import { SETTINGS } from "./config.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MEDIA_DIR = path.resolve("data", "media");

function imageExtension(attachment) {
  const ext = path.extname(attachment.name ?? "").toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;
  if (attachment.contentType && !attachment.contentType.startsWith("image/")) return null;
  return ext;
}

export async function cacheMessageImages(db, message) {
  if (!SETTINGS.mediaCacheEnabled) return;
  if (!message.guild || message.author?.bot || !message.attachments?.size) return;
  if (!db.isEnabled(message.guild.id)) return;
  const maxBytes = SETTINGS.mediaMaxMb * 1024 * 1024;
  const dir = path.join(MEDIA_DIR, message.guild.id);
  fs.mkdirSync(dir, { recursive: true });

  for (const attachment of message.attachments.values()) {
    const ext = imageExtension(attachment);
    if (!ext || (attachment.size && attachment.size > maxBytes)) continue;
    try {
      const response = await fetch(attachment.url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > maxBytes) continue;
      const fileName = `${message.id}_${attachment.id}${ext}`;
      const filePath = path.join(dir, fileName);
      await fs.promises.writeFile(filePath, buffer);
      db.addMedia({
        messageId: message.id,
        attachmentId: attachment.id,
        guildId: message.guild.id,
        channelId: message.channelId,
        authorId: message.author?.id,
        authorTag: message.author?.tag,
        fileName: `${message.id}_${attachment.id}${ext}`,
        filePath,
        size: buffer.length
      });
    } catch (error) {
      console.warn(`[MEDIA] cache failed for ${attachment.id}:`, error.message);
    }
  }
}

export function takeMessageMedia(db, messageId) {
  const rows = db.getMedia(messageId);
  const files = [];
  for (const row of rows) {
    try {
      files.push({ name: row.file_name, buffer: fs.readFileSync(row.file_path) });
    } catch {}
  }
  return { rows, files };
}

export function releaseMessageMedia(db, messageId) {
  for (const row of db.getMedia(messageId)) {
    fs.promises.unlink(row.file_path).catch(() => {});
  }
  db.removeMedia(messageId);
}

export function cleanupMedia(db) {
  if (!SETTINGS.mediaCacheHours) return;
  for (const row of db.expiredMedia(SETTINGS.mediaCacheHours)) {
    fs.promises.unlink(row.file_path).catch(() => {});
    db.removeMedia(row.message_id);
  }
}
