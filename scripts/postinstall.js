#!/usr/bin/env node
/**
 * Postinstall hook — runs automatically after `pnpm install`.
 * Sets up pre-commit hooks so team doesn't need to remember.
 *
 * Skip in CI environments. Skip if pre-commit already installed.
 * Warn-and-continue on failure — never fail pnpm install itself.
 */
const { execSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(level, msg) {
  const tag = {
    info: `${colors.blue}ℹ${colors.reset}`,
    ok: `${colors.green}✓${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
  }[level];
  console.log(`${tag}  ${msg}`);
}

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf-8", stdio: opts.silent ? "pipe" : "inherit", ...opts });
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isCi() {
  return Boolean(
    process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.VERCEL ||
      process.env.NETLIFY ||
      process.env.CIRCLECI ||
      process.env.GITLAB_CI,
  );
}

function isInsideGitRepo() {
  return existsSync(join(process.cwd(), ".git"));
}

function preCommitInstalled() {
  return commandExists("pre-commit");
}

function gitHooksAlreadyInstalled() {
  const hookFile = join(process.cwd(), ".git", "hooks", "pre-commit");
  return existsSync(hookFile);
}

function main() {
  console.log("");

  if (isCi()) {
    log("info", "CI environment detected — skipping team setup automation");
    return;
  }

  if (!isInsideGitRepo()) {
    log("info", "Not inside a git repository — skipping pre-commit setup");
    return;
  }

  log("info", `${colors.bold}ClaimIt team setup${colors.reset}`);

  if (!preCommitInstalled()) {
    log("warn", "pre-commit not found on this system");

    if (!commandExists("uv")) {
      log("error", "uv is also missing — required for Python agents and pre-commit install");
      console.log("");
      console.log(`  Install uv first:`);
      console.log(`    ${colors.cyan}brew install uv${colors.reset}  (macOS)`);
      console.log(
        `    ${colors.cyan}curl -LsSf https://astral.sh/uv/install.sh | sh${colors.reset}  (Linux/macOS)`,
      );
      console.log("");
      console.log(
        `  Then run: ${colors.cyan}pnpm install${colors.reset} again, or: ${colors.cyan}./scripts/setup.sh${colors.reset}`,
      );
      console.log("");
      return;
    }

    log("info", "Installing pre-commit via uv tool...");
    try {
      run("uv tool install pre-commit");
      log("ok", "pre-commit installed");
    } catch (err) {
      log("error", `Failed to install pre-commit: ${err.message}`);
      log("warn", "Continuing without pre-commit. Run ./scripts/setup.sh manually to retry.");
      return;
    }
  } else {
    log("ok", "pre-commit already installed");
  }

  if (gitHooksAlreadyInstalled()) {
    log("ok", "git hooks already installed");
  } else {
    log("info", "Installing git hooks...");
    try {
      run("pre-commit install", { silent: true });
      log("ok", "git hooks installed");
    } catch (err) {
      log("error", `Failed to install git hooks: ${err.message}`);
      log("warn", "Run `pre-commit install` manually in repo root.");
      return;
    }
  }

  console.log("");
  log("info", `${colors.bold}Next steps for Python agent work:${colors.reset}`);
  console.log("");
  console.log(
    `  Run ${colors.cyan}uv sync${colors.reset} in agent directories you'll work in. Per workstream:`,
  );
  console.log(
    `    • Raj   (ingest + monitor agents): ${colors.cyan}cd apps/ingest-agent && uv sync${colors.reset}`,
  );
  console.log(
    `                                       ${colors.cyan}cd apps/monitor-agent && uv sync${colors.reset}`,
  );
  console.log(
    `    • Chris (claim + assistant agents): ${colors.cyan}cd apps/claim-agent && uv sync${colors.reset}`,
  );
  console.log(
    `                                         ${colors.cyan}cd apps/assistant-agent && uv sync${colors.reset}`,
  );
  console.log(
    `    • Or all four at once:              ${colors.cyan}./scripts/setup.sh --with-python${colors.reset}`,
  );
  console.log("");
}

try {
  main();
} catch (err) {
  log("error", `Unexpected postinstall error: ${err.message}`);
  log("warn", "Continuing — run ./scripts/setup.sh manually to debug.");
}
