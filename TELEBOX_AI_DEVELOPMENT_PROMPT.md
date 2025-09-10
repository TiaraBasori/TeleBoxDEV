# TeleBox AI 开发规范

> 📌 **版本**: 3.0 | **更新日期**: 2025-09-10 | **适用于**: TeleBox 高级插件开发

## 核心架构

```
telebox/
├── src/utils/          # 核心工具模块
├── plugins/            # 用户插件目录  
├── assets/             # 资源文件目录
├── temp/               # 临时文件目录
└── config.json         # API配置
```


## 核心依赖引用

### 🔧 内部模块

```typescript
// 插件系统
import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { getPrefixes, handleCommand, getCommandFromMessage, dealCommandPluginWithMessage } from "@utils/pluginManager";

// 路径管理
import { createDirectoryInAssets, createDirectoryInTemp } from "@utils/pathHelpers";

// 实体处理  
import { getEntityWithHash, parseEntityId, safeForwardMessage } from "@utils/entityHelpers";

// 数据库
import { AliasDB } from "@utils/aliasDB";
import { SudoDB } from "@utils/sudoDB";
import { SureDB } from "@utils/sureDB";
import { SendLogDB } from "@utils/sendLogDB";

// 封禁管理
import { unbanUser, banUser, kickUser, getBannedUsers, batchUnbanUsers } from "@utils/banUtils";

// 系统功能
import { cronManager } from "@utils/cronManager";
import { conversation } from "@utils/conversation";
import { reviveEntities } from "@utils/tlRevive";
import { npm_install } from "@utils/npm_install";
import { apiConfig } from "@utils/apiConfig";
import { loginManager } from "@utils/loginManager";
```

### 📦 Telegram API

```typescript
import { Api } from "telegram";
import { CustomFile } from "telegram/client/uploads.js";
import { sleep } from "telegram/Helpers";
import { NewMessage } from "telegram/events";
import { BigInteger } from "big-integer";
```

### 📦 内置依赖库

```typescript
// 网络请求
import axios from "axios";

// 工具库
import _ from "lodash";
import dayjs from "dayjs";
import * as cron from "cron";

// 图像处理
import sharp from "sharp";

// 数据库
import Database from "better-sqlite3";
import { JSONFilePreset } from "lowdb/node";

// 文件处理
import * as download from "download";
import archiver from "archiver";
import * as fs from "fs";
import * as path from "path";

// 中文处理
import * as OpenCC from "opencc-js";
import { pinyin } from "pinyin-pro";

// 翻译
import translate from "@vitalets/google-translate-api";

// YouTube
import { Innertube } from "youtubei.js";
import ytdl from "@distube/ytdl-core";
```

### 🔧 必需工具函数

```typescript
// HTML转义（每个插件必须实现）
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

// 获取命令前缀
const prefixes = getPrefixes();
const mainPrefix = prefixes[0];

// 动态插件管理
function dynamicRequireWithDeps(filePath: string): any;
function setPlugins(basePath: string): Promise<void>;
function loadPlugin(pluginPath: string): Promise<void>;
function unloadPlugin(commandName: string): void;
function reloadPlugin(commandName: string): Promise<void>;

// 提取命令参数（跳过前n个参数）
function getRemarkFromMsg(msg: Api.Message | string, n: number): string {
  return (typeof msg === "string" ? msg : msg?.message || "")
    .replace(new RegExp(`^\\S+${Array(n).fill("\\s+\\S+").join("")}`), "")
    .trim();
}

// 类型转换
function toInt(value: any): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function toStrInt(value: any): string | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.trunc(n)) : undefined;
}

// 时区处理
const CN_TIME_ZONE = "Asia/Shanghai";
function formatDate(date: Date): string {
  return date.toLocaleString("zh-CN", { timeZone: CN_TIME_ZONE });
}
```
## 核心API签名

### Plugin 基类

