import { NavLink, Outlet } from "react-router";
import HealthStatus from "./HealthStatus.tsx";
import styles from "./Layout.module.css";

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;
}

/** 全画面に共通のヘッダー・フッター。各画面は <Outlet /> の位置に表示する */
function Layout() {
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>BookKeeper</h1>
        <nav aria-label="メインメニュー">
          <ul className={styles.nav}>
            <li>
              {/* end を付けないと、/books/new などでも「本の一覧」が選択中になる */}
              <NavLink to="/" end className={navLinkClassName}>
                本の一覧
              </NavLink>
            </li>
            <li>
              <NavLink to="/books/new" className={navLinkClassName}>
                本を登録
              </NavLink>
            </li>
            <li>
              <NavLink to="/tsundoku" className={navLinkClassName}>
                積読
              </NavLink>
            </li>
            <li>
              <NavLink to="/expenses" className={navLinkClassName}>
                書籍費
              </NavLink>
            </li>
          </ul>
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <HealthStatus />
      </footer>
    </>
  );
}

export default Layout;
