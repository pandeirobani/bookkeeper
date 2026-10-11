import { type FormEvent, useEffect, useRef, useState } from "react";
import { toApiError } from "../api/client.ts";
import { type FieldErrors, splitFieldErrors } from "../api/fieldErrors.ts";
import type { PurchaseInput } from "../api/purchases.ts";
import ErrorMessage from "./ErrorMessage.tsx";
import FormField from "./FormField.tsx";
import styles from "./form.module.css";
import {
  PURCHASE_FIELDS,
  type PurchaseField,
  type PurchaseFormValues,
  toPurchaseInput,
} from "./purchaseFormValues.ts";

type Props = {
  /** 入力欄の id の接頭辞。追加と編集のフォームで id が重ならないようにする */
  idPrefix: string;
  initialValues: PurchaseFormValues;
  submitLabel: string;
  submittingLabel: string;
  /** 金額の欄のヒント（定価など） */
  amountHint?: string;
  /** 送信する。失敗したときは例外を投げると、エラーを入力欄ごとに表示する */
  onSubmit: (input: PurchaseInput) => Promise<void>;
  onCancel: () => void;
};

/** 購入記録の入力フォーム。追加と編集で使う */
function PurchaseForm({
  idPrefix,
  initialValues,
  submitLabel,
  submittingLabel,
  amountHint,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors<PurchaseField> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // 開いたときは購入日の欄に、送信に失敗したらエラーのある最初の入力欄に移動する
  useEffect(() => {
    const form = formRef.current;
    const target =
      form?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      (errors === null ? form?.querySelector<HTMLElement>("input") : null);
    target?.focus();
  }, [errors]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors(null);
    try {
      await onSubmit(toPurchaseInput(values));
    } catch (error) {
      setErrors(splitFieldErrors(toApiError(error), PURCHASE_FIELDS));
      setSubmitting(false);
    }
  }

  function setValue(field: PurchaseField, value: string) {
    setValues({ ...values, [field]: value });
  }

  return (
    // 入力値の検証はサーバーに任せ、メッセージをサーバーの日本語にそろえる
    <form ref={formRef} onSubmit={handleSubmit} noValidate className={styles.form}>
      <ErrorMessage messages={errors?.general ?? []} />
      <FormField
        id={`${idPrefix}-purchased-on`}
        label="購入日"
        required
        errors={errors?.fields.purchased_on}
      >
        {(controlProps) => (
          <input
            {...controlProps}
            type="date"
            value={values.purchased_on}
            onChange={(event) => setValue("purchased_on", event.target.value)}
          />
        )}
      </FormField>
      <FormField
        id={`${idPrefix}-amount`}
        label="金額（税込・円）"
        required
        hint={amountHint}
        errors={errors?.fields.amount}
      >
        {(controlProps) => (
          <input
            {...controlProps}
            inputMode="numeric"
            value={values.amount}
            onChange={(event) => setValue("amount", event.target.value)}
          />
        )}
      </FormField>
      <FormField id={`${idPrefix}-store`} label="購入店" errors={errors?.fields.store}>
        {(controlProps) => (
          <input
            {...controlProps}
            value={values.store}
            onChange={(event) => setValue("store", event.target.value)}
          />
        )}
      </FormField>
      <FormField id={`${idPrefix}-memo`} label="メモ" errors={errors?.fields.memo}>
        {(controlProps) => (
          <textarea
            {...controlProps}
            rows={2}
            value={values.memo}
            onChange={(event) => setValue("memo", event.target.value)}
          />
        )}
      </FormField>
      <div className={styles.actions}>
        <button type="submit" disabled={submitting} className={styles.submit}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        <button type="button" disabled={submitting} onClick={onCancel} className={styles.secondary}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

export default PurchaseForm;
