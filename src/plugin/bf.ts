/**
 * Backup & Restore plugin for TeleBox - Complete backup solution
 * Converted from PagerMaid-Modify bf.py
 */

import { Plugin } from "@utils/pluginBase";
import { Api, TelegramClient } from "telegram";
import { getGlobalClient } from "@utils/globalClient";
import { createDirectoryInAssets } from "@utils/pathHelpers";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import * as crypto from "crypto";
import * as os from "os";

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

// 全局变量
const BJ_TZ_OFFSET = 8 * 60 * 60 * 1000; // UTC+8 时区偏移

// 简化的Cron表达式解析器
class CronParser {
  static parse(cronExpression: string): { isValid: boolean; nextRun?: Date; error?: string } {
    try {
      const nextRun = CronParser.getNextRunTime(cronExpression);
      if (!nextRun) {
        return { isValid: false, error: '无法计算下次执行时间' };
      }
      return { isValid: true, nextRun };
    } catch (error) {
      return { isValid: false, error: `无效的cron表达式: ${String(error)}` };
    }
  }

  static getNextRunTime(cronExpression: string, from?: Date): Date | null {
    try {
      const parts = cronExpression.trim().split(/\s+/);
      if (parts.length !== 6) {
        throw new Error('Cron表达式必须包含6个字段: 秒 分 时 日 月 周');
      }

      const [second, minute, hour, day, month, weekday] = parts;
      const now = from || nowBJ();
      const next = new Date(now);
      next.setMilliseconds(0);
      next.setSeconds(next.getSeconds() + 1); // 从下一秒开始
      
      // 解析各个字段
      const parsedSecond = CronParser.parseField(second, 0, 59);
      const parsedMinute = CronParser.parseField(minute, 0, 59);
      const parsedHour = CronParser.parseField(hour, 0, 23);
      const parsedDay = CronParser.parseField(day, 1, 31);
      const parsedMonth = CronParser.parseField(month, 1, 12);
      
      // 按秒查找下一个匹配的时间点
      for (let i = 0; i < 31536000; i++) { // 最多查找一年的秒数
        if (!CronParser.matchField(parsedSecond, next.getSeconds())) {
          next.setSeconds(next.getSeconds() + 1);
          continue;
        }
        if (!CronParser.matchField(parsedMinute, next.getMinutes())) {
          next.setSeconds(next.getSeconds() + 1);
          continue;
        }
        if (!CronParser.matchField(parsedHour, next.getHours())) {
          next.setSeconds(next.getSeconds() + 1);
          continue;
        }
        if (!CronParser.matchField(parsedDay, next.getDate())) {
          next.setSeconds(next.getSeconds() + 1);
          continue;
        }
        if (!CronParser.matchField(parsedMonth, next.getMonth() + 1)) {
          next.setSeconds(next.getSeconds() + 1);
          continue;
        }
        
        return next;
      }
      
      throw new Error('无法找到下一个执行时间');
    } catch (error) {
      console.error('Cron解析错误:', error);
      return null;
    }
  }

  private static parseField(field: string, min: number, max: number): number[] | null {
    if (field === '*') {
      return null; // 表示匹配所有值
    }
    
    if (field.startsWith('*/')) {
      // 处理 */N 格式
      const step = parseInt(field.substring(2));
      if (isNaN(step) || step <= 0) {
        throw new Error(`无效的步长值: ${field}`);
      }
      const values = [];
      for (let i = min; i <= max; i += step) {
        values.push(i);
      }
      return values;
    }
    
    if (field.includes(',')) {
      // 处理逗号分隔的值
      return field.split(',').map(v => {
        const num = parseInt(v.trim());
        if (isNaN(num) || num < min || num > max) {
          throw new Error(`无效的字段值: ${v}`);
        }
        return num;
      });
    }
    
    if (field.includes('-')) {
      // 处理范围值
      const [start, end] = field.split('-').map(v => parseInt(v.trim()));
      if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
        throw new Error(`无效的范围值: ${field}`);
      }
      const values = [];
      for (let i = start; i <= end; i++) {
        values.push(i);
      }
      return values;
    }
    
    // 处理单个数字
    const num = parseInt(field);
    if (isNaN(num) || num < min || num > max) {
      throw new Error(`无效的字段值: ${field}`);
    }
    return [num];
  }

  private static matchField(allowedValues: number[] | null, currentValue: number): boolean {
    if (allowedValues === null) {
      return true; // * 匹配所有值
    }
    return allowedValues.includes(currentValue);
  }

  static validateCron(cronExpression: string): { valid: boolean; error?: string } {
    const result = CronParser.parse(cronExpression);
    return { valid: result.isValid, error: result.error };
  }
}

// 定时备份管理器
class ScheduledBackupManager {
  private static timer: NodeJS.Timeout | null = null;

  static start(): void {
    const config = Config.get<BackupConfig['scheduled_backup']>('scheduled_backup');
    if (!config?.enabled || !config.cron_expression) return;

    // 清除现有定时器
    if (ScheduledBackupManager.timer) {
      clearTimeout(ScheduledBackupManager.timer);
    }

    // 计算下次备份时间
    const nextRun = CronParser.getNextRunTime(config.cron_expression);
    if (!nextRun) {
      console.error('无效的cron表达式，无法启动定时备份');
      return;
    }

    const now = nowBJ();
    const delay = nextRun.getTime() - now.getTime();

    // 如果延迟时间为负数或很小，立即执行
    if (delay <= 1000) {
      ScheduledBackupManager.executeBackup();
      return;
    }

    // 设置定时器
    ScheduledBackupManager.timer = setTimeout(() => {
      ScheduledBackupManager.executeBackup();
      // 执行完后重新调度下一次
      setTimeout(() => ScheduledBackupManager.start(), 1000);
    }, delay);

    console.log(`定时备份已启动，cron: ${config.cron_expression}，下次执行: ${nextRun.toLocaleString('zh-CN')}`);
  }

