/**
 * The common package of the dsh-lpipe- series. Its Host half is intentionally
 * empty: this package exists for the client-side settings page that every
 * component registers a block into. A component's patch mounts this row, so
 * installing any one dsh-lpipe- plugin brings the shared page along.
 */
export const name = 'dsh-life-pipline';

export function apply() {}
