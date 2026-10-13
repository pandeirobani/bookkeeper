import { useCallback } from "react";
import { Link, useSearchParams } from "react-router";
import {
  type MonthlyExpense,
  type YearlyExpense,
  fetchYearExpenses,
  fetchYearlyExpenses,
} from "../api/expenses.ts";
import AmountBar from "../components/AmountBar.tsx";
import ErrorMessage from "../components/ErrorMessage.tsx";
import { useApiData } from "../hooks/useApiData.ts";
import { formatYen, parseYear } from "../utils/format.ts";
import styles from "./ExpensesPage.module.css";

// バックエンドの集計APIが受け付ける年の範囲
const MIN_YEAR = 1;
const MAX_YEAR = 9999;

function yearPath(year: number): string {
  return `/expenses?year=${year}`;
}

function maxTotal(rows: { total: number }[]): number {
  return Math.max(0, ...rows.map((row) => row.total));
}

function YearlyTable({ rows, selectedYear }: { rows: YearlyExpense[]; selectedYear: number }) {
  const max = maxTotal(rows);
  return (
    <table className={styles.table} aria-labelledby="yearly-expenses-heading">
      <thead>
        <tr>
          <th scope="col">年</th>
          <th scope="col" className={styles.number}>
            件数
          </th>
          <th scope="col" className={styles.number}>
            金額
          </th>
          {/* 棒は読み上げないので、列の見出しも付けない */}
          <td className={styles.barCell} />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.year} className={row.year === selectedYear ? styles.selected : undefined}>
            <th scope="row" className={styles.label}>
              <Link
                to={yearPath(row.year)}
                aria-current={row.year === selectedYear ? "true" : undefined}
              >
                {row.year}年
              </Link>
            </th>
            <td className={styles.number}>{row.count}件</td>
            <td className={styles.number}>{formatYen(row.total)}</td>
            <td className={styles.barCell}>
              <AmountBar amount={row.total} max={max} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonthlyTable({ year, rows }: { year: number; rows: MonthlyExpense[] }) {
  const max = maxTotal(rows);
  return (
    <table className={styles.table} aria-label={`${year}年の月ごとの書籍費`}>
      <thead>
        <tr>
          <th scope="col">月</th>
          <th scope="col" className={styles.number}>
            件数
          </th>
          <th scope="col" className={styles.number}>
            金額
          </th>
          <td className={styles.barCell} />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.month}>
            <th scope="row" className={styles.label}>
              {row.month}月
            </th>
            <td className={styles.number}>{row.count}件</td>
            <td className={styles.number}>{formatYen(row.total)}</td>
            <td className={styles.barCell}>
              <AmountBar amount={row.total} max={max} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 年ごとの書籍費の表 */
function YearlySection({ selectedYear }: { selectedYear: number }) {
  const yearly = useApiData(fetchYearlyExpenses);

  return (
    <section className={styles.section}>
      <h3 id="yearly-expenses-heading">年ごとの書籍費</h3>
      {yearly.status === "loading" && <p>読み込み中…</p>}
      {yearly.status === "error" && (
        <ErrorMessage messages={yearly.error.details.map((detail) => detail.msg)} />
      )}
      {yearly.status === "success" &&
        (yearly.data.length === 0 ? (
          <p>まだ購入記録がありません。本の詳細画面から購入記録を追加すると、ここに集計します。</p>
        ) : (
          <YearlyTable rows={yearly.data} selectedYear={selectedYear} />
        ))}
    </section>
  );
}

/** 選んだ年の年額と、月ごとの書籍費の表 */
function YearSection({ year }: { year: number }) {
  const yearDetail = useApiData(useCallback(() => fetchYearExpenses(year), [year]));

  return (
    <section className={styles.section}>
      <div className={styles.yearHeader}>
        <h3>{year}年の書籍費</h3>
        <nav aria-label="年の切り替え" className={styles.yearNav}>
          {year > MIN_YEAR && <Link to={yearPath(year - 1)}>前の年</Link>}
          {year < MAX_YEAR && <Link to={yearPath(year + 1)}>次の年</Link>}
        </nav>
      </div>
      {yearDetail.status === "loading" && <p>読み込み中…</p>}
      {yearDetail.status === "error" && (
        <ErrorMessage messages={yearDetail.error.details.map((detail) => detail.msg)} />
      )}
      {yearDetail.status === "success" && (
        <>
          <p className={styles.yearTotal}>
            年額 <strong>{formatYen(yearDetail.data.total)}</strong>（{yearDetail.data.count}件）
          </p>
          <MonthlyTable year={year} rows={yearDetail.data.months} />
        </>
      )}
    </section>
  );
}

function ExpensesPage() {
  // 選んだ年は URL（/expenses?year=…）に持たせ、再読み込みや「戻る」でも同じ年を表示する
  const [searchParams] = useSearchParams();
  const year = parseYear(searchParams.get("year")) ?? new Date().getFullYear();

  return (
    <>
      <h2>書籍費</h2>
      <p className={styles.note}>購入記録の金額（実際に支払った金額）を、購入日で集計します。</p>
      <YearlySection selectedYear={year} />
      <YearSection year={year} />
    </>
  );
}

export default ExpensesPage;
