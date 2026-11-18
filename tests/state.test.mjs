import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const MANAGER = new URL("../tools/state.py", import.meta.url).pathname;

// A commit needs an identity, and a CI runner has no global one. Both helpers
// pass these, so a commit made here and one made by the manager both work.
const IDENTITY = {
	GIT_AUTHOR_NAME: "t",
	GIT_AUTHOR_EMAIL: "t@example.com",
	GIT_COMMITTER_NAME: "t",
	GIT_COMMITTER_EMAIL: "t@example.com",
};

function git(root, ...args) {
	const env = { ...process.env, ...IDENTITY };
	return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env }).trim();
}

function manager(root, ...args) {
	const env = { ...process.env, ...IDENTITY, AGENT_STATE_DIR: root, AGENT_STATE_TEST: "1" };
	const result = spawnSync("python3", ["-I", MANAGER, ...args], { env, encoding: "utf8" });
	return { code: result.status, out: result.stdout, err: result.stderr };
}

/** The manager as normally invoked, plus a managed home pair. */
function managerWithHomes(pi, claude) {
	const env = { ...process.env, ...IDENTITY, AGENT_PI_HOME: pi, AGENT_CLAUDE_HOME: claude };
	delete env.AGENT_STATE_TEST;
	return (root, ...args) => {
		const result = spawnSync("python3", ["-I", MANAGER, ...args], {
			env: { ...env, AGENT_STATE_DIR: root },
			encoding: "utf8",
		});
		return { code: result.status, out: result.stdout, err: result.stderr };
	};
}

