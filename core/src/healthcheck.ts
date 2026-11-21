import { checkHealth } from "./modules/health/index.js";

const port = process.env.CORE_PORT || "3000";

try {
  await checkHealth(`http://127.0.0.1:${port}/health`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
