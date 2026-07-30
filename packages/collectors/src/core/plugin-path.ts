import fs from 'node:fs';
import path from 'node:path';

const PLUGIN_EXTENSIONS = new Set(['.ts', '.js']);

/** Resolves a verifier input while preventing traversal and symlink escapes. */
export function resolveGatewayPluginPath(inputPath: string, gatewaysDirectory: string): string {
  const requestedPath = path.resolve(inputPath);
  const extension = path.extname(requestedPath).toLowerCase();
  if (!PLUGIN_EXTENSIONS.has(extension)) {
    throw new Error('Gateway plugin must be a .ts or .js file.');
  }

  const rootPath = fs.realpathSync(gatewaysDirectory);
  const realPath = fs.realpathSync(requestedPath);
  const relativePath = path.relative(rootPath, realPath);
  if (
    relativePath === '' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('Gateway plugin must be located inside the gateways directory.');
  }
  if (!fs.statSync(realPath).isFile()) {
    throw new Error('Gateway plugin path must reference a regular file.');
  }
  return realPath;
}
