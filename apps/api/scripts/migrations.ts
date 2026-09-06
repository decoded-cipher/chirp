import { SCHEMA } from "@chirp/db";

const path = `${import.meta.dir}/../migrations/0001_init.sql`;
await Bun.write(path, `${SCHEMA.map((s) => `${s.trim()};`).join("\n\n")}\n`);
console.log(`wrote ${path}`);
