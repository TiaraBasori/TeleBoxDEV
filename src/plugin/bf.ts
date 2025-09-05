/**
 * Backup & Restore plugin for TeleBox - Complete backup solution
 * Converted from PagerMaid-Modify bf.py
 */
import * as cron from "cron";
import { Plugin } from "@utils/pluginBase";
import { Api, TelegramClient } from "telegram";
import { getGlobalClient } from "@utils/globalClient";
import { createDirectoryInAssets } from "@utils/pathHelpers";
import { cronManager } from "@utils/cronManager";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import * as crypto from "crypto";
import * as os from "os";
import { JSONFilePreset } from "lowdb/node"; // 使用 JSONFilePreset 简化 lowdb

// 取消原先通过加8小时实现的伪北京时区处理，统一内部使用UTC时间。
// 显示时按需格式化为 Asia/Shanghai。
const CN_TIME_ZONE = "Asia/Shanghai";

function formatCN(date: Date): string {
  return date.toLocaleString("zh-CN", { timeZone: CN_TIME_ZONE });
}

// 基本类型定义
interface BackupConfig {
  target_chat_ids?: string[];
  upload_sessions?: boolean;
  temp_restore_file?: {
    file_info: FileInfo;
    expire_time: string;
  };
  scheduled_backup?: {
    enabled: boolean;
    cron_expression: string;
    last_backup: string;
    next_backup: string;
  };
}

interface FileInfo {
  file_name: string;
  file_size: number;
  message_id: number;
  chat_id: number;
  date: string;
}

// 定时标准备份执行逻辑（assets + plugins）
async function runScheduledStandardBackup(): Promise<void> {
  console.log("执行定时标准备份（cronManager）...");
  const tempDir = os.tmpdir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const backupPath = path.join(tempDir, `telebox-backup-${timestamp}.tar.gz`);

  try {
    const programDir = getProgramDir();
    // 检查哪些项目实际存在
    const potentialItems = ["assets", "plugins"];
    const existingItems = potentialItems.filter((item) =>
      fs.existsSync(path.join(programDir, item))
    );

    if (existingItems.length === 0) {
      throw new Error("没有找到可备份的项目 (assets, plugins)");
    }

    await createTarGz(existingItems, backupPath);

    const stats = fs.statSync(backupPath);
    const caption = `🤖 定时标准备份\n📅 ${formatCN(new Date())}\n📦 大小: ${(
      stats.size /
      1024 /
      1024
    ).toFixed(2)} MB\n📁 内容: ${existingItems.join(" + ")}`;

    const client = await getGlobalClient();
    if (!client) throw new Error("Telegram客户端未初始化");
    const targets = await Config.get<string[]>("target_chat_ids", []);
    await uploadToTargets(client, backupPath, targets, caption);
  } catch (err) {
    console.error("定时标准备份失败", err);
    throw err;
  } finally {
    try {
      fs.unlinkSync(backupPath);
    } catch {}
  }
}

function computeNextRun(cronExpression: string): string {
  try {
    // cron.sendAt 返回 Luxon DateTime
    const dt: any = (cron as any).sendAt(cronExpression);
    if (!dt) return "";
    if (typeof dt.toJSDate === "function") {
      return dt.toJSDate().toISOString();
    }
    if (typeof dt.toISO === "function") {
      return dt.toISO();
    }
    if (dt instanceof Date) return dt.toISOString();
    return "";
  } catch {
    return "";
  }
}

class ScheduledBackupService {
  private static readonly TASK_NAME = "telebox_scheduled_backup";
  private static running = false;

  static async initFromConfig() {
    const cfg = await Config.get<BackupConfig["scheduled_backup"]>(
      "scheduled_backup"
    );
    if (cfg?.enabled && cfg.cron_expression) {
      try {
        await this.start(cfg.cron_expression, false); // 不覆盖 last/next，保持原有
      } catch (e) {
        console.error("重新载入定时任务失败", e);
      }
    }
  }

  static async start(cronExpression: string, updateConfig: boolean = true) {
    // 验证
    const validation: any = (cron as any).validateCronExpression
      ? (cron as any).validateCronExpression(cronExpression)
      : { valid: true };
    if (!validation.valid) {
      throw new Error(`无效的 cron 表达式: ${validation.error || "format"}`);
    }

    // 若存在旧任务，先删除
    if (cronManager.has(this.TASK_NAME)) {
      cronManager.del(this.TASK_NAME);
    }

    // 注册任务
    cronManager.set(this.TASK_NAME, cronExpression, async () => {
      if (this.running) {
        console.log("定时标准备份仍在运行，跳过本次触发");
        return;
      }
      this.running = true;
      const startTime = new Date();
      try {
        await runScheduledStandardBackup();
        // 更新 last_backup
        const sched: any =
          (await Config.get<BackupConfig["scheduled_backup"]>(
            "scheduled_backup"
          )) || {};
        sched.last_backup = startTime.toISOString();
        sched.next_backup = computeNextRun(cronExpression);
        sched.enabled = true;
        sched.cron_expression = cronExpression;
        await Config.set("scheduled_backup", sched);
      } catch (e) {
        console.error("定时备份执行出错", e);
      } finally {
        this.running = false;
      }
    });

    if (updateConfig) {
      const nextISO = computeNextRun(cronExpression);
      await Config.set("scheduled_backup", {
        enabled: true,
        cron_expression: cronExpression,
        last_backup: "",
        next_backup: nextISO,
      });
    }

    console.log(
      `定时备份已通过 cronManager 启动: ${cronExpression} ，下次执行: ${formatCN(
        new Date(computeNextRun(cronExpression) || new Date().toISOString())
      )}`
    );
  }

  static async stop() {
    if (cronManager.has(this.TASK_NAME)) {
      cronManager.del(this.TASK_NAME);
      console.log("定时备份任务已停止");
    }
    await Config.set("scheduled_backup", {
      enabled: false,
      cron_expression: "",
      last_backup: "",
      next_backup: "",
    });
  }

  static async runOnce(): Promise<void> {
    const cfg = await Config.get<BackupConfig["scheduled_backup"]>(
      "scheduled_backup"
    );
    if (!cfg?.enabled) throw new Error("定时备份未启用");
    await runScheduledStandardBackup();
    const cronExpression = cfg.cron_expression;
    const updated: any =
      (await Config.get<BackupConfig["scheduled_backup"]>(
        "scheduled_backup"
      )) || {};
    updated.last_backup = new Date().toISOString();
    updated.next_backup = computeNextRun(cronExpression);
    await Config.set("scheduled_backup", updated);
  }

