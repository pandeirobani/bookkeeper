import { type ReactNode, useId } from "react";
import styles from "./DetailSection.module.css";

type Props = {
  title: string;
  children: ReactNode;
};

/** 詳細画面の1つの欄（読書記録・手放した日など）。見出しで区切る */
function DetailSection({ title, children }: Props) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h3 id={headingId} className={styles.heading}>
        {title}
      </h3>
      {children}
    </section>
  );
}

export default DetailSection;
