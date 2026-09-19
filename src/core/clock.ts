/**
 * 可注入时钟：生产环境用 systemClock，测试注入固定值，
 * 让版本快照时间、自动保存时间等都可确定性测试。
 */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();
