import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const MANAGER = new URL("../tools/state.py", import.meta.url).pathname;

function git(root, ...args) {
	return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function manager(root, ...args) {
	const env = { ...process.env, AGENT_STATE_DIR: root, AGENT_STATE_TEST: "1" };
	const result = spawnSync("python3", ["-I", MANAGER, ...args], { env, encoding: "utf8" });
	return { code: result.status, out: result.stdout, err: result.stderr };
}

/** A minimal state tree: the two shared halves the manager reads. */
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "agent-state-"));
	mkdirSync(join(root, "tools"), { recursive: true });
	mkdirSync(join(root, "shared", "agents"), { recursive: true });
	mkdirSync(join(root, "shared", "skills", "example"), { recursive: true });
	mkdirSync(join(root, "hosts", "pi"), { recursive: true });
	mkdirSync(join(root, "hosts", "claude", "output-styles"), { recursive: true });
	writeFileSync(
		join(root, "shared", "AGENTS.md"),
		"# Contract\n\nRead the playbooks.\n\n| Tool | Load it when | Never when |\n|---|---|---|\n| `example` | always | never |\n",
	);
	writeFileSync(join(root, "hosts", "pi", "AGENTS.append.md"), "# Pi only\n");
	writeFileSync(join(root, "hosts", "pi", "settings.json"), "{}\n");
	writeFileSync(join(root, "shared", "skills", "example", "SKILL.md"), "---\nname: example\n---\n");
	git(root, "init", "-q", "-b", "main");
	cpSync(new URL("../tools/state.py", import.meta.url).pathname, join(root, "tools", "state.py"));
	git(root, "config", "user.email", "t@example.com");
	git(root, "config", "user.name", "t");
	git(root, "add", "-A");
	git(root, "commit", "-qm", "init");
	return root;
}

