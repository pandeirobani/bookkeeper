import type { Book } from "../api/books.ts";
import type { Purchase } from "../api/purchases.ts";
import type { ApiData } from "../hooks/useApiData.ts";
import { formatDate } from "../utils/date.ts";
import { formatYen } from "../utils/format.ts";
import DetailSection from "./DetailSection.tsx";
import ErrorMessage from "./ErrorMessage.tsx";
import styles from "./PurchasesSection.module.css";

function PurchaseTable({ purchases }: { purchases: Purchase[] }) {
  const total = purchases.reduce((sum, purchase) => sum + purchase.amount, 0);
  return (
    <>
      <table className={styles.table} aria-label="購入記録">
        <thead>
          <tr>
            <th scope="col">購入日</th>
            <th scope="col" className={styles.amount}>
              金額
            </th>
            <th scope="col">購入店</th>
            <th scope="col">メモ</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((purchase) => (
            <tr key={purchase.id}>
              <td className={styles.date}>{formatDate(purchase.purchased_on)}</td>
              <td className={styles.amount}>{formatYen(purchase.amount)}</td>
              <td>{purchase.store}</td>
              <td className={styles.memo}>{purchase.memo}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.total}>
        {purchases.length}件、合計 {formatYen(total)}
      </p>
    </>
  );
}

type Props = {
  book: Book;
  /** 本の購入記録。詳細画面で取得したもの。追加・編集・削除の後に reload で取り直す */
  purchases: ApiData<Purchase[]>;
};

/** 詳細画面の購入記録の欄 */
function PurchasesSection({ purchases }: Props) {
  return (
    <DetailSection title="購入記録">
      {purchases.status === "loading" && <p>読み込み中…</p>}
      {purchases.status === "error" && (
        <ErrorMessage messages={purchases.error.details.map((detail) => detail.msg)} />
      )}
      {purchases.status === "success" &&
        (purchases.data.length === 0 ? (
          // 図書館で借りた本やもらった本もあるので、購入記録がないのは普通のこと
          <p>購入記録はありません。</p>
        ) : (
          <PurchaseTable purchases={purchases.data} />
        ))}
    </DetailSection>
  );
}

export default PurchasesSection;
