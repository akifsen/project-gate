export const EXIT_PASS = 0;
export const EXIT_BLOCKED = 1;
export const EXIT_INCOMPLETE = 2;
export const EXIT_INTERNAL = 3;
export const EXIT_HUMAN_REVIEW = 4;
export const EXIT_USAGE = 64;

export class ProjectGateError extends Error {
  constructor(
    message: string,
    readonly code: "CONFIG" | "GIT" | "CONTRACT" | "USAGE" | "INTERNAL" | "BROWSER",
    readonly exitCode = EXIT_INTERNAL,
  ) {
    super(message);
    this.name = "ProjectGateError";
  }
}

export class UsageError extends ProjectGateError {
  constructor(message: string) {
    super(message, "USAGE", EXIT_USAGE);
    this.name = "UsageError";
  }
}