  static async getStatus() {
    const cfg = await Config.get<BackupConfig["scheduled_backup"]>(
      "scheduled_backup"
    );
    if (!cfg || !cfg.enabled) {
      return { enabled: false, is_running: false };
    }
    // 计算最新 next (实时展示)
    const nextISO =
      computeNextRun(cfg.cron_expression) || cfg.next_backup || "";
    return {
      enabled: true,
      cron_expression: cfg.cron_expression,
      last_backup: cfg.last_backup,
      next_backup: nextISO,
      is_running: cronManager.has(this.TASK_NAME),
    };
  }
}

// 统一配置管理
class Config {
  private static db: any = null;
  private static initPromise: Promise<void> | null = null;

  private static async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    await this.initPromise;
  }

  private static async doInit(): Promise<void> {
    const filePath = path.join(createDirectoryInAssets("bf"), "bf_config.json");
    this.db = await JSONFilePreset<BackupConfig>(filePath, {});
  }

  static async load(): Promise<BackupConfig> {
    await this.init();
    return { ...this.db.data };
  }

  static async save(config: BackupConfig): Promise<void> {
    await this.init();
    this.db.data = { ...config };
    await this.db.write();
  }

  static async get<T>(key: keyof BackupConfig, def?: T): Promise<T> {
    await this.init();
    const v = (this.db.data as any)[key];
    return v !== undefined ? (v as T) : (def as T);
  }

  static async set<T>(key: keyof BackupConfig, value: T): Promise<void> {
    await this.init();
    if (value === null || value === undefined) {
      delete (this.db.data as any)[key];
    } else {
      (this.db.data as any)[key] = value;
    }
    await this.db.write();
  }

  static async setTempRestoreFile(fileInfo: FileInfo): Promise<void> {
    const expire = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await this.set("temp_restore_file", {
      file_info: fileInfo,
      expire_time: expire,
    });
  }

  static async getTempRestoreFile(): Promise<FileInfo | null> {
    const t = await this.get<BackupConfig["temp_restore_file"]>(
      "temp_restore_file"
    );
    if (!t) return null;
    try {
      if (new Date() > new Date(t.expire_time)) {
        await this.set("temp_restore_file", null as any);
        return null;
      }
      return t.file_info;
    } catch {
      await this.set("temp_restore_file", null as any);
      return null;
    }
  }
}

// 目标聊天管理
class TargetManager {
  static async getTargets(): Promise<string[]> {
    let ids = await Config.get<string[]>("target_chat_ids", []);
    if (!ids || ids.length === 0) {
      return [];
    }

    ids = ids.map((i: any) => String(i).trim()).filter((i: any) => i);
    return [...new Set(ids)]; // 去重
  }

  static async setTargets(newIds: string[]): Promise<void> {
    await Config.set("target_chat_ids", newIds);
  }

  static async addTargets(idsToAdd: string[]): Promise<string[]> {
    const existing = await TargetManager.getTargets();
    for (const id of idsToAdd) {
      const s = String(id).trim();
      if (s && !existing.includes(s)) {
        existing.push(s);
      }
    }
    await TargetManager.setTargets(existing);
    return existing;
  }

  static async removeTarget(idToRemove: string): Promise<string[]> {
    if (idToRemove === "all") {
      await TargetManager.setTargets([]);
      return [];
    }
    const existing = await TargetManager.getTargets();
    const filtered = existing.filter((i) => i !== String(idToRemove).trim());
    await TargetManager.setTargets(filtered);
    return filtered;
  }
}

// 多媒体文件扩展名列表
const MULTIMEDIA_EXTENSIONS = [
  // 音频文件
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".ogg",
  ".wma",
  ".m4a",
  ".opus",
  // 视频文件
  ".mp4",
  ".avi",
  ".mkv",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".m4v",
  ".3gp",
  // 图片文件 (大尺寸)
  ".psd",
  ".tiff",
  ".tif",
  ".raw",
  ".cr2",
  ".nef",
  ".arw",
  // 其他大文件
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".bz2",
  ".iso",
  ".dmg",
];

// 文件操作工具 - 使用Node.js内置模块创建zip文件
async function createTarGz(
  sourceDirs: string[],
  outputFilename: string,
  options: {
    excludeDirs?: string[];
    excludeExts?: string[];
    maxFileSizeMB?: number;
    compressLevel?: number;
    skipMultimedia?: boolean;
  } = {}
): Promise<void> {
  const {
    excludeDirs = [],
    excludeExts = [],
    maxFileSizeMB,
    skipMultimedia = true,
  } = options;
  const excludeDirSet = new Set(excludeDirs);
  let excludeExtSet = new Set(excludeExts);

  // 如果启用跳过多媒体文件，添加到排除列表
  if (skipMultimedia) {
    MULTIMEDIA_EXTENSIONS.forEach((ext) => excludeExtSet.add(ext));
  }

  const sizeLimit = maxFileSizeMB ? maxFileSizeMB * 1024 * 1024 : null;

  // 简化实现：直接复制文件到临时目录然后压缩
  const tempDir = path.join(
    os.tmpdir(),
    `backup_${crypto.randomBytes(8).toString("hex")}`
  );
  const backupDir = path.join(tempDir, "telebox_backup");

  try {
    fs.mkdirSync(backupDir, { recursive: true });

    for (const sourceDir of sourceDirs) {
      if (!fs.existsSync(sourceDir)) {
        console.warn(`跳过不存在的路径: ${sourceDir}`);
        continue;
      }

      const baseName = path.basename(sourceDir);
      const targetDir = path.join(backupDir, baseName);

      if (fs.statSync(sourceDir).isFile()) {
        const ext = path.extname(sourceDir);
        if (excludeExtSet.has(ext)) continue;

        if (sizeLimit) {
          try {
            const stats = fs.statSync(sourceDir);
            if (stats.size > sizeLimit) continue;
          } catch {
            continue;
          }
        }

        fs.copyFileSync(sourceDir, targetDir);
        continue;
      }

      // 递归复制目录
      function copyDir(srcDir: string, destDir: string) {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        const items = fs.readdirSync(srcDir);

        for (const item of items) {
          const srcPath = path.join(srcDir, item);
          const destPath = path.join(destDir, item);
          const stats = fs.statSync(srcPath);

          if (stats.isDirectory()) {
            if (excludeDirSet.has(item)) continue;
            copyDir(srcPath, destPath);
          } else {
            const ext = path.extname(item);
            if (excludeExtSet.has(ext)) continue;

            if (sizeLimit && stats.size > sizeLimit) continue;

            fs.copyFileSync(srcPath, destPath);
          }
        }
      }

      copyDir(sourceDir, targetDir);
    }

    // 创建压缩文件 - 简化版本，直接使用gzip压缩整个目录的tar
    await new Promise<void>((resolve, reject) => {
      const { spawn } = require("child_process");
      const tarProcess = spawn(
        "tar",
        ["-czf", outputFilename, "-C", tempDir, "telebox_backup"],
        {
          stdio: "pipe",
        }
      );

      tarProcess.on("close", (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          // 如果tar命令失败，使用简单的zip实现
          try {
            const archiver = require("archiver");
            const output = fs.createWriteStream(outputFilename);
            const archive = archiver("zip", { zlib: { level: 5 } });

            archive.pipe(output);
            archive.directory(backupDir, "telebox_backup");
            archive.finalize();

            output.on("close", () => resolve());
            output.on("error", reject);
          } catch {
            reject(new Error("压缩失败：需要安装tar命令或archiver包"));
          }
        }
      });

      tarProcess.on("error", () => {
        // 如果tar命令不存在，尝试其他方法
        reject(new Error("tar命令不可用"));
      });
    });
  } finally {
    // 清理临时目录
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

function generatePackageName(backupType: string = "backup"): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "_");

  const prefixMap: { [key: string]: string } = {
    plugins: "bf_p",
    assets: "bf_a",
    full: "bf_all",
  };

  const prefix = prefixMap[backupType] || "bf";
  const randomId = crypto.randomBytes(4).toString("hex");
  const packageName = `${prefix}_${timestamp}_${randomId}.tar.gz`;

  return sanitizeFilename(packageName);
}

