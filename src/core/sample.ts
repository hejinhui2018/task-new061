import type { CaptionDoc } from './types';

/**
 * 内置示例：一段约 1 分钟的双人采访（主持人 × 林博士），中英双语。
 * 时间轴本身无重叠/空白问题；seg-04 的英文译文故意偏长，
 * 用于演示“翻译超时”（阅读速度超限）检测。
 */
export function buildSampleDoc(): CaptionDoc {
  // [startMs, endMs, speaker, zh, en]
  const rows: [number, number, string, string, string][] = [
    [500, 4000, '主持人', '欢迎来到本期访谈，今天我们请到了本地化专家林博士。',
      "Welcome to the show. Today we're joined by localization expert Dr. Lin."],
    [4600, 7200, '林博士', '谢谢邀请，很高兴来到这里。',
      "Thanks for having me, it's a pleasure to be here."],
    [8000, 12500, '主持人', '很多团队做多语言字幕时，最头疼的就是时间轴漂移，您怎么看？',
      "Many teams struggle with timeline drift when localizing subtitles. What's your take on it?"],
    [13200, 18000, '林博士', '漂移通常是因为大家各自为战，没有统一的校对台。',
      'Drift usually happens because everyone edits the timeline in isolation, without a shared review surface or any automated safeguards.'],
    [18800, 22000, '主持人', '所以只要插入一句话，后面的时间轴就全乱了？',
      'So inserting a single line throws off everything after it?'],
    [22600, 27500, '林博士', '没错。插入延迟应该自动连锁平移，并立刻报告影响范围。',
      'Exactly. An inserted delay should ripple forward automatically and report its impact at once.'],
    [28200, 31000, '主持人', '说话人标签跟错，也是编辑经常踩的坑。',
      'Speaker labels drifting out of place is another common pitfall.'],
    [31700, 36200, '林博士', '对，重叠检测加上说话人冲突提示，能拦住大部分低级错误。',
      'Right. Overlap detection plus speaker-conflict warnings catch most of those mistakes.'],
    [37000, 41500, '主持人', '如果译文太长，观众读不完怎么办？',
      'What if a translation is too long for viewers to read in time?'],
    [42100, 46000, '林博士', '给每种语言设一个阅读速度上限，超时的译文自动标红。',
      'Set a reading-speed limit per language and flag any translation that exceeds it.'],
    [46800, 50500, '主持人', '版本对比呢？编辑想看到调整前后的差别。',
      'And version diffs? Editors want to see the before-and-after impact clearly.'],
    [51200, 56000, '林博士', '每次大改前存一个快照，随时对比，随时回滚。',
      'Snapshot before every major change, then compare or roll back whenever you need.'],
    [56800, 60000, '主持人', '感谢林博士的分享，我们下期再见。',
      'Thanks for sharing, Dr. Lin. See you next time.'],
    [60600, 63000, '林博士', '谢谢大家。',
      'Thank you, everyone.'],
  ];

  return {
    title: '内置示例：双人对谈 · 字幕本地化的那些坑',
    languages: ['zh', 'en'],
    speakers: ['主持人', '林博士'],
    segments: rows.map(([start, end, speaker, zh, en], i) => ({
      id: `seg-${String(i + 1).padStart(2, '0')}`,
      start,
      end,
      speaker,
      texts: { zh, en },
    })),
  };
}
