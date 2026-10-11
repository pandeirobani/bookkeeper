import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../api/books.ts";
import { ApiError } from "../api/client.ts";
import { type Purchase, createPurchase, deletePurchase, updatePurchase } from "../api/purchases.ts";
import type { ApiData, ApiDataState } from "../hooks/useApiData.ts";
import { makeBook, makePurchase } from "../test/fixtures.ts";
import PurchasesSection from "./PurchasesSection.tsx";

vi.mock("../api/purchases.ts", () => ({
  createPurchase: vi.fn(),
  deletePurchase: vi.fn(),
  updatePurchase: vi.fn(),
}));

const NO_PURCHASES: ApiDataState<Purchase[]> = { status: "success", data: [] };

function renderSection(
  state: ApiDataState<Purchase[]> = NO_PURCHASES,
  book: Book = makeBook({ id: 7 }),
) {
  const purchases: ApiData<Purchase[]> = { ...state, reload: vi.fn() };
  const onBookChanged = vi.fn();
  render(<PurchasesSection book={book} purchases={purchases} onBookChanged={onBookChanged} />);
  return { purchases, onBookChanged, user: userEvent.setup() };
}

/** 表の本文の行を、セルの文字の配列にする。最後の操作の列は含めない */
function bodyRows(): string[][] {
  const [, body] = within(screen.getByRole("table", { name: "購入記録" })).getAllByRole("rowgroup");
  return within(body)
    .getAllByRole("row")
    .map((row) =>
      Array.from(row.querySelectorAll("td"), (cell) => cell.textContent ?? "").slice(0, 4),
    );
}

