import { getRequestContext } from "@cloudflare/next-on-pages";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { documents } from "../../../src/db/schema";

export const runtime = "edge";

interface SearchBindings {
  DB: D1Database;
  AI: {
    run<T>(model: string, input: Record<string, unknown>): Promise<T>;
  };
  VECTOR_INDEX: {
    query(
      vector: number[],
      options: { topK: number },
    ): Promise<{ matches?: Array<{ id: string; score: number }> }>;
  };
}

interface EmbeddingResult {
  data?: number[][];
}

/**
 * GET /api/search?query=<text>
 * Success JSON: { "query": string, "results": [{ "document": Document, "score": number }] }.
 * Error JSON: { "error": string }.
 * Each Document is the complete matching row from D1, including content and timestamps.
 * @example
 * Request: GET /api/search?query=release%20planning
 * Response: { "query": "release planning", "results": [{ "document": { "id": "doc_123", "title": "Roadmap", "content": "..." }, "score": 0.87 }] }
 */
export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("query")?.trim();
  if (!query) {
    return Response.json({ error: "A non-empty query parameter is required." }, { status: 400 });
  }

  if (query.length > 2_000) {
    return Response.json({ error: "Query must be 2,000 characters or fewer." }, { status: 400 });
  }

  try {
    const { env } = getRequestContext();
    const bindings = env as unknown as SearchBindings;
    const embeddingResult = await bindings.AI.run<EmbeddingResult>(
      "@cf/baai/bge-small-en-v1.5",
      { text: [query] },
    );
    const vector = embeddingResult.data?.[0];

    if (!vector?.length || !vector.every(Number.isFinite)) {
      return Response.json({ error: "AI did not return a valid query embedding." }, { status: 502 });
    }

    const vectorResult = await bindings.VECTOR_INDEX.query(vector, { topK: 5 });
    const matches = (vectorResult.matches ?? [])
      .filter((match) => match.id && Number.isFinite(match.score))
      .sort((left, right) => right.score - left.score);

    if (matches.length === 0) {
      return Response.json({ query, results: [] });
    }

    const db = drizzle(bindings.DB);
    const rows = await db
      .select()
      .from(documents)
      .where(inArray(documents.id, matches.map((match) => match.id)));
    const documentsById = new Map(rows.map((document) => [document.id, document]));
    const results = matches.flatMap((match) => {
      const document = documentsById.get(match.id);
      return document ? [{ document, score: match.score }] : [];
    });

    return Response.json({ query, results });
  } catch {
    return Response.json({ error: "Unable to search documents." }, { status: 500 });
  }
}