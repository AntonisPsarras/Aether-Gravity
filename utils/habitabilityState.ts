/** Bit flags for planet surface shader `uState` */
export const PLANET_STATE = {
  NONE: 0,
  HABITABLE: 1,
  FROZEN: 2,
  BURNING: 4,
  TOXIC: 8,
  VOLCANIC: 16,
  STERILIZED: 32,
} as const;

export function habitabilityToState(
  habitability: string | undefined,
  tectonics: number,
  temperature: number
): number {
  let state = PLANET_STATE.NONE;
  switch (habitability) {
    case 'HABITABLE':
      state |= PLANET_STATE.HABITABLE;
      break;
    case 'FROZEN':
      state |= PLANET_STATE.FROZEN;
      break;
    case 'BURNING':
      state |= PLANET_STATE.BURNING;
      break;
    case 'TOXIC':
      state |= PLANET_STATE.TOXIC;
      break;
    case 'STERILIZED':
      state |= PLANET_STATE.STERILIZED;
      break;
    default:
      break;
  }
  if (tectonics > 0.55 && temperature > 500) {
    state |= PLANET_STATE.VOLCANIC;
  }
  return state;
}
