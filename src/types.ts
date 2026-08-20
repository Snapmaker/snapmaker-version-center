/**
 * 灰度配置的类型定义。
 *
 * 设计原则：配置即数据，与代码分离。
 * 运维日常只改 config/rollout.json（数据），不改这里的类型（代码）。
 */

/** 单个产品（放量单元）的灰度配置。 */
export interface ProductRollout {
  /** 命中比例，取值 0~100。缺省 100 = 全量，等于当前"无灰度"的默认行为。 */
  percent: number;

  /** 精确序列号白名单：命中即进灰度，不看 percent（用于内部测试机/种子用户）。 */
  whitelist?: string[];

  /** 序列号前缀：命中即进灰度，不看 percent（用于按批次/型号段放量）。 */
  sn_prefix?: string[];
}

/** config/rollout.json 的整体结构。 */
export interface RolloutConfig {
  version: number;

  /**
   * 放量单元 → 灰度配置。
   * key 形如 firmware/a400、app/android、orca/win、flutter、profile。
   */
  products: Record<string, ProductRollout>;
}
