import type { CctPort } from '../api';

const PORT_TYPE_LABELS: Record<number, string> = {
  1: 'AI', 2: 'AO', 3: 'BI', 4: 'BO', 5: 'AV', 6: 'BV', 7: 'MSI', 8: 'MSO', 9: 'MSV',
};

export default function PortsTable({ ports }: { ports: CctPort[] }) {
  return (
    <div className="card">
      <div className="card-header">Ports / I/O Points ({ports.length})</div>
      <table className="attr-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Signal ID</th>
            <th>Port ID</th>
          </tr>
        </thead>
        <tbody>
          {ports.map(p => (
            <tr key={p.PortId}>
              <td>{p.Name}</td>
              <td>
                <span className="tag tag-blue">
                  {PORT_TYPE_LABELS[p.PortTypeId] ?? `T${p.PortTypeId}`}
                </span>
              </td>
              <td className="attr-value">{p.ActualSignalId ?? '—'}</td>
              <td style={{ fontFamily: 'Consolas, monospace', fontSize: 11, color: 'var(--text-dim)' }}>
                {p.PortId.slice(0, 8)}…
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
