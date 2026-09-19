import type { ImpactReport } from '../core/impact';
import { msToTimecode } from '../core/timecode';

const ROWS: { key: 'overlap' | 'gap' | 'speakerConflict' | 'translationTimeout'; label: string }[] = [
  { key: 'overlap', label: '时间重叠' },
  { key: 'gap', label: '空白' },
  { key: 'speakerConflict', label: '说话人冲突' },
  { key: 'translationTimeout', label: '翻译超时' },
];

/** 调整前后影响对比：四类问题计数、增减、受影响片段与新增/解决的问题 */
export default function ImpactView({ report }: { report: ImpactReport }) {
  return (
    <div className="impact">
      <table className="impact-table">
        <thead>
          <tr>
            <th>问题类型</th>
            <th>调整前</th>
            <th>调整后</th>
            <th>变化</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ key, label }) => {
            const before = report.before[key];
            const after = report.after[key];
            const delta = after - before;
            return (
              <tr key={key}>
                <td>{label}</td>
                <td>{before}</td>
                <td>{after}</td>
                <td className={delta > 0 ? 'delta-bad' : delta < 0 ? 'delta-good' : 'delta-same'}>
                  {delta > 0 ? `+${delta}` : delta}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="muted">影响片段 {report.affectedSegmentIds.length} 个</p>

      {report.addedIssues.length > 0 && (
        <div className="impact-issues added">
          <strong>新增问题</strong>
          <ul>
            {report.addedIssues.slice(0, 4).map((i) => (
              <li key={i.id}>
                + {i.message}（{msToTimecode(i.at)}）
              </li>
            ))}
            {report.addedIssues.length > 4 && <li>…共 {report.addedIssues.length} 条</li>}
          </ul>
        </div>
      )}

      {report.resolvedIssues.length > 0 && (
        <div className="impact-issues resolved">
          <strong>解决问题</strong>
          <ul>
            {report.resolvedIssues.slice(0, 4).map((i) => (
              <li key={i.id}>− {i.message}</li>
            ))}
            {report.resolvedIssues.length > 4 && <li>…共 {report.resolvedIssues.length} 条</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
