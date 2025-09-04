import { Plugin } from "@utils/pluginBase";
import { Api } from "telegram";
import { SudoDB } from "@utils/sudoDB";
import { sleep } from "telegram/Helpers";
import {
  dealCommandPluginWithMessage,
  getCommandFromMessage,
} from "@utils/pluginManager";

// 简单缓存 sudo 用户 ID，减少频繁 IO
let sudoCache = { ids: [] as number[], ts: 0 };
const SUDO_CACHE_TTL = 10_000; // 10s

function withSudoDB<T>(fn: (db: SudoDB) => T): T {
  const db = new SudoDB();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
function refreshSudoCache() {
  sudoCache.ids = withSudoDB((db) => db.ls().map((u) => u.uid));
  sudoCache.ts = Date.now();
}
function getSudoIds() {
  if (Date.now() - sudoCache.ts > SUDO_CACHE_TTL) refreshSudoCache();
  return sudoCache.ids;
}

function extractUid(from: any): number | null {
  const raw = from?.channelId || from?.userId;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function buildDisplay(uid: number, entity: any, isChannel: boolean) {
  const parts: string[] = [];
  if (entity?.title) parts.push(entity.title);
  if (entity?.firstName) parts.push(entity.firstName);
  if (entity?.lastName) parts.push(entity.lastName);
  if (entity?.username) parts.push(`@${entity.username}`);
  parts.push(
    isChannel
      ? `<a href="https://t.me/c/${uid}">${uid}</a>`
      : `<a href="tg://user?id=${uid}">${uid}</a>`
  );
  return parts.join(" ").trim();
}

async function handleAddDel(
  msg: Api.Message,
  target: string,
  action: "add" | "del"
) {
  let entity: any;
  let uid: any;
  let display: any;
  if (target) {
    try {
      entity = await msg.client?.getEntity(target);
      uid = entity?.id;
      if (!uid) {
        await msg.edit({ text: "无法获取用户 ID" });
        return;
      }
      uid = Number(uid);
      display = buildDisplay(uid, entity, !!entity?.channelId);
    } catch {
      await msg.edit({ text: "无法获取用户信息" });
      return;
    }
  } else {
    if (!msg.isReply) {
      await msg.edit({ text: "请回复目标用户的消息或带上 uid/@username" });
      return;
    }
    const reply = await msg.getReplyMessage();
    if (!reply) {
      await msg.edit({ text: "无法获取回复消息" });
      return;
    }
    uid = extractUid(reply.fromId as any);
    if (!uid) {
      await msg.edit({ text: "无法获取用户 ID" });
      return;
    }
    try {
      entity = await msg.client?.getEntity(uid);
    } catch {
      /* ignore */
    }
    display = buildDisplay(uid, entity, !!(reply.fromId as any)?.channelId);
  }

  withSudoDB((db) => {
    if (action === "add") db.add(uid, display);
    else db.del(uid);
  });
  sudoCache.ts = 0; // 失效缓存

  await msg.edit({
    text: `已${action === "add" ? "添加" : "删除"}: ${display}`,
    parseMode: "html",
  });
  await sleep(2000);
  await msg.delete();
}

async function handleList(msg: Api.Message) {
  const users = withSudoDB((db) => db.ls());
  if (users.length === 0) {
    await msg.edit({ text: "当前没有任何用户" });
    return;
  }
  await msg.edit({
    text: `当前用户列表：\n${users.map((u) => "- " + u.username).join("\n")}`,
    parseMode: "html",
  });
}

const sudoPlugin: Plugin = {
  command: ["sudo"],
  description: `赋予其他用户使用 bot 权限\n.sudo add (回复目标用户的消息或带上 uid/@username) - 添加用户\n.sudo del (回复目标用户的消息或带上 uid/@username) - 删除用户\n.sudo ls - 列出所有用户`,
  cmdHandler: async (msg) => {
    const parts = msg.message.trim().split(/\s+/);
    const command = parts[1];
    const target = parts[2];
    if (command === "add" || command === "del") {
      await handleAddDel(msg, target, command);
      return;
    }
    if (command === "ls" || command === "list") {
      await handleList(msg);
      return;
    }
    await msg.edit({ text: "未知命令，请使用 add、del 或 ls" });
  },
  listenMessageHandler: async (msg) => {
    const uid = extractUid(msg.fromId as any);
    if (!uid) return;
    if (!getSudoIds().includes(uid)) return;
    const cmd = await getCommandFromMessage(msg);
    if (!cmd) return;
    const sudoMsg = await msg.client?.sendMessage(msg.peerId, {
      message: msg.message,
      replyTo: msg.replyToMsgId,
    });
    if (sudoMsg) await dealCommandPluginWithMessage({ cmd, msg: sudoMsg });
  },
};

export default sudoPlugin;
