import path from 'node:path';

function shouldRetryWithJs(specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return false;
  return path.extname(specifier) === '';
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const err = error;
    if (
      (err?.code === 'ERR_MODULE_NOT_FOUND' || err?.code === 'ERR_UNSUPPORTED_DIR_IMPORT') &&
      shouldRetryWithJs(specifier)
    ) {
      try {
        return await nextResolve(`${specifier}.js`, context);
      } catch {
        return nextResolve(`${specifier}/index.js`, context);
      }
    }
    throw error;
  }
}
