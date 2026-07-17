/** True iff `stream` is an interactive TTY and the user hasn't opted out via NO_COLOR. */
export function supportsColor(stream: NodeJS.WriteStream): boolean {
  return Boolean(stream.isTTY) && !process.env.NO_COLOR;
}

function wrap(code: string, text: string, enabled: boolean): string {
  return enabled ? `[${code}m${text}[0m` : text;
}

export function red(text: string, enabled: boolean): string {
  return wrap("31", text, enabled);
}

export function green(text: string, enabled: boolean): string {
  return wrap("32", text, enabled);
}

export function yellow(text: string, enabled: boolean): string {
  return wrap("33", text, enabled);
}

export function dim(text: string, enabled: boolean): string {
  return wrap("2", text, enabled);
}
