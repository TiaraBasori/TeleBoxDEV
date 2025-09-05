import path from "path";
import fs from "fs";
import { isValidPlugin, Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { NewMessageEvent, NewMessage } from "telegram/events";
import { AliasDB } from "./aliasDB";
import { Api, TelegramClient } from "telegram";
import { cronManager } from "./cronManager";

type PluginEntry = {
  original?: string; // 主要用于重定向命令找到初始命令，从而可以调用相应的命令函数，不是重定向的可以不填写
  plugin: Plugin;
};

const validPlugins: Plugin[] = []; // 用来存储有效的插件，防止随意安装东西引起崩溃
const plugins: Map<string, PluginEntry> = new Map();

const USER_PLUGIN_PATH = path.join(process.cwd(), "plugins");
const DEFAUTL_PLUGIN_PATH = path.join(process.cwd(), "src", "plugin");

function getPrefixes(): string[] {
  let prefixes: string[] = [".", "。", "$"];
  if (process.env.NODE_ENV === "development") {
    prefixes = ["!", "！"];
  }
  return prefixes;
}

function dynamicRequireWithDeps(filePath: string) {
  try {
    delete require.cache[require.resolve(filePath)];
    return require(filePath);
  } catch (err) {
    console.error(`Failed to require ${filePath}:`, err);
    return null; // 或者 throw err，看你想如何处理
  }
}

async function setPlugins(basePath: string) {
  const files = fs.readdirSync(basePath).filter((file) => file.endsWith(".ts"));
  const aliasDB = new AliasDB();
  for (const file of files) {
    const pluginPath = path.resolve(basePath, file);
    const mod = await dynamicRequireWithDeps(pluginPath);
    if (!mod) return;
    const plugin = mod.default;
    if (plugin instanceof Plugin && isValidPlugin(plugin)) {
      validPlugins.push(plugin);
      const cmds = Object.keys(plugin.cmdHandlers);
      for (const cmd of cmds) {
        plugins.set(cmd, { plugin });
        const alias = aliasDB.getOriginal(cmd);
        if (alias?.length > 0) {
          alias.forEach((a) => {
            plugins.set(a, { original: cmd, plugin });
          });
        }
      }
    }
  }
  aliasDB.close();
}

function getPluginEntry(command: string): PluginEntry | undefined {
  return plugins.get(command);
}

function listCommands(): string[] {
  const cmds: Map<string, string> = new Map();
  for (const key of plugins.keys()) {
    const entry = plugins.get(key)!;
    if (entry.original) {
      cmds.set(key, `${key}(${entry.original})`);
    } else {
      cmds.set(key, key);
    }
  }
  return Array.from(cmds.values()).sort((a, b) => a.localeCompare(b));
}

function getCommandFromMessage(msg: Api.Message | string): string | null {
  let prefixes = getPrefixes();
  const text = typeof msg === "string" ? msg : msg.message;
  if (!prefixes.some((p) => text.startsWith(p))) return null;
  const [cmd] = text.slice(1).split(" ");
  if (!cmd) return null;
  return cmd;
}

async function dealCommandPluginWithMessage(param: {
  cmd: string;
  msg: Api.Message;
  trigger?: Api.Message;
}) {
  const { cmd, msg, trigger } = param;
  const pluginEntry = getPluginEntry(cmd);
  try {
    if (pluginEntry) {
      const original = pluginEntry.original;
      if (original) {
        await pluginEntry.plugin.cmdHandlers[original](msg, trigger);
      } else {
        await pluginEntry.plugin.cmdHandlers[cmd](msg, trigger);
      }
    } else {
      const availableCommands = listCommands();
      const helpText = `未知命令：<code>${cmd}</code>\n可用命令：${availableCommands
        .map((c) => `<code>${c}</code>`)
        .join(", ")}`;
      await msg.edit({ text: helpText, parseMode: "html" });
    }
  } catch (error) {
    console.log(error);
    await msg.edit({ text: `处理命令时出错：${error}` });
  }
}

async function dealCommandPlugin(event: NewMessageEvent) {
  const msg = event.message;
  // 检查是否发送到 收藏信息
  const savedMessage = (msg as any).savedPeerId;
  if (msg.out || savedMessage) {
    const cmd = getCommandFromMessage(msg);
    if (cmd) {
      await dealCommandPluginWithMessage({ cmd, msg });
    }
  }
}

function dealListenMessagePlugin(client: TelegramClient): void {
  for (const plugin of validPlugins) {
    const messageHandler = plugin.listenMessageHandler;
    if (messageHandler) {
      client.addEventHandler(async (event: NewMessageEvent) => {
        try {
          await messageHandler(event.message);
        } catch (error) {
          console.log("listenMessageHandler error:", error);
        }
      }, new NewMessage());
    }
  }
}

function dealCronPlugin(client: TelegramClient): void {
  for (const plugin of validPlugins) {
    const cronTasks = plugin.cronTasks;
    if (cronTasks) {
      const keys = Object.keys(cronTasks);
      for (const key of keys) {
        const cronTask = cronTasks[key];
        cronManager.set(key, cronTask.cron, async () => {
          await cronTask.handler(client);
        });
      }
    }
  }
}

async function clearPlugins() {
  validPlugins.length = 0;
  plugins.clear();

  let client = await getGlobalClient();
  let handlers = client.listEventHandlers();
  for (const handler of handlers) {
    client.removeEventHandler(handler[1], handler[0]);
  }
}

async function loadPlugins() {
  // 清空现有插件
  await clearPlugins();
  // 清空所有 cron 任务
  cronManager.clear();

  // 设置插件路径
  await setPlugins(USER_PLUGIN_PATH);
  await setPlugins(DEFAUTL_PLUGIN_PATH);

  let client = await getGlobalClient();
  // 注册插件命令处理器
  client.addEventHandler(dealCommandPlugin, new NewMessage());
  // 添加监听新消息事件的处理器
  dealListenMessagePlugin(client);
  // 添加cron事件
  dealCronPlugin(client);
}

export {
  getPrefixes,
  loadPlugins,
  listCommands,
  getPluginEntry,
  dealCommandPluginWithMessage,
  getCommandFromMessage,
};
