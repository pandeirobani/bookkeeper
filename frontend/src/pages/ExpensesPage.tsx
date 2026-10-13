import { useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import {
  type ExpensePurchase,
  type MonthlyExpense,
  type YearlyExpense,
  fetchMonthExpenses,
  fetchYearExpenses,
  fetchYearlyExpenses,
} from "../api/expenses.ts";
import AmountBar from "../components/AmountBar.tsx";
import ErrorMessage from "../components/ErrorMessage.tsx";
import { useApiData } from "../hooks/useApiData.ts";
import { formatDate } from "../utils/date.ts";
import { formatYen, parseMonth, parseYear } from "../utils/format.ts";
import { scrollOffsetToReveal } from "../utils/scroll.ts";
import styles from "./ExpensesPage.module.css";

// バックエンドの集計APIが受け付ける年の範囲
const MIN_YEAR = 1;
const MAX_YEAR = 9999;

/** 年の書籍費の表示。月の明細は閉じる */
function yearPath(year: number): string {
  return `/expenses?year=${year}`;
}

/** 年の書籍費と、その月の明細の表示 */
function monthPath(year: number, month: number): string {
  return `/expenses?year=${year}&month=${month}`;
}

/**
 * 月額の表で月をクリックしたときに付ける location state。
 * URL を直接開いたときや再読み込みでは付かないので、クリックしたときだけ明細へスクロールできる
 */
const SCROLL_TO_MONTH_DETAIL = { scrollToMonthDetail: true };

/** 明細へスクロールしたときに、画面の上下の端に取る余白（px） */
const SCROLL_MARGIN = 16;

function shouldScrollToMonthDetail(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    "scrollToMonthDetail" in state &&
    state.scrollToMonthDetail === true
  );
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

function MonthlyTable({
  year,
  rows,
  selectedMonth,
}: {
  year: number;
  rows: MonthlyExpense[];
  selectedMonth: number | null;
}) {
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
          <tr key={row.month} className={row.month === selectedMonth ? styles.selected : undefined}>
            <th scope="row" className={styles.label}>
              {/* 購入のない月も、明細が空であることを確かめられるようリンクにする */}
              <Link
                to={monthPath(year, row.month)}
                state={SCROLL_TO_MONTH_DETAIL}
                aria-current={row.month === selectedMonth ? "true" : undefined}
              >
                {row.month}月
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
function YearSection({ year, selectedMonth }: { year: number; selectedMonth: number | null }) {
  const yearDetail = useApiData(useCallback(() => fetchYearExpenses(year), [year]));

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
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
          <MonthlyTable year={year} rows={yearDetail.data.months} selectedMonth={selectedMonth} />
        </>
      )}
    </section>
  );
}

function PurchaseTable({ purchases, label }: { purchases: ExpensePurchase[]; label: string }) {
  return (
    <table className={styles.table} aria-label={label}>
      <thead>
        <tr>
          <th scope="col">購入日</th>
          <th scope="col">書名</th>
          <th scope="col">購入店</th>
          <th scope="col" className={styles.number}>
            金額
          </th>
        </tr>
      </thead>
      <tbody>
        {purchases.map((purchase) => (
          <tr key={purchase.id}>
            <td className={styles.date}>{formatDate(purchase.purchased_on)}</td>
            <th scope="row" className={styles.label}>
              <Link to={`/books/${purchase.book.id}`}>{purchase.book.title}</Link>
            </th>
            <td>{purchase.store}</td>
            <td className={styles.number}>{formatYen(purchase.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 選んだ月の購入記録の明細 */
function MonthSection({ year, month }: { year: number; month: number }) {
  const monthDetail = useApiData(useCallback(() => fetchMonthExpenses(year, month), [year, month]));
  const title = `${year}年${month}月の明細`;

  // 月をクリックしたときは、見出しから月の合計まで（明細の部分の全体）が見えるようスクロールし、
  // 見出しにフォーカスを移す。画面に収まらなければ、見出しを画面の上に合わせる。
  // 合計の位置は明細を読み込むまでわからないので、取得が終わって（成功・失敗とも）からにする。
  // 履歴の1件（location.key）につき一度だけにする
  const location = useLocation();
  const scrollToDetail = shouldScrollToMonthDetail(location.state);
  const loaded = monthDetail.status !== "loading";
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrolledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const section = sectionRef.current;
    const heading = headingRef.current;
    if (
      !scrollToDetail ||
      !loaded ||
      scrolledKeyRef.current === location.key ||
      section === null ||
      heading === null
    ) {
      return;
    }
    scrolledKeyRef.current = location.key;

    const { top, bottom } = section.getBoundingClientRect();
    const offset = scrollOffsetToReveal(top, bottom, window.innerHeight, SCROLL_MARGIN);
    if (offset !== 0) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: offset, behavior: reduceMotion ? "instant" : "smooth" });
    }
    // フォーカスでのスクロールは、上のスクロールと重なるので止める
    heading.focus({ preventScroll: true });
  }, [location.key, scrollToDetail, loaded]);

  return (
    <section ref={sectionRef} className={styles.section}>
      <div className={styles.sectionHeader}>
        {/* スクロールのときにフォーカスを移せるよう tabIndex={-1} を付ける（Tabキーでは止まらない） */}
        <h3 ref={headingRef} tabIndex={-1} className={styles.detailHeading}>
          {title}
        </h3>
        <Link to={yearPath(year)}>明細を閉じる</Link>
      </div>
      {monthDetail.status === "loading" && <p>読み込み中…</p>}
      {monthDetail.status === "error" && (
        <ErrorMessage messages={monthDetail.error.details.map((detail) => detail.msg)} />
      )}
      {monthDetail.status === "success" &&
        (monthDetail.data.purchases.length === 0 ? (
          <p>この月の購入記録はありません</p>
        ) : (
          <>
            <PurchaseTable purchases={monthDetail.data.purchases} label={title} />
            <p className={styles.monthTotal}>
              合計 <strong>{formatYen(monthDetail.data.total)}</strong>
              {`（${monthDetail.data.count}件）`}
            </p>
          </>
        ))}
    </section>
  );
}

function ExpensesPage() {
  // 選んだ年と月は URL（/expenses?year=…&month=…）に持たせ、
  // 再読み込みや「戻る」でも同じ表示に戻るようにする
  const [searchParams] = useSearchParams();
  const year = parseYear(searchParams.get("year")) ?? new Date().getFullYear();
  const month = parseMonth(searchParams.get("month"));

  return (
    <>
      <h2>書籍費</h2>
      <p className={styles.note}>購入記録の金額（実際に支払った金額）を、購入日で集計します。</p>
      <YearlySection selectedYear={year} />
      <YearSection year={year} selectedMonth={month} />
      {month !== null && <MonthSection year={year} month={month} />}
    </>
  );
}

export default ExpensesPage;
