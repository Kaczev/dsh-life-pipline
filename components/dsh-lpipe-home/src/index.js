import { mainSessionId, registerMainSection } from 'dsh-life-core/main-session';
import { homeRoot, loadConfig, normalize, saveConfig, validateHome } from './config.mjs';
import { homePrompt } from './prompt.mjs';
import { createHomeRpcHandler, registerHomeRpc } from './rpc.mjs';

export const name = 'dsh-lpipe-home';
import { registerDependencies } from 'dsh-life-core/dependencies';

export function apply(ctx, options = {}) {
  registerDependencies(ctx);
  const root = options.root ?? homeRoot();
  ctx.inject(['sessions', 'workingDirectory'], directoryCtx => {
    const workspace = () => {
      const id = mainSessionId();
      const session = id ? directoryCtx.sessions.get(id) : undefined;
      return session ? directoryCtx.workingDirectory.get(session) : '';
    };
    const snapshot = () => {
      try { const config = loadConfig(root); return { config, status: validateHome(config, workspace) }; }
      catch { return { config: null, status: { state: 'invalid', valid: false, path: '', resolvedPath: '', error: '栖所配置无法读取，请检查配置文件。' } }; }
    };
    directoryCtx.inject(['systemPrompt'], promptCtx => {
      promptCtx.effect(() => registerMainSection(promptCtx, {
        name: 'dsh-lpipe-home', order: 710, interpolate: false,
        text: () => { const { config, status } = snapshot(); return config ? homePrompt(config, status) : ''; },
      }));
    });
    directoryCtx.inject(['connection'], connectionCtx => {
      const handle = createHomeRpcHandler({ snapshot,
        save: patch => saveConfig(patch, root),
        validate: draft => { const config = normalize(draft); return { config, status: validateHome(config, workspace) }; },
      });
      connectionCtx.effect(() => registerHomeRpc(connectionCtx, handle));
    });
  });
}
