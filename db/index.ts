import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  const e = env as any;
  const binding = e?.DB ?? e?.dinhcaotritue_db;

  if (!binding) {
    throw new Error(
      "D1 chua san sang. Cac binding nhin thay duoc: [" +
      Object.keys(e ?? {}).join(", ") + "]"
    );
  }

  return drizzle(binding, { schema });
}