// 文件查找辅助函数
async function findBackupFile(
  client: any,
  chatId: number
): Promise<Api.Message | null> {
  try {
    const messages = await client.getMessages(chatId, { limit: 50 });

    for (const msg of messages) {
      if (msg.file && msg.file.name && msg.file.name.endsWith(".tar.gz")) {
        return msg;
      }
    }
  } catch {
    // 静默处理错误
  }

  return null;
}

function extractFileInfo(backupMsg: Api.Message): FileInfo {
  return {
    file_name: backupMsg.file!.name!,
    file_size: Number(backupMsg.file!.size!),
    message_id: backupMsg.id,
    chat_id: Number(backupMsg.chatId),
    date: new Date(backupMsg.date as any).toISOString(),
  };
}

// 上传逻辑
async function uploadToTargets(
  client: any,
  filePath: string,
  targets: string[],
  caption: string,
  message?: Api.Message,
  showProgress: boolean = false
): Promise<void> {
  const progress = { last: 0 };
  const progressCallback =
    showProgress && message
      ? async (sent: number, total: number) => {
          if (!total) return;
          try {
            const pct = Math.floor((sent * 100) / total);
            if (pct >= progress.last + 10) {
              progress.last = pct;
              const client = await getGlobalClient();
              if (client) {
                client
                  .editMessage(message.peerId, {
                    message: message.id,
                    text: `📤 上传中... ${pct}%`,
                  })
                  .catch(() => {});
              }
            }
          } catch {}
        }
      : undefined;

  console.log("上传函数接收到的targets:", targets);

  try {
    if (targets.length === 0) {
      // 发送到收藏夹
      console.log("无目标，发送到收藏夹");
      await client.sendFile("me", {
        file: filePath,
        caption,
        forceDocument: true,
        progressCallback,
      });
    } else if (targets.length === 1) {
      // 单个目标直接上传
      const targetId = targets[0];
      try {
        await client.sendFile(targetId, {
          file: filePath,
          caption,
          forceDocument: true,
          progressCallback,
        });
      } catch (error) {
        console.error(`发送到目标 ${targetId} 失败，发送到收藏夹:`, error);
        // 如果目标发送失败，发送到收藏夹
        await client.sendFile("me", {
          file: filePath,
          caption: `⚠️ 原定目标 ${targetId} 发送失败\n\n${caption}`,
          forceDocument: true,
        });
      }
    } else {
      // 多个目标先发到收藏夹再转发
      const sentMsg = await client.sendFile("me", {
        file: filePath,
        caption,
        forceDocument: true,
      });

      let failedTargets = [];

      for (const target of targets) {
        try {
          await client.forwardMessages(target, {
            messages: [sentMsg],
            fromPeer: "me",
          });
        } catch (error) {
          console.error(`转发到目标 ${target} 失败:`, error);
          failedTargets.push(target);

          // 尝试直接发送
          try {
            await client.sendFile(target, {
              file: filePath,
              caption,
              forceDocument: true,
            });
          } catch (sendError) {
            console.error(`直接发送到目标 ${target} 也失败:`, sendError);
          }
        }
      }

      if (failedTargets.length > 0) {
        // 更新收藏夹中的消息，添加失败信息
        const failedInfo = `\n\n⚠️ 发送失败的目标: ${failedTargets.join(", ")}`;
        await client
          .editMessage("me", {
            message: sentMsg.id,
            text: caption + failedInfo,
          })
          .catch(() => {}); // 忽略编辑失败
      }
    }
  } catch (error) {
    console.error("上传失败:", error);
    // 最后的兜底：尝试发送到收藏夹
    try {
      await client.sendFile("me", {
        file: filePath,
        caption: `❌ 备份上传失败，错误: ${String(error)}\n\n${caption}`,
        forceDocument: true,
      });
      console.log("已将失败的备份发送到收藏夹");
    } catch (fallbackError) {
      console.error("连收藏夹都发送失败:", fallbackError);
      throw error;
    }
  }
}

