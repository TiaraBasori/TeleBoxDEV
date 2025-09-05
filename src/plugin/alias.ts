import { Plugin } from "@utils/pluginBase";
import { AliasDB } from "@utils/aliasDB";
import { Api } from "telegram";
import { loadPlugins } from "@utils/pluginManager";

async function setAlias(args: string[], msg: Api.Message) {
  const db = new AliasDB();
  const original = args[1];
  const final = args[2];
  db.set(original, final);
  db.close();
  loadPlugins();
  await msg.edit({
    text: `插件命令重命名成功，${original} -> ${final}`,
  });
}

async function delAlias(args: string[], msg: Api.Message) {
  const db = new AliasDB();
  const success = db.del(args[1]);
  db.close();
  if (success) {
    await msg.edit({
      text: `删除 ${args[1]} 重命名成功`,
    });
    loadPlugins();
  } else {
    await msg.edit({
      text: `删除 ${args[1]} 重命名失败, 请检查命令是否存在`,
    });
  }
}

async function listAlias(args: string[], msg: Api.Message) {
  const db = new AliasDB();
  const result = db.list();
  db.close();
  const text = result
    .map(({ original, final }) => `${original} -> ${final}`)
    .join("\n");
  await msg.edit({ text: "重命名列表：\n" + text });
}

class AliasPlugin extends Plugin {
  description: string = `插件命名重命名
<code>.alias set a b</code> <code>a</code> -> <code>b</code>
<code>.alias del a</code>
<code>.alias ls</code>`;
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    alias: async (msg) => {
      const [, ...args] = msg.message.split(" ");
      if (args.length == 0) {
        await msg.edit({
          text: "不知道你要干什么！",
        });
      }
      const cmd = args[0];
      if (cmd == "set") {
        await setAlias(args, msg);
      } else if (cmd == "del") {
        await delAlias(args, msg);
      } else if (cmd == "ls" || cmd == "list") {
        await listAlias(args, msg);
      }
    },
  };
}

export default new AliasPlugin();
