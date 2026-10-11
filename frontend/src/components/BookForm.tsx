import { type FormEvent, type HTMLInputTypeAttribute, useEffect, useRef, useState } from "react";
import type { BookInput } from "../api/books.ts";
import { toApiError } from "../api/client.ts";
import { type FieldErrors, splitFieldErrors } from "../api/fieldErrors.ts";
import ErrorMessage from "./ErrorMessage.tsx";
import {
  BOOK_FIELDS,
  type BookField,
  type BookFormValues,
  EMPTY_BOOK_FORM_VALUES,
  toBookInput,
} from "./bookFormValues.ts";
import styles from "./BookForm.module.css";

type FieldConfig = {
  name: BookField;
  label: string;
  required?: boolean;
  hint?: string;
  type?: HTMLInputTypeAttribute;
  inputMode?: "numeric";
};

const FIELD_CONFIGS: FieldConfig[] = [
  { name: "title", label: "書名", required: true },
  {
    name: "isbn",
    label: "ISBN",
    hint: "ハイフンや全角数字を含んでもかまいません。ISBN-10 も入力できます",
  },
  { name: "author", label: "著者", hint: "複数の著者はカンマ（,）で区切ります" },
  { name: "publisher", label: "出版社" },
  { name: "published_date", label: "出版日", hint: "例：2024-05" },
  { name: "list_price", label: "定価（税込・円）", inputMode: "numeric" },
  { name: "cover_image_url", label: "表紙画像のURL", type: "url" },
];

type Props = {
  initialValues?: BookFormValues;
  submitLabel: string;
  submittingLabel: string;
  /** 送信する。失敗したときは例外を投げると、エラーを入力欄ごとに表示する */
  onSubmit: (input: BookInput) => Promise<void>;
};

/** 書誌情報の入力フォーム。登録と編集で使う */
function BookForm({
  initialValues = EMPTY_BOOK_FORM_VALUES,
  submitLabel,
  submittingLabel,
  onSubmit,
}: Props) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors<BookField> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // 送信に失敗したら、エラーのある最初の入力欄に移動する
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors(null);
    try {
      await onSubmit(toBookInput(values));
    } catch (error) {
      setErrors(splitFieldErrors(toApiError(error), BOOK_FIELDS));
      setSubmitting(false);
    }
  }

  return (
    // 入力値の検証はサーバーに任せ、メッセージをサーバーの日本語にそろえる
    <form ref={formRef} onSubmit={handleSubmit} noValidate className={styles.form}>
      <ErrorMessage messages={errors?.general ?? []} />
      {FIELD_CONFIGS.map(({ name, label, required, hint, type = "text", inputMode }) => {
        const fieldErrors = errors?.fields[name] ?? [];
        const hintId = `book-${name}-hint`;
        const errorId = `book-${name}-error`;
        const describedBy = [hint && hintId, fieldErrors.length > 0 && errorId]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={name} className={styles.field}>
            <label htmlFor={`book-${name}`} className={styles.label}>
              {label}
              {required && <span className={styles.required}>（必須）</span>}
            </label>
            <input
              id={`book-${name}`}
              name={name}
              type={type}
              inputMode={inputMode}
              value={values[name]}
              onChange={(event) => setValues({ ...values, [name]: event.target.value })}
              aria-required={required}
              aria-invalid={fieldErrors.length > 0}
              aria-describedby={describedBy || undefined}
              className={styles.input}
            />
            {hint && (
              <p id={hintId} className={styles.hint}>
                {hint}
              </p>
            )}
            {fieldErrors.length > 0 && (
              <p id={errorId} className={styles.fieldError}>
                {fieldErrors.join(" ")}
              </p>
            )}
          </div>
        );
      })}
      <button type="submit" disabled={submitting} className={styles.submit}>
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}

export default BookForm;