```typescript
abstract class Plugin {
  description?: string;
  cmdHandlers?: { [key: string]: (msg: Api.Message) => Promise<void> };
  listenMessageHandler?: (msg: Api.Message) => Promise<void>;
  cronTasks?: { [key: string]: { schedule: string; handler: () => Promise<void> } };
  onInit?(): Promise<void>;
  onDestroy?(): Promise<void>;
}
```

### Message API

```typescript
interface Api.Message {
  id: number;
  peerId: Api.TypePeer;
  senderId?: BigInteger;
  text?: string;
  message?: string;
  media?: Api.TypeMessageMedia;
  entities?: Api.TypeMessageEntity[];
  replyTo?: Api.MessageReplyHeader;
  groupedId?: BigInteger;
  
  // Methods
  edit(params: { text?: string; parseMode?: string }): Promise<Api.Message>;
  reply(params: { message: string; parseMode?: string }): Promise<Api.Message>;
  delete(params?: { revoke?: boolean }): Promise<void>;
  getReplyMessage(): Promise<Api.Message | undefined>;
  downloadMedia(): Promise<Buffer | undefined>;
  getSender(): Promise<Api.User | Api.Chat | undefined>;
}
```

### 数据库 API

```typescript
// SQLite
const db = new Database(dbPath);
db.prepare(sql: string): Statement;
db.exec(sql: string): void;
db.transaction(fn: Function): Function;

// lowdb
const db = await JSONFilePreset<T>(path, defaultData);
await db.read();
await db.write();
db.data; // 访问数据

// 内置数据库
const aliasDB = new AliasDB();
aliasDB.setAlias(alias: string, command: string): void;
aliasDB.getCommand(alias: string): string | null;

const sudoDB = new SudoDB();
sudoDB.isSudoUser(userId: string): Promise<boolean>;
sudoDB.addSudoUser(userId: string): void;

const sureDB = new SureDB();
sureDB.addConfirmation(msgId: string, handler: Function): void;
sureDB.getConfirmation(msgId: string): Function | null;
```

### 客户端 API

```typescript
const client = await getGlobalClient();

// 消息操作
client.sendMessage(peer, { message, parseMode });
client.editMessage(peer, { message: msgId, text, parseMode });
client.deleteMessages(peer, messageIds, { revoke });
client.getMessages(peer, { limit, offsetId, reverse });

// 文件操作
client.sendFile(peer, { file, caption, parseMode });
client.downloadMedia(message, { outputFile });

// 实体操作
client.getEntity(peer): Promise<Entity>;
client.getInputEntity(peer): Promise<InputPeer>;
client.getDialogs({ limit, offsetDate });
client.iterDialogs({ limit });

// 调用原始API
client.invoke(request: Api.AnyRequest): Promise<any>;
```

### 实体处理 API

```typescript
// 获取实体
getEntityWithHash(client, peer): Promise<{ entity, hash }>;
parseEntityId(id: string): { type: string, id: BigInteger };
safeForwardMessage(client, fromPeer, toPeer, msgIds): Promise<void>;

// 格式化实体
formatEntity(target, mention?: boolean): Promise<{
  id: BigInteger;
  entity: Entity;
  display: string;
}>;
```

### 路径管理 API

```typescript
createDirectoryInAssets(name: string): string;
createDirectoryInTemp(name: string): string;
getAssetsPath(): string;
getTempPath(): string;
```

### 定时任务 API

```typescript
cronManager.addTask(name: string, schedule: string, handler: Function);
cronManager.removeTask(name: string);
cronManager.listTasks(): string[];

// Cron表达式
// "0 0 * * *"     每天0点
// "*/5 * * * *"   每5分钟
// "0 9 * * 1"     每周一9点
```

## 开发规范

