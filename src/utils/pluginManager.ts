import { Plugin } from "../utils/pluginBase";
import path from "path";
import fs from "fs"
import { NewMessageEvent, NewMessage } from "telegram/events";
import { execSync } from "child_process";
import { getGlobalClient } from "@utils/globalClient";

const prefixs: string[] = ["$", "."];

const plugins: Map<string, Plugin> = new Map();

const USER_PLUGIN_PATH = path.join(process.cwd(), "plugins");
const DEFAUTL_PLUGIN_PATH = path.join(process.cwd(), "src", "plugin");

async function dynamicImportWithDeps(filePath: string) {
  try {
    return await import(filePath);
  } catch (e) {
    const err = e as Error
    const match = err.message.match(/Cannot find module '(.*?)'/);
    if (match) {
      const missingModule = match[1];
      console.log(`📦 正在安装缺失模块: ${missingModule}...`);
      execSync(`npm install ${missingModule}`, { stdio: "inherit" });

      console.log(`✅ 模块 ${missingModule} 安装完成，重新导入插件...`);
      return await import(filePath);
    } else {
      throw e;
    }
  }
}

async function setPlugins(basePath: string) {
    const files = fs.readdirSync(basePath).filter(file=>file.endsWith(".ts"));
    for (const file of files) {
        const pluginPath = path.join(basePath, file);
        const mod = await dynamicImportWithDeps(pluginPath)
        const plugin: Plugin = mod.default
        plugins.set(plugin.command, plugin)
    }
}

function getPlugin(command:string): Plugin | undefined {
    return plugins.get(command)
}

function listCommands(): string[] {
    return Array.from(plugins.keys())
}

async function dealCommandPlugin(event:NewMessageEvent) {
    const message = event.message
    const text = message.message
    if (message.out) {
        if (!prefixs.some(p => text.startsWith(p))) return;
        const [cmd] = text.slice(1).split(" ");
        const plugin = getPlugin(cmd)
        if (plugin) {
            plugin.commandHandler(event)
        }
    }
}

export async function loadPlugins() {
    plugins.clear();
    await setPlugins(USER_PLUGIN_PATH)
    await setPlugins(DEFAUTL_PLUGIN_PATH)

    let client = await getGlobalClient();
    
    client.addEventHandler(dealCommandPlugin, new NewMessage({}))
    // TODO: - 让用户可以监听新消息事件，从而可以使用 keyword 等监听事件类型的插件
}