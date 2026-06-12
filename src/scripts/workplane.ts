import { main as laptopJobMain } from "./workplane-laptop-job";
import { buildWorkplaneStatus, parseWorkplaneStatusArgs } from "./workplane-status";
import { loadEnv } from "./script-helpers";
import { closeDatabasePoolForTests } from "../lib/db";

export type WorkplaneCommandRoute =
  | { readonly mode: "status"; readonly args: readonly string[] }
  | { readonly mode: "laptop_job"; readonly args: readonly string[] };

export function routeWorkplaneCommand(argv: readonly string[]): WorkplaneCommandRoute {
  const [command, ...rest] = argv;
  if (!command || command.startsWith("--") || command === "status") {
    const args = (command === "status" ? rest : argv).filter((arg) => arg !== "--status" && arg !== "--json");
    return { mode: "status", args };
  }
  if (command === "claim" || command === "complete") {
    return { mode: "laptop_job", args: argv };
  }
  throw new Error(`unsupported_workplane_command:${command}; use status, claim, or complete`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const route = routeWorkplaneCommand(argv);
  if (route.mode === "laptop_job") {
    await laptopJobMain([...route.args]);
    return;
  }
  const result = await buildWorkplaneStatus(parseWorkplaneStatusArgs([...route.args]));
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main()
    .then(async () => {
      await closeDatabasePoolForTests();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      await closeDatabasePoolForTests().catch(() => undefined);
      process.exit(1);
    });
}