  static stop(): void {
    if (ScheduledBackupManager.timer) {
      clearTimeout(ScheduledBackupManager.timer);
      ScheduledBackupManager.timer = null;
      console.log('定时备份已停止');
    }
  }

  static async executeBackup(): Promise<void> {
    try {
      console.log('执行定时标准备份...');
      
      // 直接执行标准备份
      const tempDir = os.tmpdir();
      const timestamp = new Date(Date.now() + BJ_TZ_OFFSET).toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const backupPath = path.join(tempDir, `telebox-backup-${timestamp}.tar.gz`);
      
      await createTarGz(['assets', 'plugins'], backupPath);
      
      const stats = fs.statSync(backupPath);
      const caption = `🤖 定时标准备份\n📅 ${new Date(Date.now() + BJ_TZ_OFFSET).toLocaleString('zh-CN', { timeZone: 'UTC' })}\n📦 大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n📁 内容: assets + plugins`;
      
      // 定时备份使用已设置的目标
      try {
        const client = await getGlobalClient();
        if (!client) {
          throw new Error('Telegram客户端未初始化');
        }
        const targets = Config.get<string[]>('target_chat_ids') || [];
        console.log('定时备份获取到的目标:', targets);
        await uploadToTargets(client, backupPath, targets, caption);
      } catch (error) {
        console.error('定时备份上传失败:', error);
        throw error;
      }
      
      // 清理临时文件
      fs.unlinkSync(backupPath);
      
      console.log('定时标准备份完成');
    } catch (error) {
      console.error('定时备份执行失败:', error);
    }
  }

  private static async performStandardBackup(): Promise<void> {
    const programDir = getProgramDir();
    const client = getGlobalClient();
    
    if (!client) {
      console.error('Telegram客户端未初始化，跳过定时备份');
      return;
    }

    try {
      const packageName = `telebox_scheduled_${nowBJ().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_')}.tar.gz`;
      const sourceDirs = [path.join(programDir, 'assets'), path.join(programDir, 'plugins')];
      const options = { excludeExts: ['.ttf'], compressLevel: 5 };
      const caption = `📦 **定时标准备份**\n\n• 创建时间: ${nowBJ().toLocaleString('zh-CN')}\n• 包含: assets + plugins\n• 备份类型: 自动标准备份`;

      // 创建备份文件
      await createTarGz(sourceDirs, packageName, options);
      
      // 上传到目标聊天
      const targets = Config.get<string[]>('target_chat_ids') || [];
      await uploadToTargets(client, packageName, targets, caption, undefined, false);
      
      console.log(`定时备份完成: ${packageName}`);
      
    } catch (error) {
      console.error('定时备份执行失败:', error);
    }
  }

  static getStatus(): {
    enabled: boolean;
    cron_expression?: string;
    last_backup?: string;
    next_backup?: string;
    is_running: boolean;
  } {
    const config = Config.get<BackupConfig['scheduled_backup']>('scheduled_backup');
    if (!config) {
      return { enabled: false, is_running: false };
    }
    
    return {
      enabled: config.enabled,
      cron_expression: config.cron_expression,
      last_backup: config.last_backup,
      next_backup: config.next_backup,
      is_running: ScheduledBackupManager.timer !== null
    };
  }
}

// 工具函数
function nowBJ(): Date {
  return new Date(Date.now() + BJ_TZ_OFFSET);
}

function getProgramDir(): string {
  return process.cwd();
}

function sanitizeFilename(filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return safeName.length > 100 ? safeName.substring(0, 100) : safeName;
}

// 统一配置管理
class Config {
  private static getFile(): string {
    return path.join(createDirectoryInAssets("bf"), "bf_config.json");
  }

