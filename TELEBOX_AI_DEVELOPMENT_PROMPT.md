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

// HTML解析
import * as cheerio from "cheerio";

// YouTube
import { Innertube } from "youtubei.js";
import ytdl from "@distube/ytdl-core";
```

### 必需工具函数

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

### Plugin 基类（实际实现）

```typescript
abstract class Plugin {
  // 必需属性（abstract） - 必须实现，否则插件无法加载
  abstract description: string | ((...args: any[]) => string | void) | ((...args: any[]) => Promise<string | void>);
  abstract cmdHandlers: Record<string, (msg: Api.Message, trigger?: Api.Message) => Promise<void>>;
  
  // 可选属性
  listenMessageHandler?: (msg: Api.Message) => Promise<void>;
  eventHandlers?: Array<{ event?: any; handler: (event: any) => Promise<void> }>;
  cronTasks?: Record<string, { cron: string; description: string; handler: (client: TelegramClient) => Promise<void> }>;
}

// ⚠️ 重要说明：
// 1. description 和 cmdHandlers 是 abstract，必须在子类中实现
// 2. cmdHandlers 支持可选的 trigger 参数，用于处理触发消息
// 3. eventHandlers 是新增的扩展功能，用于处理 Telegram 事件
```

### Message API

#### ⚠️ Telegram 消息限制

**每条消息最大 4096 字符：**
- 超过限制会抛出 `MESSAGE_TOO_LONG` 错误
- 需要分割长消息或使用文件发送
- HTML 标签也计入字符数

```typescript
// 消息长度检查和分割
const MAX_MESSAGE_LENGTH = 4096;

function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) {
    return [text];
  }
  
  const parts: string[] = [];
  let currentPart = "";
  const lines = text.split("\n");
  
  for (const line of lines) {
    if (currentPart.length + line.length + 1 > MAX_MESSAGE_LENGTH) {
      parts.push(currentPart);
      currentPart = line;
    } else {
      currentPart += (currentPart ? "\n" : "") + line;
    }
  }
  
  if (currentPart) {
    parts.push(currentPart);
  }
  
  return parts;
}

// 发送长消息
async function sendLongMessage(msg: Api.Message, text: string) {
  const parts = splitMessage(text);
  
  if (parts.length === 1) {
    await msg.edit({ text: parts[0], parseMode: "html" });
  } else {
    // 编辑第一部分
    await msg.edit({ 
      text: parts[0] + "\n\n📄 (1/" + parts.length + ")", 
      parseMode: "html" 
    });
    
    // 发送剩余部分
    for (let i = 1; i < parts.length; i++) {
      await msg.reply({ 
        message: parts[i] + "\n\n📄 (" + (i + 1) + "/" + parts.length + ")",
        parseMode: "html" 
      });
    }
  }
}
```

#### Message 接口定义

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

#### ⚠️ 数据库使用优先级

**优先使用 lowdb，特别是配置和Cookie类数据：**
- lowdb 自动保存，简单易用
- 适合配置、Cookie、用户偏好等数据
- 支持自动持久化，无需手动管理事务

```typescript
// ✅ 推荐：使用 lowdb 存储配置和Cookie
import { JSONFilePreset } from "lowdb/node";
import path from "path";

interface ConfigData {
  cookies: Record<string, string>;
  apiKeys: Record<string, string>;
  settings: Record<string, any>;
}

// 初始化数据库
const dbPath = path.join(process.cwd(), "assets", "plugin_config.json");
const defaultData: ConfigData = {
  cookies: {},
  apiKeys: {},
  settings: {}
};

const db = await JSONFilePreset<ConfigData>(dbPath, defaultData);

// 保存Cookie（自动持久化）
db.data.cookies["youtube"] = "cookie_value";
await db.write(); // 自动保存到文件

// 读取Cookie
const cookie = db.data.cookies["youtube"];

// 完整的Cookie管理示例
class CookieManager {
  private db: any;
  
