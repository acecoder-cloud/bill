"use client";
import { ErrorBox } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const missingEnv = /is not set/.test(error.message);
  return (
    <div className="space-y-4 py-8">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <ErrorBox onRetry={reset}>
        {missingEnv ? `Setup problem: ${error.message}. See the README "Environment variables" section.` : "This screen couldn't load. Check your internet connection and try again."}
      </ErrorBox>
    </div>
  );
}
