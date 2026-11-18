import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const STATE = new URL("..", import.meta.url).pathname;
const MANAGER = join(STATE, "tools", "state.py");
const SCRIPT = join(STATE, "shared", "statusline", "claude.sh");

const PAYLOAD = {
	workspace: { current_dir: "/tmp/project" },
	model: { display_name: "Opus 5.5" },
	context_window: { used_percentage: 42.5, context_window_size: 200000 },
};

const TRACKED_SETTINGS = `${JSON.stringify({
	statusLine: { type: "command", command: "{{AGENT_STATE}}/shared/statusline/claude.sh" },
})}\n`;

/** A state tree with the manager, the contract, and the status line. */
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "agent-state-"));
	mkdirSync(join(root, "tools"), { recursive: true });
	mkdirSync(join(root, "shared", "agents"), { recursive: true });
	mkdirSync(join(root, "shared", "statusline"), { recursive: true });
	mkdirSync(join(root, "hosts", "claude"), { recursive: true });
	writeFileSync(join(root, "shared", "AGENTS.md"), "# Contract\n");
	cpSync(SCRIPT, join(root, "shared", "statusline", "claude.sh"));
	cpSync(join(STATE, "tools", "state.py"), join(root, "tools", "state.py"));
	writeFileSync(join(root, "hosts", "claude", "settings.json"), TRACKED_SETTINGS);
	execFileSync("git", ["-C", root, "init", "-q", "-b", "main"]);
	return root;
}

function managerEnv(root, claude) {
	return { ...process.env, AGENT_STATE_DIR: root, AGENT_CLAUDE_HOME: claude, AGENT_STATE_HOSTS: "claude" };
}

function run(env, ...args) {
	return spawnSync("python3", ["-I", MANAGER, ...args], { env, encoding: "utf8" });
}

function render(home, env = process.env) {
	return spawnSync("bash", [join(home, "statusline.sh")], {
		input: JSON.stringify(PAYLOAD),
		env: { ...env, HOME: home },
		encoding: "utf8",
	});
}

