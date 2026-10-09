import type { Progress } from "./types";

export const progressLabels: Record<Progress, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  needs_fixing: "Needs fixing",
};
export const progressValues = Object.keys(progressLabels) as Progress[];
