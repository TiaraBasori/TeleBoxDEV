import path from "path";
import fs from "fs";
import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { NewMessageEvent, NewMessage } from "telegram/events";

let prefixs: string[] = ["$", "."];

if (process.env.NODE_ENV === "development") {
  prefixs = ["!", "！"];
}

const plugins: Map<string, Plugin> = new Map();

const USER_PLUGIN_PATH = path.join(process.cwd(), "plugins");
const DEFAUTL_PLUGIN_PATH = path.join(process.cwd(), "src", "plugin");

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
  for (const file of files) {
    const pluginPath = path.resolve(basePath, file);
    const mod = await dynamicRequireWithDeps(pluginPath);
    if (mod) {
      const plugin = mod.default;
      plugins.set(plugin.command, plugin);
    }
  }
}

function getPlugin(command: string): Plugin | undefined {
  return plugins.get(command);
}

function listCommands(): string[] {
  return Array.from(plugins.keys());
}

async function dealCommandPlugin(event: NewMessageEvent) {
  const message = event.message;
  const text = message.message;
  // 检查是否发送到 收藏信息
  const savedMessage = (message as any).savedPeerId;
  if (message.out || savedMessage) {
    if (!prefixs.some((p) => text.startsWith(p))) return;
    const [cmd] = text.slice(1).split(" ");
    const plugin = getPlugin(cmd);
    if (plugin) {
      plugin.commandHandler(event);
    }
  }
}

async function clearPlugins() {
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

  // 设置插件路径
  await setPlugins(USER_PLUGIN_PATH);
  await setPlugins(DEFAUTL_PLUGIN_PATH);

  let client = await getGlobalClient();
  // 注册插件命令处理器
  client.addEventHandler(dealCommandPlugin, new NewMessage({}));
  // TODO: - 让用户可以监听新消息事件，从而可以使用 keyword 等监听事件类型的插件
}

export { loadPlugins, listCommands, getPlugin };
