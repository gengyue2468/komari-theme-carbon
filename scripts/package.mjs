import { ZipArchive } from "archiver";
import {
  createWriteStream,
  existsSync,
  cpSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const clientDir = join(root, "build", "client");
const themeJsonPath = join(root, "komari-theme.json");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const themeJson = JSON.parse(readFileSync(themeJsonPath, "utf8"));
const previewPath = join(root, "preview.png");

if (!existsSync(clientDir)) {
  console.error("Missing build/client. Run `pnpm build` first.");
  process.exit(1);
}

if (!existsSync(previewPath)) {
  console.error(
    "Missing preview.png at theme root. Admin UI loads /themes/{short}/{preview}.",
  );
  process.exit(1);
}

const previewStat = statSync(previewPath);
if (!previewStat.isFile() || previewStat.size < 100) {
  console.error("preview.png looks empty or invalid.");
  process.exit(1);
}

themeJson.version = packageJson.version;
if (!themeJson.preview || typeof themeJson.preview !== "string") {
  themeJson.preview = "preview.png";
}
if (
  themeJson.preview.startsWith("/") ||
  /^https?:\/\//i.test(themeJson.preview)
) {
  console.warn(
    "komari-theme.json preview should be a relative path inside the zip (e.g. preview.png).",
  );
}

const distDir = join(root, "dist");
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(clientDir, distDir, { recursive: true });
rmSync(join(distDir, ".vite"), { recursive: true, force: true });

const indexPath = join(distDir, "index.html");
if (!existsSync(indexPath)) {
  console.error("Missing dist/index.html after copy from build/client.");
  process.exit(1);
}

let html = readFileSync(indexPath, "utf8");
if (!html.includes("<title>Komari Monitor</title>")) {
  html = html.replace(/<title>.*?<\/title>/i, "<title>Komari Monitor</title>");
}
if (!html.includes("A simple server monitor tool.")) {
  if (/name="description"/.test(html)) {
    html = html.replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
      '<meta name="description" content="A simple server monitor tool." />',
    );
  } else {
    html = html.replace(
      "</head>",
      '    <meta name="description" content="A simple server monitor tool." />\n  </head>',
    );
  }
}
if (!/<\/head>/i.test(html) || !/<\/body>/i.test(html)) {
  console.error("dist/index.html missing </head> or </body>");
  process.exit(1);
}
writeFileSync(indexPath, html);

const zipName = `komari-theme-carbon-v${packageJson.version}.zip`;
const zipPath = join(root, zipName);
if (existsSync(zipPath)) rmSync(zipPath);

const output = createWriteStream(zipPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

await new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("error", reject);
  archive.on("warning", (err) => {
    if (err.code === "ENOENT") console.warn(err);
    else reject(err);
  });
  archive.pipe(output);

  // Komari installs to ./data/theme/{short}/ then serves:
  //   GET /themes/{short}/{preview}  e.g. /themes/komari-theme-carbon/preview.png
  //   GET /themes/{short}/komari-theme.json
  //   SPA assets under dist/
  archive.append(`${JSON.stringify(themeJson, null, 2)}\n`, {
    name: "komari-theme.json",
  });
  archive.file(previewPath, { name: "preview.png" });
  archive.directory(distDir, "dist");
  void archive.finalize();
});

const zipBuf = readFileSync(zipPath);
const entries = listZipEntries(zipBuf);
const required = ["komari-theme.json", "preview.png", "dist/index.html"];
for (const name of required) {
  const hit = entries.find((e) => e.name === name);
  if (!hit) {
    console.error(`Zip missing required entry: ${name}`);
    console.error(
      "Top entries:",
      entries
        .map((e) => e.name)
        .filter((n) => !n.includes("/assets/"))
        .join(", "),
    );
    process.exit(1);
  }
  if (name === "preview.png" && hit.uncompressedSize < 100) {
    console.error("preview.png in zip has invalid size:", hit.uncompressedSize);
    process.exit(1);
  }
}

const previewEntry = entries.find((e) => e.name === "preview.png");
console.log(
  `Created ${zipName} (${archive.pointer()} bytes), preview.png=${previewEntry?.uncompressedSize ?? 0} bytes, entries=${entries.length}`,
);

/** @param {Buffer} buf */
function listZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid zip: EOCD not found");
  const totalEntries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < totalEntries; n++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString("utf8");
    out.push({ name, uncompressedSize });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
