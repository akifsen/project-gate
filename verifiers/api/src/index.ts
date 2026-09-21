import type { ApiVerification, ChangeContract } from "@projectgate/contracts";
import { brief, redactHeaders, redactText } from "@projectgate/shared";
import type { ExecutionContext, PlanningContext, VerificationCheck, VerificationResult, Verifier } from "@projectgate/verifier-sdk";
import { sourcePatterns, unavailable } from "@projectgate/verifier-sdk";
import { randomBytes } from "node:crypto";

export class ApiVerifier implements Verifier {
  readonly id = "api";
  readonly version = "1.0.0";

  supports(context: PlanningContext): boolean {
    return apiChecks(context).length > 0;
  }

  plan(context: PlanningContext): VerificationCheck[] {
    return apiChecks(context);
  }

  async execute(check: VerificationCheck, context: ExecutionContext): Promise<VerificationResult> {
    if (!context.baseUrl) return unavailable(context.browserUnavailableReason ?? "No base URL is configured, so the HTTP check was not sent.");
    const input = check.input as ApiVerification;
    const target = new URL(input.request.path, context.baseUrl);
    const headers: Record<string, string> = { ...(input.request.headers ?? {}) };
    let body: Buffer | undefined;
    if (input.request.multipart) {
      const file = fileBody(input.request.multipart);
      const encoded = encodeMultipart(input.request.multipart.field, {
        filename: input.request.multipart.filename,
        contentType: input.request.multipart.content_type,
        bytes: file,
      });
      body = encoded.body;
      headers["content-type"] = encoded.contentType;
    }
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(target, {
        method: input.request.method,
        headers,
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(context.timeouts.httpMs),
      });
    } catch (error) {
      return {
        status: "UNKNOWN",
        evidence: [],
        findings: [],
        error: `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const responseText = redactText(await response.text()).text.slice(0, 64_000);
    const statusOk = matchesStatus(response.status, input.expect);
    const evidence = {
      type: "http-exchange",
      evidenceClass: "RUNTIME" as const,
      summary: `${input.request.method.toUpperCase()} ${input.request.path} → ${response.status} in ${Date.now() - started}ms.`,
      artifacts: [
        {
          filename: "exchange.json",
          mediaType: "application/json",
          body: JSON.stringify(
            {
              request: {
                method: input.request.method,
                url: target.toString(),
                headers: redactHeaders(headers),
                multipart: input.request.multipart
                  ? {
                      filename: input.request.multipart.filename,
                      contentType: input.request.multipart.content_type,
                      bytes: fileBody(input.request.multipart).byteLength,
                    }
                  : undefined,
              },
              response: { status: response.status, body: responseText.slice(0, 4000) },
            },
            null,
            2,
          ),
        },
      ],
    };
    if (statusOk) return { status: "PASSED", evidence: [evidence], findings: [] };
    return {
      status: "FAILED",
      evidence: [evidence],
      findings: [
        {
          stableKey: `${check.id}:${response.status}`,
          severity: check.severityOnFail,
          title: check.title,
          ...(check.requirement ? { requirement: check.requirement } : {}),
          observed: brief(responseText || `HTTP ${response.status}`),
          expected: expectedStatus(input.expect),
          actual: `HTTP ${response.status}`,
          reproduction: check.reproduction,
          suspectedLocations: check.suspects,
          evidenceClass: "RUNTIME",
          reproducible: true,
          fingerprint: `${input.request.method}:${input.request.path}:${response.status}`,
        },
      ],
    };
  }
}

function apiChecks(context: PlanningContext): VerificationCheck[] {
  const checks: VerificationCheck[] = [];
  for (const criterion of context.contract.acceptance) {
    if (criterion.verification?.verifier !== "api") continue;
    checks.push(toCheck(criterion.verification, criterion.id, criterion.description, criterion.evidence));
  }
  for (const field of context.contract.fields) {
    if (field.type !== "file") continue;
    const headers = field.request.headers;
    const base = {
      method: field.request.method,
      path: field.request.path,
      ...(headers ? { headers } : {}),
      field: field.request.multipart_field,
      dependencies: field.dependencies,
    };
    if (field.covers.accept) {
      const types = field.accept.length > 0 ? field.accept : ["application/octet-stream"];
      for (const contentType of types) {
        checks.push(
          generated(context, field.covers.accept, `Accept ${contentType}`, "API accept", base, {
            filename: `sample.${extension(contentType)}`,
            content_type: contentType,
            bytes: 32,
          }, { status: 201 }),
        );
      }
    }
    if (field.covers.reject_oversize && field.max_bytes) {
      checks.push(
        generated(context, field.covers.reject_oversize, "Reject oversized upload", "API size", base, {
          filename: "big.png",
          content_type: field.accept[0] ?? "image/png",
          bytes: field.max_bytes + 1,
        }, { status_in: [400, 413, 422] }),
      );
    }
    if (field.covers.reject_type) {
      checks.push(
        generated(context, field.covers.reject_type, "Reject unsupported type", "API type", base, {
          filename: "notes.txt",
          content_type: "text/plain",
          bytes: 16,
        }, { status_in: [400, 415, 422] }),
      );
    }
    if (field.covers.reject_empty) {
      checks.push(
        generated(context, field.covers.reject_empty, "Reject empty upload", "API empty", base, {
          filename: "empty.png",
          content_type: field.accept[0] ?? "image/png",
          bytes: 0,
        }, { status_in: [400, 422] }),
      );
    }
  }
  return checks;
}

function toCheck(
  verification: ApiVerification,
  criterionId: string,
  requirement: string,
  evidence: VerificationCheck["expectedEvidence"],
): VerificationCheck {
  return {
    id: `api:${criterionId}:${verification.title}`,
    verifierId: "api",
    criterionId,
    requirement,
    title: verification.title,
    why: `Exercise ${verification.request.method.toUpperCase()} ${verification.request.path} for ${criterionId}.`,
    group: verification.group ?? verification.title,
    expectedEvidence: evidence,
    execution: "deterministic",
    severityOnFail: "MAJOR",
    dependencyPatterns: sourcePatterns(verification.dependencies),
    reproduction: [`Send ${verification.request.method.toUpperCase()} ${verification.request.path}.`, `Expect ${expectedStatus(verification.expect)}.`],
    suspects: verification.suspects,
    input: verification,
  };
}

function generated(
  context: PlanningContext,
  criterionId: string,
  title: string,
  group: string,
  base: { method: string; path: string; headers?: Record<string, string>; field: string; dependencies: string[] },
  multipart: { filename: string; content_type: string; bytes: number },
  expect: { status?: number; status_in?: number[] },
): VerificationCheck {
  const criterion = context.contract.acceptance.find((item) => item.id === criterionId);
  const verification: ApiVerification = {
    verifier: "api",
    title,
    group,
    request: {
      method: base.method,
      path: base.path,
      ...(base.headers ? { headers: base.headers } : {}),
      multipart: { field: base.field, ...multipart },
    },
    expect,
    dependencies: base.dependencies,
    suspects: [],
  };
  return toCheck(verification, criterionId, criterion?.description ?? title, criterion?.evidence ?? "RUNTIME");
}

function matchesStatus(status: number, expect: { status?: number; status_in?: number[] }): boolean {
  if (expect.status !== undefined && status !== expect.status) return false;
  if (expect.status_in && !expect.status_in.includes(status)) return false;
  return expect.status !== undefined || (expect.status_in?.length ?? 0) > 0;
}

function expectedStatus(expect: { status?: number; status_in?: number[] }): string {
  if (expect.status !== undefined) return `HTTP ${expect.status}`;
  if (expect.status_in) return `HTTP ${expect.status_in.join(" or ")}`;
  return "a declared status";
}

function fileBody(multipart: { bytes?: number; text?: string }): Buffer {
  if (multipart.text !== undefined) return Buffer.from(multipart.text);
  return Buffer.alloc(multipart.bytes ?? 0, 1);
}

function encodeMultipart(field: string, file: { filename: string; contentType: string; bytes: Buffer }): { contentType: string; body: Buffer } {
  const boundary = `pg${randomBytes(8).toString("hex")}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { contentType: `multipart/form-data; boundary=${boundary}`, body: Buffer.concat([head, file.bytes, tail]) };
}

function extension(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/png") return "png";
  return "bin";
}

export function contractHasApiWork(contract: ChangeContract): boolean {
  return contract.acceptance.some((item) => item.verification?.verifier === "api") || contract.fields.length > 0;
}
