import { resolveUnit } from './units';
import { bucket, isEligible } from './rollout';
import type { ProductRollout, RolloutConfig } from './types';

/**
 * 版本中心灰度 Worker（入口）。
 *
 * 职责：读设备序列号 → 查灰度配置 → 判定 → 返回最新版 version.json 或 204 无更新。
 * 无状态：不保存任何设备/版本状态，灰度状态全部来自静态配置 config/rollout.json。
 */

export interface Env {
  /** 源站基址：GitHub raw（如 https://raw.githubusercontent.com/OWNER/REPO/main）。
   *  Worker 从这里取 version.json 和 config/rollout.json。不能以 / 结尾。 */
  ORIGIN: string;
}

/** 未配置灰度时的兜底：100% = 全量，等于当前无灰度的默认行为。 */
const DEFAULT_PRODUCT: ProductRollout = { percent: 100 };
const EMPTY_CONFIG: RolloutConfig = { version: 1, products: {} };

/**
 * 灰度配置的缓存时长（秒）。
 * 配置是静态文件；30s 意味着改 percent（含回滚）后最多 30s 全网生效。
 */
const CONFIG_CACHE_TTL = 30;

/**
 * 从 ?sn= 查询参数或 X-Device-Sn 请求头提取设备序列号。
 * 两者都没有 → 返回 null，视为老客户端（未接灰度），走透传。
 */
function getSerial(request: Request): string | null {
  const url = new URL(request.url);
  const sn = url.searchParams.get('sn')?.trim();
  if (sn) return sn;
  const header = request.headers.get('X-Device-Sn')?.trim();
  return header || null;
}

/**
 * 把当前请求路径映射到源站的对应 URL，忽略查询串。
 * ORIGIN 可能带路径（GitHub raw 的 /OWNER/REPO/BRANCH），故用相对路径拼接：
 * new URL(pathname, ORIGIN) 会因为 pathname 以 / 开头而覆盖掉 ORIGIN 的路径。
 */
function originUrl(request: Request, env: Env): string {
  const url = new URL(request.url);
  return new URL(url.pathname.slice(1), env.ORIGIN + '/').toString();
}

/**
 * 读取灰度配置 config/rollout.json。
 *
 * 失败策略（fail-open 到 100%，并记录日志）：
 * - 配置缺失（404）或内容为空 → 空配置，所有产品回到 100% 全量。
 *   理由：灰度是"可选功能"，没有配置就不应影响升级，零配置即可上线。
 * - 读取/解析异常 → 同样 fail-open 到 100%，但 console.error 记录。
 *   风险说明：配置与 version.json 同源（都在 GitHub raw），配置读不到时 version.json
 *   通常也读不到，请求本就会失败；所以这里 fail-open 撞破安全闸的实际概率很低。
 */
async function loadConfig(env: Env): Promise<RolloutConfig> {
  try {
    const res = await fetch(new URL('config/rollout.json', env.ORIGIN + '/').toString(), {
      cf: { cacheTtl: CONFIG_CACHE_TTL },
    });
    if (!res.ok) return EMPTY_CONFIG;
    const json = (await res.json()) as RolloutConfig;
    return json && json.products ? json : EMPTY_CONFIG;
  } catch (err) {
    console.error('loadConfig failed, fail-open to 100%', err);
    return EMPTY_CONFIG;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. 路径 → 放量单元；非灰度路径直接透传源站静态文件。
    const unit = resolveUnit(new URL(request.url).pathname);
    if (!unit) return fetch(originUrl(request, env));

    // 2. 提取序列号；老客户端（无序列号）直接透传，行为与现在完全一致。
    const sn = getSerial(request);
    if (!sn) return fetch(originUrl(request, env));

    // 3. 读配置并判定命中。
    const config = await loadConfig(env);
    const product = config.products[unit] ?? DEFAULT_PRODUCT;
    const b = await bucket(sn);
    const eligible = isEligible(product, sn, b);

    // 可观测性：结构化日志（不含原始序列号，避免记录设备隐私）。高频时可抽样或移除。
    console.log(
      JSON.stringify({ unit, decision: eligible ? 'serve' : 'no_update', bucket: b, percent: product.percent }),
    );

    // 4. 未命中 → 204 无更新（客户端保持当前版本）。
    //    说明：服务端因此无需保存"旧版本"，不会产生任何 beta/previous 文件。
    if (!eligible) {
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }

    // 5. 命中 → 返回源站最新 version.json；拉取失败优雅降级为 502，而不是抛 500。
    let origin: Response;
    try {
      origin = await fetch(originUrl(request, env));
    } catch (err) {
      console.error('fetch version.json failed', unit, err);
      return new Response('version source temporarily unavailable', { status: 502 });
    }

    const headers = new Headers(origin.headers);
    // 灰度响应不缓存：每次检查都重新走判定，便于 percent 调整/回滚即时生效。
    headers.set('Cache-Control', 'no-store');
    return new Response(origin.body, { status: origin.status, headers });
  },
};
