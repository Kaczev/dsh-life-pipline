/**
 * This package is the bundle, not a plugin. It ships only the patch that mounts
 * the component packages under `components/`; nothing imports this module at
 * runtime. It exists so the manifest has a valid entry point.
 */
export const name = 'dsh-life-pipline';
