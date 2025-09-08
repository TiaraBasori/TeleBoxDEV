import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { Api, TelegramClient } from "telegram";
import { getPrefixes } from "@utils/pluginManager";
import { CustomFile } from "telegram/client/uploads";
import { createDirectoryInTemp } from "@utils/pathHelpers";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
const prefixes = getPrefixes();
const mainPrefix = prefixes[0];
class DebugPlugin extends Plugin {
  description: string = `<code>${mainPrefix}id 回复一条消息 或 留空查看当前对话</code> - 获取详细的用户、群组或频道信息
<code>${mainPrefix}entity [id/@name] 或 回复一条消息 或 留空查看当前对话</code> - 获取 entity 信息
<code>${mainPrefix}msg 回复一条消息</code> - 获取 msg 信息
<code>${mainPrefix}echo 回复一条消息</code> - 尝试以原样回复
`;
  cmdHandlers: Record<
    string,
    (msg: Api.Message, trigger?: Api.Message) => Promise<void>
  > = {
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

    entity: async (msg, trigger) => {
      const [cmd, ...args] = msg.message.trim().split(/\s+/);
      const input = args.join("");
      const reply = await msg.getReplyMessage();
      const entity = await msg.client?.getEntity(
        input || reply?.senderId || msg.peerId
      );

      const txt = JSON.stringify(entity, null, 2);
      console.log(txt);

      // if ((entity as any)?.sender) {
      //   console.log("sender", JSON.stringify((entity as any)?.sender, null, 2));
      // }

      try {
        await msg.edit({
          text: `<blockquote expandable>${txt}</blockquote>`,
          parseMode: "html",
        });
      } catch (error: any) {
        // 如果编辑失败且是因为消息过长，则发送文件
        if (
          error.message &&
          (error.message.includes("MESSAGE_TOO_LONG") ||
            error.message.includes("too long"))
        ) {
          const buffer = Buffer.from(txt, "utf-8");
          const dir = createDirectoryInTemp("exit");

          const filename = `entity_${entity?.id}.json`;
          const filePath = path.join(dir, filename);
          fs.writeFileSync(filePath, buffer);
          const size = fs.statSync(filePath).size;
          await (trigger || msg).reply({
            file: new CustomFile(filename, size, filePath),
          });
          fs.unlinkSync(filePath);
        } else {
          // 其他错误则重新抛出
          throw error;
        }
      }
    },
    msg: async (msg, trigger) => {
      const reply = await msg.getReplyMessage();
      if (!reply) {
        await msg.edit({
          text: `请回复一条消息以获取详细信息。`,
        });
        return;
      }
      const txt = JSON.stringify(reply, null, 2);
      console.log(txt);
      // if (reply.media) {
      //   console.log("media", JSON.stringify(reply.media, null, 2));
      // }

      try {
        await msg.edit({
          text: `<blockquote expandable>${txt}</blockquote>`,
          parseMode: "html",
        });
      } catch (error: any) {
        // 如果编辑失败且是因为消息过长，则发送文件
        if (
          error.message &&
          (error.message.includes("MESSAGE_TOO_LONG") ||
            error.message.includes("too long"))
        ) {
          const buffer = Buffer.from(txt, "utf-8");
          const dir = createDirectoryInTemp("exit");

          const filename = `msg_${reply.id}.json`;
          const filePath = path.join(dir, filename);
          fs.writeFileSync(filePath, buffer);
          const size = fs.statSync(filePath).size;
          await (trigger || msg).reply({
            file: new CustomFile(filename, size, filePath),
          });
          fs.unlinkSync(filePath);
        } else {
          // 其他错误则重新抛出
          throw error;
        }
      }
    },
    echo: async (msg, trigger) => {
      const reply = await msg.getReplyMessage();
      if (!reply) {
        await msg.edit({
          text: `请回复一条消息以尝试原样发出`,
        });
        return;
      }
      const txt = JSON.stringify(reply, null, 2);
      console.log(txt);

      // gramjs 支持不全...
      // await (trigger || msg).reply({
      //   message: reply,
      //   formattingEntities: reply.entities,
      // });

      // 将消息中的媒体转换为可发送的 InputMedia（仅处理常见的照片/文件）
      const toInputMedia = (
        media: Api.TypeMessageMedia
      ): Api.TypeInputMedia | undefined => {
        try {
          if (media instanceof Api.MessageMediaPhoto && media.photo) {
            if (media.photo instanceof Api.Photo) {
              const inputPhoto = new Api.InputPhoto({
                id: media.photo.id,
                accessHash: media.photo.accessHash,
                fileReference: media.photo.fileReference,
              });
              return new Api.InputMediaPhoto({
                id: inputPhoto,
                ...(media.spoiler ? { spoiler: true } : {}),
                ...(media.ttlSeconds ? { ttlSeconds: media.ttlSeconds } : {}),
              });
            }
          }
          if (
            media instanceof Api.MessageMediaDocument &&
            media.document &&
            media.document instanceof Api.Document
          ) {
            const inputDoc = new Api.InputDocument({
              id: media.document.id,
              accessHash: media.document.accessHash,
              fileReference: media.document.fileReference,
            });
            return new Api.InputMediaDocument({
              id: inputDoc,
              ...(media.spoiler ? { spoiler: true } : {}),
              ...(media.ttlSeconds ? { ttlSeconds: media.ttlSeconds } : {}),
            });
          }
        } catch (e) {
          console.warn("[debug.echo] 构造 InputMedia 失败", e);
        }
        return undefined;
      };

      const inputMedia = reply.media ? toInputMedia(reply.media) : undefined;

      if (inputMedia) {
        await msg.client?.invoke(
          new Api.messages.SendMedia({
            peer: reply.chatId,
            message: reply.message || "",
            media: inputMedia,
            entities: reply.entities,
            ...(reply.replyTo
              ? {
                  replyTo: new Api.InputReplyToMessage({
                    replyToMsgId: reply.replyTo.replyToMsgId!,
                    quoteText: reply.replyTo.quoteText,
                    quoteEntities: reply.replyTo.quoteEntities,
                    quoteOffset: reply.replyTo.quoteOffset,
                    topMsgId: reply.replyTo.replyToTopId,
                  }),
                }
              : {}),
          })
        );
      } else {
        await msg.client?.invoke(
          new Api.messages.SendMessage({
            peer: reply.chatId,
            message: reply.message,
            entities: reply.entities,
            ...(reply.replyTo
              ? {
                  replyTo: new Api.InputReplyToMessage({
                    replyToMsgId: reply.replyTo.replyToMsgId!,
                    quoteText: reply.replyTo.quoteText,
                    quoteEntities: reply.replyTo.quoteEntities,
                    quoteOffset: reply.replyTo.quoteOffset,
                    topMsgId: reply.replyTo.replyToTopId,
                  }),
                }
              : {}),
          })
        );
      }
      await msg.delete();
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

export default new DebugPlugin();