### 参数解析标准
```typescript
// acron.ts 模式
const lines = msg.text?.trim()?.split(/\r?\n/g) || [];
const parts = lines?.[0]?.split(/\s+/) || [];
const [, ...args] = parts; // 跳过命令本身
const sub = (args[0] || "").toLowerCase();

// 无参数显示错误，不自动显示帮助
if (!sub) {
  await msg.edit({ 
    text: `❌ <b>参数不足</b>\n\n💡 使用 <code>${mainPrefix}cmd help</code> 查看帮助`,
    parseMode: "html" 
  });
  return;
}

// 双向帮助支持：help 可以在子命令前或后
if (sub === "help" || sub === "h") {
  // 处理 .cmd help 或 .cmd help subcommand
  if (args[1]) {
    // 有子命令，显示子命令的帮助
    const subCmd = args[1].toLowerCase();
    // 显示特定子命令的帮助...
  } else {
    // 无子命令，显示总帮助
    await msg.edit({ text: help_text, parseMode: "html" });
  }
  return;
}

// 检查子命令后是否跟着 help（支持 .cmd subcommand help）
if (args[1] && (args[1].toLowerCase() === "help" || args[1].toLowerCase() === "h")) {
  // 显示当前子命令的帮助
  const subCmd = sub;
  // 根据 subCmd 显示对应的帮助信息...
  return;
}
```

### 完整的参数解析示例
```typescript
class ExamplePlugin extends Plugin {
  cmdHandlers = {
    example: async (msg: Api.Message) => {
      const client = await getGlobalClient();
      if (!client) {
        await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
        return;
      }

      // 标准参数解析
      const lines = msg.text?.trim()?.split(/\r?\n/g) || [];
      const parts = lines?.[0]?.split(/\s+/) || [];
      const [, ...args] = parts;
      const sub = (args[0] || "").toLowerCase();

      try {
        // 无参数时显示错误提示
        if (!sub) {
          await msg.edit({
            text: `❌ <b>参数不足</b>\n\n💡 使用 <code>${mainPrefix}example help</code> 查看帮助`,
            parseMode: "html"
          });
          return;
        }

        // 处理 help 在前的情况：.example help [subcommand]
        if (sub === "help" || sub === "h") {
          if (args[1]) {
            // 显示特定子命令的帮助
            const subCmd = args[1].toLowerCase();
            if (subCmd === "query") {
              await msg.edit({ 
                text: `📖 <b>查询命令帮助</b>\n\n<code>${mainPrefix}example query &lt;关键词&gt;</code> - 查询数据`,
                parseMode: "html" 
              });
            } else if (subCmd === "process") {
              await msg.edit({ 
                text: `📖 <b>处理命令帮助</b>\n\n<code>${mainPrefix}example process &lt;数据&gt;</code> - 处理数据`,
                parseMode: "html" 
              });
            } else {
              await msg.edit({ text: help_text, parseMode: "html" });
            }
          } else {
            // 显示总帮助
            await msg.edit({ text: help_text, parseMode: "html" });
          }
          return;
        }

        // 处理 help 在后的情况：.example [subcommand] help
        if (args[1] && (args[1].toLowerCase() === "help" || args[1].toLowerCase() === "h")) {
          // 根据 sub 显示对应子命令的帮助
          if (sub === "query") {
            await msg.edit({ 
              text: `📖 <b>查询命令帮助</b>\n\n<code>${mainPrefix}example query &lt;关键词&gt;</code> - 查询数据`,
              parseMode: "html" 
            });
          } else if (sub === "process") {
            await msg.edit({ 
              text: `📖 <b>处理命令帮助</b>\n\n<code>${mainPrefix}example process &lt;数据&gt;</code> - 处理数据`,
              parseMode: "html" 
            });
          } else {
            await msg.edit({ text: help_text, parseMode: "html" });
          }
          return;
        }

        // 处理具体的子命令
        if (sub === "query") {
          // 查询逻辑...
        } else if (sub === "process") {
          // 处理逻辑...
        } else {
          // 未知命令
          await msg.edit({
            text: `❌ <b>未知命令:</b> <code>${htmlEscape(sub)}</code>\n\n💡 使用 <code>${mainPrefix}example help</code> 查看帮助`,
            parseMode: "html"
          });
        }

      } catch (error: any) {
        console.error("[example] 插件执行失败:", error);
        await msg.edit({
          text: `❌ <b>插件执行失败:</b> ${htmlEscape(error.message)}`,
          parseMode: "html"
        });
      }
    }
  };
}
```

