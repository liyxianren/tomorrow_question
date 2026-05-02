// Price-curve damping coefficients used by the Phase-1 domestic market
// preview UI. The backend authoritative formula lives in
// backend/app/modules/rules/phase1_economy.py:calculate_domestic_price.
// The frontend preview is allocation-driven (what-if for the player's
// chosen allocation) and intentionally damped so that the displayed
// price reacts smoothly to slider changes.

export const SHORTAGE_PRICE_DAMPING = 0.5;
export const SURPLUS_PRICE_DAMPING = 0.3;
export const MIN_SURPLUS_PRICE_RATIO = 0.5;
