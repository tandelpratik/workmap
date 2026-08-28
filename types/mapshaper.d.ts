/**
 * Minimal declarations for mapshaper, which ships no types.
 *
 * Only the surface this project uses is declared. Broadening it invites the
 * false confidence of a type that was never checked against the library.
 */
declare module 'mapshaper' {
  /** Runs a mapshaper command line and resolves when the output is written. */
  export function runCommands(commands: string): Promise<void>;

  const mapshaper: {
    runCommands: typeof runCommands;
  };

  export default mapshaper;
}
