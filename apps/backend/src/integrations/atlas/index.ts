import { env } from "../../config/env.js";
import type { AtlasClient } from "./client.js";
import { AtlasHttpClient } from "./client.js";
import { MockAtlasClient } from "./mockClient.js";

export type { AtlasClient } from "./client.js";
export { AtlasHttpClient } from "./client.js";
export { MockAtlasClient } from "./mockClient.js";
export * from "./types.js";

let instance: AtlasClient | undefined;

export function getAtlasClient(): AtlasClient {
  if (!instance) {
    if (env.ATLAS_MODE === "live") {
      instance = new AtlasHttpClient({ baseUrl: env.ATLAS_HOST! });
    } else {
      instance = new MockAtlasClient();
    }
  }
  return instance;
}