### 错误处理标准
```typescript
try {
  // 业务逻辑
} catch (error: any) {
  if (error.message?.includes("FLOOD_WAIT")) {
    const waitTime = parseInt(error.message.match(/\d+/)?.[0] || "60");
    await sleep((waitTime + 1) * 1000);
  }
  await msg.edit({ 
    text: `❌ <b>错误:</b> ${htmlEscape(error.message)}`,
    parseMode: "html" 
  });
}
```

## 高级技巧

### 复杂类型定义
```typescript
// 定义复杂的任务类型系统
type AcronType = "send" | "copy" | "forward" | "del" | "del_re" | "pin" | "unpin" | "cmd";

type AcronTaskBase = {
  id: string;
  type: AcronType;
  cron: string;
  chat: string;
  chatId?: string;
  createdAt: string;
  lastRunAt?: string;
  lastResult?: string;
  lastError?: string;
  disabled?: boolean;
  remark?: string;
  display?: string;
};

// 使用交叉类型扩展基础类型
type DelTask = AcronTaskBase & {
  type: "del";
  msgId: string;
};

type SendTask = AcronTaskBase & {
  type: "send";
  message: string;
  entities?: any;
  replyTo?: string;
};
```

### 动态代码执行
```typescript
// Data URL 动态导入
async function exec(code: string, context: any) {
  return await (
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(
        `export default async (context) => { 
          const { msg, client, Api, _, axios, sleep, dayjs } = context;
          ${code}
        }`
      )}`
    )
  ).default(context);
}

// 执行上下文
const executionContext = {
  msg, chat: msg?.chat, sender: msg?.sender,
  client, Api, _, axios, dayjs, sleep,
  formatEntity, run: runCommand
};
```

### 消息实体转换
```typescript
function convertEntities(entities: Api.TypeMessageEntity[]): any[] {
  if (!entities) return [];
  return entities.map((entity) => {
    const base = { offset: entity.offset, length: entity.length };
    if (entity instanceof Api.MessageEntityBold) return { ...base, type: "bold" };
    if (entity instanceof Api.MessageEntityItalic) return { ...base, type: "italic" };
    if (entity instanceof Api.MessageEntityUnderline) return { ...base, type: "underline" };
    if (entity instanceof Api.MessageEntityStrike) return { ...base, type: "strikethrough" };
    if (entity instanceof Api.MessageEntitySpoiler) return { ...base, type: "spoiler" };
    if (entity instanceof Api.MessageEntityCode) return { ...base, type: "code" };
    if (entity instanceof Api.MessageEntityPre) return { ...base, type: "pre", language: (entity as any).language };
    if (entity instanceof Api.MessageEntityUrl) return { ...base, type: "url" };
    if (entity instanceof Api.MessageEntityTextUrl) return { ...base, type: "text_link", url: (entity as any).url };
    if (entity instanceof Api.MessageEntityMention) return { ...base, type: "mention" };
    if (entity instanceof Api.MessageEntityMentionName) return { ...base, type: "text_mention", user: { id: (entity as any).userId }};
    if (entity instanceof Api.MessageEntityCustomEmoji) {
      const documentId = (entity as any).documentId;
      const custom_emoji_id = documentId?.value?.toString() || documentId?.toString() || "";
      return { ...base, type: "custom_emoji", custom_emoji_id };
    }
    if (entity instanceof Api.MessageEntityHashtag) return { ...base, type: "hashtag" };
    if (entity instanceof Api.MessageEntityCashtag) return { ...base, type: "cashtag" };
    if (entity instanceof Api.MessageEntityBotCommand) return { ...base, type: "bot_command" };
    if (entity instanceof Api.MessageEntityEmail) return { ...base, type: "email" };
    if (entity instanceof Api.MessageEntityPhone) return { ...base, type: "phone_number" };
    return base;
  });
}
```

### Flood Wait 处理
```typescript
async function handleFloodWait<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (error.message?.includes("FLOOD_WAIT")) {
      const waitTime = parseInt(error.message.match(/\d+/)?.[0] || "60");
      await sleep((waitTime + 1) * 1000);
      return await operation();
    }
    throw error;
  }
}
```



### 封禁管理工具
```typescript
// 解封用户 - 移除所有限制
async function unbanUser(client: TelegramClient, channel: any, user: any): Promise<boolean>;

