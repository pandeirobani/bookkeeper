import { type FormEvent, type HTMLInputTypeAttribute, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { type BookInput, findConflictingBookId } from "../api/books.ts";
import { toApiError } from "../api/client.ts";
import { type FieldErrors, splitFieldErrors } from "../api/fieldErrors.ts";
import { lookupIsbn } from "../api/isbnLookup.ts";
import ErrorMessage from "./ErrorMessage.tsx";
import FormField from "./FormField.tsx";
import SuccessMessage from "./SuccessMessage.tsx";
import {
  applyIsbnLookupResult,
  BOOK_FIELDS,
  type BookField,
  type BookFormValues,
  EMPTY_BOOK_FORM_VALUES,
  toBookInput,
} from "./bookFormValues.ts";
import styles from "./form.module.css";

type FieldConfig = {
  name: BookField;
  label: string;
  required?: boolean;
  hint?: string;
  type?: HTMLInputTypeAttribute;
  inputMode?: "numeric";
};

// ISBN を先頭に置く。ISBN から取得すると、その下の欄が埋まり、上から順に確かめられる
const FIELD_CONFIGS: FieldConfig[] = [
  {
    name: "isbn",
    label: "ISBN",
    hint: "ISBN のない本は空欄のままでかまいません。ハイフンや全角数字を含んでもかまいません。ISBN-10 も入力できます",
  },
  { name: "title", label: "書名", required: true },
  { name: "author", label: "著者", hint: "複数の著者はカンマ（,）で区切ります" },
  { name: "publisher", label: "出版社" },
  {
    name: "published_date",
    label: "出版日",
    hint: "例：2024-05-10。日や月がわからなければ 2024-05 や 2024 でもかまいません",
  },
  { name: "list_price", label: "定価（税込・円）", inputMode: "numeric" },
  { name: "cover_image_url", label: "表紙画像のURL", type: "url" },
];

type Props = {
  initialValues?: BookFormValues;
  submitLabel: string;
  submittingLabel: string;
  /** 指定すると、送信ボタンの横に「キャンセル」のリンクを出す */
  cancelTo?: string;
  /** 送信する。失敗したときは例外を投げると、エラーを入力欄ごとに表示する */
  onSubmit: (input: BookInput) => Promise<void>;
};

/** 書誌情報の入力フォーム。登録と編集で使う */
function BookForm({
  initialValues = EMPTY_BOOK_FORM_VALUES,
  submitLabel,
  submittingLabel,
  cancelTo,
  onSubmit,
}: Props) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors<BookField> | null>(null);
  // ISBNが重複したときの、登録済みの本のID
  const [conflictingBookId, setConflictingBookId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // ISBNからの書誌情報の取得。送信のエラーとは別に持つ
  // （取得のエラーは loc が ["query", "isbn"] で、splitFieldErrors の対象外のため）
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupErrors, setLookupErrors] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  // 送信に失敗したら、エラーのある最初の入力欄に移動する
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors(null);
    setConflictingBookId(null);
    setLookupMessage(null);
    setLookupErrors([]);
    try {
      await onSubmit(toBookInput(values));
    } catch (error) {
      const apiError = toApiError(error);
      setErrors(splitFieldErrors(apiError, BOOK_FIELDS));
      setConflictingBookId(findConflictingBookId(apiError));
      setSubmitting(false);
    }
  }

  /** ISBN欄の値で書誌情報を取得し、取得できた項目だけを入力欄に入れる。保存はしない */
  async function handleLookup() {
    setLookingUp(true);
    setLookupMessage(null);
    setLookupErrors([]);
    try {
      const result = await lookupIsbn(values.isbn);
      // 取得中に書き換えられた入力欄も残すよう、届いた時点の値に重ねる
      setValues((current) => applyIsbnLookupResult(current, result));
      // 前回の送信のエラー（「書名を入力してください」など）は、取得した値と食い違うので消す
      setErrors(null);
      setConflictingBookId(null);
      setLookupMessage("書誌情報を取得しました。内容を確認してください");
    } catch (error) {
      setLookupErrors(toApiError(error).details.map((detail) => detail.msg));
    } finally {
      setLookingUp(false);
    }
  }

  return (
    // 入力値の検証はサーバーに任せ、メッセージをサーバーの日本語にそろえる
    <form ref={formRef} onSubmit={handleSubmit} noValidate className={styles.form}>
      <ErrorMessage messages={errors?.general ?? []} />
      {FIELD_CONFIGS.map(({ name, label, required, hint, type = "text", inputMode }) => (
        <FormField
          key={name}
          id={`book-${name}`}
          label={label}
          required={required}
          hint={hint}
          errors={errors?.fields[name]}
          after={
            name === "isbn" && (
              <>
                {conflictingBookId !== null && (
                  <p className={styles.hint}>
                    <Link to={`/books/${conflictingBookId}`}>登録済みの本を見る</Link>
                  </p>
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    disabled={lookingUp || submitting}
                    onClick={handleLookup}
                    className={styles.secondary}
                  >
                    {lookingUp ? "取得中…" : "ISBNから取得"}
                  </button>
                </div>
                <SuccessMessage message={lookupMessage} />
                <ErrorMessage messages={lookupErrors} />
              </>
            )
          }
        >
          {(controlProps) => (
            <input
              {...controlProps}
              name={name}
              type={type}
              inputMode={inputMode}
              value={values[name]}
              onChange={(event) => setValues({ ...values, [name]: event.target.value })}
            />
          )}
        </FormField>
      ))}
      <div className={styles.actions}>
        {/* 取得中に送信すると、送信後に取得結果で入力欄が書き換わるので押せなくする */}
        <button type="submit" disabled={submitting || lookingUp} className={styles.submit}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        {cancelTo !== undefined && <Link to={cancelTo}>キャンセル</Link>}
      </div>
    </form>
  );
}

export default BookForm;
