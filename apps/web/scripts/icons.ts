import sharp from "sharp";

const PUB = `${import.meta.dir}/../public`;
const read = (f: string) => Bun.file(`${PUB}/${f}`).arrayBuffer().then((b) => Buffer.from(b));

const favicon = await read("favicon.svg");
const apple = await read("icon-apple.svg");
const maskable = await read("icon-maskable.svg");

const jobs: [Buffer, number, string][] = [
  [favicon, 16, "favicon-16x16.png"],
  [favicon, 32, "favicon-32x32.png"],
  [favicon, 96, "favicon-96x96.png"],
  [apple, 180, "apple-touch-icon.png"],
  [favicon, 192, "icon-192.png"],
  [favicon, 512, "icon-512.png"],
  [maskable, 192, "icon-maskable-192.png"],
  [maskable, 512, "icon-maskable-512.png"],
];

for (const [svg, size, name] of jobs) {
  await sharp(svg, { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`${PUB}/${name}`);
  console.log(`  ${name.padEnd(26)} ${size}x${size}`);
}

// ICO is a directory of embedded PNGs; Vista+ reads them directly.
const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map((s) => sharp(favicon, { density: 512 }).resize(s, s).png({ compressionLevel: 9 }).toBuffer()),
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);

let offset = 6 + sizes.length * 16;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s === 256 ? 0 : s, 0);
  e.writeUInt8(s === 256 ? 0 : s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i]!.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i]!.length;
  return e;
});

await Bun.write(`${PUB}/favicon.ico`, Buffer.concat([header, ...entries, ...pngs]));
console.log(`  favicon.ico                ${sizes.join(", ")}`);