  async init() {
    this.db = await JSONFilePreset<ConfigData>(dbPath, defaultData);
  }
  
  async setCookie(key: string, value: string) {
    this.db.data.cookies[key] = value;
    await this.db.write(); // 自动保存
  }
  
  getCookie(key: string): string | undefined {
    return this.db.data.cookies[key];
  }
  
  async clearCookie(key: string) {
    delete this.db.data.cookies[key];
    await this.db.write(); // 自动保存
  }
}
```

#### SQLite（用于大量数据或复杂查询）

```typescript
// 仅在需要复杂查询或大量数据时使用
const db = new Database(dbPath);
db.prepare(sql: string): Statement;
db.exec(sql: string): void;
db.transaction(fn: Function): Function;

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
// 必须定义 help_text
const help_text = `📋 <b>示例插件</b>

<b>命令：</b>
• <code>.example query</code> - 查询数据
• <code>.example process</code> - 处理数据
• <code>.example help</code> - 显示帮助`;

class ExamplePlugin extends Plugin {
  // 必须在 description 中引用 help_text
  description: string = `示例插件\n\n${help_text}`;
  
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
          // 显示当前子命令的帮助
          const subCmd = sub;
          // 根据 subCmd 显示对应的帮助信息...
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

#### 帮助文本定义要求

**所有插件必须定义 `help_text` 常量，并在 `description` 中引用：**

```typescript
// ✅ 正确：定义 help_text 常量
const help_text = `📝 <b>插件名称</b>

<b>命令格式：</b>
<code>.cmd [子命令] [参数]</code>

<b>可用命令：</b>
• <code>.cmd sub1</code> - 子命令1说明
• <code>.cmd sub2</code> - 子命令2说明
• <code>.cmd help</code> - 显示帮助

<b>示例：</b>
<code>.cmd sub1### ✅ 必须遵循（强制要求）
- [ ] **实现 description 和 cmdHandlers**（abstract 属性，必需）
- [ ] **定义 `const help_text` 常量并在 description 中引用**
  - 格式：`const help_text = "帮助内容";`
  - 引用：`description: string = \`插件简介\\n\\n${help_text}\`;`
- [ ] **所有用户输入必须HTML转义**（安全红线，不可妥协）
- [ ] **优先使用 lowdb 存储配置和Cookie**（自动保存，无需手动管理）
- [ ] **注意 Telegram 消息长度限制 4096 字符**（超长需分割发送）
- [ ] 明确区分独立子指令和附属子指令（别名）   if (!args[0]) {
        await msg.edit({
          text: help_text,
          parseMode: "html"
        });
      }
{{ ... }}
    }
  };
}
```

#### 指令类型区分

1. **完全独立的子指令**（如 aban.ts）
   - 每个子命令是独立的处理函数
   - 在 `cmdHandlers` 中注册为独立的键值对
   - 直接作为主命令使用，无需主命令前缀
   - 示例：`kick`、`ban`、`unban`、`mute` 等都是独立命令
   ```typescript
   cmdHandlers = {
     kick: handleKickCommand,
     ban: handleBanCommand,
     unban: handleUnbanCommand,
     mute: handleMuteCommand
   }
   // 使用方式：.kick @user、.ban @user、.unban @user
   ```

2. **附属子指令（别名）**
   - 作为主命令的参数，不是独立命令
   - 在单个处理函数内部通过参数解析区分
   - 必须配合主命令使用
   - 帮助文档中子命令要带主命令前缀，方便复制
   - 示例：`music` 插件的子命令
   ```typescript
   cmdHandlers = {
     music: async (msg) => {
       const sub = args[0]; // search、cookie、help 等
       switch(sub) {
         case 'search': // 处理搜索
         case 'cookie': // 处理cookie
         case 'help': // 显示帮助
       }
     }
   }
   // 使用方式：.music search 歌名、.music cookie set、.music help
   ```

3. **双向帮助支持**
   - 必须定义 `const help_text` 变量
   - 必须在 `description` 中使用 `${help_text}`
   - 支持 `.cmd help` 显示总帮助
   - 支持 `.cmd help subcommand` 显示子命令帮助
   - 支持 `.cmd subcommand help` 显示子命令帮助
   - 无参数时可以显示 help_text 或错误提示

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

### 指令注册示例对比

#### 独立子指令模式（推荐用于功能独立的命令）
```typescript
// aban.ts 风格 - 每个命令都是独立的
class BanPlugin extends Plugin {
  cmdHandlers = {
    kick: async (msg) => { /* 踢人逻辑 */ },
    ban: async (msg) => { /* 封禁逻辑 */ },
    unban: async (msg) => { /* 解封逻辑 */ },
    mute: async (msg) => { /* 禁言逻辑 */ },
    sb: async (msg) => { /* 批量封禁逻辑 */ }
  }
}
// 用户使用：.kick @user、.ban @user、.unban @user
```

#### 附属子指令模式（推荐用于功能相关的命令组）
```typescript
// music.ts 风格 - 所有子命令共享一个处理函数
class MusicPlugin extends Plugin {
  cmdHandlers = {
    music: async (msg) => {
      const [sub, ...args] = msg.message.split(' ').slice(1);
      switch(sub) {
        case 'search': await this.handleSearch(args);
        case 'cookie': await this.handleCookie(args);
        case 'help': await this.showHelp();
      }
    }
  }
}
// 用户使用：.music search 歌名、.music cookie set、.music help
```

#### 3. 混合模式示例 - encode.ts（编码工具）
```typescript
class EncodePlugin extends Plugin {
  cmdHandlers = {
    // b64 和 url 是独立命令
    b64: async (msg) => {
      const [action, ...text] = parseArgs(msg.message);
      // encode/decode 是 b64 的附属子指令
      if (action === 'encode') await this.b64Encode(text);
      if (action === 'decode') await this.b64Decode(text);
    },
    
    url: async (msg) => {
      const [action, ...text] = parseArgs(msg.message);
      // encode/decode 是 url 的附属子指令
      if (action === 'encode') await this.urlEncode(text);
      if (action === 'decode') await this.urlDecode(text);
    }
  }
}