test("snapshot refuses a host-only file even when it is in the tree", () => {
	const root = fixture();
	try {
		writeFileSync(join(root, "auth.json"), '{"token":"host"}\n');
		const { code, err } = manager(root, "snapshot", "chore: leak");
		assert.equal(code, 1);
		assert.match(err, /host-only/);
		assert.equal(git(root, "rev-parse", "HEAD"), git(root, "rev-parse", "HEAD~0"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("snapshot refuses a literal secret and accepts an env reference", () => {
	const root = fixture();
	try {
		writeFileSync(join(root, "hosts", "pi", "settings.json"), '{"apiKey":"sk-live-123"}\n');
		let result = manager(root, "snapshot", "chore: secret");
		assert.equal(result.code, 1);
		assert.match(result.err, /Literal secrets/);
		writeFileSync(join(root, "hosts", "pi", "settings.json"), '{"apiKey":"$REAL_KEY"}\n');
		result = manager(root, "snapshot", "chore: reference");
		assert.equal(result.code, 0);
		assert.match(git(root, "log", "-1", "--format=%s"), /reference/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("snapshot with nothing changed says so and does not commit", () => {
	const root = fixture();
	try {
		const head = git(root, "rev-parse", "HEAD");
		const { code, out } = manager(root, "snapshot", "chore: nothing");
		assert.equal(code, 0);
		assert.match(out, /Nothing to commit/);
		assert.equal(git(root, "rev-parse", "HEAD"), head);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("sync renders both homes and check reports a stale one", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	process.env.AGENT_PI_HOME = pi;
	process.env.AGENT_CLAUDE_HOME = claude;
	try {
		let result = manager(root, "sync");
		assert.equal(result.code, 0, result.err);
		const piContract = readFileSync(join(pi, "AGENTS.md"), "utf8");
		assert.match(piContract, /^# Contract\n\nRead the playbooks\.\n/);
		assert.match(piContract, /# Pi only/);
		assert.match(readFileSync(join(claude, "CLAUDE.md"), "utf8"), /# Contract/);
		assert.doesNotMatch(readFileSync(join(claude, "CLAUDE.md"), "utf8"), /Pi only/);

		result = manager(root, "check");
		assert.equal(result.code, 0, "a fresh render is not drift");

		writeFileSync(join(claude, "CLAUDE.md"), "# hand edit\n");
		result = manager(root, "check");
		assert.equal(result.code, 1);
		assert.match(result.out, /CLAUDE\.md is stale/);

		manager(root, "sync");
		assert.equal(manager(root, "check").code, 0);
	} finally {
		delete process.env.AGENT_PI_HOME;
		delete process.env.AGENT_CLAUDE_HOME;
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
	}
});

test("both hosts receive every skill the contract routes to", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	process.env.AGENT_PI_HOME = pi;
	process.env.AGENT_CLAUDE_HOME = claude;
	try {
		// A skill named in the contract's tool-routing table must reach Claude too,
		// or the rendered CLAUDE.md tells the agent to load what it never got.
		const contract = readFileSync(join(root, "shared", "AGENTS.md"), "utf8");
		const routed = [...contract.matchAll(/^\| `([a-z][a-z0-9-]+)` \|/gm)].map((match) => match[1]);
		assert.ok(routed.includes("example"));
		const result = manager(root, "sync");
		assert.equal(result.code, 0, result.err);
		for (const name of routed) {
			const readme = join(root, "shared", "skills", name, "SKILL.md");
			if (!existsSync(readme)) continue;
			assert.ok(existsSync(join(pi, "skills", name)), `pi is missing the ${name} skill`);
			assert.ok(existsSync(join(claude, "skills", name)), `claude is missing the ${name} skill`);
		}
	} finally {
		delete process.env.AGENT_PI_HOME;
		delete process.env.AGENT_CLAUDE_HOME;
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
	}
});

test("pull refuses a dirty tree and fast-forwards a clean one", () => {
	const origin = mkdtempSync(join(tmpdir(), "agent-origin-"));
	const clone = join(origin, "clone");
	try {
		const seed = fixture();
		cpSync(seed, join(origin, "seed"), { recursive: true });
		git(origin, "clone", "-q", "--bare", join(origin, "seed"), join(origin, "remote.git"));
		git(origin, "clone", "-q", join(origin, "remote.git"), clone);
		const other = mkdtempSync(join(tmpdir(), "agent-other-"));
		git(origin, "clone", "-q", join(origin, "remote.git"), other);
		writeFileSync(join(other, "shared", "AGENTS.md"), "# Contract v2\n");
		git(other, "add", "-A");
		git(other, "commit", "-qm", "chore: v2");
		git(other, "push", "-q");

		process.env.AGENT_PI_HOME = join(origin, "pihome");
		process.env.AGENT_CLAUDE_HOME = join(origin, "claudehome");
		writeFileSync(join(clone, "dirty.txt"), "x");
		let result = manager(clone, "pull");
		assert.equal(result.code, 1);
		assert.match(result.err, /dirty/);

		rmSync(join(clone, "dirty.txt"));
		result = manager(clone, "pull");
		assert.equal(result.code, 0, result.err);
		assert.match(readFileSync(join(clone, "shared", "AGENTS.md"), "utf8"), /v2/);

		delete process.env.AGENT_PI_HOME;
		delete process.env.AGENT_CLAUDE_HOME;
		rmSync(seed, { recursive: true, force: true });
		rmSync(other, { recursive: true, force: true });
		rmSync(origin, { recursive: true, force: true });
	} catch (error) {
		rmSync(origin, { recursive: true, force: true });
		throw error;
	}
});

test("check is silent and exit 0 outside a checkout, so a hook can never block", () => {
	const empty = mkdtempSync(join(tmpdir(), "agent-empty-"));
	try {
		const { code, out } = manager(empty, "check");
		assert.equal(code, 0);
		assert.equal(out.trim(), "");
	} finally {
		rmSync(empty, { recursive: true, force: true });
	}
});

test("a clone inside a home it renders is refused instead of overwriting itself", () => {
	const home = mkdtempSync(join(tmpdir(), "agent-home-"));
	try {
		const root = join(home, "state");
		cpSync(fixture(), root, { recursive: true });
		const result = spawnSync("python3", ["-I", MANAGER, "sync"], {
			env: { ...process.env, AGENT_STATE_DIR: root, AGENT_PI_HOME: join(home, "pi"), AGENT_CLAUDE_HOME: home },
			encoding: "utf8",
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /sits inside the home it renders/);
	} finally {
		delete process.env.AGENT_CLAUDE_HOME;
		delete process.env.AGENT_PI_HOME;
		rmSync(home, { recursive: true, force: true });
	}
});