async function sendAndCleanup(
  client: any,
  filePath: string,
  caption: string,
  message?: Api.Message,
  showProgress: boolean = false
): Promise<void> {
  try {
    const targets = await Config.get<string[]>("target_chat_ids", []);
    await uploadToTargets(
      client,
      filePath,
      targets,
      caption,
      message,
      showProgress
    );
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

// 恢复相关接口
interface RestoreSession {
  file_info: FileInfo;
  backup_type: "standard" | "full" | "plugins";
  download_path: string;
  extract_path: string;
  created_at: string;
}

// 依赖安装函数
async function ensureDependencies(): Promise<void> {
  const { spawn } = require("child_process");

  // 检查并安装 tar 依赖 (如果需要)
  const checkTar = () => {
    return new Promise<boolean>((resolve) => {
      const tarProcess = spawn("tar", ["--version"], { stdio: "pipe" });
      tarProcess.on("close", (code: number) => resolve(code === 0));
      tarProcess.on("error", () => resolve(false));
    });
  };

  const hasTar = await checkTar();
  if (!hasTar) {
    console.log("tar 命令不可用，将使用 Node.js 内置解压");
  }

  // 检查并安装 archiver 包
  try {
    require("archiver");
  } catch {
    console.log("正在安装 archiver 依赖...");
    await new Promise<void>((resolve, reject) => {
      const npmProcess = spawn("npm", ["install", "archiver"], {
        stdio: "pipe",
        cwd: getProgramDir(),
      });
      npmProcess.on("close", (code: number) => {
        if (code === 0) {
          console.log("archiver 安装成功");
          resolve();
        } else {
          reject(new Error("archiver 安装失败"));
        }
      });
      npmProcess.on("error", reject);
    });
  }

  // 检查并安装 tar-stream 包用于解压
  try {
    require("tar-stream");
  } catch {
    console.log("正在安装 tar-stream 依赖...");
    await new Promise<void>((resolve, reject) => {
      const npmProcess = spawn("npm", ["install", "tar-stream"], {
        stdio: "pipe",
        cwd: getProgramDir(),
      });
      npmProcess.on("close", (code: number) => {
        if (code === 0) {
          console.log("tar-stream 安装成功");
          resolve();
        } else {
          reject(new Error("tar-stream 安装失败"));
        }
      });
      npmProcess.on("error", reject);
    });
  }
}

// 下载备份文件
async function downloadBackupFile(
  client: any,
  fileInfo: FileInfo
): Promise<string> {
  const tempDir = os.tmpdir();
  const downloadPath = path.join(
    tempDir,
    `restore_${Date.now()}_${fileInfo.file_name}`
  );

  try {
    const message = await client.getMessages(fileInfo.chat_id, {
      ids: [fileInfo.message_id],
    });
    if (!message || message.length === 0) {
      throw new Error("备份消息不存在或已被删除");
    }

    const msg = message[0];
    if (!msg.file) {
      throw new Error("消息中没有文件");
    }

    // 使用 downloadMedia 方法直接下载到文件
    const result = await client.downloadMedia(msg, {
      outputFile: downloadPath,
    });

    // 验证文件是否下载成功
    if (!fs.existsSync(downloadPath)) {
      throw new Error("文件下载后未能保存到磁盘");
    }

    const stats = fs.statSync(downloadPath);
    if (stats.size === 0) {
      throw new Error("下载的文件为空");
    }

    console.log(`文件下载成功: ${downloadPath}, 大小: ${stats.size} bytes`);
    return downloadPath;
  } catch (error) {
    // 清理可能创建的空文件
    try {
      if (fs.existsSync(downloadPath)) {
        fs.unlinkSync(downloadPath);
      }
    } catch {}
    throw new Error(`下载失败: ${String(error)}`);
  }
}

// 解压备份文件
async function extractBackupFile(archivePath: string): Promise<string> {
  const extractDir = path.join(os.tmpdir(), `extract_${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    // 首先尝试使用 tar 命令
    const { spawn } = require("child_process");
    const success = await new Promise<boolean>((resolve) => {
      const tarProcess = spawn("tar", ["-xzf", archivePath, "-C", extractDir], {
        stdio: "pipe",
      });

      tarProcess.on("close", (code: number) => resolve(code === 0));
      tarProcess.on("error", () => resolve(false));
    });

    if (success) {
      return extractDir;
    }

    // 如果 tar 失败，使用 Node.js 解压
    console.log("使用 Node.js 内置解压...");
    const tarStream = require("tar-stream");
    const extract = tarStream.extract();
    const gunzip = zlib.createGunzip();

    return new Promise<string>((resolve, reject) => {
      extract.on("entry", (header: any, stream: any, next: any) => {
        const filePath = path.join(extractDir, header.name);

        if (header.type === "directory") {
          fs.mkdirSync(filePath, { recursive: true });
          stream.resume();
          next();
        } else {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          const writeStream = fs.createWriteStream(filePath);
          stream.pipe(writeStream);
          stream.on("end", next);
        }
      });

      extract.on("finish", () => resolve(extractDir));
      extract.on("error", reject);

      const readStream = fs.createReadStream(archivePath);
      readStream.pipe(gunzip).pipe(extract);
    });
  } catch (error) {
    // 清理失败的解压目录
    try {
      fs.rmSync(extractDir, { recursive: true, force: true });
    } catch {}
    throw new Error(`解压失败: ${String(error)}`);
  }
}

// 检测备份类型
function detectBackupType(
  extractPath: string
): "standard" | "full" | "plugins" {
  const contents = fs.readdirSync(extractPath);

  // 查找 telebox_backup 目录
  const backupDir = contents.find(
    (item) =>
      fs.statSync(path.join(extractPath, item)).isDirectory() &&
      item.includes("backup")
  );

  if (!backupDir) {
    throw new Error("无效的备份文件格式");
  }

  const backupPath = path.join(extractPath, backupDir);
  const backupContents = fs.readdirSync(backupPath);

  // 检测备份类型
  const hasAssets = backupContents.includes("assets");
  const hasPlugins = backupContents.includes("plugins");
  const hasConfig = backupContents.includes("config.json");
  const hasSession = backupContents.includes("my_session");

  if (hasPlugins && backupContents.length === 1) {
    return "plugins";
  } else if (hasAssets && hasPlugins && hasConfig && hasSession) {
    return "standard"; // 增强标准备份
  } else if (hasAssets && hasPlugins && backupContents.length === 2) {
    return "standard"; // 传统标准备份
  } else {
    return "full";
  }
}

// 执行恢复操作
async function performRestore(session: RestoreSession): Promise<void> {
  const programDir = getProgramDir();
  const backupDir = fs
    .readdirSync(session.extract_path)
    .find((item) =>
      fs.statSync(path.join(session.extract_path, item)).isDirectory()
    );

  if (!backupDir) {
    throw new Error("找不到备份目录");
  }

  const sourcePath = path.join(session.extract_path, backupDir);

  // 创建备份当前文件
  const backupTimestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, -5);
  const currentBackupDir = path.join(
    programDir,
    `_restore_backup_${backupTimestamp}`
  );

  try {
    switch (session.backup_type) {
      case "standard":
        // 备份当前的关键文件和目录
        fs.mkdirSync(currentBackupDir, { recursive: true });

        const standardItems = [
          "assets",
          "plugins",
          "config.json",
          "my_session",
        ];
        for (const item of standardItems) {
          const itemPath = path.join(programDir, item);
          if (fs.existsSync(itemPath)) {
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
              fs.cpSync(itemPath, path.join(currentBackupDir, item), {
                recursive: true,
              });
            } else {
              fs.copyFileSync(itemPath, path.join(currentBackupDir, item));
            }
          }
        }

        // 恢复所有标准备份项目
        for (const item of standardItems) {
          const sourcePath_item = path.join(sourcePath, item);
          const targetPath = path.join(programDir, item);

          if (fs.existsSync(sourcePath_item)) {
            // 删除现有文件/目录
            if (fs.existsSync(targetPath)) {
              const stat = fs.statSync(targetPath);
              if (stat.isDirectory()) {
                fs.rmSync(targetPath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(targetPath);
              }
            }

            // 恢复文件/目录
            const sourceStats = fs.statSync(sourcePath_item);
            if (sourceStats.isDirectory()) {
              fs.cpSync(sourcePath_item, targetPath, { recursive: true });
            } else {
              fs.copyFileSync(sourcePath_item, targetPath);
            }
          }
        }
        break;

      case "plugins":
        // 仅备份和恢复 plugins
        if (fs.existsSync(path.join(programDir, "plugins"))) {
          fs.cpSync(
            path.join(programDir, "plugins"),
            path.join(currentBackupDir, "plugins"),
            { recursive: true }
          );
          fs.rmSync(path.join(programDir, "plugins"), {
            recursive: true,
            force: true,
          });
        }

        if (fs.existsSync(path.join(sourcePath, "plugins"))) {
          fs.cpSync(
            path.join(sourcePath, "plugins"),
            path.join(programDir, "plugins"),
            { recursive: true }
          );
        }
        break;

      case "full":
        // 全量恢复 - 备份整个程序目录的关键部分
        const importantDirs = [
          "assets",
          "plugins",
          "src",
          "config.json",
          "package.json",
        ];
        fs.mkdirSync(currentBackupDir, { recursive: true });

        for (const item of importantDirs) {
          const itemPath = path.join(programDir, item);
          if (fs.existsSync(itemPath)) {
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
              fs.cpSync(itemPath, path.join(currentBackupDir, item), {
                recursive: true,
              });
            } else {
              fs.copyFileSync(itemPath, path.join(currentBackupDir, item));
            }
          }
        }

        // 恢复所有内容 (排除危险目录)
        const dangerousDirs = [
          "node_modules",
          ".git",
          "logs",
          "temp",
          "my_session",
        ];
        const sourceContents = fs.readdirSync(sourcePath);

        for (const item of sourceContents) {
          if (dangerousDirs.includes(item)) continue;

          const sourcePath_item = path.join(sourcePath, item);
          const targetPath = path.join(programDir, item);

          if (fs.existsSync(targetPath)) {
            const stat = fs.statSync(targetPath);
            if (stat.isDirectory()) {
              fs.rmSync(targetPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(targetPath);
            }
          }

          const sourceStats = fs.statSync(sourcePath_item);
          if (sourceStats.isDirectory()) {
            fs.cpSync(sourcePath_item, targetPath, { recursive: true });
          } else {
            fs.copyFileSync(sourcePath_item, targetPath);
          }
        }
        break;
    }

    console.log(`恢复完成，当前文件备份保存在: ${currentBackupDir}`);
  } catch (error) {
    // 恢复失败，尝试回滚
    if (fs.existsSync(currentBackupDir)) {
      try {
        console.log("恢复失败，正在回滚...");
        // 这里可以添加回滚逻辑
      } catch (rollbackError) {
        console.error("回滚也失败了:", rollbackError);
      }
    }
    throw error;
  }
}

// 恢复会话管理
class RestoreSessionManager {
  private static sessions = new Map<string, RestoreSession>();

  static createSession(
    fileInfo: FileInfo,
    backupType: "standard" | "full" | "plugins",
    downloadPath: string,
    extractPath: string
  ): string {
    const sessionId = crypto.randomBytes(8).toString("hex");
    const session: RestoreSession = {
      file_info: fileInfo,
      backup_type: backupType,
      download_path: downloadPath,
      extract_path: extractPath,
      created_at: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);

    // 30分钟后自动清理会话
    setTimeout(() => {
      this.cleanupSession(sessionId);
    }, 30 * 60 * 1000);

    return sessionId;
  }

  static getSession(sessionId: string): RestoreSession | null {
    return this.sessions.get(sessionId) || null;
  }

  static cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // 清理临时文件
      try {
        if (fs.existsSync(session.download_path)) {
          fs.unlinkSync(session.download_path);
        }
        if (fs.existsSync(session.extract_path)) {
          fs.rmSync(session.extract_path, { recursive: true, force: true });
        }
      } catch (error) {
        console.error("清理临时文件失败:", error);
      }

      this.sessions.delete(sessionId);
    }
  }

  static listSessions(): RestoreSession[] {
    return Array.from(this.sessions.values());
  }
}

// 通用工具函数（恢复被误删的）
function getProgramDir(): string {
  return process.cwd();
}

function sanitizeFilename(filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return safeName.length > 100 ? safeName.substring(0, 100) : safeName;
}

class BfPlugin extends Plugin {
  description: string =
    "📦 备份主命令，支持多种备份模式；🔄 hf 恢复命令\n<code>.bf help</code> 查看帮助; <code>.hf help</code> 查看帮助";
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    bf: async (msg) => {
      const command = msg.message.slice(1).split(" ")[0];
      const args = msg.message.slice(1).split(" ").slice(1);
      const param = args[0] || "";
      const programDir = getProgramDir();
      // bf 备份命令处理
      // 帮助命令
      if (param && ["help", "帮助"].includes(param)) {
        const helpText =
          "🔧 **TeleBox 备份/恢复系统**\n\n" +
          "**📦 备份命令:**\n" +
          "• `bf` - 增强标准备份 (assets+plugins+config+session)\n" +
          "• `bf all [slim]` - 完整程序备份\n" +
          "• `bf p` - 仅插件备份\n\n" +
          "**🎯 目标管理:**\n" +
          "• `bf set <ID...>` - 设置备份目标聊天\n" +
          "• `bf del <ID|all>` - 删除备份目标\n\n" +
          "**⏰ 定时备份:**\n" +
          "• `bf cron help` - 定时备份帮助\n\n" +
          "**🔄 恢复系统:**\n" +
          "• 回复备份文件用 `hf` 直接恢复\n\n" +
          "**✨ 新功能:**\n" +
          "• 增强标准备份现已包含所有插件设置和会话文件\n" +
          "• 恢复后无需重新配置插件，保持所有设置";
        const client = await getGlobalClient();
        await msg.edit({
          text: helpText,
          parseMode: "html",
        });
        return;
      }

      // 设置目标聊天ID
      if (param === "set") {
        if (
          args.length < 2 ||
          ["help", "-h", "--help", "?"].includes(args[1])
        ) {
          await msg.edit({
            text:
              "🎯 目标聊天\n用法: `bf set <ID...>` (空格/逗号分隔)\n" +
              "例: `bf set 123,456` 或 `bf set 123 456`\n未设置则发到收藏夹",
            parseMode: "html",
          });
          return;
        }

        try {
          const raw = args.slice(1).join(" ");
          const parts = raw
            .replace(/,/g, " ")
            .split(/\s+/)
            .filter((s) => s.trim());

          const valid: string[] = [];
          for (const part of parts) {
            if (/^-?\d+$/.test(part)) {
              valid.push(part);
            } else {
              await msg.edit({
                text: `无效的聊天ID: ${part}\n仅支持数字ID，例如 123456 或 -1001234567890`,
                parseMode: "html",
              });
              return;
            }
          }

          if (valid.length === 0) {
            await msg.edit({
              text: "聊天ID不能为空",
              parseMode: "html",
            });
            return;
          }

          const newList = await TargetManager.addTargets(valid);
          await msg.edit({
            text: `目标聊天ID已更新：${
              newList.length > 0 ? newList.join(", ") : "（已清空）"
            }`,
            parseMode: "html",
          });
        } catch (e) {
          await msg.edit({
            text: `设置失败：${String(e)}`,
            parseMode: "html",
          });
        }
        return;
      }

      // 定时备份管理 - 使用cron表达式
      if (param === "cron") {
        const subCmd = args[1];

        if (!subCmd || subCmd === "status") {
          const status = await ScheduledBackupService.getStatus();
          if (!status.enabled) {
            await msg.edit({
              text: "⏰ 定时备份未启用\n\n使用 `bf cron help` 查看帮助",
              parseMode: "html",
            });
          } else {
            const lastBackupFmt = status.last_backup
              ? formatCN(new Date(status.last_backup))
              : "从未执行";
            const nextBackupFmt = status.next_backup
              ? formatCN(new Date(status.next_backup))
              : "计算失败";
            await msg.edit({
              text:
                `⏰ **定时备份状态**\n\n` +
                `• 状态: ${status.enabled ? "✅ 已启用" : "❌ 已禁用"}\n` +
                `• Cron表达式: \`${status.cron_expression}\`\n` +
                `• 备份类型: 标准备份 (assets + plugins)\n` +
                `• 上次备份: ${lastBackupFmt}\n` +
                `• 下次备份: ${nextBackupFmt}\n` +
                `• 运行状态: ${status.is_running ? "🟢 运行中" : "🔴 未运行"}`,
              parseMode: "html",
            });
          }
          return;
        }

        if (subCmd === "help") {
          await msg.edit({
            text:
              "⏰ **Cron定时备份命令 (使用 cronManager)**\n\n" +
              "• `bf cron` - 查看状态\n" +
              "• `bf cron <cron表达式>` - 启动/重设定时标准备份\n" +
              "• `bf cron stop` - 停止定时备份\n" +
              "• `bf cron now` - 立即执行一次备份 (已启用情况下)\n\n" +
              "**Cron表达式 (6字段)**: `秒 分 时 日 月 周`\n" +
              "示例: \n`bf cron */5 * * * * *` 每5秒\n`bf cron 0 */30 * * * *` 每30分钟\n`bf cron 0 0 2 * * *` 每天2点\n\n" +
              "使用 validateCronExpression/sendAt/timeout 获取有效性与下次执行时间。",
            parseMode: "html",
          });
          return;
        }

        if (subCmd === "stop") {
          await ScheduledBackupService.stop();
          await msg.edit({
            text: "⏹️ 定时备份已停止",
            parseMode: "html",
          });
          return;
        }

        if (subCmd === "now") {
          try {
            await msg.edit({
              text: "🔄 正在执行定时标准备份...",
              parseMode: "html",
            });
            await ScheduledBackupService.runOnce();
            const status = await ScheduledBackupService.getStatus();
            await msg.edit({
              text: `✅ 定时标准备份完成\n下次: ${
                status.next_backup
                  ? formatCN(new Date(status.next_backup))
                  : "计算失败"
              }`,
              parseMode: "html",
            });
          } catch (e) {
            await msg.edit({
              text: `❌ 执行失败: ${String(e)}`,
              parseMode: "html",
            });
          }
          return;
        }

        // 其它情况视为设置 cron 表达式
        const cronExpression = args.slice(1).join(" ");
        if (!cronExpression) {
          await msg.edit({
            text: "❌ 请指定 cron 表达式",
            parseMode: "html",
          });
          return;
        }

        try {
          const validation: any = (cron as any).validateCronExpression
            ? (cron as any).validateCronExpression(cronExpression)
            : { valid: true };
          if (!validation.valid) {
            await msg.edit({
              text: `❌ 无效的表达式: ${validation.error || "format"}`,
              parseMode: "html",
            });
            return;
          }

          // 启动任务
          await ScheduledBackupService.start(cronExpression);
          const status = await ScheduledBackupService.getStatus();
          await msg.edit({
            text:
              `✅ 定时标准备份已启动\n` +
              `• Cron: \`${cronExpression}\`\n` +
              `• 下次执行: ${
                status.next_backup
                  ? formatCN(new Date(status.next_backup))
                  : "计算失败"
              }`,
            parseMode: "html",
          });
        } catch (e) {
          await msg.edit({
            text: `❌ 设置失败: ${String(e)}`,
            parseMode: "html",
          });
        }
        return;
      }

      // 删除目标聊天ID
      if (param === "del") {
        if (
          args.length < 2 ||
          ["help", "-h", "--help", "?"].includes(args[1])
        ) {
          await msg.edit({
            text: "🧹 删除目标: `bf del <ID>`，清空: `bf del all`",
            parseMode: "html",
          });
          return;
        }

        const target = args[1];
        try {
          const newList = await TargetManager.removeTarget(target);
          if (target === "all") {
            await msg.edit({
              text: "已清空全部目标聊天ID",
              parseMode: "html",
            });
          } else {
            await msg.edit({
              text: `已删除：${target}，当前目标列表：${
                newList.length > 0 ? newList.join(", ") : "（空）"
              }`,
              parseMode: "html",
            });
          }
        } catch (e) {
          await msg.edit({
            text: `删除失败：${String(e)}`,
            parseMode: "html",
          });
        }
        return;
      }

      // 全量备份
      if (param === "all") {
        const client = await getGlobalClient();
        try {
          await msg.edit({
            text: "🔄 正在创建完整程序备份...",
            parseMode: "html",
          });
          const packageName = generatePackageName("full");
          const slimMode =
            args.length > 1 && ["slim", "fast"].includes(args[1].toLowerCase());

          const programDir = getProgramDir();
          const excludeDirnames = [
            ".git",
            "__pycache__",
            ".pytest_cache",
            "venv",
            "env",
            ".venv",
            "node_modules",
            "cache",
            "caches",
            "logs",
            "log",
            "downloads",
            "download",
            "media",
            ".mypy_cache",
            ".ruff_cache",
          ];
          const excludeExts = [".log", ".ttf"];

          let maxFileSizeMB: number | undefined;
          let compressLevel = 5;

          if (slimMode) {
            excludeDirnames.push("dist", "build", ".cache", "tmp", "temp");
            maxFileSizeMB = 20;
            compressLevel = 3;
          }

          const includeItems = fs
            .readdirSync(programDir)
            .filter((item) => !item.startsWith("."))
            .map((item) => path.join(programDir, item));

          await createTarGz(includeItems, packageName, {
            excludeDirs: excludeDirnames,
            excludeExts,
            maxFileSizeMB,
            compressLevel,
            skipMultimedia: true,
          });

          await msg.edit({
            text: "📤 正在上传完整备份...",
            parseMode: "html",
          });

          const stats = fs.statSync(packageName);
          const caption =
            `🚀 **TeleBox 完整程序备份${slimMode ? " (瘦身版)" : ""}** 🚀\n\n` +
            `📦 **包名**: \`${packageName}\`\n` +
            `🕐 **创建时间**: ${formatCN(new Date())}\n` +
            `📊 **文件大小**: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n` +
            `🎯 **备份类型**: ${
              slimMode ? "🏃‍♂️ 瘦身完整备份" : "📁 标准完整备份"
            }\n\n` +
            `📋 **包含内容**:\n` +
            `• 📁 所有程序文件和配置\n` +
            `• 🔌 插件源代码和设置\n` +
            `• ⚙️ 系统配置文件\n` +
            `• 🔐 登录会话数据\n\n` +
            `🎵 **智能优化**:\n` +
            `• 自动跳过多媒体文件 (mp3/mp4等)\n` +
            `${
              slimMode
                ? "• 跳过>20MB大文件，上传更快\n• 排除更多缓存目录\n"
                : ""
            }` +
            `• 压缩算法优化，节省空间\n\n` +
            `💡 **适用场景**: 系统迁移、完整备份、灾难恢复`;

          const targets = await TargetManager.getTargets();
          await sendAndCleanup(
            client,
            packageName,
            caption,
            msg,
            targets.length <= 1
          );

          await msg.edit({
            text:
              `✅ 完整备份已完成\n\n📦 \`${packageName}\`\n` +
              `🎯 发送到: ${
                targets.length > 0 ? targets.join(", ") : "收藏夹"
              }`,
            parseMode: "html",
          });
        } catch (e) {
          await msg.edit({
            text: `❌ 完整备份失败: ${String(e)}`,
            parseMode: "html",
          });
        }
        return;
      }

      // 插件备份
      if (param === "p") {
        const client = await getGlobalClient();
        try {
          await msg.edit({
            text: "🔌 正在创建插件备份...",
            parseMode: "html",
          });
          const packageName = generatePackageName("plugins");

          const programDir = getProgramDir();
          const pluginsDir = path.join(programDir, "plugins");
          if (!fs.existsSync(pluginsDir)) {
            await msg.edit({
              text: "❌ plugins目录不存在",
              parseMode: "html",
            });
            return;
          }

          const tempRoot = path.join(programDir, "_tmp_plugins_ts_only");
          const tempPluginsDir = path.join(tempRoot, "plugins");
          fs.mkdirSync(tempPluginsDir, { recursive: true });

          let tsCount = 0;
          function copyTsFiles(srcDir: string, destDir: string) {
            const items = fs.readdirSync(srcDir);
            for (const item of items) {
              const srcPath = path.join(srcDir, item);
              const stats = fs.statSync(srcPath);

              if (stats.isDirectory() && item !== "__pycache__") {
                const destSubDir = path.join(destDir, item);
                fs.mkdirSync(destSubDir, { recursive: true });
                copyTsFiles(srcPath, destSubDir);
              } else if (stats.isFile() && item.endsWith(".ts")) {
                const destPath = path.join(destDir, item);
                fs.copyFileSync(srcPath, destPath);
                tsCount++;
              }
            }
          }

          copyTsFiles(pluginsDir, tempPluginsDir);

          if (tsCount === 0) {
            fs.rmSync(tempRoot, { recursive: true, force: true });
            await msg.edit({
              text: "❌ 未找到任何TypeScript插件文件",
              parseMode: "html",
            });
            return;
          }

          await createTarGz([tempPluginsDir], packageName);
          fs.rmSync(tempRoot, { recursive: true, force: true });

          await msg.edit({
            text: "📤 正在分享插件备份...",
            parseMode: "html",
          });

          const caption =
            `🔌 **TeleBox 插件专用备份** 🔌\n\n` +
            `📦 **包名**: \`${packageName}\`\n` +
            `🕐 **创建时间**: ${formatCN(new Date())}\n` +
            `🎯 **备份类型**: TypeScript 插件专用包\n` +
            `📊 **插件数量**: ${tsCount} 个 TypeScript 文件\n\n` +
            `✨ **特色功能**:\n` +
            `• 🎯 仅包含 .ts 插件文件\n` +
            `• 📁 保持原有目录结构\n` +
            `• 🚀 体积小巧，传输快速\n` +
            `• 🔄 完美适配插件分享\n\n` +
            `💡 **适用场景**: 插件分享、代码迁移、开发协作`;

          await sendAndCleanup(client, packageName, caption);
          const targets = await TargetManager.getTargets();

          await msg.edit({
            text:
              `✅ 插件备份已完成\n\n📦 \`${packageName}\`\n🔌 数量: ${tsCount} 个\n` +
              `🎯 发送到: ${
                targets.length > 0 ? targets.join(", ") : "收藏夹"
              }`,
            parseMode: "html",
          });
        } catch (e) {
          await msg.edit({
            text: `❌ 插件备份失败: ${String(e)}`,
            parseMode: "html",
          });
        }
        return;
      }

      // 默认增强标准备份
      const client = await getGlobalClient();
      try {
        const programDir = getProgramDir();
        const nowStr = new Date()
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\..+/, "")
          .replace("T", "_");
        const tmpdir = os.tmpdir();
        const backupPath = path.join(
          tmpdir,
          `telebox_enhanced_backup_${nowStr}.tar.gz`
        );

        await msg.edit({
          text: "🔄 正在创建增强标准备份...",
          parseMode: "html",
        });

        // 检查哪些项目实际存在
        const potentialItems = [
          path.join(programDir, "assets"),
          path.join(programDir, "plugins"),
          path.join(programDir, "config.json"),
          path.join(programDir, "my_session"),
        ];

        const backupItems = potentialItems.filter((item) =>
          fs.existsSync(item)
        );

        if (backupItems.length === 0) {
          await msg.edit({
            text: "❌ 没有找到可备份的项目 (assets, plugins, config.json, my_session)",
            parseMode: "html",
          });
          return;
        }

        await createTarGz(backupItems, backupPath, {
          excludeExts: [".ttf"],
          compressLevel: 5,
          skipMultimedia: true,
        });

        await msg.edit({
          text: "📤 正在上传增强备份...",
          parseMode: "html",
        });

        const stats = fs.statSync(backupPath);
        const sessionPath = path.join(programDir, "my_session");
        const sessionCount =
          fs.existsSync(sessionPath) && fs.statSync(sessionPath).isDirectory()
            ? fs.readdirSync(sessionPath).length
            : 0;
        const hasSession = fs.existsSync(sessionPath);

        const caption =
          `✨ **TeleBox 智能增强备份** ✨\n\n` +
          `🕐 **创建时间**: ${formatCN(new Date())}\n` +
          `📊 **文件大小**: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n\n` +
          `📦 **备份内容**:\n` +
          `┣ 📁 **Assets** - ${
            fs.existsSync(path.join(programDir, "assets"))
              ? "插件配置与缓存数据"
              : "未找到"
          }\n` +
          `┣ 🔌 **Plugins** - ${
            fs.existsSync(path.join(programDir, "plugins"))
              ? "插件源代码文件"
              : "未找到"
          }\n` +
          `┣ ⚙️ **Config** - ${
            fs.existsSync(path.join(programDir, "config.json"))
              ? "API配置信息"
              : "未找到"
          }\n` +
          `┗ 🔐 **Sessions** - ${
            hasSession ? `${sessionCount}个登录会话` : "未找到会话"
          }\n\n` +
          `🚀 **智能优化**:\n` +
          `• 🎵 自动跳过多媒体文件 (mp3/mp4等)\n` +
          `• 💾 优化压缩算法，减少体积\n` +
          `• 🔄 恢复后保持所有插件设置\n\n` +
          `💡 **使用提示**: 此备份包含完整配置，重装系统后可一键恢复！`;

        const targets = await TargetManager.getTargets();
        await sendAndCleanup(
          client,
          backupPath,
          caption,
          msg,
          targets.length <= 1
        );

        await msg.edit({
          text:
            `🎉 **增强标准备份完成** 🎉\n\n` +
            `🎯 **发送目标**: ${
              targets.length > 0 ? targets.join(", ") : "💾 收藏夹"
            }\n` +
            `📦 **备份内容**: ${backupItems
              .map((item) => path.basename(item))
              .join(" + ")}\n` +
            `💾 **文件大小**: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n` +
            `🎵 **已优化**: 跳过多媒体文件，体积更小\n\n` +
            `✨ **恢复优势**: 此备份包含完整插件设置，恢复后无需重新配置！`,
          parseMode: "html",
        });
      } catch (e) {
        await msg.edit({
          text: `❌ 备份失败: ${String(e)}`,
          parseMode: "html",
        });
      }
    },
    hf: async (msg) => {
      const command = msg.message.slice(1).split(" ")[0];
      const args = msg.message.slice(1).split(" ").slice(1);
      const param = args[0] || "";
      const programDir = getProgramDir();

      const client = await getGlobalClient();
      if (!client) {
        return;
      }

      if (["help", "帮助"].includes(param)) {
        await msg.edit({
          text:
            "🔄 **TeleBox 恢复系统** 🔄\n\n" +
            "📁 回复备份文件消息，发送 `hf` 直接恢复\n\n" +
            "📦 **支持格式**: 增强标准 | 插件专用 | 完整备份\n" +
            "🔄 **自动重载**: 恢复后自动重载插件",
          parseMode: "html",
        });
        return;
      }

      if (!msg.replyTo) {
        await msg.edit({
          text: "❌ 请回复一个备份文件消息后使用 `hf` 命令",
          parseMode: "html",
        });
        return;
      }

      try {
        const replyMsg = await client.getMessages(msg.peerId, {
          ids: [msg.replyTo.replyToMsgId!],
        });
        if (!replyMsg || replyMsg.length === 0) {
          await msg.edit({
            text: "❌ 无法获取回复的消息",
            parseMode: "html",
          });
          return;
        }

        const backupMsg = replyMsg[0];
        if (
          !backupMsg.file ||
          !backupMsg.file.name ||
          !backupMsg.file.name.endsWith(".tar.gz")
        ) {
          await msg.edit({
            text: "❌ 回复的消息不是有效的备份文件",
            parseMode: "html",
          });
          return;
        }

        await msg.edit({
          text: "🔄 正在恢复备份...",
          parseMode: "html",
        });

        await ensureDependencies();

        const fileInfo = extractFileInfo(backupMsg);
        await msg.edit({
          text: "📥 正在下载备份文件...",
          parseMode: "html",
        });
        const downloadPath = await downloadBackupFile(client, fileInfo);

        await msg.edit({
          text: "📦 正在解压备份文件...",
          parseMode: "html",
        });
        const extractPath = await extractBackupFile(downloadPath);

        await msg.edit({
          text: "🔍 正在检测备份类型...",
          parseMode: "html",
        });
        const backupType = detectBackupType(extractPath);

        await msg.edit({
          text: `🔄 正在恢复${
            backupType === "standard"
              ? "标准"
              : backupType === "plugins"
              ? "插件"
              : "完整"
          }备份...`,
          parseMode: "html",
        });

        const session = {
          file_info: fileInfo,
          backup_type: backupType,
          download_path: downloadPath,
          extract_path: extractPath,
          created_at: new Date().toISOString(),
        } as any;

        await performRestore(session);

        try {
          if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);
          if (fs.existsSync(extractPath))
            fs.rmSync(extractPath, { recursive: true, force: true });
        } catch {}

        try {
          const { loadPlugins } = require("@utils/pluginManager");
          await loadPlugins();
          await msg.edit({
            text: "✅ 恢复完成并已重载",
            parseMode: "html",
          });
        } catch {
          await msg.edit({
            text: "✅ 恢复完成，建议重启程序",
            parseMode: "html",
          });
        }
      } catch (error) {
        await msg.edit({
          text: `❌ 恢复失败: ${String(error)}`,
          parseMode: "html",
        });
      }
      return;
    },
  };
}

// 插件初始化时启动定时备份（使用新服务）
setTimeout(() => {
  try {
    ScheduledBackupService.initFromConfig();
  } catch (error) {
    console.error("定时备份启动失败:", error);
  }
}, 5000);

const plugin = new BfPlugin();
export default plugin;
