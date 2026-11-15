import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".json": "application/json",
  ".txt": "text/plain",
};
const port = Number(process.env.PORT || 4201);
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = resolve(root, "." + (path === "/" ? "/dev/index.html" : path));
    if (
      !file.startsWith(root + sep) ||
      !["/dev/", "/src/", "/assets/", "/licenses/"].some((prefix) =>
        (
          "/" +
          file
            .slice(root.length + 1)
            .split(sep)
            .join("/")
        ).startsWith(prefix),
      )
    ) {
      res.writeHead(404).end();
      return;
    }
    if (!(await stat(file)).isFile()) throw new Error("not found");
    res.writeHead(200, {
      "content-type": types[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(
    `Synthetic development shell: http://127.0.0.1:${port} (not a real 2FA installation)`,
  ),
);