// 用户使用
// .b64 encode 你好世界
// .b64 decode SGVsbG8gV29ybGQ=
// .url encode https://example.com?q=你好
```

### 实际插件示例对比

#### 1. 独立子指令插件示例 - aban.ts（封禁管理）
```typescript
class AbanPlugin extends Plugin {
  cmdHandlers = {
    // 每个命令都是独立注册的
    kick: handleKickCommand,     // .kick @user
    ban: handleBanCommand,        // .ban @user  
    unban: handleUnbanCommand,    // .unban @user
    mute: handleMuteCommand,      // .mute @user 60
    unmute: handleUnmuteCommand,  // .unmute @user
    sb: handleSuperBanCommand,    // .sb @user
    unsb: handleUnSuperBan,       // .unsb @user
    refresh: handleRefreshCommand // .refresh
  }
}

// 用户直接使用每个命令
// .kick @spammer
// .ban @advertiser 广告
// .mute @flooder 30
```

#### 2. 附属子指令插件示例 - music.ts（音乐下载）
```typescript
class MusicPlugin extends Plugin {
  cmdHandlers = {
    music: async (msg) => {
      const [sub, ...args] = parseArgs(msg.message);
      
      // 所有子命令都在这个函数内处理
      switch(sub) {
        case 'search':
        case 's':
          await this.searchMusic(args.join(' '));
          break;
          
        case 'cookie':
          const action = args[0];
          if (action === 'set') await this.setCookie(args.slice(1));
          if (action === 'get') await this.getCookie();
          if (action === 'clear') await this.clearCookie();
          break;
          
        case 'help':
        case 'h':
          await this.showHelp();
          break;
          
        default:
          // 默认行为：直接搜索
          await this.searchMusic(msg.message.slice(6));
      }
    }
  }
}