// 封禁用户
async function banUser(client: TelegramClient, channel: any, user: any, untilDate?: number): Promise<boolean>;

// 踢出用户（封禁后立即解封）
async function kickUser(client: TelegramClient, channel: any, user: any): Promise<boolean>;

// 获取被封禁的用户列表
async function getBannedUsers(client: TelegramClient, channel: any, limit?: number): Promise<Array<{
  id: number;
  firstName: string;
  username?: string;
  kickedBy?: number;
  kickedDate?: number;
}>>;

// 批量解封用户
async function batchUnbanUsers(
  client: TelegramClient, 
  channel: any, 
  userIds: number[], 
  delayMs?: number
): Promise<{ success: number[]; failed: number[]; }>;
```

### 实体格式化
```typescript
async function formatEntity(target: any, mention?: boolean, throwErrorIfFailed?: boolean) {
  const client = await getGlobalClient();
  if (!client) throw new Error("客户端未初始化");
  
  let id: any, entity: any;
  try {
    entity = target?.className ? target : await client?.getEntity(target);
    if (!entity) throw new Error("无法获取entity");
    id = entity.id;
  } catch (e: any) {
    if (throwErrorIfFailed) throw new Error(`无法获取 ${target}: ${e?.message}`);
  }
  
  const displayParts: string[] = [];
  if (entity?.title) displayParts.push(entity.title);
  if (entity?.firstName) displayParts.push(entity.firstName);
  if (entity?.lastName) displayParts.push(entity.lastName);
  if (entity?.username) {
    displayParts.push(mention ? `@${entity.username}` : `<code>@${entity.username}</code>`);
  }
  if (id) {
    displayParts.push(
      entity instanceof Api.User
        ? `<a href="tg://user?id=${id}">${id}</a>`
        : `<a href="https://t.me/c/${id}">${id}</a>`
    );
  }
  
  return { id, entity, display: displayParts.join(" ").trim() };
}
```

### 正则解析
```typescript
function tryParseRegex(input: string): RegExp {
  const trimmed = input.trim();
  if (trimmed.startsWith("/") && trimmed.lastIndexOf("/") > 0) {
    const lastSlash = trimmed.lastIndexOf("/");
    const pattern = trimmed.slice(1, lastSlash);
    const flags = trimmed.slice(lastSlash + 1);
    return new RegExp(pattern, flags);
  }
  return new RegExp(trimmed);
}
```

### 多行命令解析
```typescript
// 解析多行命令格式
const lines = msg.message.split(/\r?\n/g).map(l => l.trim());
const args = lines[0].split(/\s+/g);
const param1 = lines[1]; // 第二行作为参数
const param2 = lines[2]; // 第三行作为参数
```

## 高级工具函数

### 命令执行
```typescript
import { getCommandFromMessage, dealCommandPluginWithMessage } from "@utils/pluginManager";

async function runCommand(commandText: string, msg: Api.Message, trigger?: Api.Message) {
  const cmd = await getCommandFromMessage(commandText);
  const cmdMsg = await msg.client?.sendMessage(msg.peerId, {
    message: commandText,
    replyTo: msg.replyToMsgId,
  });
  if (cmd && cmdMsg) {
    await dealCommandPluginWithMessage({ cmd, msg: cmdMsg, trigger: msg });
  }
}
```


### 用户验证
```typescript
function isValidUser(entity: any): boolean {
  if (!entity) return false;
  return !entity.bot && !entity.deleted && !entity.fake && !entity.scam;
}

function extractSenderId(message: Api.Message): number | undefined {
  const from = (message as any).fromId as any;
  const userId = from?.userId ? Number(from.userId) : undefined;
  return Number.isFinite(userId) ? userId : Number(message.senderId);
}
```

### 概率计算
```typescript
function calculateProbability(selected: number, total: number): string {
  if (total === 0) return "0.00";
  const probability = (selected / total) * 100;
  return (Math.round(probability * 100) / 100).toString();
}

