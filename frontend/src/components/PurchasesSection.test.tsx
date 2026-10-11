import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.ts";
import type { Purchase } from "../api/purchases.ts";
import type { ApiData, ApiDataState } from "../hooks/useApiData.ts";
import { makeBook, makePurchase } from "../test/fixtures.ts";
import PurchasesSection from "./PurchasesSection.tsx";

function renderSection(state: ApiDataState<Purchase[]>) {
  const purchases: ApiData<Purchase[]> = { ...state, reload: vi.fn() };
  render(<PurchasesSection book={makeBook()} purchases={purchases} />);
  return purchases;
}

/** 表の本文の行を、セルの文字の配列にする */
function bodyRows(): string[][] {
  const [, body] = within(screen.getByRole("table", { name: "購入記録" })).getAllByRole("rowgroup");
  return within(body)
    .getAllByRole("row")
    .map((row) => Array.from(row.querySelectorAll("td"), (cell) => cell.textContent ?? ""));
}

describe("PurchasesSection", () => {
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
    renderSection({ status: "success", data: [] });

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
      error: new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    });

    expect(screen.getByRole("alert")).toHaveTextContent("サーバーに接続できません");
  });
});
