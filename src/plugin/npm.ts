import { Plugin } from "@utils/pluginBase";
import { loadPlugins } from "@utils/pluginManager";
import path from "path";
import fs from "fs";
import axios from "axios";
import { Api } from "telegram";

const PLUGIN_PATH = path.join(process.cwd(), "plugins");

async function getMediaFileName(msg: any): Promise<string> {
  const metadata = msg.media as any;
  return metadata.document.attributes[0].fileName;
}

async function installRemotePlugin(plugin: string, msg: Api.Message) {
  await msg.edit({ text: `正在安装插件 ${plugin}...` });
  const url = `https://github.com/TeleBoxDev/TeleBox_Plugins/blob/main/plugins.json?raw=true`;
  const res = await axios.get(url);
  if (res.status === 200) {
    if (!res.data[plugin]) {
      await msg.edit({ text: `未找到插件 ${plugin} 的远程资源` });
      return;
    }
    const pluginUrl = res.data[plugin].url;
    const response = await axios.get(pluginUrl);
    if (response.status !== 200) {
      await msg.edit({ text: `无法下载插件 ${plugin}` });
      return;
    }
    // 保存插件文件
    const filePath = path.join(PLUGIN_PATH, `${plugin}.ts`);
    fs.writeFileSync(filePath, response.data);
    await msg.edit({ text: `插件 ${plugin} 已安装并加载成功` });
    await loadPlugins(); // 重新加载插件
  } else {
    await msg.edit({ text: `无法获取远程插件库` });
  }
}

async function installPlugin(args: string[], msg: Api.Message) {
  if (args.length === 1) {
    if (msg.isReply) {
      const replied = await msg.getReplyMessage();
      if (replied?.media) {
        const fileName = await getMediaFileName(replied);
        const filePath = path.join(PLUGIN_PATH, fileName);
        await msg.client?.downloadMedia(replied, { outputFile: filePath });
        // 这里可以添加安装插件的逻辑
        await loadPlugins();
        await msg.edit({ text: `插件 ${fileName} 已安装并加载成功` });
      } else {
        await msg.edit({ text: "请回复一个插件文件" });
      }
    } else {
      await msg.edit({ text: "请回复某个插件文件或提供 npm 包名" });
    }
  } else {
    const packageName = args[1];
    await installRemotePlugin(packageName, msg);
  }
}

async function uninstallPlugin(plugin: string, msg: Api.Message) {
  if (!plugin) {
    await msg.edit({ text: "请提供要卸载的插件名称" });
    return;
  }
  const pluginPath = path.join(PLUGIN_PATH, `${plugin}.ts`);
  if (fs.existsSync(pluginPath)) {
    fs.unlinkSync(pluginPath);
    await msg.edit({ text: `插件 ${plugin} 已卸载` });
  } else {
    await msg.edit({ text: `未找到插件 ${plugin}` });
  }
  await loadPlugins(); // 重新加载插件
}

async function uploadPlugin(args: string[], msg: Api.Message) {
  const pluginName = args[1];
  if (!pluginName) {
    await msg.edit({ text: "请提供插件名称" });
    return;
  }
  const pluginPath = path.join(PLUGIN_PATH, `${pluginName}.ts`);
  if (!fs.existsSync(pluginPath)) {
    await msg.edit({ text: `未找到插件 ${pluginName}` });
    return;
  }
  await msg.client?.sendFile(msg.peerId, {
    file: pluginPath,
    thumb: path.join(process.cwd(), "telebox.png"),
    caption: `**TeleBox_Plugin ${pluginName} plugin.**`,
  });
  await msg.delete();
}

async function search(msg: Api.Message) {
  const url = `https://github.com/TeleBoxDev/TeleBox_Plugins/blob/main/plugins.json?raw=true`;
  const res = await axios.get(url);
  if (res.status === 200) {
    const plugins = Object.keys(res.data);
    
    // 插件描述映射
    const pluginDescriptions: { [key: string]: string } = {
      "aban": "用户权限管理，多群组操作",
      "bulk_delete": "批量删除消息工具",
      "clean_member": "群组成员清理工具",
      "da": "删除群内所有消息",
      "dc": "获取数据中心信息",
      "dig": "DNS 查询工具",
      "dme": "删除自己的消息",
      "eat": "生成吃掉表情包",
      "forward_cron": "定时转发消息",
      "gpt": "OpenAI GPT 聊天助手",
      "gt": "谷歌翻译插件",
      "ip": "IP 地址查询工具",
      "keyword": "关键词自动回复",
      "komari": "服务器监控插件",
      "lottery": "群组抽奖系统",
      "music": "YouTube 音乐下载",
      "netease": "网易云音乐播放",
      "pin_cron": "定时置顶消息",
      "pm2": "PM2 进程管理",
      "pmcaptcha": "私聊验证系统",
      "q": "消息引用生成器",
      "search": "频道消息搜索",
      "send_cron": "定时发送消息",
      "shift": "智能消息转发",
      "speednext": "网络速度测试",
      "yt-dlp": "YouTube 视频下载"
    };
    
    const pluginList = plugins.map(plugin => {
      const description = pluginDescriptions[plugin] || "暂无描述";
      return `• <code>${plugin}</code> - ${description}`;
    }).join("\n");
    
    const installTip = `\n\n💡 <b>安装方法:</b> <code>npm i &lt;插件名&gt;</code>`;
    const repoLink = `\n\n🔗 <b>插件仓库:</b> <a href="https://github.com/TeleBoxDev/TeleBox_Plugins">TeleBox_Plugins</a>`;
    
    // 确保消息不超过Telegram限制
    await msg.edit({ 
      text: `🔍 <b>远程插件列表:</b>\n\n${pluginList}${installTip}${repoLink}`,
      parseMode: "html"
    });
  } else {
    await msg.edit({ text: `❌ 无法获取远程插件库` });
  }
}

const npmPlugin: Plugin = {
  command: ["npm"],
  description:
    `本地资源: 对某个文件回复 npm install\n` +
    `远程资源: npm install <plugin_name> || npm i <plugin_name>\n` +
    `卸载插件: npm remove <plugin_name> || npm rm <plugin_name> || npm un <plugin_name> || npm uninstall <plugin_name>
    `,
  cmdHandler: async (msg) => {
    const text = msg.message;
    const [, ...args] = text.split(" ");
    if (args.length === 0) {
      await msg.edit({ text: "请输入完整指令" });
      return;
    }

    const cmd = args[0];
    if (cmd === "install" || cmd === "i") {
      await installPlugin(args, msg);
    } else if (
      cmd === "uninstall" ||
      cmd == "un" ||
      cmd === "remove" ||
      cmd === "rm"
    ) {
      await uninstallPlugin(args[1], msg);
    } else if (cmd == "upload") {
      await uploadPlugin(args, msg);
    } else if (cmd === "search") {
      await search(msg);
    }
  },
};

export default npmPlugin;
