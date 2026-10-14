import { type FormEvent, useState } from "react";
import { type Book, updateDisposal } from "../api/books.ts";
import { toApiError } from "../api/client.ts";
import { type FieldErrors, splitFieldErrors } from "../api/fieldErrors.ts";
import { formatDate, todayLocal } from "../utils/date.ts";
import DetailSection from "./DetailSection.tsx";
import ErrorMessage from "./ErrorMessage.tsx";
import FormField from "./FormField.tsx";
import SuccessMessage from "./SuccessMessage.tsx";
import styles from "./form.module.css";

const FIELDS = ["disposed_on"] as const;

/** 完了メッセージと、その操作の後の手放した日 */
type Message = { text: string; disposedOn: string | null };

type Props = {
  book: Book;
  /** 手放した日を変えた後に呼ぶ。詳細画面で本を取り直す */
  onChanged: () => void;
};

/** 詳細画面の「手放した日」の欄。手放した日の記録と、手元に戻す操作を行う */
function DisposalSection({ book, onChanged }: Props) {
  const [disposedOn, setDisposedOn] = useState(todayLocal);
  const [errors, setErrors] = useState<FieldErrors<(typeof FIELDS)[number]> | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [saving, setSaving] = useState(false);

  // 購入記録の追加で手元に戻ったときなど、ほかの操作で手放した日が変わったら、
  // 状況と合わなくなった完了メッセージを消す。この欄の操作の後の取り直しでは残す
  const [prevDisposedOn, setPrevDisposedOn] = useState(book.disposed_on);
  if (book.disposed_on !== prevDisposedOn) {
    setPrevDisposedOn(book.disposed_on);
    if (message !== null && message.disposedOn !== book.disposed_on) {
      setMessage(null);
    }
  }

  async function save(value: string | null, successMessage: string) {
    setSaving(true);
    setErrors(null);
    setMessage(null);
    try {
      const updated = await updateDisposal(book.id, value);
      setMessage({ text: successMessage, disposedOn: updated.disposed_on });
      onChanged();
    } catch (error) {
      setErrors(splitFieldErrors(toApiError(error), FIELDS));
    } finally {
      setSaving(false);
    }
  }

  function handleDispose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // 空欄は空文字のまま送り、サーバーの「日付の形式」のエラーを出す（null は「手元に戻す」になる）
    void save(disposedOn, "手放した日を記録しました");
  }

  return (
    <DetailSection title="手放した日">
      <SuccessMessage message={message?.text ?? null} />
      <ErrorMessage messages={errors?.general ?? []} />
      {book.disposed_on === null ? (
        <form onSubmit={handleDispose} noValidate className={styles.form}>
          <p>
            売った・譲った・捨てたなどで手放したら、その日を記録します。購入記録と読書記録は残ります。
          </p>
          <FormField id="disposed-on" label="手放した日" errors={errors?.fields.disposed_on}>
            {(controlProps) => (
              <input
                {...controlProps}
                type="date"
                value={disposedOn}
                onChange={(event) => setDisposedOn(event.target.value)}
              />
            )}
          </FormField>
          <div className={styles.actions}>
            <button type="submit" disabled={saving} className={styles.submit}>
              {saving ? "記録中…" : "手放したことを記録する"}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.form}>
          <p>{formatDate(book.disposed_on)} に手放しました。</p>
          <div className={styles.actions}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(null, "手元に戻しました")}
              className={styles.secondary}
            >
              {saving ? "戻しています…" : "手元に戻す"}
            </button>
          </div>
        </div>
      )}
    </DetailSection>
  );
}

export default DisposalSection;