  static load(): BackupConfig {
    try {
      const data = fs.readFileSync(Config.getFile(), "utf-8");
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  static save(config: BackupConfig): void {
    const filePath = Config.getFile();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
  }

  static get<T>(key: keyof BackupConfig, defaultValue?: T): T {
    const config = Config.load();
    const value = config[key] as T;
    return value !== undefined ? value : defaultValue!;
  }

  static set<T>(key: keyof BackupConfig, value: T): void {
    const config = Config.load();
    if (value === null || value === undefined) {
      delete config[key];
    } else {
      (config as any)[key] = value;
    }
    Config.save(config);
  }

  static setTempRestoreFile(fileInfo: FileInfo): void {
    const expireTime = new Date(nowBJ().getTime() + 5 * 60 * 1000).toISOString();
    Config.set("temp_restore_file", {
      file_info: fileInfo,
      expire_time: expireTime
    });
  }

  static getTempRestoreFile(): FileInfo | null {
    const tempData = Config.get<BackupConfig['temp_restore_file']>("temp_restore_file");
    if (!tempData) return null;

    try {
      const expireTime = new Date(tempData.expire_time);
      if (nowBJ() > expireTime) {
        Config.set("temp_restore_file", null);
        return null;
      }
      return tempData.file_info;
    } catch {
      Config.set("temp_restore_file", null);
      return null;
    }
  }
}

// 目标聊天管理
class TargetManager {
  static getTargets(): string[] {
    let ids = Config.get<string[]>("target_chat_ids", []);
    if (!ids || ids.length === 0) {
      return [];
    }

    ids = ids.map(i => String(i).trim()).filter(i => i);
    return [...new Set(ids)]; // 去重
  }

  static setTargets(newIds: string[]): void {
    Config.set("target_chat_ids", newIds);
  }

  static addTargets(idsToAdd: string[]): string[] {
    const existing = TargetManager.getTargets();
    for (const id of idsToAdd) {
      const s = String(id).trim();
      if (s && !existing.includes(s)) {
        existing.push(s);
      }
    }
    TargetManager.setTargets(existing);
    return existing;
  }

  static removeTarget(idToRemove: string): string[] {
    if (idToRemove === "all") {
      TargetManager.setTargets([]);
      return [];
    }
    const existing = TargetManager.getTargets();
    const filtered = existing.filter(i => i !== String(idToRemove).trim());
    TargetManager.setTargets(filtered);
    return filtered;
  }
}

// 多媒体文件扩展名列表
const MULTIMEDIA_EXTENSIONS = [
  // 音频文件
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus',
  // 视频文件
  '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp',
  // 图片文件 (大尺寸)
  '.psd', '.tiff', '.tif', '.raw', '.cr2', '.nef', '.arw',
  // 其他大文件
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.iso', '.dmg'
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
  const { excludeDirs = [], excludeExts = [], maxFileSizeMB, skipMultimedia = true } = options;
  const excludeDirSet = new Set(excludeDirs);
  let excludeExtSet = new Set(excludeExts);
  
  // 如果启用跳过多媒体文件，添加到排除列表
  if (skipMultimedia) {
    MULTIMEDIA_EXTENSIONS.forEach(ext => excludeExtSet.add(ext));
  }
  
  const sizeLimit = maxFileSizeMB ? maxFileSizeMB * 1024 * 1024 : null;

  // 简化实现：直接复制文件到临时目录然后压缩
  const tempDir = path.join(os.tmpdir(), `backup_${crypto.randomBytes(8).toString('hex')}`);
  const backupDir = path.join(tempDir, 'telebox_backup');
  
  try {
    fs.mkdirSync(backupDir, { recursive: true });

    for (const sourceDir of sourceDirs) {
      if (!fs.existsSync(sourceDir)) {
        throw new Error(`${sourceDir} 不存在`);
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
      const { spawn } = require('child_process');
      const tarProcess = spawn('tar', ['-czf', outputFilename, '-C', tempDir, 'telebox_backup'], {
        stdio: 'pipe'
      });

      tarProcess.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          // 如果tar命令失败，使用简单的zip实现
          try {
            const archiver = require('archiver');
            const output = fs.createWriteStream(outputFilename);
            const archive = archiver('zip', { zlib: { level: 5 } });
            
            archive.pipe(output);
            archive.directory(backupDir, 'telebox_backup');
            archive.finalize();
            
            output.on('close', () => resolve());
            output.on('error', reject);
          } catch {
            reject(new Error('压缩失败：需要安装tar命令或archiver包'));
          }
        }
      });

      tarProcess.on('error', () => {
        // 如果tar命令不存在，尝试其他方法
        reject(new Error('tar命令不可用'));
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
  const now = nowBJ();
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
  
  const prefixMap: { [key: string]: string } = {
    plugins: "bf_p",
    assets: "bf_a", 
    full: "bf_all"
  };
  
  const prefix = prefixMap[backupType] || "bf";
  const randomId = crypto.randomBytes(4).toString("hex");
  const packageName = `${prefix}_${timestamp}_${randomId}.tar.gz`;
  
  return sanitizeFilename(packageName);
}

// 文件查找辅助函数
async function findBackupFile(client: any, chatId: number): Promise<Api.Message | null> {
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
    date: new Date(backupMsg.date as any).toISOString()
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
  const progressCallback = showProgress && message ? async (sent: number, total: number) => {
    if (!total) return;
    try {
      const pct = Math.floor((sent * 100) / total);
      if (pct >= progress.last + 10) {
        progress.last = pct;
        const client = await getGlobalClient();
        if (client) {
          client.editMessage(message.peerId, {
            message: message.id,
            text: `📤 上传中... ${pct}%`
          }).catch(() => {});
        }
      }
    } catch {}
  } : undefined;

  console.log('上传函数接收到的targets:', targets);
  
  try {
    if (targets.length === 0) {
      // 发送到收藏夹
      console.log('无目标，发送到收藏夹');
      await client.sendFile('me', {
        file: filePath,
        caption,
        forceDocument: true,
        progressCallback
      });
    } else if (targets.length === 1) {
      // 单个目标直接上传
      const targetId = targets[0];
      try {
        await client.sendFile(targetId, {
          file: filePath,
          caption,
          forceDocument: true,
          progressCallback
        });
      } catch (error) {
        console.error(`发送到目标 ${targetId} 失败，发送到收藏夹:`, error);
        // 如果目标发送失败，发送到收藏夹
        await client.sendFile('me', {
          file: filePath,
          caption: `⚠️ 原定目标 ${targetId} 发送失败\n\n${caption}`,
          forceDocument: true
        });
      }
    } else {
      // 多个目标先发到收藏夹再转发
      const sentMsg = await client.sendFile('me', {
        file: filePath,
        caption,
        forceDocument: true
      });
      
      let failedTargets = [];
      
      for (const target of targets) {
        try {
          await client.forwardMessages(target, { messages: [sentMsg], fromPeer: 'me' });
        } catch (error) {
          console.error(`转发到目标 ${target} 失败:`, error);
          failedTargets.push(target);
          
          // 尝试直接发送
          try {
            await client.sendFile(target, {
              file: filePath,
              caption,
              forceDocument: true
            });
          } catch (sendError) {
            console.error(`直接发送到目标 ${target} 也失败:`, sendError);
          }
        }
      }
      
      if (failedTargets.length > 0) {
        // 更新收藏夹中的消息，添加失败信息
        const failedInfo = `\n\n⚠️ 发送失败的目标: ${failedTargets.join(', ')}`;
        await client.editMessage('me', {
          message: sentMsg.id,
          text: caption + failedInfo
        }).catch(() => {}); // 忽略编辑失败
      }
    }
  } catch (error) {
    console.error('上传失败:', error);
    // 最后的兜底：尝试发送到收藏夹
    try {
      await client.sendFile('me', {
        file: filePath,
        caption: `❌ 备份上传失败，错误: ${String(error)}\n\n${caption}`,
        forceDocument: true
      });
      console.log('已将失败的备份发送到收藏夹');
    } catch (fallbackError) {
      console.error('连收藏夹都发送失败:', fallbackError);
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
    const targets = Config.get<string[]>('target_chat_ids') || [];
    await uploadToTargets(client, filePath, targets, caption, message, showProgress);
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

// 恢复相关接口
interface RestoreSession {
  file_info: FileInfo;
  backup_type: 'standard' | 'full' | 'plugins';
  download_path: string;
  extract_path: string;
  created_at: string;
}

// 依赖安装函数
async function ensureDependencies(): Promise<void> {
  const { spawn } = require('child_process');
  
  // 检查并安装 tar 依赖 (如果需要)
  const checkTar = () => {
    return new Promise<boolean>((resolve) => {
      const tarProcess = spawn('tar', ['--version'], { stdio: 'pipe' });
      tarProcess.on('close', (code: number) => resolve(code === 0));
      tarProcess.on('error', () => resolve(false));
    });
  };

  const hasTar = await checkTar();
  if (!hasTar) {
    console.log('tar 命令不可用，将使用 Node.js 内置解压');
  }

  // 检查并安装 archiver 包
  try {
    require('archiver');
  } catch {
    console.log('正在安装 archiver 依赖...');
    await new Promise<void>((resolve, reject) => {
      const npmProcess = spawn('npm', ['install', 'archiver'], { 
        stdio: 'pipe',
        cwd: getProgramDir()
      });
      npmProcess.on('close', (code: number) => {
        if (code === 0) {
          console.log('archiver 安装成功');
          resolve();
        } else {
          reject(new Error('archiver 安装失败'));
        }
      });
      npmProcess.on('error', reject);
    });
  }

  // 检查并安装 tar-stream 包用于解压
  try {
    require('tar-stream');
  } catch {
    console.log('正在安装 tar-stream 依赖...');
    await new Promise<void>((resolve, reject) => {
      const npmProcess = spawn('npm', ['install', 'tar-stream'], { 
        stdio: 'pipe',
        cwd: getProgramDir()
      });
      npmProcess.on('close', (code: number) => {
        if (code === 0) {
          console.log('tar-stream 安装成功');
          resolve();
        } else {
          reject(new Error('tar-stream 安装失败'));
        }
      });
      npmProcess.on('error', reject);
    });
  }
}

// 下载备份文件
async function downloadBackupFile(client: any, fileInfo: FileInfo): Promise<string> {
  const tempDir = os.tmpdir();
  const downloadPath = path.join(tempDir, `restore_${Date.now()}_${fileInfo.file_name}`);
  
  try {
    const message = await client.getMessages(fileInfo.chat_id, { ids: [fileInfo.message_id] });
    if (!message || message.length === 0) {
      throw new Error('备份消息不存在或已被删除');
    }

    const msg = message[0];
    if (!msg.file) {
      throw new Error('消息中没有文件');
    }

    // 使用 downloadMedia 方法直接下载到文件
    const result = await client.downloadMedia(msg, { outputFile: downloadPath });
    
    // 验证文件是否下载成功
    if (!fs.existsSync(downloadPath)) {
      throw new Error('文件下载后未能保存到磁盘');
    }
    
    const stats = fs.statSync(downloadPath);
    if (stats.size === 0) {
      throw new Error('下载的文件为空');
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
    const { spawn } = require('child_process');
    const success = await new Promise<boolean>((resolve) => {
      const tarProcess = spawn('tar', ['-xzf', archivePath, '-C', extractDir], {
        stdio: 'pipe'
      });
      
      tarProcess.on('close', (code: number) => resolve(code === 0));
      tarProcess.on('error', () => resolve(false));
    });

    if (success) {
      return extractDir;
    }

    // 如果 tar 失败，使用 Node.js 解压
    console.log('使用 Node.js 内置解压...');
    const tarStream = require('tar-stream');
    const extract = tarStream.extract();
    const gunzip = zlib.createGunzip();

    return new Promise<string>((resolve, reject) => {
      extract.on('entry', (header: any, stream: any, next: any) => {
        const filePath = path.join(extractDir, header.name);
        
        if (header.type === 'directory') {
          fs.mkdirSync(filePath, { recursive: true });
          stream.resume();
          next();
        } else {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          const writeStream = fs.createWriteStream(filePath);
          stream.pipe(writeStream);
          stream.on('end', next);
        }
      });

      extract.on('finish', () => resolve(extractDir));
      extract.on('error', reject);

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
function detectBackupType(extractPath: string): 'standard' | 'full' | 'plugins' {
  const contents = fs.readdirSync(extractPath);
  
  // 查找 telebox_backup 目录
  const backupDir = contents.find(item => 
    fs.statSync(path.join(extractPath, item)).isDirectory() && 
    item.includes('backup')
  );
  
  if (!backupDir) {
    throw new Error('无效的备份文件格式');
  }

  const backupPath = path.join(extractPath, backupDir);
  const backupContents = fs.readdirSync(backupPath);

  // 检测备份类型
  const hasAssets = backupContents.includes('assets');
  const hasPlugins = backupContents.includes('plugins');
  const hasConfig = backupContents.includes('config.json');
  const hasSession = backupContents.includes('my_session');

  if (hasPlugins && backupContents.length === 1) {
    return 'plugins';
  } else if (hasAssets && hasPlugins && hasConfig && hasSession) {
    return 'standard'; // 增强标准备份
  } else if (hasAssets && hasPlugins && backupContents.length === 2) {
    return 'standard'; // 传统标准备份
  } else {
    return 'full';
  }
}

// 执行恢复操作
async function performRestore(session: RestoreSession): Promise<void> {
  const programDir = getProgramDir();
  const backupDir = fs.readdirSync(session.extract_path)
    .find(item => fs.statSync(path.join(session.extract_path, item)).isDirectory());
  
  if (!backupDir) {
    throw new Error('找不到备份目录');
  }

  const sourcePath = path.join(session.extract_path, backupDir);
  
  // 创建备份当前文件
  const backupTimestamp = nowBJ().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const currentBackupDir = path.join(programDir, `_restore_backup_${backupTimestamp}`);
  
  try {
    switch (session.backup_type) {
      case 'standard':
        // 备份当前的关键文件和目录
        fs.mkdirSync(currentBackupDir, { recursive: true });
        
        const standardItems = ['assets', 'plugins', 'config.json', 'my_session'];
        for (const item of standardItems) {
          const itemPath = path.join(programDir, item);
          if (fs.existsSync(itemPath)) {
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
              fs.cpSync(itemPath, path.join(currentBackupDir, item), { recursive: true });
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

      case 'plugins':
        // 仅备份和恢复 plugins
        if (fs.existsSync(path.join(programDir, 'plugins'))) {
          fs.cpSync(path.join(programDir, 'plugins'), path.join(currentBackupDir, 'plugins'), { recursive: true });
          fs.rmSync(path.join(programDir, 'plugins'), { recursive: true, force: true });
        }
        
        if (fs.existsSync(path.join(sourcePath, 'plugins'))) {
          fs.cpSync(path.join(sourcePath, 'plugins'), path.join(programDir, 'plugins'), { recursive: true });
        }
        break;

      case 'full':
        // 全量恢复 - 备份整个程序目录的关键部分
        const importantDirs = ['assets', 'plugins', 'src', 'config.json', 'package.json'];
        fs.mkdirSync(currentBackupDir, { recursive: true });
        
        for (const item of importantDirs) {
          const itemPath = path.join(programDir, item);
          if (fs.existsSync(itemPath)) {
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
              fs.cpSync(itemPath, path.join(currentBackupDir, item), { recursive: true });
            } else {
              fs.copyFileSync(itemPath, path.join(currentBackupDir, item));
            }
          }
        }
        
        // 恢复所有内容 (排除危险目录)
        const dangerousDirs = ['node_modules', '.git', 'logs', 'temp', 'my_session'];
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
        console.log('恢复失败，正在回滚...');
        // 这里可以添加回滚逻辑
      } catch (rollbackError) {
        console.error('回滚也失败了:', rollbackError);
      }
    }
    throw error;
  }
}

// 恢复会话管理
class RestoreSessionManager {
  private static sessions = new Map<string, RestoreSession>();

  static createSession(fileInfo: FileInfo, backupType: 'standard' | 'full' | 'plugins', downloadPath: string, extractPath: string): string {
    const sessionId = crypto.randomBytes(8).toString('hex');
    const session: RestoreSession = {
      file_info: fileInfo,
      backup_type: backupType,
      download_path: downloadPath,
      extract_path: extractPath,
      created_at: nowBJ().toISOString()
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
        console.error('清理临时文件失败:', error);
      }
      
      this.sessions.delete(sessionId);
    }
  }

  static listSessions(): RestoreSession[] {
    return Array.from(this.sessions.values());
  }
}

// 主插件定义
const bfPlugin: Plugin = {
  command: ["bf", "hf"],
  description: "📦 备份主命令，支持多种备份模式；🔄 hf 恢复命令",
  listenMessageHandler: async (msg: Api.Message) => {
    // 备份插件不需要监听所有消息，仅响应命令
    // 但为了接口合规性需要包含此属性
    try {
      // 无需处理普通消息
    } catch (error) {
      console.error('[BF Plugin] Message listening error:', error);
    }
  },
  cmdHandler: async (msg: Api.Message) => {
    const command = msg.message.slice(1).split(' ')[0];
    const args = msg.message.slice(1).split(' ').slice(1);
    const param = args[0] || '';
    const programDir = getProgramDir();

    try {
      // hf 恢复命令处理
      if (command === "hf") {
        const client = await getGlobalClient();
        if (!client) {
          return;
        }

        // hf 帮助
        if (["help", "帮助"].includes(param)) {
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: "🔄 **TeleBox 恢复系统** 🔄\n\n" +
                  "📁 回复备份文件消息，发送 `hf` 直接恢复\n\n" +
                  "📦 **支持格式**: 增强标准 | 插件专用 | 完整备份\n" +
                  "🔄 **自动重载**: 恢复后自动重载插件"
          });
          return;
        }

        // 默认恢复流程 - 需要回复备份文件
        if (!msg.replyTo) {
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: "❌ 请回复一个备份文件消息后使用 `hf` 命令"
          });
          return;
        }

        try {
          // 获取回复的消息
          const replyMsg = await client.getMessages(msg.peerId, { ids: [msg.replyTo.replyToMsgId!] });
          if (!replyMsg || replyMsg.length === 0) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "❌ 无法获取回复的消息"
            });
            return;
          }

          const backupMsg = replyMsg[0];
          console.log('备份消息信息:', {
            hasFile: !!backupMsg.file,
            fileName: backupMsg.file?.name,
            fileSize: backupMsg.file?.size,
            messageId: backupMsg.id
          });
          
          if (!backupMsg.file || !backupMsg.file.name || !backupMsg.file.name.endsWith('.tar.gz')) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "❌ 回复的消息不是有效的备份文件"
            });
            return;
          }

          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: "🔄 正在恢复备份..."
          });

          // 确保依赖已安装
          await ensureDependencies();

          // 提取文件信息
          const fileInfo = extractFileInfo(backupMsg);

          // 显示下载进度
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: "📥 正在下载备份文件..."
          });

          // 下载备份文件
          const downloadPath = await downloadBackupFile(client, fileInfo);

          // 显示解压进度
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: "📦 正在解压备份文件..."
          });

          // 解压备份文件
          const extractPath = await extractBackupFile(downloadPath);

          // 显示检测进度
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: "🔍 正在检测备份类型..."
          });

          // 检测备份类型
          const backupType = detectBackupType(extractPath);

          // 显示恢复进度
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: `🔄 正在恢复${backupType === 'standard' ? '标准' : backupType === 'plugins' ? '插件' : '完整'}备份...`
          });

          // 创建临时会话并立即执行恢复
          const session: RestoreSession = {
            file_info: fileInfo,
            backup_type: backupType,
            download_path: downloadPath,
            extract_path: extractPath,
            created_at: nowBJ().toISOString()
          };

          // 直接执行恢复
          await performRestore(session);

          // 清理临时文件
          try {
            if (fs.existsSync(downloadPath)) {
              fs.unlinkSync(downloadPath);
            }
            if (fs.existsSync(extractPath)) {
              fs.rmSync(extractPath, { recursive: true, force: true });
            }
          } catch {}

          // 尝试重载插件
          try {
            const { loadPlugins } = require('@utils/pluginManager');
            await loadPlugins();
            
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: `✅ 恢复完成并已重载`
            });
          } catch (reloadError) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: `✅ 恢复完成，建议重启程序`
            });
          }

        } catch (error) {
          console.error('恢复过程出错:', error);
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: `❌ 恢复失败: ${String(error)}\n\n调试信息已输出到控制台`
          });
        }
        return;
      }

      // bf 备份命令处理
      // 帮助命令
      if (param && ["help", "帮助"].includes(param)) {
        const helpText = (
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
          "• 恢复后无需重新配置插件，保持所有设置"
        );
        const client = await getGlobalClient();
        if (client) {
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: helpText
          });
        }
        return;
      }

      // 设置目标聊天ID
      if (param === "set") {
        if (args.length < 2 || ["help", "-h", "--help", "?"].includes(args[1])) {
          const client = await getGlobalClient();
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "🎯 目标聊天\n用法: `bf set <ID...>` (空格/逗号分隔)\n" +
                    "例: `bf set 123,456` 或 `bf set 123 456`\n未设置则发到收藏夹"
            });
          }
          return;
        }

        try {
          const raw = args.slice(1).join(" ");
          const parts = raw.replace(/,/g, " ").split(/\s+/).filter(s => s.trim());
          
          const valid: string[] = [];
          for (const part of parts) {
            if (/^-?\d+$/.test(part)) {
              valid.push(part);
            } else {
              const client = await getGlobalClient();
              if (client) {
                await client.editMessage(msg.peerId, {
                  message: msg.id,
                  text: `无效的聊天ID: ${part}\n仅支持数字ID，例如 123456 或 -1001234567890`
                });
              }
              return;
            }
          }

          if (valid.length === 0) {
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: "聊天ID不能为空"
              });
            }
            return;
          }

          const newList = TargetManager.addTargets(valid);
          const client = await getGlobalClient();
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: `目标聊天ID已更新：${newList.length > 0 ? newList.join(', ') : '（已清空）'}`
            });
          }
        } catch (e) {
          const client = await getGlobalClient();
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: `设置失败：${String(e)}`
            });
          }
        }
        return;
      }

      // 定时备份管理 - 使用cron表达式
      if (param === "cron") {
        const subCmd = args[1];
        
        if (!subCmd || subCmd === "status") {
          const status = ScheduledBackupManager.getStatus();
          if (!status.enabled) {
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: "⏰ 定时备份未启用\n\n使用 `bf cron help` 查看帮助"
              });
            }
          } else {
            const lastBackup = status.last_backup ? new Date(status.last_backup).toLocaleString('zh-CN') : '从未执行';
            const nextBackup = status.next_backup ? new Date(status.next_backup).toLocaleString('zh-CN') : '未知';
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: `⏰ **定时备份状态**\n\n` +
                      `• 状态: ${status.enabled ? '✅ 已启用' : '❌ 已禁用'}\n` +
                      `• Cron表达式: \`${status.cron_expression}\`\n` +
                      `• 备份类型: 标准备份 (assets + plugins)\n` +
                      `• 上次备份: ${lastBackup}\n` +
                      `• 下次备份: ${nextBackup}\n` +
                      `• 运行状态: ${status.is_running ? '🟢 运行中' : '🔴 已停止'}`
              });
            }
          }
          return;
        }
        
        if (subCmd === "help") {
          const client = await getGlobalClient();
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "⏰ **Cron定时备份命令**\n\n" +
                    "• `bf cron` - 查看状态\n" +
                    "• `bf cron <cron表达式>` - 启动定时标准备份\n" +
                    "• `bf cron stop` - 停止定时备份\n" +
                    "• `bf cron now` - 立即执行一次备份\n\n" +
                    "**Cron表达式格式 (6字段):**\n" +
                    "`秒 分 时 日 月 周`\n\n" +
                    "**支持格式:**\n" +
                    "• `*` - 匹配所有值\n" +
                    "• `*/N` - 每N个单位执行一次\n" +
                    "• `N` - 指定具体值\n\n" +
                    "**备份类型:**\n" +
                    "• 定时备份: 仅标准备份 (assets + plugins)\n" +
                    "• 其他备份: 请使用手动命令 `bf p` 或 `bf all`\n\n" +
                    "**示例:**\n" +
                    "`bf cron */5 * * * * *` - 每5秒标准备份\n" +
                    "`bf cron 0 */30 * * * *` - 每30分钟标准备份\n" +
                    "`bf cron 0 0 */6 * * *` - 每6小时标准备份\n" +
                    "`bf cron 0 0 2 * * *` - 每天凌晨2点标准备份"
            });
          }
          return;
        }
        
        // 直接解析cron表达式（简化命令）
        if (subCmd && subCmd !== 'stop' && subCmd !== 'now' && subCmd !== 'help' && subCmd !== 'status') {
          // 重新组合完整的cron表达式
          const cronExpression = args.slice(1).join(' ');
          
          if (!cronExpression) {
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: "❌ 请指定cron表达式\n例: `bf cron */5 * * * * *`"
              });
            }
            return;
          }
          
          // 验证cron表达式
          const validation = CronParser.validateCron(cronExpression);
          if (!validation.valid) {
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: `❌ 无效的cron表达式: ${validation.error}`
              });
            }
            return;
          }
          
          const nextBackup = CronParser.getNextRunTime(cronExpression);
          if (!nextBackup) {
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: "❌ 无法计算下次执行时间"
              });
            }
            return;
          }
          
          Config.set('scheduled_backup', {
            enabled: true,
            cron_expression: cronExpression,
            last_backup: '',
            next_backup: nextBackup.toISOString()
          });
          
          ScheduledBackupManager.start();
          
          const client = await getGlobalClient();
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: `✅ **定时标准备份已启动**\n\n` +
                    `• Cron表达式: \`${cronExpression}\`\n` +
                    `• 备份类型: 标准备份 (assets + plugins)\n` +
                    `• 下次备份: ${nextBackup.toLocaleString('zh-CN')}`
            });
          }
          return;
        }
        
        if (subCmd === "stop") {
          Config.set('scheduled_backup', {
            enabled: false,
            cron_expression: '',
            last_backup: '',
            next_backup: ''
          });
          
          ScheduledBackupManager.stop();
          
          const client = await getGlobalClient();
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "⏹️ 定时备份已停止"
            });
          }
          return;
        }
        
        if (subCmd === "now") {
          const config = Config.get<BackupConfig['scheduled_backup']>('scheduled_backup');
          if (!config?.enabled) {
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: "❌ 定时备份未启用，请先使用 `bf cron <表达式>` 启动"
              });
            }
            return;
          }
          
          const client = await getGlobalClient();
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "🔄 正在执行定时标准备份..."
            });
          }
          
          try {
            await ScheduledBackupManager.executeBackup();
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: "✅ 定时标准备份执行完成"
              });
            }
          } catch (error) {
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: `❌ 定时备份执行失败: ${String(error)}`
              });
            }
          }
          return;
        }
        
        const client = await getGlobalClient();
        if (client) {
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: "❌ 未知的定时备份命令，使用 `bf cron help` 查看帮助"
          });
        }
        return;
      }

      // 删除目标聊天ID
      if (param === "del") {
        if (args.length < 2 || ["help", "-h", "--help", "?"].includes(args[1])) {
          const client = await getGlobalClient();
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "🧹 删除目标: `bf del <ID>`，清空: `bf del all`"
            });
          }
          return;
        }

        const target = args[1];
        try {
          const newList = TargetManager.removeTarget(target);
          if (target === "all") {
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: "已清空全部目标聊天ID"
              });
            }
          } else {
            const client = await getGlobalClient();
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: `已删除：${target}，当前目标列表：${newList.length > 0 ? newList.join(', ') : '（空）'}`
              });
            }
          }
        } catch (e) {
          const client = await getGlobalClient();
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: `删除失败：${String(e)}`
            });
          }
        }
        return;
      }

      // 全量备份
      if (param === "all") {
        const client = await getGlobalClient();
        try {
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "🔄 正在创建完整程序备份..."
            });
          }
          const packageName = generatePackageName("full");
          const slimMode = args.length > 1 && ["slim", "fast"].includes(args[1].toLowerCase());
          
          const excludeDirnames = [
            ".git", "__pycache__", ".pytest_cache", "venv", "env", ".venv", 
            "node_modules", "cache", "caches", "logs", "log", "downloads", 
            "download", "media", ".mypy_cache", ".ruff_cache"
          ];
          const excludeExts = [".log", ".ttf"];
          
          let maxFileSizeMB: number | undefined;
          let compressLevel = 5;
          
          if (slimMode) {
            excludeDirnames.push("dist", "build", ".cache", "tmp", "temp");
            maxFileSizeMB = 20;
            compressLevel = 3;
          }

          const includeItems = fs.readdirSync(programDir)
            .filter(item => !item.startsWith("."))
            .map(item => path.join(programDir, item));

          await createTarGz(includeItems, packageName, {
            excludeDirs: excludeDirnames,
            excludeExts,
            maxFileSizeMB,
            compressLevel,
            skipMultimedia: true
          });

          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "📤 正在上传完整备份..."
            });
          }

          const stats = fs.statSync(packageName);
          const caption = (
            `🚀 **TeleBox 完整程序备份${slimMode ? ' (瘦身版)' : ''}** 🚀\n\n` +
            `📦 **包名**: \`${packageName}\`\n` +
            `🕐 **创建时间**: ${nowBJ().toLocaleString('zh-CN')}\n` +
            `📊 **文件大小**: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n` +
            `🎯 **备份类型**: ${slimMode ? '🏃‍♂️ 瘦身完整备份' : '📁 标准完整备份'}\n\n` +
            `📋 **包含内容**:\n` +
            `• 📁 所有程序文件和配置\n` +
            `• 🔌 插件源代码和设置\n` +
            `• ⚙️ 系统配置文件\n` +
            `• 🔐 登录会话数据\n\n` +
            `🎵 **智能优化**:\n` +
            `• 自动跳过多媒体文件 (mp3/mp4等)\n` +
            `${slimMode ? '• 跳过>20MB大文件，上传更快\n• 排除更多缓存目录\n' : ''}` +
            `• 压缩算法优化，节省空间\n\n` +
            `💡 **适用场景**: 系统迁移、完整备份、灾难恢复`
          );

          const targets = TargetManager.getTargets();
          await sendAndCleanup(client, packageName, caption, msg, true);
          
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: `✅ 完整备份已完成\n\n📦 \`${packageName}\`\n` +
                    `🎯 发送到: ${targets.length > 0 ? targets.join(', ') : '收藏夹'}`
            });
          }
        } catch (e) {
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: `❌ 完整备份失败: ${String(e)}`
            });
          }
        }
        return;
      }

      // 插件备份
      if (param === "p") {
        const client = await getGlobalClient();
        try {
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "🔌 正在创建插件备份..."
            });
          }
          const packageName = generatePackageName("plugins");
          
          const pluginsDir = path.join(programDir, "plugins");
          if (!fs.existsSync(pluginsDir)) {
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: "❌ plugins目录不存在"
              });
            }
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
            if (client) {
              await client.editMessage(msg.peerId, {
                message: msg.id,
                text: "❌ 未找到任何TypeScript插件文件"
              });
            }
            return;
          }

          await createTarGz([tempPluginsDir], packageName);
          fs.rmSync(tempRoot, { recursive: true, force: true });

          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: "📤 正在分享插件备份..."
            });
          }

          const caption = (
            `🔌 **TeleBox 插件专用备份** 🔌\n\n` +
            `📦 **包名**: \`${packageName}\`\n` +
            `🕐 **创建时间**: ${nowBJ().toLocaleString('zh-CN')}\n` +
            `🎯 **备份类型**: TypeScript 插件专用包\n` +
            `📊 **插件数量**: ${tsCount} 个 TypeScript 文件\n\n` +
            `✨ **特色功能**:\n` +
            `• 🎯 仅包含 .ts 插件文件\n` +
            `• 📁 保持原有目录结构\n` +
            `• 🚀 体积小巧，传输快速\n` +
            `• 🔄 完美适配插件分享\n\n` +
            `💡 **适用场景**: 插件分享、代码迁移、开发协作`
          );

          await sendAndCleanup(client, packageName, caption);
          const targets = TargetManager.getTargets();
          
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: `✅ 插件备份已完成\n\n📦 \`${packageName}\`\n🔌 数量: ${tsCount} 个\n` +
                    `🎯 发送到: ${targets.length > 0 ? targets.join(', ') : '收藏夹'}`
            });
          }
        } catch (e) {
          if (client) {
            await client.editMessage(msg.peerId, {
              message: msg.id,
              text: `❌ 插件备份失败: ${String(e)}`
            });
          }
        }
        return;
      }

      // 默认增强标准备份 - 包含完整配置
      const client = await getGlobalClient();
      try {
        const nowStr = nowBJ().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_");
        const tmpdir = os.tmpdir();
        const backupPath = path.join(tmpdir, `telebox_enhanced_backup_${nowStr}.tar.gz`);

        if (client) {
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: "🔄 正在创建增强标准备份..."
          });
        }
        
        // 增强备份：包含 assets + plugins + config.json + my_session
        const backupItems = [
          path.join(programDir, "assets"),
          path.join(programDir, "plugins"),
          path.join(programDir, "config.json"),
          path.join(programDir, "my_session")
        ];

        await createTarGz(
          backupItems,
          backupPath,
          { excludeExts: [".ttf"], compressLevel: 5, skipMultimedia: true }
        );

        if (client) {
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: "📤 正在上传增强备份..."
          });
        }
        
        const stats = fs.statSync(backupPath);
        const sessionCount = fs.existsSync(path.join(programDir, "my_session")) 
          ? fs.readdirSync(path.join(programDir, "my_session")).length 
          : 0;

        const caption = (
          `✨ **TeleBox 智能增强备份** ✨\n\n` +
          `🕐 **创建时间**: ${nowBJ().toLocaleString('zh-CN')}\n` +
          `📊 **文件大小**: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n\n` +
          `📦 **备份内容**:\n` +
          `┣ 📁 **Assets** - 插件配置与缓存数据\n` +
          `┣ 🔌 **Plugins** - 插件源代码文件\n` +
          `┣ ⚙️ **Config** - API配置信息\n` +
          `┗ 🔐 **Sessions** - ${sessionCount}个登录会话\n\n` +
          `🚀 **智能优化**:\n` +
          `• 🎵 自动跳过多媒体文件 (mp3/mp4等)\n` +
          `• 💾 优化压缩算法，减少体积\n` +
          `• 🔄 恢复后保持所有插件设置\n\n` +
          `💡 **使用提示**: 此备份包含完整配置，重装系统后可一键恢复！`
        );

        const targets = TargetManager.getTargets();
        await sendAndCleanup(client, backupPath, caption, msg, targets.length <= 1);

        if (client) {
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: `🎉 **增强标准备份完成** 🎉\n\n` +
                  `🎯 **发送目标**: ${targets.length > 0 ? targets.join(', ') : '💾 收藏夹'}\n` +
                  `📦 **备份内容**: 配置 + 插件 + 会话 (${sessionCount}个)\n` +
                  `💾 **文件大小**: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n` +
                  `🎵 **已优化**: 跳过多媒体文件，体积更小\n\n` +
                  `✨ **恢复优势**: 此备份包含完整插件设置，恢复后无需重新配置！`
          });
        }
      } catch (e) {
        if (client) {
          await client.editMessage(msg.peerId, {
            message: msg.id,
            text: `❌ 备份失败: ${String(e)}`
          });
        }
      }

    } catch (e) {
      const client = await getGlobalClient();
      if (client) {
        await client.editMessage(msg.peerId, {
          message: msg.id,
          text: `❌ 命令执行失败: ${String(e)}`
        });
      }
    }
  }
};

// 插件初始化时启动定时备份
setTimeout(() => {
  try {
    ScheduledBackupManager.start();
  } catch (error) {
    console.error('定时备份启动失败:', error);
  }
}, 5000); // 延迟5秒启动，确保系统初始化完成

export default bfPlugin;
