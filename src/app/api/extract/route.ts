import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BILL_BUCKET } from "@/lib/env";
import { normalizeExtraction } from "@/lib/bill";
import { EXTRACT_PROMPT, EXTRACT_SCHEMA } from "@/lib/extract-schema";

export const runtime = "nodejs";
export const maxDuration = 60; // seconds (Vercel limit for this route)

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.CLAUDE_EFFORT || "medium") as Effort;
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * POST /api/extract  { imagePath: "<user id>/<file>.jpg" }
 * Downloads the bill photo from Supabase Storage (as the signed-in user, so RLS applies),
 * sends it to Claude, and returns { bill_date, rows: [...] }.
 */
export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(500, "The server is missing ANTHROPIC_API_KEY.");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail(401, "Please sign in again.");

  let imagePath: unknown;
  try {
    ({ imagePath } = await request.json());
  } catch {
    return fail(400, "Invalid request.");
  }
  if (typeof imagePath !== "string" || !imagePath || imagePath.includes("..")) {
    return fail(400, "Missing image path.");
  }

  const { data: file, error: dlError } = await supabase.storage.from(BILL_BUCKET).download(imagePath);
  if (dlError || !file) return fail(404, "Could not load the uploaded photo.");
  if (file.size > 8 * 1024 * 1024) return fail(413, "Photo is too large to read. Please retake it.");

  const mediaType: MediaType = (MEDIA_TYPES as readonly string[]).includes(file.type)
    ? (file.type as MediaType)
    : "image/jpeg";
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: EFFORT,
        format: { type: "json_schema", schema: EXTRACT_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: EXTRACT_PROMPT },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return fail(422, "The AI could not read this photo. Please enter the items manually.");
    if (response.stop_reason === "max_tokens") return fail(422, "This bill is too long to read automatically. Please enter it manually.");

    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail(502, "The AI returned an unreadable answer. Please enter the items manually.");
    }
    if (parsed && typeof parsed === "object" && (parsed as { is_bill?: unknown }).is_bill === false) {
      return fail(422, "This photo doesn't look like a bill. Retake it or enter the items manually.");
    }
    const result = normalizeExtraction(parsed);
    if (result.rows.length === 0) return fail(422, "No items could be read from this photo. Please enter them manually.");
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return fail(500, "The server's Claude API key is invalid.");
    if (error instanceof Anthropic.RateLimitError) return fail(429, "Too many bills are being read right now. Try again in a minute.");
    if (error instanceof Anthropic.APIConnectionTimeoutError) return fail(504, "Reading the bill took too long. Please try again or enter it manually.");
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API error", error.status, error.message);
      return fail(502, "The AI service had a problem reading this bill.");
    }
    console.error("extract failed", error);
    return fail(500, "Something went wrong while reading the bill.");
  }
}
