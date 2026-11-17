// "Show as table": every value of a chart as text, for screen readers and exact numbers.
export default function ChartTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <details className="table-view">
      <summary>Show as table</summary>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column, i) => (
              <th key={column} scope="col" className={i > 0 ? 'num' : undefined}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells) => (
            <tr key={cells.join('|')}>
              {cells.map((cell, i) => (
                <td key={i} className={i > 0 ? 'num' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
