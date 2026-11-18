import assert from "node:assert/strict";
import test from "node:test";
import {
	claudePaths,
	claudeTools,
	splitFrontmatter,
	toClaudeAgent,
	toClaudeCommand,
} from "../extensions/pi-state/translate.ts";

const ROOT = "/home/user/agent-state";
const CLAUDE = "/home/user/.claude";

test("frontmatter folds a multi-line description and keeps the body", () => {
	const { keys, body } = splitFrontmatter(
		"---\nname: x\ndescription: >-\n  one two\n  three\ntools: read, bash\n---\n\nBody.\n",
	);
	assert.deepEqual(keys, [
		["name", "x"],
		["description", "one two three"],
		["tools", "read, bash"],
	]);
	assert.equal(body, "Body.\n");
});

test("a file without frontmatter is all body", () => {
	assert.deepEqual(splitFrontmatter("# Title\n"), { keys: [], body: "# Title\n" });
});

test("pi tools become capitalised Claude tools, once each", () => {
	assert.deepEqual(claudeTools("read, bash, write"), ["Read", "Bash", "Write", "Edit"]);
	assert.deepEqual(claudeTools("write, edit, replace"), ["Write", "Edit"]);
	assert.deepEqual(claudeTools("find, ls"), ["Glob"]);
	assert.deepEqual(claudeTools("read, codemode"), ["Read"]);
	assert.deepEqual(claudeTools("all"), [], "all is expressed by omitting the key");
	assert.deepEqual(claudeTools(""), []);
});

test("state paths point at the Claude home", () => {
	const text = "Read `{{AGENT_STATE}}/playbooks/workflow.md` and `{{AGENT_STATE}}/AGENTS.md`.";
	const out = claudePaths(text, ROOT, CLAUDE);
	assert.equal(out, "Read `/home/user/.claude/playbooks/workflow.md` and `/home/user/.claude/AGENTS.md`.");
});

test("a Claude agent drops pi-only keys and inherits the model", () => {
	const source = [
		"---",
		"description: >-",
		"  Does the work.",
		"tools: read, bash, write",
		"exclude_extensions: pi-mcp-adapter",
		"thinking: high",
		"model: mistral/some-model",
		"---",
		"",
		"Read `{{AGENT_STATE}}/AGENTS.md`.",
	].join("\n");
	const out = toClaudeAgent("implementer", source, ROOT, CLAUDE);
	assert.match(out, /^---\nname: implementer\ndescription: Does the work\.\ntools: Read, Bash, Write, Edit\n---\n/);
	assert.match(out, /Read `\/home\/user\/\.claude\/AGENTS\.md`\./);
	assert.doesNotMatch(out, /thinking:|effort:|model:|exclude_extensions/);
});

test("an agent excluded from MCP is not published to Claude", () => {
	const source = "---\ndescription: x\nexclude_extensions: builtin:mcp\n---\nbody\n";
	assert.equal(toClaudeAgent("worker", source, ROOT, CLAUDE), undefined);
});

test("a prompt becomes a command with its hint", () => {
	const source = ["---", "description: Do it", "argument-hint: [what]", "---", "", "Go: {{AGENT_STATE}}/x.md"].join("\n");
	const out = toClaudeCommand("go", source, ROOT, CLAUDE);
	assert.match(out, /description: Do it\nargument-hint: \[what\]/);
	assert.match(out, /\/home\/user\/\.claude\/x\.md/);
});

