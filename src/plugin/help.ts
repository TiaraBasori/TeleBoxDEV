import { NewMessageEvent } from "telegram/events";

const helpPlugin = {
    command: "help", 
    description: "whakkkkk",
    commandHandler: async (event: NewMessageEvent) => {
        await event.message.edit({
            text: "waht kkk kkkk "
        })
    }
}

export default helpPlugin;