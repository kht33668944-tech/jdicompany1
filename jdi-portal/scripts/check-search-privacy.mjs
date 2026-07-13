import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layout = readFileSync(path.join(appRoot, "src/app/layout.tsx"), "utf8");
const nextConfig = readFileSync(path.join(appRoot, "next.config.ts"), "utf8");

assert.match(
  layout,
  /robots:\s*\{[\s\S]*?index:\s*false,[\s\S]*?follow:\s*false,[\s\S]*?googleBot:\s*\{[\s\S]*?index:\s*false,[\s\S]*?follow:\s*false,/,
  "Root metadata must prevent general and Google indexing.",
);

assert.match(
  nextConfig,
  /key:\s*["']X-Robots-Tag["'][\s\S]*?value:\s*["']noindex, nofollow, noarchive, nosnippet["']/,
  "Every HTTP response must include a noindex X-Robots-Tag header.",
);

console.log("Search privacy policy checks passed.");
