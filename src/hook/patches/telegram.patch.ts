import { Api } from "telegram/tl";
import { sleep } from "telegram/Helpers";

Api.Message.prototype.deleteWithDelay = async function (delay:number) {
    await sleep(delay);
    return this.delete();
}