import { Link } from "react-router";
import { READING_STATUS_LABELS } from "../api/readingRecords.ts";
import { type Tsundoku, fetchTsundoku } from "../api/tsundoku.ts";
import ErrorMessage from "../components/ErrorMessage.tsx";
import { useApiData } from "../hooks/useApiData.ts";
import { daysBetween, formatDate, todayLocal } from "../utils/date.ts";
import { formatYen } from "../utils/format.ts";
import styles from "./TsundokuPage.module.css";

function TsundokuTable({ rows, today }: { rows: Tsundoku[]; today: string }) {
  return (
    <table className={styles.table} aria-labelledby="tsundoku-heading">
      <thead>
        <tr>
          <th scope="col">書名</th>
          <th scope="col">著者</th>
          <th scope="col">状態</th>
          <th scope="col">購入日</th>
          <th scope="col" className={styles.number}>
            積んでいる日数
          </th>
          <th scope="col" className={styles.number}>
            金額
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.book.id}>
            <th scope="row" className={styles.title}>
              <Link to={`/books/${row.book.id}`}>{row.book.title}</Link>
            </th>
            <td>{row.book.author}</td>
            <td className={styles.nowrap}>{READING_STATUS_LABELS[row.status]}</td>
            <td className={styles.nowrap}>{formatDate(row.first_purchased_on)}</td>
            {/* 購入日が未来の日付で記録されていても、負の日数にはしない */}
            <td className={styles.number}>
              {Math.max(0, daysBetween(row.first_purchased_on, today))}日
            </td>
            <td className={styles.number}>{formatYen(row.first_purchase_amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TsundokuPage() {
  const tsundoku = useApiData(fetchTsundoku);
  const today = todayLocal();

  return (
    <>
      <h2 id="tsundoku-heading">積読</h2>
      <p className={styles.note}>
        買ってまだ読み終えていない（未読・読書中の）手元の本を、長く積んでいる順に並べます。
        購入日と金額は、その本を最初に買ったときのものです。
      </p>
      {tsundoku.status === "loading" && <p>読み込み中…</p>}
      {tsundoku.status === "error" && (
        <ErrorMessage messages={tsundoku.error.details.map((detail) => detail.msg)} />
      )}
      {tsundoku.status === "success" &&
        (tsundoku.data.length === 0 ? (
          <p>積読の本はありません</p>
        ) : (
          <>
            <p className={styles.summary}>
              積読 <strong>{tsundoku.data.length}冊</strong>・合計{" "}
              <strong>
                {formatYen(tsundoku.data.reduce((sum, row) => sum + row.first_purchase_amount, 0))}
              </strong>
            </p>
            <TsundokuTable rows={tsundoku.data} today={today} />
          </>
        ))}
    </>
  );
}

export default TsundokuPage;
