import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteBook } from "../api/books.ts";
import { ApiError } from "../api/client.ts";
import type { Purchase } from "../api/purchases.ts";
import type { ApiDataState } from "../hooks/useApiData.ts";
import { useFlashMessage } from "../hooks/useFlashMessage.ts";
import { makeBook, makePurchase } from "../test/fixtures.ts";
import DeleteSection from "./DeleteSection.tsx";

vi.mock("../api/books.ts", () => ({
  deleteBook: vi.fn(),
}));

/** 削除後に移る一覧画面の代わり。受け取ったメッセージを表示する */
function ListStub() {
  return <p>{`一覧画面 ${useFlashMessage() ?? ""}`}</p>;
}

/** 削除の欄を表示し、「この本を削除する…」を押して確認を開く */
async function openConfirmation(purchases: ApiDataState<Purchase[]>) {
  render(
    <MemoryRouter initialEntries={["/books/7"]}>
      <Routes>
        <Route path="/" element={<ListStub />} />
        <Route
          path="/books/7"
          element={<DeleteSection book={makeBook({ id: 7 })} purchases={purchases} />}
        />
      </Routes>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "この本を削除する…" }));
  return user;
}

const NO_PURCHASES: ApiDataState<Purchase[]> = { status: "success", data: [] };

describe("DeleteSection", () => {
  afterEach(() => {
    vi.mocked(deleteBook).mockReset();
  });

  it("確認を開くまでは、手放した本への案内だけを表示する", () => {
    render(
      <MemoryRouter>
        <DeleteSection book={makeBook()} purchases={NO_PURCHASES} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/手放した本は、削除せずに/)).toBeInTheDocument();
    expect(screen.queryByText("購入記録はありません。")).not.toBeInTheDocument();
  });

  it("一緒に削除される購入記録の件数と合計金額を示す", async () => {
    await openConfirmation({
      status: "success",
      data: [makePurchase({ id: 1, amount: 1980 }), makePurchase({ id: 2, amount: 1980 })],
    });

    expect(
      screen.getByText(
        "購入記録 2件（合計 3,960円）も一緒に削除され、書籍費の集計からも消えます。",
      ),
    ).toBeInTheDocument();
  });

  it("購入記録がなければ、そのことを示す", async () => {
    await openConfirmation(NO_PURCHASES);

    expect(screen.getByText("購入記録はありません。")).toBeInTheDocument();
  });

  it("削除したら一覧画面に移り、削除したことを伝える", async () => {
    vi.mocked(deleteBook).mockResolvedValue();
    const user = await openConfirmation(NO_PURCHASES);

    await user.click(screen.getByRole("button", { name: "削除する" }));

    expect(deleteBook).toHaveBeenCalledWith(7);
    expect(await screen.findByText("一覧画面 「テスト書籍」を削除しました")).toBeInTheDocument();
  });

  it("「やめる」で確認を閉じ、削除しない", async () => {
    const user = await openConfirmation(NO_PURCHASES);

    await user.click(screen.getByRole("button", { name: "やめる" }));

    expect(screen.getByRole("button", { name: "この本を削除する…" })).toBeInTheDocument();
    expect(deleteBook).not.toHaveBeenCalled();
  });

  it("購入記録を確認している間は削除できない", async () => {
    await openConfirmation({ status: "loading" });

    expect(screen.getByText("購入記録を確認しています…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除する" })).toBeDisabled();
  });

  it("購入記録を確認できなかったときは削除できない", async () => {
    await openConfirmation({
      status: "error",
      error: new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "購入記録を確認できないため、削除できません。",
    );
    expect(screen.getByRole("button", { name: "削除する" })).toBeDisabled();
  });

  it("削除に失敗したらエラーを表示し、もう一度押せるようにする", async () => {
    vi.mocked(deleteBook).mockRejectedValue(
      new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    );
    const user = await openConfirmation(NO_PURCHASES);

    await user.click(screen.getByRole("button", { name: "削除する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
    expect(screen.getByRole("button", { name: "削除する" })).toBeEnabled();
  });
});
