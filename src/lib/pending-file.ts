"use client";
// Hands the photo picked on the Home screen to the New Bill screen (kept in memory during client navigation).
let pending: File | null = null;

export function setPendingFile(file: File | null) {
  pending = file;
}

export function takePendingFile(): File | null {
  const f = pending;
  pending = null;
  return f;
}
