import { useState } from "react";
import type { Book } from "../api/books.ts";
import {
  type Purchase,
  type PurchaseInput,
  createPurchase,
  updatePurchase,
} from "../api/purchases.ts";
import type { ApiData } from "../hooks/useApiData.ts";
import { formatDate, todayLocal } from "../utils/date.ts";
import { formatYen } from "../utils/format.ts";
import DetailSection from "./DetailSection.tsx";
import ErrorMessage from "./ErrorMessage.tsx";
import PurchaseForm from "./PurchaseForm.tsx";
import styles from "./PurchasesSection.module.css";
import SuccessMessage from "./SuccessMessage.tsx";
import formStyles from "./form.module.css";
import { newPurchaseFormValues, toPurchaseFormValues } from "./purchaseFormValues.ts";

type TableProps = {
  purchases: Purchase[];
  onEdit: (purchase: Purchase) => void;
};

function PurchaseTable({ purchases, onEdit }: TableProps) {
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
            <th scope="col">
              <span className={styles.visuallyHidden}>操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((purchase) => {
            const date = formatDate(purchase.purchased_on);
            return (
              <tr key={purchase.id}>
                <td className={styles.date}>{date}</td>
                <td className={styles.amount}>{formatYen(purchase.amount)}</td>
                <td>{purchase.store}</td>
                <td className={styles.memo}>{purchase.memo}</td>
                <td className={styles.actions}>
                  {/* 行ごとに同じ「編集」が並ぶので、読み上げでは購入日も伝える */}
                  <button
                    type="button"
                    onClick={() => onEdit(purchase)}
                    aria-label={`${date} の購入記録を編集`}
                    className={styles.linkButton}
                  >
                    編集
                  </button>
                </td>
              </tr>
            );
          })}
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

/** 開いているフォーム。追加と編集を合わせて、一度に1つだけ開く */
type OpenForm = { kind: "add" } | { kind: "edit"; purchase: Purchase } | null;

type Props = {
  book: Book;
  /** 本の購入記録。詳細画面で取得したもの。追加・編集・削除の後に reload で取り直す */
  purchases: ApiData<Purchase[]>;
  /** 本が変わったとき（購入記録の追加で手元に戻ったとき）に呼ぶ。詳細画面で本を取り直す */
  onBookChanged: () => void;
};

/** 詳細画面の購入記録の欄 */
function PurchasesSection({ book, purchases, onBookChanged }: Props) {
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [message, setMessage] = useState<string | null>(null);

  function open(form: OpenForm) {
    setOpenForm(form);
    setMessage(null);
  }

  async function handleCreate(input: PurchaseInput) {
    await createPurchase(book.id, input);
    setOpenForm(null);
    purchases.reload();
    if (returnsToHand(book, input.purchased_on)) {
      setMessage("購入記録を追加しました。手放した日より後の購入なので、手元に戻しました");
      onBookChanged();
    } else {
      setMessage("購入記録を追加しました");
    }
  }

  async function handleUpdate(purchaseId: number, input: PurchaseInput) {
    // 購入記録の更新では、手放した日は変わらない
    await updatePurchase(purchaseId, input);
    setOpenForm(null);
    purchases.reload();
    setMessage("購入記録を更新しました");
  }

  const amountHint = book.list_price === null ? undefined : `定価 ${formatYen(book.list_price)}`;

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
          <PurchaseTable
            purchases={purchases.data}
            onEdit={(purchase) => open({ kind: "edit", purchase })}
          />
        ))}
      <div className={styles.formArea}>
        {openForm === null && (
          <button
            type="button"
            onClick={() => open({ kind: "add" })}
            className={formStyles.secondary}
          >
            購入記録を追加
          </button>
        )}
        {openForm?.kind === "add" && (
          <>
            <h4 className={styles.formHeading}>購入記録を追加</h4>
            <PurchaseForm
              idPrefix="purchase-new"
              initialValues={newPurchaseFormValues(todayLocal())}
              submitLabel="追加する"
              submittingLabel="追加中…"
              amountHint={amountHint}
              onSubmit={handleCreate}
              onCancel={() => setOpenForm(null)}
            />
          </>
        )}
        {openForm?.kind === "edit" && (
          <>
            <h4 className={styles.formHeading}>
              購入記録を編集（{formatDate(openForm.purchase.purchased_on)} の購入）
            </h4>
            <PurchaseForm
              // 別の購入記録の編集に切り替えたら、入力中の値を引き継がない
              key={openForm.purchase.id}
              idPrefix={`purchase-${openForm.purchase.id}`}
              initialValues={toPurchaseFormValues(openForm.purchase)}
              submitLabel="保存する"
              submittingLabel="保存中…"
              amountHint={amountHint}
              onSubmit={(input) => handleUpdate(openForm.purchase.id, input)}
              onCancel={() => setOpenForm(null)}
            />
          </>
        )}
      </div>
    </DetailSection>
  );
}

export default PurchasesSection;
