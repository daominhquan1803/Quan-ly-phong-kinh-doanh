function ts() {
  return new Date().toISOString();
}

export const logger = {
  info: (...args: unknown[]) => console.log(`[${ts()}] [worker]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${ts()}] [worker]`, ...args),
  error: (...args: unknown[]) => console.error(`[${ts()}] [worker]`, ...args),
};