/** A git repo holding a copy of the manager and one task, for the task-code rule. */
function taskRepo() {
	const root = mkdtempSync(join(tmpdir(), "agent-task-"));
	cpSync(new URL("../tools/state.py", import.meta.url).pathname, join(root, "tools", "state.py"));
	mkdirSync(join(root, "shared"), { recursive: true });
	mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
	writeFileSync(join(root, "backlog", "tasks", "task-1 - A-Thing Done.md"), "---\nid: TASK-1\n---\n");
	git(root, "init", "-q", "-b", "main");
	git(root, "add", "-A");
	git(root, "commit", "-qm", "chore: first task");
	return root;
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
	mkdirSync(join(root, "shared", "prompts"), { recursive: true });
	writeFileSync(
		join(root, "shared", "prompts", "duo.md"),
		"---\ndescription: Pair up\n---\n\nRead `{{AGENT_STATE}}/rig/.rig/playbooks/workflow.md`.\n",
	);
	writeFileSync(join(root, "hosts", "pi", "settings.json"), "{}\n");
	writeFileSync(join(root, "shared", "skills", "example", "SKILL.md"), "---\nname: example\n---\n");
	git(root, "init", "-q", "-b", "main");
	cpSync(new URL("../tools/state.py", import.meta.url).pathname, join(root, "tools", "state.py"));
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

test("snapshot reads a lockfile version as a version, and still refuses a real secret", () => {
	const root = fixture();
	try {
		writeFileSync(
			join(root, "package-lock.json"),
			'{"packages":{"node_modules/a":{"dependencies":{"@aws-sdk/token-providers":"3.1048.0"}}}}\n',
		);
		let result = manager(root, "snapshot", "chore: lockfile");
		assert.equal(result.code, 0, result.err);

		writeFileSync(join(root, "package-lock.json"), '{"token":"sk-live-abc123"}\n');
		result = manager(root, "snapshot", "chore: leak");
		assert.equal(result.code, 1);
		assert.match(result.err, /Literal secrets/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("snapshot refuses a code change whose message names no Backlog task", () => {
	const root = taskRepo();
	try {
		writeFileSync(join(root, "shared", "example.ts"), "work\n");
		let result = manager(root, "snapshot", "chore: untracked work");
		assert.equal(result.code, 1);
		assert.match(result.err, /No Backlog task/);
		assert.match(result.err, /TASK-3/);
		assert.match(result.err, /Tasks here: TASK-1/);
		// A refused snapshot leaves the index as it found it.
		assert.equal(git(root, "diff", "--cached", "--name-only"), "", "the refusal staged nothing");

		// A glob character is not a task code.
		result = manager(root, "snapshot", "task-* feat: wildcard");
		assert.equal(result.code, 1);

		// An empty message has no code to find, so it is refused the same way.
		result = manager(root, "snapshot", "");
		assert.equal(result.code, 1);
		assert.match(result.err, /No Backlog task/);

		// Code needs its task file named even when a task file shares the stage.
		writeFileSync(join(root, "backlog", "tasks", "task-2 - B.md"), "---\nid: TASK-2\n---\n");
		writeFileSync(join(root, "backlog", "tasks", "task-1 - A-Thing Done.md"), "---\nid: TASK-1\nstatus: in progress\n---\n");
		result = manager(root, "snapshot", "chore: untracked work");
		assert.equal(result.code, 1);
		assert.match(result.err, /No Backlog task/);

		// A task code in any case names its task.
		for (const message of ["TASK-1 feat: upper", "task-1 feat: lower", "Task-1 feat: mixed"]) {
			writeFileSync(join(root, "shared", "example.txt"), message);
			result = manager(root, "snapshot", message);
			assert.equal(result.code, 0, result.err);
			assert.equal(git(root, "log", "-1", "--format=%s"), message);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a prose change needs no task, and a task file alone commits", () => {
	const root = taskRepo();
	try {
		// The bootstrap path the refusal names: create the task, then its code.
		writeFileSync(join(root, "backlog", "tasks", "task-2 - B.md"), "---\nid: TASK-2\n---\n");
		let result = manager(root, "snapshot", "chore: add a task");
		assert.equal(result.code, 0, result.err);

		// Prose outside `docs/` is a document stage, and the playbooks are most of it.
		mkdirSync(join(root, "rig", "agents"), { recursive: true });
		writeFileSync(join(root, "rig", "agents", "worker.md"), "rule\n");
		writeFileSync(join(root, "shared", "AGENTS.MD"), "contract\n");
		result = manager(root, "snapshot", "chore: tighten a playbook");
		assert.equal(result.code, 0, result.err);
		assert.equal(git(root, "log", "-1", "--format=%s"), "chore: tighten a playbook");

		// One non-prose path beside the prose needs the task.
		writeFileSync(join(root, "rig", "agents", "worker.md"), "rule 2\n");
		writeFileSync(join(root, "shared", "secret.env"), "KEY=1\n");
		result = manager(root, "snapshot", "chore: prose and a config");
		assert.equal(result.code, 1);
		assert.match(result.err, /No Backlog task/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a repo's first commit needs no task, whatever it changes", () => {
	const fresh = mkdtempSync(join(tmpdir(), "agent-first-"));
	try {
		cpSync(new URL("../tools/state.py", import.meta.url).pathname, join(fresh, "tools", "state.py"));
		mkdirSync(join(fresh, "shared"), { recursive: true });
		mkdirSync(join(fresh, "backlog", "tasks"), { recursive: true });
		writeFileSync(join(fresh, "shared", "example.txt"), "work\n");
		git(fresh, "init", "-q", "-b", "main");
		const result = manager(fresh, "snapshot", "chore: first commit");
		assert.equal(result.code, 0, result.err);
		assert.equal(git(fresh, "log", "-1", "--format=%s"), "chore: first commit");
	} finally {
		rmSync(fresh, { recursive: true, force: true });
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

test("a rendered file names a target that exists on this machine", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	process.env.AGENT_PI_HOME = pi;
	process.env.AGENT_CLAUDE_HOME = claude;
	try {
			writeFileSync(join(root, "config.json"), '{"hosts": ["pi", "claude"]}\n');
		mkdirSync(join(root, "rig", ".rig", "playbooks"), { recursive: true });
		writeFileSync(join(root, "rig", ".rig", "playbooks", "workflow.md"), "# Workflow\n");
		writeFileSync(
			join(root, "shared", "AGENTS.md"),
			"# Contract\n\nRead `{{AGENT_STATE}}/rig/.rig/playbooks/workflow.md`.\n",
		);
		mkdirSync(join(root, "shared", "agents"), { recursive: true });
		writeFileSync(
			join(root, "shared", "agents", "worker.md"),
			"---\ndescription: worker\ntools: read\n---\n\nRead `{{AGENT_STATE}}/rig/.rig/playbooks/workflow.md`.\n",
		);
		git(root, "add", "-A");
		git(root, "commit", "-qm", "chore: target");
		const result = manager(root, "sync");
		assert.equal(result.code, 0, result.err);
		for (const text of [
			readFileSync(join(pi, "AGENTS.md"), "utf8"),
			readFileSync(join(pi, "agents", "worker.md"), "utf8"),
			readFileSync(join(pi, "prompts", "duo.md"), "utf8"),
			readFileSync(join(pi, "skills", "example", "SKILL.md"), "utf8"),
			readFileSync(join(claude, "CLAUDE.md"), "utf8"),
			readFileSync(join(claude, "agents", "worker.md"), "utf8"),
			readFileSync(join(claude, "commands", "duo.md"), "utf8"),
		]) {
			for (const [, target] of text.matchAll(/`(\/[^`]+)`/g)) {
				assert.ok(existsSync(target), `${target} is named by a rendered file but does not exist`);
			}
		}

	} finally {
		delete process.env.AGENT_PI_HOME;
		delete process.env.AGENT_CLAUDE_HOME;
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
	}
});

test("AGENT_STATE_HOSTS limits a render to the configured host", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const run = managerWithHomes(pi, claude);
	try {
		let result = spawnSync("python3", ["-I", MANAGER, "sync"], {
			env: {
				...process.env,
				AGENT_STATE_DIR: root,
				AGENT_PI_HOME: pi,
				AGENT_CLAUDE_HOME: claude,
				AGENT_STATE_HOSTS: "claude",
				AGENT_STATE_TEST: "1",
			},
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(readdirSync(pi), [], "an unconfigured home stays empty");
		assert.ok(existsSync(join(claude, "CLAUDE.md")));

		// The tracked key, with no override, is the default source.
		writeFileSync(join(root, "config.json"), '{"hosts": ["pi"]}\n');
		rmSync(claude, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		mkdirSync(pi);
		mkdirSync(claude);
		result = run(root, "sync");
		assert.equal(result.code, 0, result.err);
		assert.deepEqual(readdirSync(claude), [], "a pi-only machine renders no Claude home");
		assert.ok(existsSync(join(pi, "AGENTS.md")));
		assert.match(result.out, /into: pi\./);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
	}
});

test("a malformed or mis-shaped config.json is one error line, not a traceback", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	try {
		for (const [body, message] of [
			['{"hosts": ["pi"],}\n', /not valid JSON/],
			['{"hosts": "claude"}\n', /non-empty list/],
			['{"hosts": []}\n', /non-empty list/],
			['{"hosts": ["smoke"]}\n', /Unknown host/],
		]) {
			writeFileSync(join(root, "config.json"), body);
			for (const verb of ["sync", "check"]) {
				const { code, out, err } = manager(root, verb);
				assert.equal(code, 1, `${verb}: ${body}`);
				// `check` reports findings on stdout, so its config error rides there.
				assert.match(verb === "check" ? out : err, message);
				assert.doesNotMatch(out + err, /Traceback/);
			}
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
	}
});

test("check stays silent about a host this machine does not render", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	process.env.AGENT_PI_HOME = pi;
	process.env.AGENT_CLAUDE_HOME = claude;
	process.env.AGENT_STATE_HOSTS = "claude";
	try {
		assert.equal(manager(root, "sync").code, 0);
		// A pi home from before the machine was configured Claude-only.
		mkdirSync(pi, { recursive: true });
		writeFileSync(join(pi, "AGENTS.md"), "# stale\n");
		const result = manager(root, "check");
		assert.equal(result.code, 0, result.out);
		assert.doesNotMatch(result.out, /pi/);
	} finally {
		delete process.env.AGENT_PI_HOME;
		delete process.env.AGENT_CLAUDE_HOME;
		delete process.env.AGENT_STATE_HOSTS;
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
	}
});

test("AGENT_STATE_TEST refuses to render a home it was not handed", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const env = { ...process.env, AGENT_STATE_DIR: root, AGENT_STATE_TEST: "1" };
	delete env.AGENT_PI_HOME;
	delete env.AGENT_CLAUDE_HOME;
	delete env.AGENT_STATE_HOSTS;
	try {
		writeFileSync(join(root, "config.json"), '{"hosts": ["claude"]}\n');
		let result = spawnSync("python3", ["-I", MANAGER, "sync"], {
			env: { ...env, AGENT_PI_HOME: pi },
			encoding: "utf8",
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /AGENT_CLAUDE_HOME/);
		assert.deepEqual(readdirSync(pi), []);

		writeFileSync(join(root, "config.json"), '{"hosts": ["pi"]}\n');
		result = spawnSync("python3", ["-I", MANAGER, "sync"], {
			env: { ...env, AGENT_PI_HOME: pi },
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr);
		assert.ok(existsSync(join(pi, "AGENTS.md")), "the configured host still renders");
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
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
