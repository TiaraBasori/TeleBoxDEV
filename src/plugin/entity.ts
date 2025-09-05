import { Plugin } from "@utils/pluginBase";

const entityPlugin: Plugin = {
  command: ["entity"],
  description: ".entity [id/@name] 或 回复一条消息 或 留空查看当前对话",
  cmdHandler: async (msg) => {
    const [cmd, ...args] = msg.message.trim().split(/\s+/);
    const input = args.join("");
    const reply = await msg.getReplyMessage();
    const entity = await msg.client?.getEntity(
      input || reply?.senderId || msg.peerId
    );
    msg.edit({
      text: `<code>${JSON.stringify(entity, null, 2)}</code>`,
      parseMode: "html",
    });
  },
};

export default entityPlugin;
