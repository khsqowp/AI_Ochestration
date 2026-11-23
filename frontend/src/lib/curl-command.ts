export type CurlCommandMode = 'unix' | 'windows'

const CURL_EXECUTABLE = /(^|[\n;|]\s*|&&\s*|\$\(\s*)curl(?=\s)/gm

/** Converts executable curl invocations only; quoted examples and prose are preserved. */
export function formatCurlCommand(command: string, mode: CurlCommandMode): string {
  if (mode === 'unix') return command
  return command.replace(CURL_EXECUTABLE, '$1curl.exe')
}
