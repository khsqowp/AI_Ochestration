// Medium #13 -- extracted from the new-build auto-reload check so it's testable without rendering. A hard
// reload is fine almost everywhere, but on pages holding an in-flight stream or conversation it would
// silently discard it -- those pages defer to a banner instead of reloading immediately.
const DEFERRED_RELOAD_PATH_PREFIXES = ['/dashboard/llm', '/dashboard/역량강화']

export function shouldDeferReload(pathname: string): boolean {
  return DEFERRED_RELOAD_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))
}