/** The rendered text without its color escapes: what the eye reads. */
function plain(text) {
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Says which reader ran, so a test can tell the two field readers apart. */
function stubJq() {
	const dir = mkdtempSync(join(tmpdir(), "statusline-bin-"));
	const path = join(dir, "jq");
	writeFileSync(path, "#!/bin/sh\nprintf 'JQ-RAN'\n");
	chmodSync(path, 0o755);
	return path;
}

test("the tracked status line renders in one row and never fails the session", () => {
	assert.ok(existsSync(SCRIPT), "shared/statusline/claude.sh is missing");
	const home = mkdtempSync(join(tmpdir(), "statusline-"));
	try {
		cpSync(SCRIPT, join(home, "statusline.sh"));
		const result = render(home);
		assert.equal(result.status, 0, result.stderr);
		const rows = result.stdout.split("\n").filter((row) => row !== "").map(plain);
		assert.equal(rows.length, 1, `expected one row, got:\n${result.stdout}`);
		assert.match(rows[0], /Opus 5\.5/);
		assert.match(rows[0], /42\.5%\/200k/);

		const bare = spawnSync("bash", [join(home, "statusline.sh")], { input: "", encoding: "utf8" });
		assert.equal(bare.status, 0, bare.stderr);

		// A context window of 0 has no maximum to print, and still must not fail the session.
		const zero = spawnSync("bash", [join(home, "statusline.sh")], {
			input: JSON.stringify({ context_window: { used_percentage: 0, context_window_size: 0 } }),
			encoding: "utf8",
		});
		assert.equal(zero.status, 0, zero.stderr);
		assert.equal(plain(zero.stdout).trim().split("\n").length, 1);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("the status line reads its fields through the jq it is handed", () => {
	const home = mkdtempSync(join(tmpdir(), "statusline-"));
	const jq = stubJq();
	try {
		cpSync(SCRIPT, join(home, "statusline.sh"));
		const result = render(home, { ...process.env, HOME: home, STATUSLINE_JQ: jq });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /JQ-RAN/, "a jq that echoes its answer still reached the render");
	} finally {
		rmSync(home, { recursive: true, force: true });
		rmSync(join(jq, ".."), { recursive: true, force: true });
	}
});

test("the status line falls back to the python reader when jq is missing", () => {
	const home = mkdtempSync(join(tmpdir(), "statusline-"));
	const bin = mkdtempSync(join(tmpdir(), "statusline-bin-"));
	const python = join(bin, "python3");
	try {
		writeFileSync(python, "#!/bin/sh\nprintf 'PY-RAN'\n");
		chmodSync(python, 0o755);
		cpSync(SCRIPT, join(home, "statusline.sh"));
		const result = render(home, { ...process.env, HOME: home, STATUSLINE_JQ: join(bin, "no-such-jq"), STATUSLINE_PY: python });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /PY-RAN/);
	} finally {
		rmSync(home, { recursive: true, force: true });
		rmSync(bin, { recursive: true, force: true });
	}
});

test("sync renders the status line and its key; check names each loss", () => {
	const root = fixture();
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const env = managerEnv(root, claude);
	try {
		// A host-only key the render must survive: the user owns it.
		writeFileSync(join(claude, "settings.json"), `${JSON.stringify({ theme: "dark" })}\n`);

		let result = run(env, "sync");
		assert.equal(result.status, 0, result.stderr);
		const read = () => JSON.parse(readFileSync(join(claude, "settings.json"), "utf8"));
		let settings = read();
		assert.equal(settings.statusLine.command, join(root, "shared", "statusline", "claude.sh"));
		assert.doesNotMatch(JSON.stringify(settings), /\{\{AGENT_STATE\}\}/, "no token survives into the home");
		assert.equal(settings.theme, "dark", "the key the render does not own survives");
		const script = join(claude, "statusline.sh");
		assert.ok(existsSync(script), "the script is missing");
		assert.ok(statSync(script).mode & 0o111, "the script is not executable");

		result = run(env, "check");
		assert.equal(result.status, 0, result.stdout);

		writeFileSync(join(claude, "settings.json"), `${JSON.stringify({ theme: "dark" })}\n`);
		result = run(env, "check");
		assert.equal(result.status, 1);
		assert.match(result.stdout, /settings\.json/);

		result = run(env, "sync");
		assert.equal(result.status, 0, result.stderr);
		rmSync(script);
		result = run(env, "check");
		assert.equal(result.status, 1);
		assert.match(result.stdout, /statusline\.sh/);

		result = run(env, "sync");
		assert.equal(result.status, 0, result.stderr);
		writeFileSync(script, "#!/bin/sh\n");
		result = run(env, "check");
		assert.equal(result.status, 1);
		assert.match(result.stdout, /statusline\.sh/);

		// A command left pointing at an older clone is drift as well.
		result = run(env, "sync");
		assert.equal(result.status, 0, result.stderr);
		settings = read();
		settings.statusLine.command = "/elsewhere/shared/statusline/claude.sh";
		writeFileSync(join(claude, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
		result = run(env, "check");
		assert.equal(result.status, 1);
		assert.match(result.stdout, /settings\.json/);

		// A hand-set statusLine is the render's to replace; the owner's other key stays.
		writeFileSync(
			join(claude, "settings.json"),
			`${JSON.stringify({ theme: "dark", statusLine: { type: "command", command: "/home/me/mine.sh" } })}\n`,
		);
		result = run(env, "check");
		assert.equal(result.status, 1, "a hand-set statusLine is named before it is replaced");
		assert.match(result.stdout, /settings\.json/);
		result = run(env, "sync");
		assert.equal(result.status, 0, result.stderr);
		assert.equal(read().statusLine.command, join(root, "shared", "statusline", "claude.sh"));
		assert.equal(read().theme, "dark");

		// The user's own keys are not drift: a render keeps them and check stays quiet.
		result = run(env, "sync");
		assert.equal(result.status, 0, result.stderr);
		assert.equal(read().theme, "dark");
		result = run(env, "check");
		assert.equal(result.status, 0, result.stdout);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
	}
});

test("a broken configuration makes check report one line, never a crash", () => {
	const root = fixture();
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const env = managerEnv(root, claude);
	try {
		writeFileSync(join(root, "hosts", "claude", "settings.json"), "[]\n");
		let result = run(env, "check");
		assert.equal(result.status, 1);
		assert.match(result.stdout, /not a JSON object/);

		// A subset that parses but is not an object reaches the same line.
		writeFileSync(join(root, "hosts", "claude", "settings.json"), "5\n");
		result = run(env, "check");
		assert.equal(result.status, 1);
		assert.match(result.stdout, /not a JSON object/);

		// The clone sitting inside a home it renders is one finding, not a crash.
		const home = mkdtempSync(join(tmpdir(), "agent-home-"));
		try {
			const nested = join(home, "state");
			cpSync(root, nested, { recursive: true });
			const nestedEnv = { ...env, AGENT_STATE_DIR: nested, AGENT_CLAUDE_HOME: home };
			result = run(nestedEnv, "check");
			assert.equal(result.status, 1);
			assert.match(result.stdout, /sits inside the home it renders/);
			assert.match(result.stdout, /^agent-state: /m);
			assert.equal(result.stdout.trim().split("\n").length, 1, "one finding line");
			assert.doesNotMatch(result.stdout + result.stderr, /Traceback/);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
	}
});

test("the portable subset is tracked; the home settings file and a literal secret are refused", () => {
	const root = fixture();
	const claude = mkdtempSync(join(tmpdir(), "agent-claude-"));
	const env = managerEnv(root, claude);
	const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
	try {
		git("config", "user.email", "t@example.com");
		git("config", "user.name", "t");
		git("add", "-A");
		git("commit", "-qm", "init");

		// A credential in the tracked subset is caught by the secret scan.
		writeFileSync(
			join(root, "hosts", "claude", "settings.json"),
			`${JSON.stringify({ statusLine: { type: "command", command: "leak" }, apiKey: "sk-live-abc" })}\n`,
		);
		let result = run(env, "snapshot", "chore: leak");
		assert.equal(result.status, 1);
		assert.match(result.stderr, /Literal secrets/);

		// A host's own file at the root of the tree is staged and then refused.
		writeFileSync(join(root, "hosts", "claude", "settings.json"), TRACKED_SETTINGS);
		writeFileSync(join(root, "settings.json"), '{"theme": "dark"}\n');
		result = run(env, "snapshot", "chore: root settings");
		assert.equal(result.status, 1);
		assert.match(result.stderr, /host-only/);
		rmSync(join(root, "settings.json"));

		writeFileSync(
			join(root, "hosts", "claude", "settings.json"),
			`${JSON.stringify({ statusLine: { type: "command", command: "{{AGENT_STATE}}/shared/statusline/claude.sh", argument_hint: "x" } })}\n`,
		);
		result = run(env, "snapshot", "TASK-2 feat: track the status line");
		assert.equal(result.status, 0, result.stderr);
		assert.match(git("log", "-1", "--format=%s"), /TASK-2/);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(claude, { recursive: true, force: true });
	}
});
