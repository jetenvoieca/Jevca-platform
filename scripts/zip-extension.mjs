// Packs the Jevca Hopper Importer (extension/) for download from Jevca
// (2026-11-02): public/importer/jevca-hopper-importer.zip, and
// public/importer/version.json with its version, which the extension's
// popup reads to say when an update is available. Run before every build
// ("prebuild" in package.json); the files are made fresh, never committed.
import { crc32, deflateRawSync } from "node:zlib";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE = "extension";
const OUT = join("public", "importer");

function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

// A plain zip: each file deflated, then the central directory.
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name);
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBytes, end]);
}

const files = filesIn(SOURCE).map((path) => ({
  name: `extension/${relative(SOURCE, path).split("\\").join("/")}`,
  data: readFileSync(path),
}));
const { version } = JSON.parse(readFileSync(join(SOURCE, "manifest.json"), "utf8"));

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "jevca-hopper-importer.zip"), zip(files));
writeFileSync(join(OUT, "version.json"), JSON.stringify({ version }));
console.log(`Packed the Hopper Importer ${version} (${files.length} files).`);
