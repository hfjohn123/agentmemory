import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? process.cwd());
const dist = join(root, "dist");
const viewerDist = join(dist, "viewer");

mkdirSync(viewerDist, { recursive: true });

for (const file of [
  "iii-config.yaml",
  "iii-config.docker.yaml",
  "docker-compose.yml",
  ".env.example",
]) {
  const source = join(root, file);
  if (existsSync(source)) {
    copyFileSync(source, join(dist, file));
  }
}

for (const file of ["index.html", "favicon.svg"]) {
  const source = join(root, "src", "viewer", file);
  copyFileSync(source, join(viewerDist, basename(source)));
}
