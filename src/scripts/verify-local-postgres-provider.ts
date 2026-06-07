import { closeDatabasePoolForTests, query, resolveDatabaseProvider } from "../lib/db";

type CountRow = { c: string };

async function count(label: string, sql: string): Promise<{ label: string; count: number }> {
  const rows = await query<CountRow>(sql);
  return { label, count: Number(rows[0]?.c ?? 0) };
}

async function main() {
  const provider = resolveDatabaseProvider();
  console.log(`provider=${provider}`);
  if (provider !== "postgres") {
    console.log("skip: set DATABASE_PROVIDER=postgres for local HH PostgreSQL verification");
    return;
  }

  const checks = await Promise.all([
    count("candles", "SELECT COUNT(*) AS c FROM candles"),
    count("candles_1h", "SELECT COUNT(*) AS c FROM candles_1h"),
    count("candles_4h", "SELECT COUNT(*) AS c FROM candles_4h"),
    count("daily_closes", "SELECT COUNT(*) AS c FROM candle_daily_closes"),
    count("public_tables", "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = 'public'"),
  ]);

  for (const check of checks) {
    console.log(`${check.label}=${check.count}`);
  }

  const candles = checks.find((c) => c.label === "candles")?.count;
  if (candles !== 35_609_670) {
    throw new Error(`unexpected candles count: ${candles}`);
  }

  for (const label of ["candles_1h", "candles_4h", "daily_closes"]) {
    const value = checks.find((c) => c.label === label)?.count ?? 0;
    if (value <= 0) throw new Error(`${label} was not queryable or empty`);
  }

  console.log("local_hh_postgres_provider_verification=pass");
}

main()
  .finally(async () => {
    await closeDatabasePoolForTests();
  })
  .catch((error) => {
    console.error(`local_hh_postgres_provider_verification=fail reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