function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}
```

### Fisher-Yates 洗牌
```typescript
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
```


### 帮助系统设计原则

1. **双向帮助支持**
   - 支持 `.cmd help` 显示总帮助
   - 支持 `.cmd help subcommand` 显示子命令帮助
   - 支持 `.cmd subcommand help` 显示子命令帮助
   - 无参数时显示错误提示，不自动显示帮助

2. **渐进式状态反馈**
   ```typescript
   await msg.edit({ text: "🔄 初始化..." });
   await msg.edit({ text: "🔍 搜索中..." });
   await msg.edit({ text: "✅ 完成!" });
   ```

3. **错误消息格式**
   - 始终使用 `❌ <b>错误类型:</b> 详细信息` 格式
   - 所有用户输入必须经过 `htmlEscape()` 处理
   - 提供有用的错误恢复建议

## 结束
```typescript
// 渐进式信息展示
await msg.edit({ text: "🔄 初始化..." });
await msg.edit({ text: "🔍 搜索中..." });
await msg.edit({ text: "✅ 完成!" });
```

### 3. API限制处理
```typescript
async function handleFloodWait<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (error.message?.includes("FLOOD_WAIT")) {
      const waitTime = parseInt(error.message.match(/\d+/)?.[0] || "60");
      await sleep((waitTime + 1) * 1000);
      return await operation();
    }
    throw error;
  }
}
```

---

## 🚀 标准插件模板

```typescript
import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { Api } from "telegram";

// HTML转义工具
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

class TemplatePlugin extends Plugin {
  description: string = `插件功能描述

参数说明:
• [参数1] - 参数说明
• -f - 选项说明

示例:
• .cmd example - 示例用法`;
  
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    cmd: async (msg: Api.Message) => {
      const client = await getGlobalClient();
      if (!client) {
        await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
        return;
      }

      // 参数解析（严格按acron.ts模式）
      const lines = msg.text?.trim()?.split(/\r?\n/g) || [];
      const parts = lines?.[0]?.split(/\s+/) || [];
      const [, ...args] = parts;
      const sub = (args[0] || "").toLowerCase();

      try {
        // 无参数时显示错误提示
        if (!sub) {
          await msg.edit({
            text: `❌ <b>参数不足</b>\n\n💡 使用 <code>.cmd help</code> 查看帮助`,
            parseMode: "html"
          });
          return;
        }

        // 明确请求帮助时才显示
        if (sub === "help" || sub === "h") {
          await msg.edit({
            text: this.description,
            parseMode: "html"
          });
          return;
        }

        // 业务逻辑
        await msg.edit({ text: "🔄 处理中...", parseMode: "html" });
        
        const result = await this.processCommand(sub, args.slice(1));
        
        await msg.edit({ 
          text: `✅ <b>操作完成</b>\n\n📊 结果: ${htmlEscape(result)}`,
          parseMode: "html"
        });
        
      } catch (error: any) {
        console.error("[TemplatePlugin] 操作失败:", error);
        await msg.edit({ 
          text: `❌ <b>操作失败:</b> ${htmlEscape(error.message)}`,
          parseMode: "html"
        });
      }
    }
  };

  private async processCommand(command: string, args: string[]): Promise<string> {
    // 具体业务逻辑实现
    return `处理命令: ${command}`;
  }
}

export default new TemplatePlugin();
```

---

## 📋 开发检查清单

### ✅ 必须遵循
- [ ] 使用acron.ts参数解析模式
- [ ] 无参数时显示错误提示，不自动显示帮助
- [ ] 明确请求help时才显示帮助文档
- [ ] 所有用户输入必须HTML转义
- [ ] 错误消息格式: `❌ <b>错误:</b> 详情`
- [ ] 使用`parseMode: "html"`
- [ ] 实现完整的错误处理

### ✅ 推荐实现
- [ ] 渐进式用户反馈（如需要）
- [ ] API限制处理
- [ ] 日志记录
- [ ] 权限验证（如需要）
