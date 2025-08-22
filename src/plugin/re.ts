import { Plugin } from "@utils/pluginBase";
import { RPCError } from "telegram/errors";

const rePlugin: Plugin = {
  command: "re",
  description: "转发消息",
  cmdHandler: async (msg) => {
    const [, ...args] = msg.text.slice(1).split(" ");
    const count = parseInt(args[0]) || 1;
    const repeat = parseInt(args[1]) || 1;

    try {
      if (!msg.isReply) {
        await msg.edit({ text: "你必须回复一条消息才能够进行转发" });
        return;
      }
      let replied = await msg.getReplyMessage();
      const messages = await msg.client?.getMessages(replied?.peerId, {
        offsetId: replied!.id - 1,
        limit: count,
        reverse: true,
      });
      await msg.delete();
      for (let i = 0; i < repeat; i++) {
        if (messages) {
          for (const message of messages) {
            await message.forwardTo(msg.peerId);
          }
        }
      }
    } catch (error) {
      if (error instanceof RPCError) {
        if (error.errorMessage == "CHAT_FORWARDS_RESTRICTED") {
          await msg.edit({
            text: "无法转发消息，群组设置禁止转发消息。",
          });
        } else {
          await msg.edit({
            text: error.message || "发生错误，无法转发消息。请稍后再试。",
          });
        }
      } else {
        await msg.edit({
          text: "发生未知错误，无法转发消息。请稍后再试。",
        });
      }
    }
  },
};

export default rePlugin;
