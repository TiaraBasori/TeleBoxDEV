import { sleep } from "telegram/Helpers";
import { Api } from "telegram/tl";

Api.Message.prototype.deleteWithDelay = async function (delay:number) {
    await sleep(delay);
    return this.delete();
}