import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The verbs every host shares. The manager in tools/state.py implements them. */
export const COMMANDS = ["status", "snapshot", "pull", "push", "sync", "check", "hosts"] as const;

const SECRET_KEY_PATTERN = /(?:api[-_]?key|token|secret|password|authorization)/i;
const SAFE_LITERAL_SECRETS = new Set(["dummy", "local", "none", "ollama"]);

export interface ParsedCommand {
	action: (typeof COMMANDS)[number] | "help" | string;
	rest: string;
}

export function parseCommand(input: string): ParsedCommand {
	const trimmed = input.trim();
	if (!trimmed) return { action: "help", rest: "" };

	const separator = trimmed.search(/\s/);
	if (separator === -1) return { action: trimmed, rest: "" };

	return {
		action: trimmed.slice(0, separator),
		rest: trimmed.slice(separator).trim(),
	};
}

/** The clone this host renders from: AGENT_STATE_DIR, then the pi variables, then ~/agent-state. */
export function resolveStateRoot(): string {
	return resolve(
		process.env.AGENT_STATE_DIR ??
			process.env.PI_STATE_DIR ??
			process.env.PI_CODING_AGENT_DIR ??
			join(homedir(), "agent-state"),
	);
}

function isSafeSecretReference(value: string): boolean {
	const trimmed = value.trim();
	return trimmed.startsWith("$") || trimmed.startsWith("!") || SAFE_LITERAL_SECRETS.has(trimmed.toLowerCase());
}

/** Literal secrets are refused; `$VAR`, `!command`, and the known dummy values are references. */
export function findUnsafeSecretLiterals(value: unknown, path = "$", issues: string[] = []): string[] {
	if (Array.isArray(value)) {
		value.forEach((item, index) => findUnsafeSecretLiterals(item, `${path}[${index}]`, issues));
		return issues;
	}

	if (!value || typeof value !== "object") return issues;

	for (const [key, child] of Object.entries(value)) {
		const childPath = `${path}.${key}`;
		if (typeof child === "string" && SECRET_KEY_PATTERN.test(key) && !isSafeSecretReference(child)) {
			issues.push(childPath);
			continue;
		}
		findUnsafeSecretLiterals(child, childPath, issues);
	}

	return issues;
}

export function isSafeRemoteUrl(input: string): boolean {
	const remote = input.trim();
	return remote.length > 0 && !remote.startsWith("-") && !/[\s\0\r\n]/.test(remote);
}

export function githubSlugFromTarget(input: string): string | undefined {
	const target = input.trim().replace(/\.git$/, "");
	const direct = target.match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]+)$/);
	if (direct) return direct[1];

	const ssh = target.match(/^git@github\.com:([^/]+\/[^/]+)$/i);
	if (ssh) return ssh[1];

	try {
		const url = new URL(target);
		if (url.hostname.toLowerCase() !== "github.com") return undefined;
		const path = url.pathname.replace(/^\/+|\/+$/g, "");
		return /^[^/]+\/[^/]+$/.test(path) ? path : undefined;
	} catch {
		return undefined;
	}
}
