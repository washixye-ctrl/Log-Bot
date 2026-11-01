import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export class Database {
  constructor(db) {
    this.db = db;
    this.file = path.resolve("data", "washi-logs.sqlite");
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
      PRAGMA foreign_keys = ON;
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
    `);
  }

  persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, Buffer.from(this.db.export()));
  }

  run(sql, params = []) {
    this.db.run(sql, params);
    this.persist();
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
    return this.get("SELECT last_insert_rowid() AS id")?.id;
  }

  removeRelay(sourceGuildId, id) {
    this.run("DELETE FROM relays WHERE id = ? AND source_guild_id = ?", [id, sourceGuildId]);
  }

  getRelays(sourceGuildId) {
    return this.all("SELECT * FROM relays WHERE source_guild_id = ? AND enabled = 1 ORDER BY id", [sourceGuildId]);
  }

  close() {
    this.persist();
    this.db.close();
  }
}
