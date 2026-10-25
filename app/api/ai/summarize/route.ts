import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

interface CloudflareBindings {
  DB: {
    prepare(query: string): {
      bind(...values: string[]): {
        first<T>(): Promise<T | null>;
      };
    };
  };
  AI: {
    run<T>(model: string, input: Record<string, unknown>): Promise<T>;
  };
  VECTOR_INDEX: {
    upsert(
      vectors: Array<{
        id: string;
        values: number[];
        metadata: Record<string, string>;
      }>,
    ): Promise<unknown>;
  };
}

interface SummarizeRequest {
  documentId: string;
  content: string;
}

interface TextGenerationResult {
  response?: string;
  generated_text?: string;
}

interface EmbeddingResult {
  data?: number[][];
}

/**
 * POST /api/ai/summarize
 * Request JSON: { "documentId": string, "content": string }.
 * Success JSON: { "documentId": string, "summary": string }.
 * Error JSON: { "error": string }.
 * @example
 * Request: { "documentId": "doc_123", "content": "Markdown text..." }
 * Response: { "documentId": "doc_123", "summary": "Three-sentence summary..." }
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { documentId, content } = body as Partial<SummarizeRequest>;
  if (
    typeof documentId !== "string" ||
    !documentId.trim() ||
    typeof content !== "string" ||
    !content.trim()
  ) {
    return Response.json(
      { error: "documentId and non-empty content strings are required." },
      { status: 400 },
    );
  }

  const { env } = getRequestContext();
  const bindings = env as unknown as CloudflareBindings;

  try {
    const document = await bindings.DB.prepare(
      "SELECT title FROM documents WHERE id = ?",
    )
      .bind(documentId)
      .first<{ title: string }>();

    if (!document) {
      return Response.json({ error: "Document not found." }, { status: 404 });
    }

    const [generation, embeddingResult] = await Promise.all([
      bindings.AI.run<TextGenerationResult>("@cf/meta/llama-3-8b-instruct", {
        prompt: `Summarize the following Markdown content in exactly three sentences. Return only the summary.\n\n${content}`,
        max_tokens: 256,
        temperature: 0.3,
      }),
      bindings.AI.run<EmbeddingResult>("@cf/baai/bge-small-en-v1.5", {
        text: [content],
      }),
    ]);

    const summary = generation.response ?? generation.generated_text;
    const vector = embeddingResult.data?.[0];
    if (
      !summary?.trim() ||
      !vector?.length ||
      !vector.every((value) => Number.isFinite(value))
    ) {
      return Response.json({ error: "AI did not return a valid summary and embedding." }, { status: 502 });
    }

    await bindings.VECTOR_INDEX.upsert([
      {
        id: documentId,
        values: vector,
        metadata: { title: document.title },
      },
    ]);

    return Response.json({ documentId, summary });
  } catch {
    return Response.json({ error: "Unable to summarize document." }, { status: 500 });
  }
}