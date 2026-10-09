/** Shared control classes for the Analyse form (semantic tokens only; 48 px minimum touch target). */
export const FIELD =
  "block min-h-[48px] w-full rounded-sm border border-line-strong bg-surface-alt px-s12 text-body text-fg disabled:cursor-not-allowed disabled:opacity-60";

export const LABEL = "block text-small text-fg";
export const HINT = "text-tiny text-muted";

/** Link that looks like the primary Button (Button itself renders a <button>). */
export const LINK_PRIMARY =
  "press tap rounded-sm border border-transparent bg-accent px-s18 text-small font-semibold text-on-accent no-underline hover:bg-accent-hover active:bg-accent-pressed";
export const LINK_SECONDARY =
  "press tap rounded-sm border border-line-strong bg-surface-alt px-s18 text-small font-semibold text-fg no-underline hover:bg-surface-hover";
