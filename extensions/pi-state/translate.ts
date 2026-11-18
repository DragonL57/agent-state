import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cross-host translation.
 *
 * The same source tree serves pi and Claude Code, whose conventions differ:
 *
 *   pi           frontmatter: description, tools (lowercase), thinking, model
 *   Claude Code  frontmatter: name, description, tools (capitalised), model
 *                and a body that reads the global contract from the clone
 *
 * Every function here is pure on its input text, so the parity tests can hold
 * the mapping still without a filesystem.
 */

/** Pi tool name → Claude Code tool name. `write` grants Edit in Claude, too. */
const CLAUDE_TOOLS: Record<string, string[]> = {
	read: ["Read"],
	bash: ["Bash"],
	write: ["Write", "Edit"],
	edit: ["Edit"],
	replace: ["Edit"],
	replace_match: ["Edit"],
	insert: ["Edit"],
	grep: ["Grep"],
	find: ["Glob"],
	ls: ["Glob"],
	websearch: ["WebSearch"],
	webfetch: ["WebFetch"],
	todo: ["TodoWrite"],
};

/** Tools with no Claude Code equivalent. `codemode` is a pi built-in. */
const DROPPED_TOOLS = new Set(["codemode"]);

/** Frontmatter keys pi understands that Claude Code does not. */
const PI_ONLY_KEYS = new Set(["thinking", "exclude_extensions", "extensions"]);

export interface Frontmatter {
	keys: Array<[string, string]>;
	body: string;
}

/** Split `---` frontmatter from the body. No fences means an empty map. */
export function splitFrontmatter(text: string): Frontmatter {
	const lines = text.split("\n");
	if (lines[0]?.trim() !== "---") return { keys: [], body: text };
	const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
	if (end === -1) return { keys: [], body: text };
	const keys: Array<[string, string]> = [];
	let collecting: string | undefined;
	let folded = "";

	const flush = () => {
		if (collecting) keys.push([collecting, folded.trim()]);
		collecting = undefined;
		folded = "";
	};

	for (const line of lines.slice(1, end)) {
		const match = line.match(/^([A-Za-z_.-]+):\s*(.*)$/);
		if (match) {
			flush();
			const value = match[2].trim();
			if (value === ">" || value === ">-" || value === "|" || value === "|-") {
				collecting = match[1];
			} else {
				keys.push([match[1], value]);
			}
			continue;
		}
		if (collecting && /^\s+/.test(line)) folded += `${line.trim()} `;
	}
	flush();
	return { keys, body: lines.slice(end + 1).join("\n").replace(/^\n+/, "") };
}

export function readFrontmatter(path: string): Frontmatter {
	return splitFrontmatter(readFileSync(path, "utf8"));
}

function get(keys: Array<[string, string]>, name: string): string | undefined {
	return keys.find(([key]) => key === name)?.[1];
}

/** Expand one pi tool list into a Claude Code list: capitalised, deduplicated, ordered. */
export function claudeTools(tools: string | undefined): string[] {
	const grant = (tools ?? "").trim();
	if (!grant || grant === "all") return [];
	const out: string[] = [];
	for (const raw of grant.split(",")) {
		const name = raw.trim();
		if (!name || DROPPED_TOOLS.has(name)) continue;
		for (const mapped of CLAUDE_TOOLS[name] ?? [name]) {
			if (!out.includes(mapped)) out.push(mapped);
		}
	}
	return out;
}

/** `{{AGENT_STATE}}` names the clone, where the content lives. */
export function claudePaths(text: string, stateRoot: string): string {
	return text.replaceAll("{{AGENT_STATE}}", stateRoot);
}

/**
 * A pi agent definition as a Claude Code agent file, or undefined when it
 * should not be published to Claude at all.
 *
 * Model and effort are never copied: the user's choice is that every Claude
 * agent inherits the session model and effort, so the fixture is the absence
 * of both keys.
 */
export function toClaudeAgent(
	name: string,
	text: string,
	stateRoot: string,
): string | undefined {
	const { keys, body } = splitFrontmatter(text);
	if (get(keys, "exclude_extensions")?.includes("builtin:mcp")) return undefined;
	const tools = claudeTools(get(keys, "tools"));
	const description = get(keys, "description") ?? "";
	const lines = ["---", `name: ${name}`, `description: ${description}`];
	if (tools.length > 0) lines.push(`tools: ${tools.join(", ")}`);
	lines.push("---", "");
	lines.push(claudePaths(body, stateRoot));
	return lines.join("\n");
}

/** A pi prompt file as a Claude Code command file. The `description` carries; the rest is body. */
export function toClaudeCommand(name: string, text: string, stateRoot: string): string {
	const { keys, body } = splitFrontmatter(text);
	const lines = ["---"];
	const description = get(keys, "description");
	if (description) lines.push(`description: ${description}`);
	const hint = get(keys, "argument-hint");
	if (hint) lines.push(`argument-hint: ${hint}`);
	lines.push("---", "");
	lines.push(claudePaths(body, stateRoot));
	return lines.join("\n");
}

/** The tracked tree's names, for the drift report. */
export function listFiles(dir: string, suffix = ""): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.flatMap((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return listFiles(path, suffix);
			return entry.name.endsWith(suffix) ? [path] : [];
		})
		.sort();
}
