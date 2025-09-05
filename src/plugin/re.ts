import { getPrefixes } from "@utils/pluginManager";
import { Plugin } from "@utils/pluginBase";
import { Api, client, TelegramClient } from "telegram";
import { RPCError } from "telegram/errors";
const prefixes = getPrefixes();
const mainPrefix = prefixes[0];
class RePlugin extends Plugin {
  description: string = `复读\n回复一条消息即可复读\n<code>${mainPrefix}re [消息数] [复读次数]</code>`;
  cmdHandlers: Record<
    string,
    (msg: Api.Message, trigger?: Api.Message) => Promise<void>
  > = {
    re: async (msg, trigger) => {
      const [, ...args] = msg.text.slice(1).split(" ");
      const count = parseInt(args[0]) || 1;
      const repeat = parseInt(args[1]) || 1;

      try {
        if (!msg.isReply) {
          await msg.edit({ text: "你必须回复一条消息才能够进行复读" });
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
          if (messages && messages.length > 0) {
            for (const message of messages) {
              await message.forwardTo(msg.peerId);
            }
          }
        }
      } catch (error) {
        if (error instanceof RPCError) {
          if (error.errorMessage == "CHAT_FORWARDS_RESTRICTED") {
            await msg.edit({
              text: "无法复读消息，群组设置禁止复读消息。",
            });
          } else {
            await msg.edit({
              text: error.message || "发生错误，无法复读消息。请稍后再试。",
            });
          }
        } else {
          await msg.edit({
            text: "发生未知错误，无法转发消息。请稍后再试。",
          });
        }
      }
      if (trigger) {
        try {
          await trigger.delete();
        } catch (e) {}
      }
    },
  };
}

const plugin = new RePlugin();

export default plugin;
