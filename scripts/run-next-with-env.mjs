import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const [, , appEnv, nextCommand, ...nextArgs] = process.argv;

const allowedEnvs = new Set(["development", "staging", "production"]);
const allowedCommands = new Set(["dev", "build", "start"]);

if (!allowedEnvs.has(appEnv)) {
  console.error(
    `Invalid app environment "${appEnv}". Use development, staging, or production.`
  );
  process.exit(1);
}

if (!allowedCommands.has(nextCommand)) {
  console.error(`Invalid Next command "${nextCommand}". Use dev, build, or start.`);
  process.exit(1);
}

const envFilePath = path.join(process.cwd(), `.env.${appEnv}`);

if (!fs.existsSync(envFilePath)) {
  console.error(`Missing environment file: ${envFilePath}`);
  process.exit(1);
}

function parseEnvFile(content) {
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return parseEnvFile(fs.readFileSync(filePath, "utf8"));
}

const fileEnv = loadEnvFile(envFilePath);
const localEnv =
  appEnv === "development"
    ? loadEnvFile(path.join(process.cwd(), ".env.local"))
    : {};
const nodeEnv =
  nextCommand === "dev"
    ? "development"
    : "production";

const child = spawn(
  process.execPath,
  [path.join("node_modules", "next", "dist", "bin", "next"), nextCommand, ...nextArgs],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ...fileEnv,
      ...localEnv,
      APP_ENV: fileEnv.APP_ENV || fileEnv.NEXT_PUBLIC_APP_ENV || appEnv,
      NEXT_PUBLIC_APP_ENV:
        localEnv.NEXT_PUBLIC_APP_ENV ||
        fileEnv.NEXT_PUBLIC_APP_ENV ||
        appEnv,
      NODE_ENV: nodeEnv,
    },
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
