import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const escapeLike = value => `%${String(value).replace(/[\\%_]/g, "\\$&")}%`;

export class Database {
  constructor(db) {
    this.db = db;
    this.file = path.resolve("data", "washi-logs.sqlite");
    this.timer = null;
  }

  static async open() {
    fs.mkdirSync("data", { recursive: true });
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    const file = path.resolve("data", "washi-logs.sqlite");
    const db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
    const instance = new Database(db);
    instance.migrate();
    instance.persist();
    return instance;
  }

  migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS log_channels (
        guild_id TEXT NOT NULL,
        event_key TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        PRIMARY KEY (guild_id, event_key)
      );
      CREATE TABLE IF NOT EXISTS relays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_guild_id TEXT NOT NULL,
        destination_guild_id TEXT NOT NULL,
        destination_channel_id TEXT NOT NULL,
        events TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_relays_source ON relays(source_guild_id, enabled);
      CREATE TABLE IF NOT EXISTS log_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        event_key TEXT NOT NULL,
        user_id TEXT,
        user_tag TEXT,
        actor_id TEXT,
        actor_tag TEXT,
        channel_id TEXT,
        channel_name TEXT,
        summary TEXT,
        content TEXT,
        has_media INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entries_time ON log_entries(guild_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_entries_user ON log_entries(guild_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_entries_event ON log_entries(guild_id, event_key);
      CREATE TABLE IF NOT EXISTS media_cache (
        message_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT,
        author_id TEXT,
        author_tag TEXT,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, attachment_id)
      );
      CREATE INDEX IF NOT EXISTS idx_media_time ON media_cache(created_at);
    `);
  }

  persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, Buffer.from(this.db.export()));
    fs.renameSync(temp, this.file);
  }

  schedulePersist() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try { this.persist(); } catch (error) { console.error("Database save failed:", error.message); }
    }, 2000);
  }

  run(sql, params = []) {
    this.db.run(sql, params);
    this.schedulePersist();
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  get(sql, params = []) {
    return this.all(sql, params)[0] ?? null;
  }

  ensureGuild(guildId) {
    this.run("INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)", [guildId]);
  }

  isEnabled(guildId) {
    const row = this.get("SELECT enabled FROM guild_settings WHERE guild_id = ?", [guildId]);
    return row ? row.enabled === 1 : true;
  }

  setEnabled(guildId, enabled) {
    this.ensureGuild(guildId);
    this.run("UPDATE guild_settings SET enabled = ? WHERE guild_id = ?", [enabled ? 1 : 0, guildId]);
  }

  setChannel(guildId, eventKey, channelId) {
    this.run(
      "INSERT INTO log_channels (guild_id, event_key, channel_id) VALUES (?, ?, ?) ON CONFLICT(guild_id,event_key) DO UPDATE SET channel_id=excluded.channel_id",
      [guildId, eventKey, channelId]
    );
  }

  getChannel(guildId, eventKey) {
    return this.get("SELECT channel_id FROM log_channels WHERE guild_id = ? AND event_key = ?", [guildId, eventKey])?.channel_id ?? null;
  }

  getChannels(guildId) {
    return this.all("SELECT event_key, channel_id FROM log_channels WHERE guild_id = ? ORDER BY event_key", [guildId]);
  }

  addRelay(sourceGuildId, destinationGuildId, destinationChannelId, events) {
    this.run(
      "INSERT INTO relays (source_guild_id, destination_guild_id, destination_channel_id, events) VALUES (?, ?, ?, ?)",
      [sourceGuildId, destinationGuildId, destinationChannelId, JSON.stringify(events)]
    );
    return this.get("SELECT MAX(id) AS id FROM relays WHERE source_guild_id = ?", [sourceGuildId])?.id;
  }

  removeRelay(sourceGuildId, id) {
    this.run("DELETE FROM relays WHERE id = ? AND source_guild_id = ?", [id, sourceGuildId]);
  }

  getRelays(sourceGuildId) {
    return this.all("SELECT * FROM relays WHERE source_guild_id = ? AND enabled = 1 ORDER BY id", [sourceGuildId]);
  }

  addLog(entry) {
    this.run(
      `INSERT INTO log_entries
        (guild_id, event_key, user_id, user_tag, actor_id, actor_tag, channel_id, channel_name, summary, content, has_media, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.guildId, entry.eventKey,
        entry.userId ?? null, entry.userTag ?? null,
        entry.actorId ?? null, entry.actorTag ?? null,
        entry.channelId ?? null, entry.channelName ?? null,
        entry.summary ? String(entry.summary).slice(0, 500) : null,
        entry.content ? String(entry.content).slice(0, 2000) : null,
        entry.hasMedia ? 1 : 0,
        entry.createdAt ?? Date.now()
      ]
    );
  }

  buildFilter(guildId, filter = {}) {
    const where = ["guild_id = ?"];
    const params = [guildId];
    if (filter.userId) {
      where.push("(user_id = ? OR actor_id = ?)");
      params.push(filter.userId, filter.userId);
    }
    if (filter.eventKey) {
      where.push("event_key = ?");
      params.push(filter.eventKey);
    }
    if (filter.channelId) {
      where.push("channel_id = ?");
      params.push(filter.channelId);
    }
    if (filter.keyword) {
      const like = escapeLike(filter.keyword);
      where.push("(summary LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR user_tag LIKE ? ESCAPE '\\' OR actor_tag LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like);
    }
    if (filter.since) {
      where.push("created_at >= ?");
      params.push(filter.since);
    }
    return { clause: where.join(" AND "), params };
  }

  searchLogs(guildId, filter = {}, limit = 8, offset = 0) {
    const { clause, params } = this.buildFilter(guildId, filter);
    const total = this.get(`SELECT COUNT(*) AS n FROM log_entries WHERE ${clause}`, params)?.n ?? 0;
    const rows = this.all(
      `SELECT * FROM log_entries WHERE ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { total, rows };
  }

  getLog(guildId, id) {
    return this.get("SELECT * FROM log_entries WHERE guild_id = ? AND id = ?", [guildId, id]);
  }

  statsByEvent(guildId, filter = {}) {
    const { clause, params } = this.buildFilter(guildId, filter);
    return this.all(`SELECT event_key, COUNT(*) AS n FROM log_entries WHERE ${clause} GROUP BY event_key ORDER BY n DESC`, params);
  }

  statsTopUsers(guildId, filter = {}, limit = 5) {
    const { clause, params } = this.buildFilter(guildId, filter);
    return this.all(
      `SELECT user_id, MAX(user_tag) AS user_tag, COUNT(*) AS n FROM log_entries WHERE ${clause} AND user_id IS NOT NULL GROUP BY user_id ORDER BY n DESC LIMIT ?`,
      [...params, limit]
    );
  }

  pruneLogs(days) {
    if (!days || days <= 0) return;
    this.run("DELETE FROM log_entries WHERE created_at < ?", [Date.now() - days * 86_400_000]);
  }

  addMedia(row) {
    this.run(
      `INSERT OR REPLACE INTO media_cache
        (message_id, attachment_id, guild_id, channel_id, author_id, author_tag, file_name, file_path, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.messageId, row.attachmentId, row.guildId, row.channelId ?? null, row.authorId ?? null, row.authorTag ?? null, row.fileName, row.filePath, row.size ?? 0, Date.now()]
    );
  }

  getMedia(messageId) {
    return this.all("SELECT * FROM media_cache WHERE message_id = ? ORDER BY created_at", [messageId]);
  }

  removeMedia(messageId) {
    this.run("DELETE FROM media_cache WHERE message_id = ?", [messageId]);
  }

  expiredMedia(hours) {
    return this.all("SELECT * FROM media_cache WHERE created_at < ?", [Date.now() - hours * 3_600_000]);
  }

  close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.persist();
    this.db.close();
  }
}
