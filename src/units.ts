/**
 * 请求路径 → 放量单元。
 *
 * 现状：仓库目录结构不统一，需要一层映射把"语言/细节层"归一化到"产品/平台"层：
 *   /upgrade/firmware/{型号}/version.json           → firmware/{型号}   （a400 / j1 / fabscreen）
 *   /upgrade/app/{平台}/version.json                → app/{平台}        （android / ios / harmonyOS）
 *   /upgrade/orca/{平台}/{语言}/version.json         → orca/{平台}       （语言层不影响灰度，忽略）
 *   /upgrade/flutter/{语言}/version.json            → flutter           （全局一个单元）
 *   /upgrade/profile/{语言}/version.json            → profile           （全局一个单元）
 *
 * 返回 null 表示该路径不做灰度，直接透传源站（例如 version_cn.json、README.txt、未知路径）。
 */

const PREFIX = '/upgrade/';

export function resolveUnit(pathname: string): string | null {
  if (!pathname.startsWith(PREFIX)) return null;

  const segments = pathname.slice(PREFIX.length).split('/').filter(Boolean);

  // 只有 version.json 参与灰度；version_cn.json 等走透传（国内链路仍在 OSS，不经过 Worker）
  if (segments[segments.length - 1] !== 'version.json') return null;

  const kind = segments[0];
  switch (kind) {
    case 'firmware':
      // firmware/{型号}/version.json
      return segments.length === 3 ? `firmware/${segments[1]}` : null;
    case 'app':
      // app/{平台}/version.json
      return segments.length === 3 ? `app/${segments[1]}` : null;
    case 'orca':
      // orca/{平台}/{语言}/version.json —— 忽略语言层
      return segments.length === 4 ? `orca/${segments[1]}` : null;
    case 'flutter':
      // flutter/{语言}/version.json —— 全局一个单元
      return segments.length === 3 ? 'flutter' : null;
    case 'profile':
      // profile/{语言}/version.json —— 全局一个单元
      return segments.length === 3 ? 'profile' : null;
    default:
      return null;
  }
}
