import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "../..");
const launcher = path.join(pluginRoot, "launcher.mjs");

// Warm the binary cache before opencode spawns the MCP command. OpenCode's
// MCP startup window is documented as 5 s and observed at 15–30 s in the
// wild — short enough that a cold-cache GitHub Releases fetch can blow it.
// Running prefetch here (synchronously, before config.mcp.lumen registers)
// pushes the download into the plugin-load phase, so the eventual MCP
// command spawn is a cache-hit fast path.
//
// Hard timeout cap: 90 s. Larger than the launcher's own 60 s HTTP idle
// timeout so a legitimate slow download isn't truncated, but bounded so
// a wedged launcher process can't hang opencode startup indefinitely.
const PREFETCH_TIMEOUT_MS = 90 * 1000;

async function prefetch() {
  await new Promise((resolve) => {
    const child = spawn(process.execPath, [launcher, "prefetch"], {
      stdio: "inherit",
    });
    const timer = setTimeout(() => {
      child.kill();
    }, PREFETCH_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    child.on("exit", done);
    child.on("error", done); // best-effort: don't block opencode startup on fetch failure
  });
}

export const LumenPlugin = async () => {
  await prefetch();
  return {
    config: async (config) => {
      config.mcp = config.mcp || {};
      if (!config.mcp.lumen) {
        config.mcp.lumen = {
          type: "local",
          command: [process.execPath, launcher, "stdio"],
          enabled: true,
        };
      }
    },
  };
};

export default LumenPlugin;
