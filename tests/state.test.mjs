import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const MANAGER = new URL("../tools/state.py", import.meta.url).pathname;

// The suite must not inherit a host list from the developer's shell: the README
// tells users to export AGENT_STATE_HOSTS, and a test that wants it sets it.
delete process.env.AGENT_STATE_HOSTS;

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

/** A path as a literal inside a RegExp. */
function literal(path) {
	return path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function manager(root, ...args) {
	// A throwaway Vibe home: the manager refuses to render a host it was not
	// handed, and these tests do not inspect that home. A test that does sets
	// AGENT_VIBE_HOME itself, and keeps it.
	const own = !process.env.AGENT_VIBE_HOME;
	const vibe = process.env.AGENT_VIBE_HOME ?? mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const env = { ...process.env, ...IDENTITY, AGENT_STATE_DIR: root, AGENT_STATE_TEST: "1", AGENT_VIBE_HOME: vibe };
	const result = spawnSync("python3", ["-I", MANAGER, ...args], { env, encoding: "utf8" });
	if (own) rmSync(vibe, { recursive: true, force: true });
	return { code: result.status, out: result.stdout, err: result.stderr };
}

/** The manager as normally invoked, plus a managed home per host. */
function managerWithHomes(pi, claude, vibe) {
	const env = {
		...process.env,
		...IDENTITY,
		AGENT_PI_HOME: pi,
		AGENT_CLAUDE_HOME: claude,
		AGENT_VIBE_HOME: vibe,
	};
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
	mkdirSync(join(root, "shared", "skills", "pi-state-sync"), { recursive: true });
	mkdirSync(join(root, "hosts", "pi"), { recursive: true });
	mkdirSync(join(root, "hosts", "claude", "output-styles"), { recursive: true });
	mkdirSync(join(root, "hosts", "vibe"), { recursive: true });
	writeFileSync(
		join(root, "shared", "AGENTS.md"),
		"# Contract\n\nRead the playbooks.\n\n| Tool | Load it when | Never when |\n|---|---|---|\n| `example` | always | never |\n",
	);
	writeFileSync(join(root, "hosts", "pi", "AGENTS.append.md"), "# Pi only\n");
	writeFileSync(join(root, "hosts", "vibe", "AGENTS.append.md"), "# Vibe only\n");
	mkdirSync(join(root, "shared", "prompts"), { recursive: true });
	writeFileSync(
		join(root, "shared", "prompts", "duo.md"),
		"---\ndescription: Pair up\n---\n\nRead `{{AGENT_STATE}}/rig/.rig/playbooks/workflow.md`.\n",
	);
	writeFileSync(join(root, "hosts", "pi", "settings.json"), "{}\n");
	writeFileSync(join(root, "shared", "skills", "example", "SKILL.md"), "---\nname: example\n---\n");
	writeFileSync(join(root, "shared", "skills", "pi-state-sync", "SKILL.md"), "---\nname: pi-state-sync\n---\n");
	git(root, "init", "-q", "-b", "main");
	cpSync(new URL("../tools/state.py", import.meta.url).pathname, join(root, "tools", "state.py"));
	git(root, "add", "-A");
	git(root, "commit", "-qm", "init");
	return root;
}

test("snapshot refuses a host-only file even when it is in the tree", () => {
	const root = fixture();
	try {
		const head = git(root, "rev-parse", "HEAD");
		writeFileSync(join(root, "auth.json"), '{"token":"host"}\n');
		const { code, err } = manager(root, "snapshot", "chore: leak");
		assert.equal(code, 1);
		assert.match(err, /host-only/);
		assert.equal(git(root, "rev-parse", "HEAD"), head, "the refusal committed nothing");
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

test("sync renders every configured home and check reports a stale one", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	process.env.AGENT_PI_HOME = pi;
	process.env.AGENT_CLAUDE_HOME = claude;
	process.env.AGENT_VIBE_HOME = vibe;
	try {
		let result = manager(root, "sync");
		assert.equal(result.code, 0, result.err);
		const piContract = readFileSync(join(pi, "AGENTS.md"), "utf8");
		assert.match(piContract, /^# Contract\n\nRead the playbooks\.\n/);
		assert.match(piContract, /# Pi only/);
		assert.match(readFileSync(join(claude, "CLAUDE.md"), "utf8"), /# Contract/);
		assert.doesNotMatch(readFileSync(join(claude, "CLAUDE.md"), "utf8"), /Pi only/);
		const vibeContract = readFileSync(join(vibe, "AGENTS.md"), "utf8");
		assert.match(vibeContract, /^# Contract\n\nRead the playbooks\.\n/);
		assert.match(vibeContract, /# Vibe only/);
		assert.doesNotMatch(vibeContract, /Pi only/);

		result = manager(root, "check");
		assert.equal(result.code, 0, "a fresh render is not drift");

		writeFileSync(join(claude, "CLAUDE.md"), "# hand edit\n");
		result = manager(root, "check");
		assert.equal(result.code, 1);
		assert.match(result.out, /CLAUDE\.md is stale/);

		writeFileSync(join(vibe, "AGENTS.md"), "# hand edit\n");
		result = manager(root, "check");
		assert.equal(result.code, 1);
		assert.match(result.out, /the vibe copy at .*AGENTS\.md is stale/);

		manager(root, "sync");
		assert.equal(manager(root, "check").code, 0);
	} finally {
		delete process.env.AGENT_PI_HOME;
		delete process.env.AGENT_CLAUDE_HOME;
		delete process.env.AGENT_VIBE_HOME;
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("HARNESS.md is rendered beside every contract and a stale copy is drift", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		// The contract tells the agent to read HARNESS.md beside it, so a home
		// without one is a broken promise.
		writeFileSync(join(root, "HARNESS.md"), "# Harness\n\nOpen: `{{AGENT_STATE}}/decisions/`.\n");
		const result = run(root, "sync");
		assert.equal(result.code, 0, result.err);
		for (const home of [pi, claude, vibe]) {
			// The token resolves to the clone, as it does in every other render.
			assert.equal(readFileSync(join(home, "HARNESS.md"), "utf8"), `# Harness\n\nOpen: \`${root}/decisions/\`.\n`);
		}
		assert.equal(run(root, "check").code, 0);

		writeFileSync(join(claude, "HARNESS.md"), "# stale\n");
		const check = run(root, "check");
		assert.equal(check.code, 1);
		assert.match(check.out, /the claude copy at .*HARNESS\.md is stale/);

		// The clone dropped it, so a copy left in a home is this renderer's orphan.
		rmSync(join(root, "HARNESS.md"));
		const orphan = run(root, "check");
		assert.equal(orphan.code, 1);
		assert.match(orphan.out, /the vibe copy at .*HARNESS\.md is stale/);
		assert.equal(run(root, "sync").code, 0);
		for (const home of [pi, claude, vibe]) {
			assert.ok(!existsSync(join(home, "HARNESS.md")), "the orphan copy is gone");
		}
		assert.equal(run(root, "check").code, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("status reports a drifted file beside the git summary", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		assert.equal(run(root, "sync").code, 0);
		writeFileSync(join(claude, "CLAUDE.md"), "# hand edit\n");
		const result = run(root, "status");
		assert.equal(result.code, 0, result.err);
		assert.match(result.out, /^clean$/m, "the tree itself is clean");
		assert.match(
			result.out,
			new RegExp("^drifted \\(claude\\): " + literal(join(claude, "CLAUDE.md")) + "$", "m"),
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("every host receives every skill the contract routes to", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	process.env.AGENT_PI_HOME = pi;
	process.env.AGENT_CLAUDE_HOME = claude;
	process.env.AGENT_VIBE_HOME = vibe;
	try {
		// A skill named in the contract's tool-routing table must reach every
		// host, or the rendered contract tells the agent to load what it never got.
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
			assert.ok(existsSync(join(vibe, "skills", name)), `vibe is missing the ${name} skill`);
		}
	} finally {
		delete process.env.AGENT_PI_HOME;
		delete process.env.AGENT_CLAUDE_HOME;
		delete process.env.AGENT_VIBE_HOME;
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("vibe gets the contract, the shared skills, and the agents as TOML subagents", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		writeFileSync(
			join(root, "shared", "agents", "worker.md"),
			[
				"---",
				"description: >-",
				"  Does the work.",
				"tools: read, bash, write, find, codemode",
				"thinking: high",
				"model: mistral/some-model",
				"---",
				"",
				"Read `{{AGENT_STATE}}/rig/.rig/playbooks/workflow.md`.",
				"",
			].join("\n"),
		);
		const result = run(root, "sync");
		assert.equal(result.code, 0, result.err);

		const contract = readFileSync(join(vibe, "AGENTS.md"), "utf8");
		assert.match(contract, /^# Contract\n\nRead the playbooks\.\n/);
		assert.match(contract, /# Vibe only/);
		assert.ok(existsSync(join(vibe, "skills", "example", "SKILL.md")), "the shared skill is linked");
		// A skill only pi can run is linked into pi's home and no other.
		assert.ok(existsSync(join(pi, "skills", "pi-state-sync", "SKILL.md")), "pi keeps its own skill");
		assert.ok(!existsSync(join(vibe, "skills", "pi-state-sync")), "vibe gets no pi-only skill");

		const agent = readFileSync(join(vibe, "agents", "worker.toml"), "utf8");
		// The marker is what `check` and `sync` use to tell a rendered agent from
		// a hand-written one, so it is asserted here, where it is produced.
		assert.match(agent, /^# Rendered from shared\/agents\/ by tools\/state\.py\. Do not edit\.$/m);
		assert.match(agent, /^description = "Does the work\."$/m);
		assert.match(agent, /^agent_type = "subagent"$/m);
		const tools = spawnSync(
			"python3",
			["-c", "import sys,tomllib,json; print(json.dumps(sorted(tomllib.load(open(sys.argv[1],'rb'))['enabled_tools'])))", join(vibe, "agents", "worker.toml")],
			{ encoding: "utf8" },
		);
		assert.equal(tools.status, 0, tools.stderr);
		assert.deepEqual(JSON.parse(tools.stdout), ["bash", "edit", "read_file", "write_file"]);
		assert.doesNotMatch(agent, /codemode/, "codemode has no Vibe equivalent");
		assert.doesNotMatch(agent, /^(model|thinking)\s*=/m, "the subagent inherits the session model and effort");
		assert.match(agent, new RegExp(literal(root)), "the body names the clone");

		// Vibe parses the file with tomllib; a broken literal string would fail here.
		const parsed = spawnSync(
			"python3",
			["-c", "import sys,tomllib; d=tomllib.load(open(sys.argv[1],'rb')); print(d['agent_type'], d['instructions'].splitlines()[0])", join(vibe, "agents", "worker.toml")],
			{ encoding: "utf8" },
		);
		assert.equal(parsed.status, 0, parsed.stderr);
		assert.match(parsed.stdout.trim(), /^subagent Read `.*workflow\.md`\.$/);

		writeFileSync(join(vibe, "agents", "worker.toml"), "# hand edit\n");
		const drift = run(root, "check");
		assert.equal(drift.code, 1);
		assert.match(drift.out, /the vibe copy at .*worker\.toml is stale/);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("a description with a quote, a backslash, and a control character survives the TOML round trip", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		// A description is free text. TOML's basic string has to escape the quote
		// and the backslash, and a control character has no raw form at all, so a
		// renderer that passes any of them through writes a file Vibe cannot read.
		const description = 'Say "hi" to C:\\path\x01';
		writeFileSync(
			join(root, "shared", "agents", "worker.md"),
			`---\ndescription: ${description}\ntools: read\n---\n\nBody.\n`,
		);
		const result = run(root, "sync");
		assert.equal(result.code, 0, result.err);
		const parsed = spawnSync(
			"python3",
			["-c", "import sys,tomllib; print(tomllib.load(open(sys.argv[1],'rb'))['description'])", join(vibe, "agents", "worker.toml")],
			{ encoding: "utf8" },
		);
		assert.equal(parsed.status, 0, parsed.stderr);
		assert.equal(parsed.stdout, description + "\n");
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("an agent excluded from MCP is not drift for Claude", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		writeFileSync(
			join(root, "shared", "agents", "mcp-worker.md"),
			"---\ndescription: Needs MCP\nexclude_extensions: builtin:mcp\ntools: read\n---\n\nBody.\n",
		);
		const result = run(root, "sync");
		assert.equal(result.code, 0, result.err);
		assert.ok(existsSync(join(pi, "agents", "mcp-worker.md")), "pi renders every agent");
		assert.ok(!existsSync(join(claude, "agents", "mcp-worker.md")), "Claude gets no agent it cannot run");
		// The renderer writes no Claude file for it, so `check` must not ask for one.
		const check = run(root, "check");
		assert.equal(check.code, 0, check.out);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("check names a missing Vibe file, a stale skill link, and an orphaned agent TOML", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		writeFileSync(join(root, "shared", "agents", "worker.md"), "---\ndescription: Does the work.\ntools: read\n---\n\nBody.\n");
		assert.equal(run(root, "sync").code, 0);

		// A rendered file that is gone is drift, not a clean home.
		unlinkSync(join(vibe, "AGENTS.md"));
		let result = run(root, "check");
		assert.equal(result.code, 1);
		assert.match(result.out, /the vibe copy at .*AGENTS\.md is stale/);

		assert.equal(run(root, "sync").code, 0);
		unlinkSync(join(vibe, "agents", "worker.toml"));
		result = run(root, "check");
		assert.equal(result.code, 1);
		assert.match(result.out, /the vibe copy at .*worker\.toml is stale/);

		// A skill is a link into the clone, so a missing or repointed one is drift.
		assert.equal(run(root, "sync").code, 0);
		unlinkSync(join(vibe, "skills", "example"));
		result = run(root, "check");
		assert.equal(result.code, 1);
		assert.match(result.out, /the vibe copy at .*skills\/example is stale/);

		// A link that points at another directory is drift, not just a missing one.
		const elsewhere = mkdtempSync(join(tmpdir(), "agent-elsewhere-"));
		symlinkSync(elsewhere, join(vibe, "skills", "example"), "dir");
		result = run(root, "check");
		assert.equal(result.code, 1);
		assert.match(result.out, /the vibe copy at .*skills\/example is stale/);
		rmSync(elsewhere, { recursive: true, force: true });

		// A file the renderer wrote and no longer would is drift; a hand-written
		// agent in the same directory belongs to the owner. The marker comes from
		// the render, so a change to it cannot leave this test passing.
		assert.equal(run(root, "sync").code, 0);
		const marker = readFileSync(join(vibe, "agents", "worker.toml"), "utf8").split("\n")[0];
		writeFileSync(
			join(vibe, "agents", "ghost.toml"),
			`${marker}\ndescription = "ghost"\nagent_type = "subagent"\n`,
		);
		writeFileSync(join(vibe, "agents", "mine.toml"), 'description = "mine"\nagent_type = "subagent"\n');
		result = run(root, "check");
		assert.equal(result.code, 1);
		assert.match(result.out, /ghost\.toml is stale/);
		assert.doesNotMatch(result.out, /mine\.toml/);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("sync removes an orphaned agent and a stale skill link, and leaves a hand-written agent", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	const elsewhere = mkdtempSync(join(tmpdir(), "agent-elsewhere-"));
	try {
		writeFileSync(join(root, "shared", "agents", "worker.md"), "---\ndescription: Does the work.\ntools: read\n---\n\nBody.\n");
		assert.equal(run(root, "sync").code, 0);
		// Vibe loads every `agents/*.toml` and every `skills/*` it finds, so a
		// file this renderer wrote and would no longer write stays live.
		const marker = readFileSync(join(vibe, "agents", "worker.toml"), "utf8").split("\n")[0];
		writeFileSync(join(vibe, "agents", "ghost.toml"), `${marker}\ndescription = "ghost"\nagent_type = "subagent"\n`);
		writeFileSync(join(vibe, "agents", "mine.toml"), 'description = "mine"\nagent_type = "subagent"\n');
		// A link the owner made is theirs, even when no shared skill has that name.
		symlinkSync(elsewhere, join(vibe, "skills", "mine"), "dir");
		// A link this renderer made, for a skill the clone has since dropped.
		mkdirSync(join(root, "shared", "skills", "gone"), { recursive: true });
		writeFileSync(join(root, "shared", "skills", "gone", "SKILL.md"), "---\nname: gone\n---\n");
		assert.equal(run(root, "sync").code, 0);
		assert.ok(existsSync(join(vibe, "skills", "gone")), "the new shared skill is linked");
		rmSync(join(root, "shared", "skills", "gone"), { recursive: true, force: true });

		const result = run(root, "sync");
		assert.equal(result.code, 0, result.err);
		assert.ok(!existsSync(join(vibe, "agents", "ghost.toml")), "the orphan this renderer wrote is gone");
		assert.ok(existsSync(join(vibe, "agents", "mine.toml")), "a hand-written agent is the owner's");
		assert.ok(existsSync(join(vibe, "agents", "worker.toml")), "the rendered agent stays");
		assert.ok(!existsSync(join(vibe, "skills", "gone")), "the link for a dropped shared skill is gone");
		assert.ok(existsSync(join(vibe, "skills", "mine")), "a link the owner made is the owner's");
		assert.ok(existsSync(join(vibe, "skills", "example")), "the shared skill stays");
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
		rmSync(elsewhere, { recursive: true, force: true });
	}
});

test("a real directory where a skill link goes is refused, not deleted", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		// A hand-installed skill may hold a credential, so the renderer refuses
		// rather than replacing it.
		mkdirSync(join(vibe, "skills", "example"), { recursive: true });
		writeFileSync(join(vibe, "skills", "example", "SKILL.md"), "---\nname: example\n---\n");
		const result = run(root, "sync");
		assert.equal(result.code, 1);
		assert.match(result.err, /is a real directory, not a link into the clone/);
		assert.ok(existsSync(join(vibe, "skills", "example", "SKILL.md")), "the owner's file survives");
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("an agent named main is refused in any case", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		for (const name of ["main", "Main", "MAIN"]) {
			writeFileSync(join(root, "shared", "agents", `${name}.md`), "---\ndescription: x\ntools: read\n---\n\nBody.\n");
			const sync = run(root, "sync");
			assert.equal(sync.code, 1, name);
			assert.match(sync.err, /Vibe reserves for hook matching/, name);
			const check = run(root, "check");
			assert.equal(check.code, 1, name);
			assert.match(check.out, /Vibe reserves for hook matching/, name);
			assert.doesNotMatch(check.out + check.err, /Traceback/);
			unlinkSync(join(root, "shared", "agents", `${name}.md`));
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("an agent over Vibe's instruction limit is refused, and one at the limit is not", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		const head = "---\ndescription: x\ntools: read\n---\n\n";
		// The limit counts the body exactly as the renderer measures it.
		writeFileSync(join(root, "shared", "agents", "worker.md"), head + "x".repeat(65536));
		let result = run(root, "sync");
		assert.equal(result.code, 0, result.err);

		writeFileSync(join(root, "shared", "agents", "worker.md"), head + "x".repeat(65537));
		result = run(root, "sync");
		assert.equal(result.code, 1);
		assert.match(result.err, /65,537 characters of instructions; Vibe's limit is 65,536/);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("an agent Vibe would drop is refused instead of rendered", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		// Vibe drops an agent with no description, and an absent enabled_tools
		// grants every tool, so an empty one cannot express "none".
		for (const [body, message] of [
			["---\ntools: read\n---\n\nBody.\n", /has no description/],
			["---\ndescription: x\ntools: codemode\n---\n\nBody.\n", /no tool for \(codemode\)/],
			["---\ndescription: x\ntools: read\n---\n\nBody with a ''' triple.\n", /contains '''/],
			["---\ndescription: x\ntools: read\n---\n\nBody with a \x0c form feed.\n", /control character/],
		]) {
			writeFileSync(join(root, "shared", "agents", "worker.md"), body);
			const sync = run(root, "sync");
			assert.equal(sync.code, 1, body);
			assert.match(sync.err, message);
			// The refused render wrote nothing, so the hand edit is the only
			// content. `check` must print this finding and the refusal together:
			// the drift collected before the refusal is not lost to it.
			writeFileSync(join(vibe, "AGENTS.md"), "# hand edit\n");
			const check = run(root, "check");
			assert.equal(check.code, 1);
			assert.match(check.out, /the vibe copy at .*AGENTS\.md is stale/, "the drift found before the refusal still prints");
			assert.match(check.out, message);
			assert.doesNotMatch(check.out + check.err, /Traceback/);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("a regular file where a skill link goes is replaced", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		mkdirSync(join(vibe, "skills"), { recursive: true });
		writeFileSync(join(vibe, "skills", "example"), "not a directory\n");
		const result = run(root, "sync");
		assert.equal(result.code, 0, result.err);
		assert.ok(lstatSync(join(vibe, "skills", "example")).isSymbolicLink());
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("a template of a host-only file is trackable, and the file itself is not", () => {
	const root = taskRepo();
	try {
		writeFileSync(join(root, ".env.example"), "TOKEN=\n");
		writeFileSync(join(root, "config.toml.example"), "model = \"x\"\n");
		writeFileSync(join(root, ".env"), "TOKEN=secret\n");
		const refused = manager(root, "snapshot", "TASK-1 chore: add a template");
		assert.equal(refused.code, 1);
		assert.match(refused.err, /host-only/);
		rmSync(join(root, ".env"));
		const accepted = manager(root, "snapshot", "TASK-1 chore: add a template");
		assert.equal(accepted.code, 0, accepted.err);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a source the clone does not have is not counted as rendered", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		rmSync(join(root, "hosts", "pi", "settings.json"));
		const result = run(root, "sync");
		assert.equal(result.code, 0, result.err);
		assert.ok(!existsSync(join(pi, "settings.json")), "nothing was written");
		assert.match(result.out, /^Rendered \d+ files into: pi, claude, vibe\.$/m);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("an unreadable agent file is one error line, not a traceback", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		assert.equal(run(root, "sync").code, 0);
		writeFileSync(join(vibe, "agents", "junk.toml"), Buffer.from([0xff, 0xfe, 0x00, 0x62]));
		const check = run(root, "check");
		assert.equal(check.code, 1);
		assert.match(check.out, /the vibe copy at .*junk\.toml is stale/);
		const sync = run(root, "sync");
		assert.equal(sync.code, 1);
		assert.match(sync.err, /cannot be read/);
		assert.doesNotMatch(sync.err, /Traceback/);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("hosts prints the configured hosts only", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		writeFileSync(join(root, "config.json"), '{"hosts": ["pi"]}\n');
		const result = run(root, "hosts");
		assert.equal(result.code, 0, result.err);
		assert.match(result.out, /^hosts:  pi$/m);
		assert.match(result.out, new RegExp("^pi:\\s+" + literal(pi) + "$", "m"));
		assert.doesNotMatch(result.out, /^claude:/m);
		assert.doesNotMatch(result.out, /^vibe:/m);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
	}
});

test("hosts prints each home's default when no override is set", () => {
	const root = fixture();
	const home = mkdtempSync(join(tmpdir(), "agent-home-"));
	const env = { ...process.env, AGENT_STATE_DIR: root, HOME: home };
	delete env.AGENT_PI_HOME;
	delete env.AGENT_CLAUDE_HOME;
	delete env.AGENT_VIBE_HOME;
	delete env.AGENT_STATE_TEST;
	delete env.AGENT_STATE_HOSTS;
	try {
		const result = spawnSync("python3", ["-I", MANAGER, "hosts"], { env, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, new RegExp("^pi:\\s+" + literal(join(home, ".pi", "agent")) + "$", "m"));
		assert.match(result.stdout, new RegExp("^claude:\\s+" + literal(join(home, ".claude")) + "$", "m"));
		assert.match(result.stdout, new RegExp("^vibe:\\s+" + literal(join(home, ".vibe")) + "$", "m"));
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(home, { recursive: true, force: true });
	}
});

test("a dot-prefixed or dated host-only name is refused, not stripped to a harmless one", () => {
	const root = fixture();
	try {
		for (const name of [
			".env",
			".env.keys",
			".last-cleanup",
			"config.toml.bak",
			"config.toml.bak.20261119144853",
			".connector_bootstrap_cache.json.lock",
			".trusted_folders.toml.lock",
		]) {
			writeFileSync(join(root, name), "x\n");
			const { code, err } = manager(root, "snapshot", "chore: leak");
			assert.equal(code, 1, name);
			assert.match(err, /host-only/, name);
			unlinkSync(join(root, name));
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("render_home refuses an unknown host instead of writing the Claude home", () => {
	const root = fixture();
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	try {
		const result = spawnSync(
			"python3",
			[
				"-c",
				[
					"import importlib.util, pathlib, sys",
					`spec = importlib.util.spec_from_file_location("state", ${JSON.stringify(MANAGER)})`,
					"m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
					`root = pathlib.Path(${JSON.stringify(root)}); m._bind(root)`,
					"try:",
					"    m.render_home(root, 'bogus')",
					"except m.StateError as error:",
					"    print(error); sys.exit(0)",
					"sys.exit(1)",
				].join("\n"),
			],
			{ env: { ...process.env, AGENT_CLAUDE_HOME: claude }, encoding: "utf8" },
		);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Unknown host 'bogus'/);
		assert.deepEqual(readdirSync(claude), [], "the Claude home stays untouched");
	} finally {
		rmSync(root, { recursive: true, force: true });
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
		process.env.AGENT_VIBE_HOME = join(origin, "vibehome");
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
		delete process.env.AGENT_VIBE_HOME;
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
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	process.env.AGENT_PI_HOME = pi;
	process.env.AGENT_CLAUDE_HOME = claude;
	process.env.AGENT_VIBE_HOME = vibe;
	// A `~/` path in a rendered file, resolved against a temp HOME so the
	// check's `~/` branch runs without touching the real home.
	const fakeHome = mkdtempSync(join(tmpdir(), "agent-fakehome-"));
	const realHome = process.env.HOME;
	try {
			writeFileSync(join(root, "config.json"), '{"hosts": ["pi", "claude", "vibe"]}\n');
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
		mkdirSync(join(fakeHome, ".probe"), { recursive: true });
		process.env.HOME = fakeHome;
		writeFileSync(join(root, "hosts", "vibe", "AGENTS.append.md"), "# Vibe only\n\nRead `~/.probe`.\n");
		git(root, "add", "-A");
		git(root, "commit", "-qm", "chore: target");
		const result = manager(root, "sync");
		assert.equal(result.code, 0, result.err);
		let tilde = 0;
		for (const text of [
			readFileSync(join(pi, "AGENTS.md"), "utf8"),
			readFileSync(join(pi, "agents", "worker.md"), "utf8"),
			readFileSync(join(pi, "prompts", "duo.md"), "utf8"),
			readFileSync(join(pi, "skills", "example", "SKILL.md"), "utf8"),
			readFileSync(join(claude, "CLAUDE.md"), "utf8"),
			readFileSync(join(claude, "agents", "worker.md"), "utf8"),
			readFileSync(join(claude, "commands", "duo.md"), "utf8"),
			readFileSync(join(vibe, "AGENTS.md"), "utf8"),
			readFileSync(join(vibe, "agents", "worker.toml"), "utf8"),
		]) {
			// `~/` as well as `/`: a rendered file that names another host's home
			// is a broken promise on a machine that runs only this host. `*` is a
			// glob in prose, not a path.
			for (const [, target] of text.matchAll(/`((?:~|\/)[^`*]+)`/g)) {
				if (target.startsWith("~/")) tilde += 1;
				const path = target.startsWith("~/") ? join(homedir(), target.slice(2)) : target;
				assert.ok(existsSync(path), `${target} is named by a rendered file but does not exist`);
			}
		}
		// Without this the `~/` half of the pattern could stop matching and the
		// loop above would pass on the absolute paths alone.
		assert.ok(tilde > 0, "the `~/` branch of the check ran");

	} finally {
		delete process.env.AGENT_PI_HOME;
		delete process.env.AGENT_CLAUDE_HOME;
		delete process.env.AGENT_VIBE_HOME;
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
		rmSync(fakeHome, { recursive: true, force: true });
		process.env.HOME = realHome;
	}
});

test("AGENT_STATE_HOSTS limits a render to the configured host", () => {
	const root = fixture();
	const pi = mkdtempSync(join(tmpdir(), "agent-pi-"));
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const vibe = mkdtempSync(join(tmpdir(), "agent-vibe-"));
	const run = managerWithHomes(pi, claude, vibe);
	try {
		let result = spawnSync("python3", ["-I", MANAGER, "sync"], {
			env: {
				...process.env,
				AGENT_STATE_DIR: root,
				AGENT_PI_HOME: pi,
				AGENT_CLAUDE_HOME: claude,
				AGENT_VIBE_HOME: vibe,
				AGENT_STATE_HOSTS: "claude",
				AGENT_STATE_TEST: "1",
			},
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(readdirSync(pi), [], "an unconfigured home stays empty");
		assert.deepEqual(readdirSync(vibe), [], "an unconfigured home stays empty");
		assert.ok(existsSync(join(claude, "CLAUDE.md")));

		// The tracked key, with no override, is the default source.
		writeFileSync(join(root, "config.json"), '{"hosts": ["pi"]}\n');
		rmSync(claude, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
		mkdirSync(pi);
		mkdirSync(claude);
		mkdirSync(vibe);
		result = run(root, "sync");
		assert.equal(result.code, 0, result.err);
		assert.deepEqual(readdirSync(claude), [], "a pi-only machine renders no Claude home");
		assert.deepEqual(readdirSync(vibe), [], "a pi-only machine renders no Vibe home");
		assert.ok(existsSync(join(pi, "AGENTS.md")));
		assert.match(result.out, /into: pi\./);

		// A separator-only override names no host. That is an error, not a
		// silent fallback to config.json.
		const blank = spawnSync("python3", ["-I", MANAGER, "sync"], {
			env: {
				...process.env,
				AGENT_STATE_DIR: root,
				AGENT_PI_HOME: pi,
				AGENT_CLAUDE_HOME: claude,
				AGENT_VIBE_HOME: vibe,
				AGENT_STATE_HOSTS: " , ",
				AGENT_STATE_TEST: "1",
			},
			encoding: "utf8",
		});
		assert.equal(blank.status, 1);
		assert.match(blank.stderr, /AGENT_STATE_HOSTS names no host/);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(vibe, { recursive: true, force: true });
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
	// A canary home: with the guard gone the manager renders the default home,
	// and this is where that lands.
	const home = mkdtempSync(join(tmpdir(), "agent-home-"));
	const env = { ...process.env, AGENT_STATE_DIR: root, AGENT_STATE_TEST: "1", HOME: home };
	delete env.AGENT_PI_HOME;
	delete env.AGENT_CLAUDE_HOME;
	delete env.AGENT_VIBE_HOME;
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
		assert.deepEqual(readdirSync(home), [], "the default home stays untouched");

		writeFileSync(join(root, "config.json"), '{"hosts": ["pi"]}\n');
		result = spawnSync("python3", ["-I", MANAGER, "sync"], {
			env: { ...env, AGENT_PI_HOME: pi },
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr);
		assert.ok(existsSync(join(pi, "AGENTS.md")), "the configured host still renders");
		assert.deepEqual(readdirSync(home), [], "the default home stays untouched");
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(pi, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
		rmSync(home, { recursive: true, force: true });
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
		// Every home is handed over: an unset one resolves to the real home, and
		// the guard only fires on the host it reaches first.
		const result = spawnSync("python3", ["-I", MANAGER, "sync"], {
			env: {
				...process.env,
				AGENT_STATE_DIR: root,
				AGENT_PI_HOME: join(home, "pi"),
				AGENT_CLAUDE_HOME: home,
				AGENT_VIBE_HOME: join(home, "vibe"),
			},
			encoding: "utf8",
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /sits inside the home it renders/);
	} finally {
		delete process.env.AGENT_CLAUDE_HOME;
		delete process.env.AGENT_PI_HOME;
		delete process.env.AGENT_VIBE_HOME;
		rmSync(home, { recursive: true, force: true });
	}
});
