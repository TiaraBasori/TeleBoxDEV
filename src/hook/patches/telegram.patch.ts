import { Api } from "telegram/tl";
import { sleep } from "telegram/Helpers";

Api.Message.prototype.deleteWithDelay = async function (
  delay: number,
  shouldThrowError: boolean
) {
  await sleep(delay);
  try {
    return this.delete();
  } catch (e) {
    console.error(e);
    if (shouldThrowError) {
      throw e;
    }
  }
};
