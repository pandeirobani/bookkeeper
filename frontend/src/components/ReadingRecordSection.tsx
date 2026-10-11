import { type FormEvent, useCallback, useState } from "react";
import { toApiError } from "../api/client.ts";
import { type FieldErrors, splitFieldErrors } from "../api/fieldErrors.ts";
import {
  READING_STATUS_LABELS,
  READING_STATUSES,
  type ReadingRecord,
  type ReadingStatus,
  fetchReadingRecord,
  updateReadingRecord,
} from "../api/readingRecords.ts";
import { useApiData } from "../hooks/useApiData.ts";
import DetailSection from "./DetailSection.tsx";
import ErrorMessage from "./ErrorMessage.tsx";
import FormField from "./FormField.tsx";
import SuccessMessage from "./SuccessMessage.tsx";
import styles from "./form.module.css";

const FIELDS = ["status", "started_at", "finished_at", "memo"] as const;
type Field = (typeof FIELDS)[number];

/** 入力欄の値。日付の入力欄は、未入力なら空文字になる */
type Values = {
  status: ReadingStatus;
  started_at: string;
  finished_at: string;
  memo: string;
};

function toValues(record: ReadingRecord): Values {
  return {
    status: record.status,
    started_at: record.started_at ?? "",
    finished_at: record.finished_at ?? "",
    memo: record.memo ?? "",
  };
}

function isReadingStatus(value: string): value is ReadingStatus {
  return READING_STATUSES.some((status) => status === value);
}

function ReadingRecordForm({ bookId, record }: { bookId: number; record: ReadingRecord }) {
  const [values, setValues] = useState(() => toValues(record));
  const [errors, setErrors] = useState<FieldErrors<Field> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors(null);
    setSaved(false);
    try {
      const updated = await updateReadingRecord(bookId, {
        status: values.status,
        started_at: values.started_at || null,
        finished_at: values.finished_at || null,
        memo: values.memo,
      });
      // メモの前後の空白など、サーバーで整えた値を表示する
      setValues(toValues(updated));
      setSaved(true);
    } catch (error) {
      setErrors(splitFieldErrors(toApiError(error), FIELDS));
    } finally {
      setSaving(false);
    }
  }

  return (
    // 日付の組み合わせ（読了日が開始日より前）などの検証はサーバーに任せる
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <SuccessMessage message={saved ? "読書記録を保存しました" : null} />
      <ErrorMessage messages={errors?.general ?? []} />
      <FormField id="reading-status" label="状態" errors={errors?.fields.status}>
        {(controlProps) => (
          <select
            {...controlProps}
            value={values.status}
            onChange={(event) => {
              const status = event.target.value;
              if (isReadingStatus(status)) setValues({ ...values, status });
            }}
          >
            {READING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {READING_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField id="reading-started-at" label="開始日" errors={errors?.fields.started_at}>
        {(controlProps) => (
          <input
            {...controlProps}
            type="date"
            value={values.started_at}
            onChange={(event) => setValues({ ...values, started_at: event.target.value })}
          />
        )}
      </FormField>
      <FormField id="reading-finished-at" label="読了日" errors={errors?.fields.finished_at}>
        {(controlProps) => (
          <input
            {...controlProps}
            type="date"
            value={values.finished_at}
            onChange={(event) => setValues({ ...values, finished_at: event.target.value })}
          />
        )}
      </FormField>
      <FormField id="reading-memo" label="メモ" errors={errors?.fields.memo}>
        {(controlProps) => (
          <textarea
            {...controlProps}
            rows={4}
            value={values.memo}
            onChange={(event) => setValues({ ...values, memo: event.target.value })}
          />
        )}
      </FormField>
      <div className={styles.actions}>
        <button type="submit" disabled={saving} className={styles.submit}>
          {saving ? "保存中…" : "保存する"}
        </button>
      </div>
    </form>
  );
}

/** 詳細画面の読書記録の欄 */
function ReadingRecordSection({ bookId }: { bookId: number }) {
  const record = useApiData(useCallback(() => fetchReadingRecord(bookId), [bookId]));

  return (
    <DetailSection title="読書記録">
      {record.status === "loading" && <p>読み込み中…</p>}
      {record.status === "error" && (
        <ErrorMessage messages={record.error.details.map((detail) => detail.msg)} />
      )}
      {record.status === "success" && <ReadingRecordForm bookId={bookId} record={record.data} />}
    </DetailSection>
  );
}

export default ReadingRecordSection;
