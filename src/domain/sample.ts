import type { Cue, Speaker, Transcript } from './types';

/**
 * 内置双人采访素材：主持人 Alex 与海洋生物学家 Maya Chen。
 * 故意保留三类待校对问题：
 *  - c7/c8 有 150ms 时间重叠（跨发言人抢话）
 *  - c9 → c10 之间有 2.8s 空白
 *  - c6 的中文译文长度超出该片段可朗读时长
 */
export const SAMPLE_SPEAKERS: Speaker[] = [
  { id: 'alex', name: 'Alex Rivera（主持人）', color: '#4f8cff' },
  { id: 'maya', name: 'Dr. Maya Chen（嘉宾）', color: '#e8635a' },
];

export const SAMPLE_CUES: Cue[] = [
  {
    id: 'c1',
    start: 0,
    end: 4800,
    speakerId: 'alex',
    text: {
      en: "Welcome back to Field Notes. Today we're in Lisbon with Dr. Maya Chen.",
      zh: '欢迎回到《田野笔记》。今天我们在里斯本与陈玛雅博士对话。',
      es: 'Bienvenidos de nuevo a Field Notes. Hoy estamos en Lisboa con la Dra. Maya Chen.',
    },
  },
  {
    id: 'c2',
    start: 4900,
    end: 8400,
    speakerId: 'maya',
    text: {
      en: 'Thanks for having me. It is great to be back in Portugal.',
      zh: '谢谢邀请。能再次来到葡萄牙真是太好了。',
      es: 'Gracias por invitarme. Es genial volver a Portugal.',
    },
  },
  {
    id: 'c3',
    start: 8500,
    end: 13500,
    speakerId: 'alex',
    text: {
      en: 'You have spent three years tagging dolphins in the Sado estuary. What surprised you most?',
      zh: '你在萨多河口花了三年时间为海豚做标记，最让你意外的是什么？',
      es: 'Has pasado tres años marcando delfines en el estuario del Sado. ¿Qué te sorprendió más?',
    },
  },
  {
    id: 'c4',
    start: 13600,
    end: 20500,
    speakerId: 'maya',
    text: {
      en: 'Honestly, how individual they are. Each one develops distinct hunting habits and even signature whistles.',
      zh: '说实话，是它们的个体差异。每只海豚都有独特的捕猎习惯，甚至有自己的标志性叫声。',
      es: 'Honestamente, lo individuales que son. Cada uno desarrolla hábitos de caza distintos e incluso silbidos propios.',
    },
  },
  {
    id: 'c5',
    start: 20600,
    end: 23200,
    speakerId: 'alex',
    text: {
      en: 'Signature whistles — like names?',
      zh: '标志性叫声——就像名字一样？',
      es: '¿Silbidos característicos, como nombres?',
    },
  },
  {
    id: 'c6',
    start: 23300,
    end: 29200,
    speakerId: 'maya',
    text: {
      en: 'Exactly. They invent a unique melody in the first months and keep it for life, answering when a friend calls.',
      // 中文译文刻意偏长：约 53 字 × 160ms ≈ 8.5s，超过 5.9s × 1.2 的预算
      zh: '正是如此。它们在出生后的头几个月里自创一段独特旋律并终身使用，朋友呼唤时便会回应，分开多年也能记得。',
      es: 'Exacto. Inventan una melodía única en sus primeros meses y la conservan de por vida.',
    },
  },
  {
    id: 'c7',
    start: 29400,
    end: 33200,
    // 故意跟错的发言人标签（本应是 Alex）：用于演示发言人冲突检测与标签修正
    speakerId: 'maya',
    text: {
      en: 'Does that change how we should protect the estuary?',
      zh: '这会改变我们保护河口区域的方式吗？',
      es: '¿Eso cambia cómo deberíamos proteger el estuario?',
    },
  },
  {
    id: 'c8',
    start: 33050,
    end: 38600,
    speakerId: 'maya',
    text: {
      en: 'It should. Conservation is not just habitat — it is about keeping social groups together.',
      zh: '应该如此。保护不只是栖息地的问题，更是让社会群体保持完整。',
      es: 'Debería. La conservación no es solo el hábitat: es mantener unidos a los grupos sociales.',
    },
  },
  {
    id: 'c9',
    start: 38800,
    end: 43000,
    speakerId: 'alex',
    text: {
      en: 'Dr. Chen, thank you for sharing your work with us.',
      zh: '陈博士，谢谢你与我们分享你的研究。',
      es: 'Dra. Chen, gracias por compartir tu trabajo con nosotros.',
    },
  },
  {
    id: 'c10',
    start: 45800,
    end: 50600,
    speakerId: 'maya',
    text: {
      en: 'My pleasure. Protect the river, and the dolphins will tell the rest.',
      zh: '不客气。保护好这条河，海豚会诉说剩下的故事。',
      es: 'Un placer. Protege el río y los delfines contarán el resto.',
    },
  },
];

export function createSampleTranscript(): Transcript {
  return {
    speakers: SAMPLE_SPEAKERS.map((s) => ({ ...s })),
    cues: SAMPLE_CUES.map((c) => ({ ...c, text: { ...c.text } })),
  };
}