// 用户使用主命令 + 子命令
// .music search 周杰伦 晴天
// .music cookie set [cookie内容]
// .music help
```

#### 3. 混合模式示例 - encode.ts（编码工具）
```typescript
class EncodePlugin extends Plugin {
  cmdHandlers = {
    // b64 和 url 是独立命令
    b64: async (msg) => {
      const [action, ...text] = parseArgs(msg.message);
      // encode/decode 是 b64 的附属子指令
      if (action === 'encode') await this.b64Encode(text);
      if (action === 'decode') await this.b64Decode(text);
    },
    
    url: async (msg) => {
      const [action, ...text] = parseArgs(msg.message);
      // encode/decode 是 url 的附属子指令
      if (action === 'encode') await this.urlEncode(text);
      if (action === 'decode') await this.urlDecode(text);
    }
  }
}

// 用户使用
// .b64 encode 你好世界
// .b64 decode SGVsbG8gV29ybGQ=
// .url encode https://example.com?q=你好
```

### 选择指南

#### 何时使用独立子指令？
- ✅ 每个命令功能完全独立
- ✅ 命令之间没有共享状态或配置
- ✅ 用户习惯直接使用短命令
- ✅ 命令数量较少（通常 < 10个）

#### 何时使用附属子指令？
- ✅ 命令组功能相关，共享配置或状态
- ✅ 需要统一的参数解析逻辑
- ✅ 子命令较多或可能扩展
- ✅ 需要默认行为（无子命令时）

### 使用示例
```
.b64 encode Hello World
.b64 decode SGVsbG8gV29ybGQ=
.url encode 你好世界
.url decode %E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C
.b64 help
.url help
```

### 常见错误示例

#### ❌ 错误：混淆指令类型
```typescript
// 错误：试图将附属子指令注册为独立命令
class WrongPlugin extends Plugin {
  cmdHandlers = {
    music: handleMusic,
    search: handleSearch,  // ❌ search 应该是 music 的子命令
    cookie: handleCookie   // ❌ cookie 应该是 music 的子命令
  }
}
```

#### ✅ 正确：保持指令层级清晰
```typescript
class CorrectPlugin extends Plugin {
  cmdHandlers = {
    music: async (msg) => {
      const [sub] = parseArgs(msg.message);
      if (sub === 'search') { /* ... */ }
      if (sub === 'cookie') { /* ... */ }
    }
  }
}
```

### 帮助文档最佳实践

#### 独立子指令的帮助文档
```typescript
// ✅ 必须定义 help_text 常量
const help_text = `🛡️ <b>封禁管理插件</b>

<b>可用命令：</b>
• <code>kick</code> - 踢出用户
• <code>ban</code> - 封禁用户  
• <code>unban</code> - 解封用户
• <code>mute</code> - 禁言用户

<b>使用方式：</b>
每个命令可独立使用，例如：
<code>.kick @user</code>
<code>.ban @user 原因</code>`;

class AbanPlugin extends Plugin {
  // ✅ 必须在 description 中引用 help_text
  description: string = `封禁管理插件\n\n${help_text}`;
}
```

#### 附属子指令的帮助文档
```typescript
// ✅ 必须定义 help_text 常量
const help_text = `🎵 <b>音乐下载插件</b>

<b>命令格式：</b>
<code>.music [子命令] [参数]</code>

<b>子命令：</b>
• <code>.music search</code> 或 <code>.music s</code> - 搜索音乐
• <code>.music cookie set</code> - 设置Cookie
• <code>.music cookie get</code> - 查看Cookie状态
• <code>.music help</code> 或 <code>.music h</code> - 显示帮助

<b>示例：</b>
<code>.music search 周杰伦 晴天</code>
<code>.music cookie set [内容]</code>
<code>.music 歌名</code> - 直接搜索（默认行为）`;

class MusicPlugin extends Plugin {
  // ✅ 必须在 description 中引用 help_text
  description: string = `音乐下载插件\n\n${help_text}`;
}
```
