declare module 'claude-code' {
  interface PluginState {
    keel: {
      /** Autopilot may drive this session: set when the user starts keel:autopilot here, never read from the repo. */
      armed: boolean
      /** The plan's mode at the last look this session (`none` without a Mode line), to see it change. */
      seenMode: 'autopilot' | 'paused' | 'none'
      /** Risky stages (by their `## Now` heading line) the user has spoken to since autopilot held them. */
      cleared: string[]
      /** For each stage number, the checks last seen unticked in `## Now` while that stage was current. */
      openChecks: Record<string, string[]>
    }
  }
}
