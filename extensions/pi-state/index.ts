import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { COMMANDS, isSafeRemoteUrl, resolveStateRoot } from "./core.ts";

const ROOT = resolveStateRoot();
const GIT_TIMEOUT_MS = 60_000;

/**
 * The pi half of agent-state.
 *
 * One clone per machine, beside the homes, and the manager renders the
 * configured homes from it (it refuses a clone inside a home it renders). The
 * manager in tools/state.py does the work for both hosts; this extension only
 * resolves the verbs and shows the result, so neither host can drift from the
 * other.
 */
export default function agentStateExtension(pi: ExtensionAPI) {
	async function manager(action: string, rest: string): Promise<string> {
		const path = resolve(ROOT, "tools", "state.py");
		if (!existsSync(path)) {
			throw new Error(`${path} is missing; clone agent-state into ${ROOT} first`);
		}
		const result = await pi.exec("python3", ["-I", path, action, ...(rest ? [rest] : [])], {
			cwd: ROOT,
			timeout: GIT_TIMEOUT_MS,
		});
		if (result.code !== 0) {
			throw new Error(result.stderr.trim() || result.stdout.trim() || `agent-state ${action} failed`);
		}
		return result.stdout.trim();
	}

	async function git(args: string[], allowFailure = false) {
		const result = await pi.exec("git", ["-C", ROOT, ...args], { timeout: GIT_TIMEOUT_MS });
		if (!allowFailure && result.code !== 0) {
			throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args[0]} failed`);
		}
		return result;
	}

	/** First run on a host: connect an existing clone or make one, then render. */
	async function configure(argument: string, ctx: ExtensionCommandContext): Promise<void> {
		const remote = argument.trim() || "https://github.com/DragonL57/agent-state.git";
		if (!isSafeRemoteUrl(remote) || !remote.includes("://")) {
			throw new Error("Give an https clone URL: /agent-state configure https://github.com/owner/agent-state.git");
		}
		const origin = await git(["remote", "get-url", "origin"], true);
		if (origin.code === 0) {
			ctx.ui.notify(`origin is already ${origin.stdout.trim()}; nothing to configure`, "info");
			return;
		}
		if (!existsSync(join(ROOT, ".git"))) {
			// The state is a sibling clone, never a repo created inside a home that
			// also holds sessions, caches, and credentials.
			throw new Error(
				`${ROOT} is not an agent-state checkout. Clone it somewhere else and start pi with ` +
					`AGENT_STATE_DIR set:\n  git clone ${remote} ~/agent-state`,
			);
		}
		const toplevel = await git(["rev-parse", "--show-toplevel"], true);
		if (toplevel.code !== 0 || resolve(toplevel.stdout.trim()) !== ROOT) {
			throw new Error(`${ROOT} is not the top of a git checkout; point AGENT_STATE_DIR at the clone root`);
		}
		await git(["remote", "add", "origin", remote]);
		const rendered = await manager("sync", "");
		ctx.ui.notify(`Configured ${remote}\n${rendered}`, "info");
		await ctx.reload();
	}

	pi.registerCommand("agent-state", {
		description: "The Git-backed state shared by pi and Claude Code: status, snapshot, pull, push, sync, hosts",
		getArgumentCompletions: (prefix) => {
			if (/\s/.test(prefix)) return null;
			const matches = ["configure", ...COMMANDS].filter((command) => command.startsWith(prefix));
			return matches.length > 0 ? matches.map((command) => ({ value: command, label: command })) : null;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const separator = trimmed.search(/\s/);
			const action = separator === -1 ? trimmed : trimmed.slice(0, separator);
			const rest = separator === -1 ? "" : trimmed.slice(separator).trim();

			try {
				if (action === "configure") {
					await configure(rest, ctx);
					return;
				}
				if (!(COMMANDS as readonly string[]).includes(action)) {
					ctx.ui.notify(
						"/agent-state configure [clone-url] | status | snapshot [message] | pull | push | sync | check | hosts",
						"info",
					);
					return;
				}
				const output = await manager(action, rest);
				ctx.ui.notify(output || `agent-state ${action}: done`, "info");
				if (action === "pull") await ctx.reload();
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}
