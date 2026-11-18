import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const HOOK = new URL("../plugin/hooks/check-behind.sh", import.meta.url).pathname;
const MANAGER = new URL("../tools/state.py", import.meta.url).pathname;

function git(cwd, ...args) {
	execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "ignore" });
}

/** A clone one commit behind its origin, plus the runner that turns it into hook output. */
function behind() {
	const base = mkdtempSync(join(tmpdir(), "agent-hook-"));
	const seed = join(base, "seed");
	mkdirSync(join(seed, "tools"), { recursive: true });
	mkdirSync(join(seed, "shared"), { recursive: true });
	mkdirSync(join(seed, "hosts", "pi"), { recursive: true });
	mkdirSync(join(seed, "hosts", "claude", "output-styles"), { recursive: true });
	cpSync(MANAGER, join(seed, "tools", "state.py"));
	writeFileSync(join(seed, "shared", "AGENTS.md"), "# Contract\n");
	git(seed, "init", "-q", "-b", "main");
	git(seed, "add", "-A");
	git(seed, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "init");
	git(base, "clone", "-q", "--bare", seed, join(base, "remote.git"));
	git(base, "clone", "-q", join(base, "remote.git"), join(base, "clone"));
	const other = join(base, "other");
	git(base, "clone", "-q", join(base, "remote.git"), other);
	writeFileSync(join(other, "shared", "AGENTS.md"), "# Contract v2\n");
	git(other, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qam", "v2");
	git(other, "push", "-q");
	return base;
}

function run(base, input) {
	const result = spawnSync("bash", [HOOK], {
		input,
		encoding: "utf8",
		env: {
			...process.env,
			AGENT_STATE_DIR: join(base, "clone"),
			AGENT_PI_HOME: join(base, "pihome"),
			AGENT_CLAUDE_HOME: join(base, "claudehome"),
			CLAUDE_PLUGIN_DATA: join(base, "data"),
		},
	});
	return result;
}

test("the hook reports behind once per session as hook JSON, and always exits 0", () => {
	const base = behind();
	try {
		const first = run(base, JSON.stringify({ session_id: "s1", source: "startup" }));
		assert.equal(first.status, 0, first.stderr);
		const output = JSON.parse(first.stdout);
		assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
		assert.match(output.hookSpecificOutput.additionalContext, /1 commit\(s\) behind origin/);

		const second = run(base, JSON.stringify({ session_id: "s1", source: "user" }));
		assert.equal(second.status, 0);
		assert.equal(second.stdout, "", "a second turn in the session checks nothing");
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
});

test("the hook stays silent and exits 0 outside a checkout", () => {
	const empty = mkdtempSync(join(tmpdir(), "agent-hook-empty-"));
	try {
		const result = run(empty, JSON.stringify({ session_id: "s2" }));
		assert.equal(result.status, 0);
		assert.equal(result.stdout, "");
	} finally {
		rmSync(empty, { recursive: true, force: true });
	}
});
