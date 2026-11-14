declare module 'claude-code' {
  interface PluginState {
    jbit: {
      /** Autopilot may drive this session: set when the user starts jbit:autopilot here, never read from the repo. */
      armed: boolean
      /** How unattended this session's autopilot runs: set only by the user's own `/jbit:autopilot unattended [outward]` prompt, reset by a plain `/jbit:autopilot` or the Mode line going. */
      unattended: 'off' | 'on' | 'outward'
      /** The plan's mode at the last look this session (`none` without a Mode line), to see it change. */
      seenMode: 'autopilot' | 'paused' | 'none'
      /** Risky stages (by their `## Now` heading line) the user has approved (`isApproval`) under autopilot, driving or paused. */
      cleared: string[]
      /** For each stage number, the checks last seen unticked in `## Now` while that stage was current. */
      openChecks: Record<string, string[]>
      /** For each stage number, how many checks `## Now` listed when last seen while that stage was current; the evidence gate wants a report row per check. */
      checkCounts: Record<string, number>
      /** The plan's Goal at the last look; a change means a new feature, and resets the per-stage records. */
      goal: string
      /** The plan's `Agents:` line as this session first read it (level and confirmation stamp); a `wide` already there is honoured only once restamped. */
      firstAgents: { level: 'lean' | 'balanced' | 'wide' | 'none' | 'unknown'; stamp?: string; at?: number }
      /** Every project rule (`JBIT risk:` / `JBIT outward:` in CLAUDE.md) seen this session, so a line removed mid-run still holds until a new session. */
      projectRules: { risk: string[]; outward: { words: string[]; file: string }[] }
    }
  }
}
