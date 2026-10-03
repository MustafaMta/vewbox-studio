/** Joins class names, dropping the falsy ones: `cls('btn', on && 'is-on')`. */
export const cls = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(' ');
