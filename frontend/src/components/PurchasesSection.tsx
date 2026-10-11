import { useState } from "react";
import type { Book } from "../api/books.ts";
import { type Purchase, type PurchaseInput, createPurchase } from "../api/purchases.ts";
import type { ApiData } from "../hooks/useApiData.ts";
import { formatDate, todayLocal } from "../utils/date.ts";
import { formatYen } from "../utils/format.ts";
import DetailSection from "./DetailSection.tsx";
import ErrorMessage from "./ErrorMessage.tsx";
import PurchaseForm from "./PurchaseForm.tsx";
import styles from "./PurchasesSection.module.css";
import SuccessMessage from "./SuccessMessage.tsx";
import formStyles from "./form.module.css";
import { newPurchaseFormValues } from "./purchaseFormValues.ts";

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

/**
 * 購入記録を追加したら、サーバーが本を手元に戻すかどうか。
 * サーバーと同じく、手放した本で、購入日が手放した日より後のときに戻す（YYYY-MM-DD は文字列で比べられる）
 */
function returnsToHand(book: Book, purchasedOn: string): boolean {
  return book.disposed_on !== null && purchasedOn > book.disposed_on;
}

type Props = {
  book: Book;
  /** 本の購入記録。詳細画面で取得したもの。追加・編集・削除の後に reload で取り直す */
  purchases: ApiData<Purchase[]>;
  /** 本が変わったとき（購入記録の追加で手元に戻ったとき）に呼ぶ。詳細画面で本を取り直す */
  onBookChanged: () => void;
};

/** 詳細画面の購入記録の欄 */
function PurchasesSection({ book, purchases, onBookChanged }: Props) {
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCreate(input: PurchaseInput) {
    await createPurchase(book.id, input);
    setAdding(false);
    purchases.reload();
    if (returnsToHand(book, input.purchased_on)) {
      setMessage("購入記録を追加しました。手放した日より後の購入なので、手元に戻しました");
      onBookChanged();
    } else {
      setMessage("購入記録を追加しました");
    }
  }

  return (
    <DetailSection title="購入記録">
      <SuccessMessage message={message} />
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
      <div className={styles.formArea}>
        {adding ? (
          <>
            <h4 className={styles.formHeading}>購入記録を追加</h4>
            <PurchaseForm
              idPrefix="purchase-new"
              initialValues={newPurchaseFormValues(todayLocal())}
              submitLabel="追加する"
              submittingLabel="追加中…"
              amountHint={
                book.list_price === null ? undefined : `定価 ${formatYen(book.list_price)}`
              }
              onSubmit={handleCreate}
              onCancel={() => setAdding(false)}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setMessage(null);
            }}
            className={formStyles.secondary}
          >
            購入記録を追加
          </button>
        )}
      </div>
    </DetailSection>
  );
}

export default PurchasesSection;
