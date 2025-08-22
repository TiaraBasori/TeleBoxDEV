import Database from "better-sqlite3";
import { createDirectoryInAssets } from "./pathHelpers";
import path from "path";

interface UserRecord {
  uid: number;
  username: string;
}

class SudoDB {
  private db: Database.Database;

  constructor(
    dbPath: string = path.join(createDirectoryInAssets("sudo"), "sudo.db")
  ) {
    this.db = new Database(dbPath);
    this.init();
  }

  // 初始化表结构
  private init(): void {
    this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS users (
        uid INTEGER PRIMARY KEY,
        username TEXT NOT NULL
      )
    `
      )
      .run();
  }

  /**
   * 添加或更新用户
   */
  public add(uid: number, username: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO users (uid, username)
      VALUES (?, ?)
      ON CONFLICT(uid) DO UPDATE SET username = excluded.username
    `);
    stmt.run(uid, username);
  }

  /**
   * 删除用户
   */
  public del(uid: number): boolean {
    const info = this.db
      .prepare(
        `
      DELETE FROM users WHERE uid = ?
    `
      )
      .run(uid);
    return info.changes > 0;
  }

  /**
   * 列出所有用户
   */
  public ls(): UserRecord[] {
    return this.db
      .prepare<[], UserRecord>(
        `
        SELECT uid, username FROM users
        ORDER BY uid ASC
      `
      )
      .all();
  }

  /**
   * 关闭数据库
   */
  public close(): void {
    this.db.close();
  }
}

export { SudoDB };
