import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link href="/" className="flex min-h-12 items-center rounded-xl bg-brand-700 px-6 font-semibold text-white">
        Go home
      </Link>
    </main>
  );
}
