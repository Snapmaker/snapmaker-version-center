import type { ProductRollout } from './types';

/**
 * 序列号 → 稳定分桶，返回 [0, 99]。
 *
 * 为什么用 SHA-256 而不是对字符串简单取模：
 * - 均匀：SHA-256 输出均匀分布，桶在 0~99 上近似均匀，percent 才能代表"约 N% 的设备"。
 * - 稳定：纯函数，同一序列号永远落同一桶，设备不会在灰度期间来回跳版本（这是金丝雀的硬性要求）。
 * - 取前 4 字节转 uint32 再 %100：2^32 % 100 的偏差约 1e-8，可忽略。
 */
export async function bucket(serial: string): Promise<number> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serial));
  return new DataView(digest).getUint32(0, false) % 100;
}

/**
 * 命中判定，优先级从高到低：
 *   1. whitelist 精确序列号 —— 强制命中；
 *   2. sn_prefix 序列号前缀 —— 强制命中；
 *   3. percent 比例分桶 —— bucket < percent 即命中。
 *
 * 前两者"绕过比例"，不参与 hash 分桶，命中即返回 true。
 * 边界说明：bucket 取值 0~99，故 percent=100 → 全部命中，percent=0 → 无人命中（可用于停止放量）。
 */
export function isEligible(cfg: ProductRollout, sn: string, bucket: number): boolean {
  if (cfg.whitelist?.includes(sn)) return true;
  if (cfg.sn_prefix?.some((p) => sn.startsWith(p))) return true;
  return bucket < cfg.percent;
}
