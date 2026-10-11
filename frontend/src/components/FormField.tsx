import type { ReactNode } from "react";
import styles from "./form.module.css";

/** 入力欄に付ける属性。ラベル・ヒント・エラーと入力欄を結びつける */
export type ControlProps = {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
  "aria-required": boolean | undefined;
  className: string;
};

type Props = {
  /** 入力欄の id。ヒントとエラーの id はこれに -hint・-error を付けたものになる */
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  /** この項目のエラーのメッセージ */
  errors?: string[];
  /** 入力欄を描画する。受け取った属性をそのまま入力欄（input・select・textarea）に付ける */
  children: (controlProps: ControlProps) => ReactNode;
  /** エラーの下に追加で表示するもの */
  after?: ReactNode;
};

/** フォームの1項目（ラベル・入力欄・ヒント・エラー）。読み上げでもヒントとエラーが伝わるようにする */
function FormField({ id, label, required, hint, errors = [], children, after }: Props) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, errors.length > 0 && errorId].filter(Boolean).join(" ");

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required}>（必須）</span>}
      </label>
      {children({
        id,
        "aria-invalid": errors.length > 0,
        "aria-describedby": describedBy || undefined,
        "aria-required": required,
        className: styles.input,
      })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {errors.length > 0 && (
        <p id={errorId} className={styles.fieldError}>
          {errors.join(" ")}
        </p>
      )}
      {after}
    </div>
  );
}

export default FormField;
