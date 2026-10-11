import styles from "./SuccessMessage.module.css";

type Props = {
  /** 表示するメッセージ。null なら何も表示しない */
  message: string | null;
};

/** 操作が完了したことを伝えるメッセージ（「〜を登録しました」など） */
function SuccessMessage({ message }: Props) {
  if (message === null) {
    return null;
  }
  return (
    <p role="status" className={styles.message}>
      {message}
    </p>
  );
}

export default SuccessMessage;
