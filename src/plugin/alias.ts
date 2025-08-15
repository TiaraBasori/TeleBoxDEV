import { Plugin } from '@utils/pluginBase';
import { NewMessageEvent } from 'telegram/events';
import { AliasDB } from '@utils/AliasDB';

async function setAlias(args: string[], event: NewMessageEvent) {
    const db = new AliasDB();
    const original = args[1];
    const final = args[2];
    db.set(original, final);
    db.close();
    await event.message.edit({
        text:  `插件命令重命名成功，${original} -> ${final}`
    })
}

async function delAlias(args: string[], event: NewMessageEvent) {
    const db = new AliasDB();
    db.del(args[1]);
    db.close();
    await event.message.edit({
        text: `删除 ${args[1]} 重命名成功`
    })
}

async function listAlias(args:string[], event: NewMessageEvent) {
    const db = new AliasDB();
    const result = db.list();
    db.close();
    const text = result.map(( {original, final} ) => `${original} -> ${final}`).join("\n")
    await event.message.edit({ text: "重命名列表：\n" + text })
}

const aliasPlugin: Plugin = {
    command: "alias",
    description: `
    插件命名重命名
    .alias set a b, a -> b
    .alias del a
    .alias ls
    `, 
    commandHandler: async (event: NewMessageEvent) => {
        const msg = event.message;
        const [, ...args] = msg.message.slice(1).split(" ");
        if (args.length == 0) {
            await msg.edit({
                text: "不知道你要干什么！"
            });
        }
        const cmd = args[0];
        if (cmd == "set") {
            await setAlias(args, event);
        }
        else if (cmd == "del") {
            await delAlias(args, event);
        }
        else if (cmd == "ls" || cmd == "list") {
            await listAlias(args, event);
        }
    }
}

export default aliasPlugin;