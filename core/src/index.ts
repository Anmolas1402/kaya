import { dirname } from "node:path";
import { ConfigError, loadConfig, loadEnvFile } from "./config/index.js";
import { startHealthServer } from "./modules/health/index.js";

const version = process.env.npm_package_version ?? "dev";

function stopSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, resolve);
  });
}

async function main(): Promise<void> {
  const envFile = loadEnvFile();
  const config = loadConfig(process.env, envFile ? dirname(envFile) : process.cwd());
  const server = await startHealthServer(config.listenHost, config.port);
  console.log(
    `kaya ${version} listening on ${config.listenHost}:${server.port} (llm: ${config.llm.provider}, data: ${config.dataDir})`,
  );

  const signal = await stopSignal();
  console.log(`kaya stopping (${signal})`);
  await server.close();
  console.log("kaya stopped");
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exitCode = 1;
});
