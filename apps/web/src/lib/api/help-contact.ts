export type ContactSubmission = {
  name: string;
  email: string;
  subject: string;
  message: string;
  website?: string;
};

export type ContactSubmissionResult = {
  id: string;
  submitted_at: string;
};

export class HelpContactApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HelpContactApiError";
  }
}

function parseErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const nested = record.error;
    if (nested && typeof nested === "object") {
      const errorObj = nested as Record<string, unknown>;
      if (typeof errorObj.message === "string") {
        return errorObj.message;
      }
    }
    if (typeof record.detail === "string") {
      return record.detail;
    }
    if (Array.isArray(record.detail) && record.detail.length > 0) {
      const first = record.detail[0] as Record<string, unknown>;
      if (typeof first.msg === "string") {
        return first.msg;
      }
    }
  }
  if (status === 429) {
    return "Please wait a few minutes before sending another message.";
  }
  return "Submission failed. Please try again.";
}

export async function submitContact(data: ContactSubmission): Promise<ContactSubmissionResult> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    throw new HelpContactApiError("NEXT_PUBLIC_API_BASE_URL is not configured.", 0);
  }

  const response = await fetch(`${baseUrl}/api/v1/help/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = parseErrorMessage(errorBody, response.status);
    const code =
      errorBody &&
      typeof errorBody === "object" &&
      errorBody.error &&
      typeof errorBody.error === "object" &&
      typeof (errorBody.error as Record<string, unknown>).code === "string"
        ? ((errorBody.error as Record<string, unknown>).code as string)
        : undefined;
    throw new HelpContactApiError(message, response.status, code);
  }

  return response.json() as Promise<ContactSubmissionResult>;
}
