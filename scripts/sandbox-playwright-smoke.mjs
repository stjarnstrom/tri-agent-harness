#!/usr/bin/env node
// Localhost + Playwright proof for the optional sandbox jail.
// Starts a tiny HTTP server (stand-in for Vite) and fetches it.
// When Playwright is installed, also drives Chromium against 127.0.0.1.

import http from "node:http";

const FETCH_ONLY = process.env.HARNESS_SANDBOX_SMOKE_FETCH_ONLY === "1";
const REQUIRE_PLAYWRIGHT = process.env.HARNESS_SANDBOX_REQUIRE_PLAYWRIGHT === "1";

function startServer() {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      "<!doctype html><html><head><title>sandbox-ok</title></head><body><h1>sandbox-ok</h1></body></html>",
    );
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

function assertFetch(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const html = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode !== 200) {
          reject(new Error(`localhost fetch failed: HTTP ${response.statusCode}`));
          return;
        }
        if (!html.includes("sandbox-ok")) {
          reject(new Error("localhost fetch did not return the smoke page"));
          return;
        }
        resolve();
      });
    });
    request.setTimeout(5000, () => {
      request.destroy();
      reject(new Error("localhost fetch timed out"));
    });
    request.on("error", reject);
  });
}

async function assertPlaywright(url) {
  let chromium;
  try {
    const moduleId = process.env.PLAYWRIGHT_MODULE || "playwright";
    const playwright = await import(moduleId);
    const api = playwright.default ?? playwright;
    chromium = api.chromium;
  } catch (error) {
    if (REQUIRE_PLAYWRIGHT) {
      throw new Error(`Playwright is required but could not be imported: ${error.message}`);
    }
    process.stdout.write(`playwright skipped (not installed): ${error.message}\n`);
    return false;
  }

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const title = await page.title();
    const heading = await page.locator("h1").innerText();
    if (title !== "sandbox-ok" || heading !== "sandbox-ok") {
      throw new Error(`Playwright saw title='${title}' heading='${heading}'`);
    }
  } finally {
    await browser.close();
  }
  return true;
}

const { server, url } = await startServer();
try {
  await assertFetch(url);
  process.stdout.write(`fetch smoke passed ${url}\n`);
  if (!FETCH_ONLY) {
    const used = await assertPlaywright(url);
    if (used) {
      process.stdout.write(`playwright smoke passed ${url}\n`);
    }
  }
} finally {
  server.close();
}
