import { ZipArchive } from "archiver";
import {
  createWriteStream,
  existsSync,
  cpSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const clientDir = join(root, "build", "client");
const themeJsonPath = join(root, "komari-theme.json");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const themeJson = JSON.parse(readFileSync(themeJsonPath, "utf8"));

if (!existsSync(clientDir)) {
  console.error("Missing build/client. Run `pnpm build` first.");
  process.exit(1);
}

themeJson.version = packageJson.version;
writeFileSync(themeJsonPath, `${JSON.stringify(themeJson, null, 2)}\n`);

const distDir = join(root, "dist");
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(clientDir, distDir, { recursive: true });
rmSync(join(distDir, ".vite"), { recursive: true, force: true });

const indexPath = join(distDir, "index.html");
if (existsSync(indexPath)) {
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
  // Ensure body/head closers exist for server injection of custom_head / custom_body
  if (!/<\/head>/i.test(html) || !/<\/body>/i.test(html)) {
    console.error("dist/index.html missing </head> or </body>");
    process.exit(1);
  }
  writeFileSync(indexPath, html);
}

const zipName = `komari-theme-carbon-v${packageJson.version}.zip`;
const zipPath = join(root, zipName);
const output = createWriteStream(zipPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

await new Promise((resolve, reject) => {
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  archive.file(themeJsonPath, { name: "komari-theme.json" });
  archive.directory(distDir, "dist");
  const preview = join(root, "preview.png");
  if (existsSync(preview)) {
    archive.file(preview, { name: "preview.png" });
  }
  void archive.finalize();
});

console.log(`Created ${zipName} (${archive.pointer()} bytes)`);
