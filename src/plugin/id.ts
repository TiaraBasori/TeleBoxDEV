import { Plugin } from "@utils/pluginBase";

const idPlugin: Plugin = {
  command: ["id"],
  description: "获取目标用户的ID",
  cmdHandler: async (msg) => {
    if (!msg.replyTo) {
      await msg.edit({ text: "请回复一条消息以获取用户ID" });
      return;
    }
    const repliedMsg = await msg.getReplyMessage();
    const senderId = repliedMsg?.senderId;
    await msg.edit({
      text: `用户ID: <a href="tg://user?id=${senderId}">${senderId}<a/>`,
      parseMode: "html",
    });
  },
};

export default idPlugin;