describe("PurchasesSection", () => {
  describe("一覧", () => {
    it("購入記録を表で表示し、件数と合計金額を出す", () => {
      renderSection({
        status: "success",
        data: [
          makePurchase({
            id: 2,
            purchased_on: "2026-10-05",
            amount: 550,
            store: null,
            memo: "2冊目",
          }),
          makePurchase({ id: 1, purchased_on: "2026-10-01", amount: 1078, store: "テスト書店" }),
        ],
      });

      expect(screen.getByRole("region", { name: "購入記録" })).toBeInTheDocument();
      expect(bodyRows()).toEqual([
        ["2026/10/05", "550円", "", "2冊目"],
        ["2026/10/01", "1,078円", "テスト書店", ""],
      ]);
      expect(screen.getByText("2件、合計 1,628円")).toBeInTheDocument();
    });

    it("購入記録がなければ、そのことを表示する", () => {
      renderSection();

      expect(screen.getByText("購入記録はありません。")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("読み込み中と表示する", () => {
      renderSection({ status: "loading" });

      expect(screen.getByText("読み込み中…")).toBeInTheDocument();
    });

    it("取得に失敗したらエラーを表示する", () => {
      renderSection({
        status: "error",
        error: new ApiError(0, [
          { type: "network_error", loc: [], msg: "サーバーに接続できません" },
        ]),
      });

      expect(screen.getByRole("alert")).toHaveTextContent("サーバーに接続できません");
    });
  });

  describe("追加", () => {
    beforeEach(() => {
      // 「今日」を固定する。購入日の初期値に使う
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 9, 12, 8, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.mocked(createPurchase).mockReset();
    });

    it("「購入記録を追加」でフォームを開き、購入日に今日を入れ、定価をヒントに出す", async () => {
      const { user } = renderSection(NO_PURCHASES, makeBook({ list_price: 1980 }));

      await user.click(screen.getByRole("button", { name: "購入記録を追加" }));

      expect(screen.getByLabelText(/購入日/)).toHaveValue("2026-10-12");
      expect(screen.getByLabelText(/購入日/)).toHaveFocus();
      expect(screen.getByLabelText(/金額/)).toHaveValue("");
      expect(screen.getByLabelText(/金額/)).toHaveAccessibleDescription("定価 1,980円");
    });

    it("入力した値を送り、フォームを閉じて購入記録を取り直す", async () => {
      vi.mocked(createPurchase).mockResolvedValue(makePurchase());
      const { user, purchases, onBookChanged } = renderSection();

      await user.click(screen.getByRole("button", { name: "購入記録を追加" }));
      await user.type(screen.getByLabelText(/金額/), "１０７８");
      await user.type(screen.getByLabelText("購入店"), "テスト書店");
      await user.click(screen.getByRole("button", { name: "追加する" }));

      expect(createPurchase).toHaveBeenCalledWith(7, {
        purchased_on: "2026-10-12",
        amount: 1078,
        store: "テスト書店",
        memo: "",
      });
      expect(await screen.findByRole("status")).toHaveTextContent("購入記録を追加しました");
      expect(screen.queryByRole("button", { name: "追加する" })).not.toBeInTheDocument();
      expect(purchases.reload).toHaveBeenCalledTimes(1);
      expect(onBookChanged).not.toHaveBeenCalled();
    });

    it("手放した日より後の購入なら、手元に戻したことを伝えて本を取り直す", async () => {
      vi.mocked(createPurchase).mockResolvedValue(makePurchase());
      const { user, onBookChanged } = renderSection(
        NO_PURCHASES,
        makeBook({ disposed_on: "2026-10-01" }),
      );

      await user.click(screen.getByRole("button", { name: "購入記録を追加" }));
      await user.type(screen.getByLabelText(/金額/), "550");
      await user.click(screen.getByRole("button", { name: "追加する" }));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "手放した日より後の購入なので、手元に戻しました",
      );
      expect(onBookChanged).toHaveBeenCalledTimes(1);
    });

    it("手放した日以前の購入なら、手元に戻さない", async () => {
      vi.mocked(createPurchase).mockResolvedValue(makePurchase());
      const { user, onBookChanged } = renderSection(
        NO_PURCHASES,
        makeBook({ disposed_on: "2026-10-12" }),
      );

      await user.click(screen.getByRole("button", { name: "購入記録を追加" }));
      await user.type(screen.getByLabelText(/金額/), "550");
      await user.click(screen.getByRole("button", { name: "追加する" }));

      expect(await screen.findByRole("status")).toHaveTextContent(/^購入記録を追加しました$/);
      expect(onBookChanged).not.toHaveBeenCalled();
    });

    it("入力エラーは入力欄の下に表示し、フォームを開いたままにする", async () => {
      vi.mocked(createPurchase).mockRejectedValue(
        new ApiError(422, [
          { type: "missing", loc: ["body", "amount"], msg: "金額を入力してください" },
        ]),
      );
      const { user, purchases } = renderSection();

      await user.click(screen.getByRole("button", { name: "購入記録を追加" }));
      await user.click(screen.getByRole("button", { name: "追加する" }));

      // 定価のヒントの後に、エラーのメッセージが続く
      expect(await screen.findByLabelText(/金額/)).toHaveAccessibleDescription(
        "定価 1,980円 金額を入力してください",
      );
      expect(screen.getByLabelText(/金額/)).toHaveFocus();
      expect(createPurchase).toHaveBeenCalledWith(7, expect.objectContaining({ amount: null }));
      expect(purchases.reload).not.toHaveBeenCalled();
    });

    it("キャンセルでフォームを閉じる", async () => {
      const { user } = renderSection();

      await user.click(screen.getByRole("button", { name: "購入記録を追加" }));
      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      expect(screen.getByRole("button", { name: "購入記録を追加" })).toBeInTheDocument();
      expect(createPurchase).not.toHaveBeenCalled();
    });
  });

  describe("編集", () => {
    const PURCHASES: ApiDataState<Purchase[]> = {
      status: "success",
      data: [
        makePurchase({ id: 2, purchased_on: "2026-10-05", amount: 550, store: null }),
        makePurchase({ id: 1, purchased_on: "2026-10-01", amount: 1078, store: "テスト書店" }),
      ],
    };

    afterEach(() => {
      vi.mocked(updatePurchase).mockReset();
    });

    it("行の「編集」で、その購入記録の値を入れたフォームを開く", async () => {
      const { user } = renderSection(PURCHASES);

      await user.click(screen.getByRole("button", { name: "2026/10/01 の購入記録を編集" }));

      expect(
        screen.getByRole("heading", { name: "購入記録を編集（2026/10/01 の購入）" }),
      ).toBeVisible();
      expect(screen.getByLabelText(/購入日/)).toHaveValue("2026-10-01");
      expect(screen.getByLabelText(/金額/)).toHaveValue("1078");
      expect(screen.getByLabelText("購入店")).toHaveValue("テスト書店");
      // 開けるフォームは1つだけなので、追加のボタンは隠す
      expect(screen.queryByRole("button", { name: "購入記録を追加" })).not.toBeInTheDocument();
    });

    it("変更した値を送り、フォームを閉じて購入記録を取り直す", async () => {
      vi.mocked(updatePurchase).mockResolvedValue(makePurchase());
      const { user, purchases, onBookChanged } = renderSection(PURCHASES);

      await user.click(screen.getByRole("button", { name: "2026/10/01 の購入記録を編集" }));
      const amount = screen.getByLabelText(/金額/);
      await user.clear(amount);
      await user.type(amount, "980");
      await user.click(screen.getByRole("button", { name: "保存する" }));

      expect(updatePurchase).toHaveBeenCalledWith(1, {
        purchased_on: "2026-10-01",
        amount: 980,
        store: "テスト書店",
        memo: "",
      });
      expect(await screen.findByRole("status")).toHaveTextContent("購入記録を更新しました");
      expect(screen.queryByRole("button", { name: "保存する" })).not.toBeInTheDocument();
      expect(purchases.reload).toHaveBeenCalledTimes(1);
      // 更新では手放した日は変わらないので、本は取り直さない
      expect(onBookChanged).not.toHaveBeenCalled();
    });

    it("別の行の「編集」に切り替えたら、その購入記録の値を入れ直す", async () => {
      const { user } = renderSection(PURCHASES);

      await user.click(screen.getByRole("button", { name: "2026/10/01 の購入記録を編集" }));
      await user.type(screen.getByLabelText("購入店"), "（入力中）");
      await user.click(screen.getByRole("button", { name: "2026/10/05 の購入記録を編集" }));

      expect(screen.getByLabelText(/購入日/)).toHaveValue("2026-10-05");
      expect(screen.getByLabelText("購入店")).toHaveValue("");
    });

    it("入力エラーは入力欄の下に表示し、フォームを開いたままにする", async () => {
      vi.mocked(updatePurchase).mockRejectedValue(
        new ApiError(422, [
          {
            type: "less_than_equal",
            loc: ["body", "amount"],
            msg: "金額は10000000以下で入力してください",
          },
        ]),
      );
      const { user, purchases } = renderSection(PURCHASES);

      await user.click(screen.getByRole("button", { name: "2026/10/01 の購入記録を編集" }));
      await user.click(screen.getByRole("button", { name: "保存する" }));

      expect(await screen.findByText("金額は10000000以下で入力してください")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "保存する" })).toBeEnabled();
      expect(purchases.reload).not.toHaveBeenCalled();
    });
  });

  describe("削除", () => {
    const PURCHASES: ApiDataState<Purchase[]> = {
      status: "success",
      data: [
        makePurchase({ id: 2, purchased_on: "2026-10-05", amount: 550 }),
        makePurchase({ id: 1, purchased_on: "2026-10-01", amount: 1078 }),
      ],
    };

    afterEach(() => {
      vi.mocked(deletePurchase).mockReset();
    });

    it("行の「削除」で確認を出し、「削除する」で削除して取り直す", async () => {
      vi.mocked(deletePurchase).mockResolvedValue();
      const { user, purchases } = renderSection(PURCHASES);

      await user.click(screen.getByRole("button", { name: "2026/10/01 の購入記録を削除" }));
      expect(screen.getByText(/この購入記録を削除しますか？/)).toHaveTextContent(
        "書籍費の集計からも消え",
      );
      await user.click(screen.getByRole("button", { name: "削除する" }));

      expect(deletePurchase).toHaveBeenCalledWith(1);
      expect(await screen.findByRole("status")).toHaveTextContent("購入記録を削除しました");
      expect(purchases.reload).toHaveBeenCalledTimes(1);
    });

    it("「やめる」で確認を閉じ、削除しない", async () => {
      const { user } = renderSection(PURCHASES);

      await user.click(screen.getByRole("button", { name: "2026/10/01 の購入記録を削除" }));
      await user.click(screen.getByRole("button", { name: "やめる" }));

      expect(screen.queryByText(/この購入記録を削除しますか？/)).not.toBeInTheDocument();
      expect(deletePurchase).not.toHaveBeenCalled();
    });

    it("削除に失敗したら確認の中にエラーを表示し、もう一度押せるようにする", async () => {
      vi.mocked(deletePurchase).mockRejectedValue(
        new ApiError(404, [
          {
            type: "not_found",
            loc: ["path", "purchase_id"],
            msg: "ID 1 の購入記録は見つかりません",
          },
        ]),
      );
      const { user, purchases } = renderSection(PURCHASES);

      await user.click(screen.getByRole("button", { name: "2026/10/01 の購入記録を削除" }));
      await user.click(screen.getByRole("button", { name: "削除する" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("ID 1 の購入記録は見つかりません");
      expect(screen.getByRole("button", { name: "削除する" })).toBeEnabled();
      expect(purchases.reload).not.toHaveBeenCalled();
    });

    it("編集中の購入記録を削除したら、編集のフォームも閉じる", async () => {
      vi.mocked(deletePurchase).mockResolvedValue();
      const { user } = renderSection(PURCHASES);

      await user.click(screen.getByRole("button", { name: "2026/10/01 の購入記録を編集" }));
      await user.click(screen.getByRole("button", { name: "2026/10/01 の購入記録を削除" }));
      await user.click(screen.getByRole("button", { name: "削除する" }));

      await screen.findByRole("status");
      expect(screen.queryByRole("button", { name: "保存する" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "購入記録を追加" })).toBeInTheDocument();
    });
  });
});
