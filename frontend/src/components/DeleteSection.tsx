import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { type Book, deleteBook } from "../api/books.ts";
import { type ApiError, toApiError } from "../api/client.ts";
import { type Purchase, fetchPurchases } from "../api/purchases.ts";
import { useApiData } from "../hooks/useApiData.ts";
import { withFlashMessage } from "../hooks/useFlashMessage.ts";
import { formatYen } from "../utils/format.ts";
import DetailSection from "./DetailSection.tsx";
import ErrorMessage from "./ErrorMessage.tsx";
import styles from "./form.module.css";

/** 削除で一緒に消える購入記録の説明。書籍費の集計が変わることを伝える */
function purchasesSummary(purchases: Purchase[]): string {
  if (purchases.length === 0) {
    return "購入記録はありません。";
  }
  const total = purchases.reduce((sum, purchase) => sum + purchase.amount, 0);
  return `購入記録 ${purchases.length}件（合計 ${formatYen(total)}）も一緒に削除され、書籍費の集計からも消えます。`;
}

/** 削除の確認。一緒に消える購入記録の件数と合計金額を示してから削除する */
function DeleteConfirmation({ book, onCancel }: { book: Book; onCancel: () => void }) {
  const navigate = useNavigate();
  const purchases = useApiData(useCallback(() => fetchPurchases(book.id), [book.id]));
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteBook(book.id);
      navigate("/", withFlashMessage(`「${book.title}」を削除しました`));
    } catch (caught) {
      setError(toApiError(caught));
      setDeleting(false);
    }
  }

  return (
    <div className={styles.form}>
      <p>「{book.title}」を削除しますか？ 読書記録も削除され、元に戻せません。</p>
      {purchases.status === "loading" && <p>購入記録を確認しています…</p>}
      {purchases.status === "success" && <p>{purchasesSummary(purchases.data)}</p>}
      {/* 件数と金額を示せないまま削除はさせない */}
      {purchases.status === "error" && (
        <ErrorMessage
          messages={[
            "購入記録を確認できないため、削除できません。",
            ...purchases.error.details.map((detail) => detail.msg),
          ]}
        />
      )}
      <ErrorMessage messages={error?.details.map((detail) => detail.msg) ?? []} />
      <div className={styles.actions}>
        <button
          type="button"
          disabled={purchases.status !== "success" || deleting}
          onClick={() => void handleDelete()}
          className={styles.danger}
        >
          {deleting ? "削除中…" : "削除する"}
        </button>
        <button type="button" disabled={deleting} onClick={onCancel} className={styles.secondary}>
          やめる
        </button>
      </div>
    </div>
  );
}

/** 詳細画面の「削除」の欄 */
function DeleteSection({ book }: { book: Book }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <DetailSection title="削除">
      {confirming ? (
        <DeleteConfirmation book={book} onCancel={() => setConfirming(false)} />
      ) : (
        <div className={styles.form}>
          <p>
            登録ミスを取り消すための操作です。手放した本は、削除せずに「手放した日」を記録してください。
          </p>
          <div className={styles.actions}>
            <button type="button" onClick={() => setConfirming(true)} className={styles.secondary}>
              この本を削除する…
            </button>
          </div>
        </div>
      )}
    </DetailSection>
  );
}

export default DeleteSection;
