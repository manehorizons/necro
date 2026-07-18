/** Whether a file path is Python source — the single shared check for Python-specific gating (tier cap, fix/verify-removal refusal). */
export function isPythonFile(file: string): boolean {
  return file.endsWith(".py");
}
