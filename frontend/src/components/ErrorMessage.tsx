import styles from "./ErrorMessage.module.css";

type Props = {
  /** 表示するメッセージ。ApiError の details[].msg など */
  messages: string[];
};

/** エラーのメッセージを目立つ形で表示する。メッセージがなければ何も表示しない */
function ErrorMessage({ messages }: Props) {
  if (messages.length === 0) {
    return null;
  }
  return (
    <div role="alert" className={styles.error}>
      {messages.length === 1 ? (
        <p>{messages[0]}</p>
      ) : (
        <ul className={styles.list}>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ErrorMessage;
