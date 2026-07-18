import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const web = path.join(root, "apps/web");
const output = path.join(web, ".next/standalone/apps/web");

async function replaceDirectory(source, destination) {
  await rm(destination, { force: true, recursive: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

await Promise.all([
  replaceDirectory(path.join(web, ".next/static"), path.join(output, ".next/static")),
  replaceDirectory(path.join(web, "public"), path.join(output, "public")),
]);
