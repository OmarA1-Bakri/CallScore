import { loadStormVideoContext, type StormVideoPlanningContext } from "../../lib/storm/storm-youtube-context";

export type { StormVideoPlanningContext };

export function loadStormVideoPlanningContext(path: string): StormVideoPlanningContext {
  return loadStormVideoContext(path);
}
