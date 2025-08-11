import { NewMessageEvent } from "telegram/events";
import { Plugin } from "@utils/pluginBase";
import path from "path";

const PLUGIN_PATH = path.join(process.cwd(), "plugins");

async function getMediaFileName(msg: any): Promise<string> {
  const metadata = msg.media as any;
  return metadata.document.attributes[0].fileName;
}

async function installPlugin(args: string[], msg: any) {
  if (args.length === 1) {
    if (msg.isReply) {
      const replied = await msg.getReplyMessage();
      if (replied?.media) {
        const fileName = await getMediaFileName(replied);
        const filePath = path.join(PLUGIN_PATH, fileName);
        await msg.client?.downloadMedia(replied, { outputFile: filePath });
        // 这里可以添加安装插件的逻辑
        await msg.edit({ text: `安装 ${fileName} 插件成功` });
      } else {
        await msg.edit({ text: "请回复一个插件文件" });
      }
    } else {
      await msg.edit({ text: "请回复某个插件文件或提供 npm 包名" });
    }
  } else {
    // TODO: 处理远程资源安装
    const packageName = args[1];
    await msg.edit({ text: `正在安装 npm 包: ${packageName}...` });
  }
}

const npmPlugin: Plugin = {
    command: "npm",
    description: `
    本地资源: 对某个文件回复 npm install
    远程资源: npm install eat`,
    commandHandler: async (event: NewMessageEvent) => {
        const msg = event.message;
        const text = msg.message;
        const [, ...args] = text.slice(1).split(" ");
        if (args.length === 0) {
            await msg.edit({ text: "请输入完整指令" });
            return;
        }
        
        const cmd = args[0];
        if (cmd === "install") {
            await installPlugin(args, msg);
        }
    },
};

export default npmPlugin;