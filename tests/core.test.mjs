import assert from "node:assert/strict";
import test from "node:test";
import {
	findUnsafeSecretLiterals,
	githubSlugFromTarget,
	isSafeRemoteUrl,
	parseCommand,
	resolveStateRoot,
} from "../extensions/pi-state/core.ts";

test("parseCommand separates action and free-form snapshot message", () => {
	assert.deepEqual(parseCommand("snapshot feat: sync config"), {
		action: "snapshot",
		rest: "feat: sync config",
	});
	assert.deepEqual(parseCommand(""), { action: "help", rest: "" });
});

test("the state root prefers AGENT_STATE_DIR over the pi variables", () => {
	const saved = { ...process.env };
	try {
		process.env.PI_STATE_DIR = "/a";
		process.env.PI_CODING_AGENT_DIR = "/b";
		process.env.AGENT_STATE_DIR = "/c";
		assert.equal(resolveStateRoot(), "/c");
		delete process.env.AGENT_STATE_DIR;
		assert.equal(resolveStateRoot(), "/a");
	} finally {
		process.env = saved;
	}
});

test("GitHub targets resolve to a slug and other hosts do not", () => {
	assert.equal(githubSlugFromTarget("DragonL57/agent-state"), "DragonL57/agent-state");
	assert.equal(githubSlugFromTarget("git@github.com:DragonL57/agent-state.git"), "DragonL57/agent-state");
	assert.equal(githubSlugFromTarget("https://github.com/DragonL57/agent-state"), "DragonL57/agent-state");
	assert.equal(githubSlugFromTarget("git@example.com:DragonL57/agent-state.git"), undefined);
});

test("a clone URL cannot be mistaken for a git option", () => {
	assert.equal(isSafeRemoteUrl("https://github.com/DragonL57/agent-state.git"), true);
	assert.equal(isSafeRemoteUrl("--upload-pack=touch pwned"), false);
	assert.equal(isSafeRemoteUrl(""), false);
});

test("literal secrets are rejected while env and command references are allowed", () => {
	const issues = findUnsafeSecretLiterals({
		providers: {
			unsafe: { apiKey: "sk-secret" },
			env: { apiKey: "$API_KEY" },
			command: { apiKey: "!op read op://vault/key" },
			ollama: { apiKey: "ollama" },
		},
	});
	assert.deepEqual(issues, ["$.providers.unsafe.apiKey"]);
});
