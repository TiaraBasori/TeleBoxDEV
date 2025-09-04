import { Plugin } from "@utils/pluginBase";
import { Api } from "telegram";
import { SudoDB } from "@utils/sudoDB";
import { sleep } from "telegram/Helpers";
import {
  dealCommandPluginWithMessage,
  getCommandFromMessage,
} from "@utils/pluginManager";

async function handleAdd(msg: Api.Message) {
  if (!msg.isReply) {
    await msg.edit({ text: "请回复一条消息以添加用户。" });
    return;
  }
  const fromId = (await msg.getReplyMessage())?.fromId;
  const user = await msg.client?.getEntity(fromId as any);
  if (user instanceof Api.User) {
    const sudoDB = new SudoDB();
    sudoDB.add(
      Number(user.id),
      user.username || user.firstName || user.lastName || "Unknown"
    );
    sudoDB.close();
    await msg.edit({
      text: `已添加用户：${user.username || "Unknown"} (ID: ${user.id})`,
    });
    await sleep(2000);
    await msg.delete();
  } else {
    await msg.edit({ text: "无法获取用户信息。" });
  }
}

async function handleDel(msg: Api.Message) {
  if (!msg.isReply) {
    await msg.edit({ text: "请回复一条消息以删除用户。" });
    return;
  }
  const fromId = (await msg.getReplyMessage())?.fromId;
  const user = await msg.client?.getEntity(fromId as any);
  if (user instanceof Api.User) {
    const sudoDB = new SudoDB();
    const success = sudoDB.del(Number(user.id));
    sudoDB.close();
    if (success) {
      await msg.edit({
        text: `已删除用户：${
          user.username || user.firstName || user.lastName
        } (ID: ${user.id})`,
      });
      await sleep(2000); // 等待1秒
      await msg.delete();
    } else {
      await msg.edit({ text: "用户不存在或删除失败。" });
    }
  } else {
    await msg.edit({ text: "无法获取用户信息。" });
  }
}

async function handleList(msg: Api.Message) {
  const sudoDB = new SudoDB();
  const users = sudoDB.ls();
  sudoDB.close();
  if (users.length === 0) {
    await msg.edit({ text: "当前没有任何用户。" });
    return;
  }
  const userList = users
    .map((user) => `- <a href="tg://user?id=${user.uid}">${user.username}</a>`)
    .join("\n");
  await msg.edit({ text: `当前用户列表：\n${userList}`, parseMode: "html" });
}

/**
 * sudo 插件
 */
const sudoPlugin: Plugin = {
  command: ["sudo"],
  description:
    `赋予其他用户使用 bot 权限\n` +
    `.sudo add (回复用户消息) - 添加用户\n` +
    `.sudo del (回复用户消息) - 删除用户\n` +
    `.sudo ls - 列出所有用户`,
  cmdHandler: async (msg) => {
    const [, ...args] = msg.message.slice(1).split(" ");
    const command = args[0];
    if (command == "add") {
      await handleAdd(msg);
    } else if (command == "del") {
      await handleDel(msg);
    } else if (command == "ls" || command == "list") {
      await handleList(msg);
    } else {
      await msg.edit({ text: "未知命令，请使用 add、del 或 ls。" });
    }
  },
  listenMessageHandler: async (msg) => {
    const sudoDB = new SudoDB();
    const users = sudoDB.ls().map((user) => user.uid);
    sudoDB.close();
    const fromId = msg.fromId;
    if (!(fromId instanceof Api.PeerUser)) return;
    const userId = fromId.userId;
    if (userId && users.includes(Number(userId))) {
      const cmd = await getCommandFromMessage(msg);
      if (!cmd) return;
      await dealCommandPluginWithMessage({cmd, msg});
      // const sudoMsg = await msg.client?.sendMessage(msg.peerId, {
      //   message: msg.message,
      //   replyTo: msg.replyToMsgId,
      // });
      // if (sudoMsg) {
      //   await dealCommandPluginWithMessage({ cmd: cmd, msg: sudoMsg });
      // }
    }
  },
};

export default sudoPlugin;
