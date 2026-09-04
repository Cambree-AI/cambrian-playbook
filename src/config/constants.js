export const ANTHROPIC_MODEL_SONNET = "claude-sonnet-4-6";
export const ANTHROPIC_MODEL_HAIKU = "claude-haiku-4-5-20251001";
export const COHORT_COLORS = ["#8B6F47","#4A7A9B","#6B8E6B","#9B6B8E","#7A7A4A","#C87533","#1B3A6B","#2E6B2E","#9B2C2C","#6B3A7A","#BA7517","#3A6B6B","#6B4A9B","#A84A4A","#4A9B7A"];
export const MAX_OUTCOMES = 3;
// Feature flag (issue #28): merge the Game Plan step into the Brief's Play card.
// OFF (false) = current behavior — 9 visible steps, Game Plan step unchanged.
// Flip to true only after staging sign-off. localStorage "cc_merged_play"
// ("on"/"off") overrides this default for per-browser staging QA.
export const MERGED_PLAY = false;
export const MAX_DOCS = 6;
export const MAX_PRODUCTS = 20;
