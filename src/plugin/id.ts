import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { Api, TelegramClient } from "telegram";

const idPlugin: Plugin = {
  command: ["id"],
  description: "获取详细的用户、群组或频道信息",
  cmdHandler: async (msg) => {
    const client = await getGlobalClient();
    let targetInfo = "";
    
    try {
      // 如果有回复消息，显示被回复用户的信息
      if (msg.replyTo) {
        const repliedMsg = await msg.getReplyMessage();
        if (repliedMsg?.senderId) {
          targetInfo += await formatUserInfo(client, repliedMsg.senderId, "被回复用户信息", true);
        }
      } else {
        // 没有回复消息时，显示当前聊天和自己的信息
        targetInfo += await formatSelfInfo(client);
        targetInfo += "\n" + "═".repeat(30) + "\n\n";
        targetInfo += await formatChatInfo(client, msg);
      }
      
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

// 格式化用户信息
async function formatUserInfo(client: TelegramClient, userId: any, title: string = "用户信息", showCommonGroups: boolean = true): Promise<string> {
  try {
    const user = await client.getEntity(userId);
    let info = `🔍 <b>${title}</b>
`;
    
    // 检查是否为用户类型
    if (user.className === "User") {
      const userEntity = user as Api.User;
      
      // 基本信息
      const fullName = [userEntity.firstName, userEntity.lastName].filter(Boolean).join(" ") || "无";
      info += `👤 <b>姓名:</b> ${fullName}\n`;
      info += `🏷️ <b>用户名:</b> ${userEntity.username ? "@" + userEntity.username : "无"}\n`;
      info += `🆔 <b>用户ID:</b> <code>${userEntity.id}</code>\n`;
      
      try {
        // 简介
        const fullUser = await client.invoke(new Api.users.GetFullUser({ id: userEntity }));
        if (fullUser.fullUser.about) {
          info += `📝 <b>简介:</b> ${fullUser.fullUser.about}\n`;
        }
        
        // 共同群组数量（仅在回复时显示）
        if (showCommonGroups) {
          try {
            const commonChats = await client.invoke(new Api.messages.GetCommonChats({
              userId: userEntity.id,
              maxId: userEntity.id.multiply(0),
              limit: 100
            }));
            info += `👥 <b>共同群组:</b> ${commonChats.chats.length} 个\n`;
          } catch (e) {
            info += `👥 <b>共同群组:</b> 无法获取\n`;
          }
        }
      } catch (e) {
        // 忽略获取详细信息的错误
      }
      
      // 状态信息
      info += "\n📊 <b>状态信息</b>\n";
      info += `${userEntity.verified ? "✅" : "❌"} <b>官方认证:</b> ${userEntity.verified ? "已认证" : "未认证"}\n`;
      info += `${userEntity.restricted ? "🚫" : "✅"} <b>账户状态:</b> ${userEntity.restricted ? "受限" : "正常"}\n`;
      
      // 用户类型
      let userType = "👤 普通用户";
      if (userEntity.bot) userType = "🤖 机器人";
      if (userEntity.premium) userType += " 💎";
      if (userEntity.fake) userType += " ⚠️ 虚假";
      if (userEntity.scam) userType += " 🚨 诈骗";
      info += `🏷️ <b>用户类型:</b> ${userType}\n`;
    } else {
      info += `🆔 <b>用户ID:</b> <code>${user.id}</code>\n`;
      info += `📋 <b>类型:</b> ${user.className}\n`;
    }
    
    return info;
  } catch (error: any) {
    return `❌ <b>${title}</b>\n获取用户信息失败: ${error.message}\n`;
  }
}

// 格式化自己的信息
async function formatSelfInfo(client: TelegramClient): Promise<string> {
  try {
    const me = await client.getMe();
    return await formatUserInfo(client, me.id, "我的信息", false);
  } catch (error: any) {
    return `❌ <b>我的信息</b>\n获取自己信息失败: ${error.message}\n`;
  }
}

// 格式化聊天信息
async function formatChatInfo(client: TelegramClient, msg: Api.Message): Promise<string> {
  try {
    if (!msg.chatId) {
      return `❌ <b>聊天信息</b>\n无法获取聊天ID\n`;
    }
    
    const chat = await client.getEntity(msg.chatId);
    let info = "";
    
    if (chat.className === "User") {
      // 私聊
      info += await formatUserInfo(client, chat.id, "私聊对象信息", false);
    } else if (chat.className === "Chat" || chat.className === "ChatForbidden") {
      // 群组
      const chatEntity = chat as Api.Chat;
      info += `👥 <b>群组信息</b>
`;
      info += `📝 <b>标题:</b> ${chatEntity.title}\n`;
      info += `🏷️ <b>群组类型:</b> 普通群组\n`;
      // 普通群组ID保持原样，但确保格式正确
      const groupId = chatEntity.id.toString();
      const fullGroupId = groupId.startsWith('-') ? groupId : `-${groupId}`;
      info += `🆔 <b>群组ID:</b> <code>${fullGroupId}</code>\n`;
      info += `💬 <b>消息ID:</b> <code>${msg.id}</code>\n`;
      if (msg.replyTo?.replyToMsgId) {
        info += `↩️ <b>回复消息ID:</b> <code>${msg.replyTo.replyToMsgId}</code>\n`;
      }
      info += `🏷️ <b>用户名:</b> 无\n`;
    } else if (chat.className === "Channel") {
      // 频道或超级群组
      const channelEntity = chat as Api.Channel;
      const isChannel = channelEntity.broadcast;
      const icon = isChannel ? "📢" : "👥";
      info += `${icon} <b>${isChannel ? "频道" : "超级群组"}信息</b>
`;
      info += `📝 <b>标题:</b> ${channelEntity.title}\n`;
      info += `🏷️ <b>用户名:</b> ${channelEntity.username ? "@" + channelEntity.username : "无"}\n`;
      // 转换为正确的群组/频道ID格式
      const chatId = channelEntity.id.toString();
      const fullChatId = chatId.startsWith('-100') ? chatId : `-100${chatId}`;
      info += `🆔 <b>${isChannel ? "频道" : "群组"}ID:</b> <code>${fullChatId}</code>\n`;
      info += `💬 <b>消息ID:</b> <code>${msg.id}</code>\n`;
      if (msg.replyTo?.replyToMsgId) {
        info += `↩️ <b>回复消息ID:</b> <code>${msg.replyTo.replyToMsgId}</code>\n`;
      }
      
      // 获取详细信息
      try {
        const fullChat = await client.invoke(new Api.channels.GetFullChannel({ channel: channelEntity }));
        if (fullChat.fullChat.about) {
          info += `📝 <b>简介:</b> ${fullChat.fullChat.about}\n`;
        }
        if (fullChat.fullChat.className === "ChannelFull") {
          const channelFull = fullChat.fullChat as Api.ChannelFull;
          info += `👤 <b>成员数:</b> ${channelFull.participantsCount || "未知"}\n`;
        }
      } catch (e) {
        // 忽略获取详细信息的错误
      }
    }
    
    return info;
  } catch (error: any) {
    return `❌ <b>聊天信息</b>\n获取聊天信息失败: ${error.message}\n`;
  }
}

export default idPlugin;
