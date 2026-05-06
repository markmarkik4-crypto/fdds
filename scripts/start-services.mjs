import { spawn } from "child_process";

const children = [];

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.log(`[${name}] exited with ${reason}`);
  });

  children.push(child);
  return child;
}

const web = start("web", "node", ["server.js"]);
const bot = start("bot", "node", ["--env-file=.env", "bot.js"]);

function shutdown(signal) {
  console.log(`Stopping services (${signal})...`);
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

web.on("exit", (code) => {
  if (code && code !== 0) {
    console.error("[web] crashed, stopping launcher");
    shutdown("web-exit");
  }
});

bot.on("exit", (code) => {
  if (code && code !== 0) {
    console.error("[bot] crashed, stopping launcher");
    shutdown("bot-exit");
  }
});
