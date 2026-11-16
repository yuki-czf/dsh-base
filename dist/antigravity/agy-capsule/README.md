# agy-capsule

Real-time context window and quota capsules for the Antigravity composer footer.

## Features
- **Ground-Truth Telemetry**: Reads exact API token counts (`uncached_input`, `cached_input`, `output_tokens`, `thinking_tokens`) from the local conversation database (`%USERPROFILE%\.gemini\antigravity\conversations\<id>.db` on Windows, `~/.gemini/antigravity/conversations/<id>.db` on macOS/Linux).
- **Compaction-Aware Breakdown**: Uses the latest billed turn (`uncached_input + cached_input`) for active context usage and resets breakdown accumulation (`Turn0`, `Read`, `Think`, `Write`) at the latest compaction checkpoint (`step_type = 23` or token-drop fallback).
- **Composer Dual Capsules & Popovers**: Displays live context percentage and matched model quotas (`Gemini`, `Claude`, `Argon`, `Carbon`) directly in the composer footer, with hover popovers for token breakdown, 3m/4m cache expiry estimates, and 5h/Weekly reset countdowns.
- **4-Level Narrow Fallback**: Progressively degrades when the composer narrows (hide Weekly quota or `--%` placeholder → keep 5h icon → keep context & quota icons → ellipsis-truncate the model selector) to preserve hover access without overlap.
- **Local Font Fallbacks & Theme Sync**: Prefers Source Han Sans and falls back to the system UI font (no downloads), while adapting to light/dark themes via host CSS variables.
