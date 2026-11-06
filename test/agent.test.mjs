import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { agent, connect } from "../agents/rambo-macos.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("package publishes a Magpie Agent with the Rambo logo and discovery metadata", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const logo = readFileSync(join(root, "assets/rambo.png"));
  assert.ok(pkg.keywords.includes("magpie-plugin"));
  assert.equal(pkg.magpie.agent, "./agents/rambo-macos.mjs");
  assert.match(pkg.magpie.icon, /raw\.githubusercontent\.com\/jiawei666\/magpie-agent-rambo/u);
  assert.ok(existsSync(join(root, pkg.magpie.agent)));
  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("Magpie agent targets Rambo's per-user bridge config", () => {
  assert.equal(agent.id, "rambo");
  assert.equal(agent.config, "~/Library/Application Support/Rambo/magpie.json");
  assert.equal(agent.model, "model");
  assert.equal("library" in agent, false);
});

test("connect writes only the Magpie gateway bridge fields", () => {
  assert.deepEqual(connect({ gateway: {
    v1: "http://127.0.0.1:4312/v1",
    key: "magpie-test-key",
  } }), {
    baseURL: "http://127.0.0.1:4312/v1",
    apiKey: "magpie-test-key",
    managedBy: "magpie",
  });
});
