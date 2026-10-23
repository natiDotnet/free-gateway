import { config as loadEnv } from 'dotenv';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const databasePackage = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(databasePackage, '../..');
loadEnv({ path: join(workspaceRoot, '.env') });

const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').toLowerCase();
const supportedProviders = new Set(['sqlite', 'postgresql', 'mysql']);
if (!supportedProviders.has(provider)) {
  throw new Error(
    `Unsupported DATABASE_PROVIDER "${provider}". Choose sqlite, postgresql, or mysql.`
  );
}

if (!process.env.DATABASE_URL) {
  if (provider !== 'sqlite') {
    throw new Error(`DATABASE_URL is required when DATABASE_PROVIDER=${provider}.`);
  }
  const sqlitePath = resolve(
    workspaceRoot,
    process.env.DATABASE_PATH ?? 'dev.sqlite'
  );
  process.env.DATABASE_URL = pathToFileURL(sqlitePath).href;
}

const sourceSchema = join(databasePackage, 'prisma', 'schema.prisma');
const generatedSchema = join(databasePackage, 'prisma', '.generated', 'schema.prisma');
let schema = (await readFile(sourceSchema, 'utf8')).replace(
  'provider = "sqlite"',
  `provider = "${provider}"`
);
if (provider === 'mysql') {
  schema = schema.replace(/^(\s*(?:meta|payload|detail)\s+String\?)$/gm, '$1 @db.Text');
}
await mkdir(dirname(generatedSchema), { recursive: true });
await writeFile(generatedSchema, schema);

const prismaCli = join(workspaceRoot, 'node_modules', 'prisma', 'build', 'index.js');

function runPrisma(args) {
  const result = spawnSync(
    process.execPath,
    [prismaCli, ...args, '--schema', generatedSchema],
    { cwd: workspaceRoot, env: process.env, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const command = process.argv[2] ?? 'generate';
if (command === 'generate') {
  runPrisma(['generate']);
} else if (command === 'push') {
  runPrisma(['db', 'push', '--accept-data-loss']);
} else if (command === 'prepare') {
  runPrisma(['generate']);
  runPrisma(['db', 'push', '--accept-data-loss']);
} else {
  throw new Error(`Unknown database command "${command}".`);
}