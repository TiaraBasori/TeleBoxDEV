import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { Api, TelegramClient } from "telegram";

class IdPlugin extends Plugin {
  description: string = `获取详细的用户、群组或频道信息`;
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    id: async (msg) => {
      const client = await getGlobalClient();
      let targetInfo = "";

      try {
        // 如果有回复消息，优先显示回复信息
        if (msg.replyTo) {
          const repliedMsg = await msg.getReplyMessage();
          if (repliedMsg?.senderId) {
            targetInfo += await formatUserInfo(
              client,
              repliedMsg.senderId,
              "REPLIED USER",
              true
            );
            targetInfo += "\n";
          }
        }

        // 显示消息详细信息
        targetInfo += await formatMessageInfo(msg);
        targetInfo += "\n";

        if (!msg.replyTo) {
          // 没有回复消息时，显示自己的信息
          targetInfo += await formatSelfInfo(client);
          targetInfo += "\n";
        }

        // 显示聊天信息
        targetInfo += await formatChatInfo(client, msg);

        await msg.edit({
          text: targetInfo,
          parseMode: "html",
        });
      } catch (error: any) {
        await msg.edit({
          text: `获取信息时出错: ${error.message}`,
        });
      }
    },
  };
}

// 格式化消息信息
async function formatMessageInfo(msg: Api.Message): Promise<string> {
  try {
    let info = `<b>MESSAGE</b>\n`;

    if (msg.replyTo?.replyToMsgId) {
      info += `· Reply to: <code>${msg.replyTo.replyToMsgId}</code>\n`;
    }

    info += `· ID: <code>${msg.id}</code>\n`;
    info += `· Sender: <code>${msg.senderId || "N/A"}</code>\n`;
    info += `· Chat: <code>${msg.chatId || "N/A"}</code>\n`;

    if (msg.date) {
      info += `· Time: ${new Date(msg.date * 1000).toLocaleString("zh-CN")}\n`;
    }

    if (msg.fwdFrom?.fromId) {
      info += `· Forwarded: <code>${msg.fwdFrom.fromId}</code>\n`;
    }

    return info;
  } catch (error: any) {
    return `<b>MESSAGE</b>\nError: ${error.message}\n`;
  }
}

// 格式化用户信息
async function formatUserInfo(
  client: TelegramClient,
  userId: any,
  title: string = "USER",
  showCommonGroups: boolean = true
): Promise<string> {
  try {
    const user = await client.getEntity(userId);
    let info = `<b>${title}</b>\n`;

    if (user.className === "User") {
      const userEntity = user as Api.User;
      const fullName =
        [userEntity.firstName, userEntity.lastName].filter(Boolean).join(" ") ||
        "N/A";

      info += `· Name: ${fullName}\n`;
      info += `· Username: ${
        userEntity.username ? "@" + userEntity.username : "N/A"
      }\n`;
      info += `· ID: <code>${userEntity.id}</code>\n`;

      if (userEntity.bot) info += `· Type: Bot\n`;
      if (userEntity.verified) info += `· Verified\n`;
      if (userEntity.premium) info += `· Premium\n`;
    } else {
      info += `· ID: <code>${user.id}</code>\n`;
      info += `· Type: ${user.className}\n`;
    }

    return info;
  } catch (error: any) {
    return `<b>${title}</b>\nError: ${error.message}\n`;
  }
}

// 格式化自己的信息
async function formatSelfInfo(client: TelegramClient): Promise<string> {
  try {
    const me = await client.getMe();
    return await formatUserInfo(client, me.id, "SELF", false);
  } catch (error: any) {
    return `<b>SELF</b>\nError: ${error.message}\n`;
  }
}

// 格式化聊天信息
async function formatChatInfo(
  client: TelegramClient,
  msg: Api.Message
): Promise<string> {
  try {
    if (!msg.chatId) {
      return `<b>CHAT</b>\nError: No chat ID\n`;
    }

    const chat = await client.getEntity(msg.chatId);
    let info = "";

    if (chat.className === "User") {
      info += await formatUserInfo(client, chat.id, "PRIVATE", false);
    } else if (
      chat.className === "Chat" ||
      chat.className === "ChatForbidden"
    ) {
      const chatEntity = chat as Api.Chat;
      info += `<b>GROUP</b>\n`;
      info += `· Title: ${chatEntity.title}\n`;
      const groupId = chatEntity.id.toString();
      const fullGroupId = groupId.startsWith("-") ? groupId : `-${groupId}`;
      info += `· ID: <code>${fullGroupId}</code>\n`;
    } else if (chat.className === "Channel") {
      const channelEntity = chat as Api.Channel;
      const isChannel = channelEntity.broadcast;
      info += `<b>${isChannel ? "CHANNEL" : "GROUP"}</b>\n`;
      info += `· Title: ${channelEntity.title}\n`;
      info += `· Username: ${
        channelEntity.username ? "@" + channelEntity.username : "N/A"
      }\n`;
      const chatId = channelEntity.id.toString();
      const fullChatId = chatId.startsWith("-100") ? chatId : `-100${chatId}`;
      info += `· ID: <code>${fullChatId}</code>\n`;

      if (channelEntity.verified) {
        info += `· Verified\n`;
      }
    }

    return info;
  } catch (error: any) {
    return `<b>CHAT</b>\nError: ${error.message}\n`;
  }
}

export default new IdPlugin();
