import { SCHEMA } from "@chirp/db";

const path = `${import.meta.dir}/../migrations/0001_init.sql`;

if (await Bun.file(path).exists()) {
  console.error(`${path} already exists — add a new numbered migration instead`);
  process.exit(1);
}

await Bun.write(path, `${SCHEMA.map((s) => `${s.trim()};`).join("\n\n")}\n`);
console.log(`wrote ${path}`);
