import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteBook } from "../api/books.ts";
import { ApiError } from "../api/client.ts";
import { type Purchase, fetchPurchases } from "../api/purchases.ts";
import { useFlashMessage } from "../hooks/useFlashMessage.ts";
import { makeBook } from "../test/fixtures.ts";
import DeleteSection from "./DeleteSection.tsx";

vi.mock("../api/books.ts", () => ({
  deleteBook: vi.fn(),
}));
vi.mock("../api/purchases.ts", () => ({
  fetchPurchases: vi.fn(),
}));

function purchase(id: number, amount: number): Purchase {
  return {
    id,
    book_id: 7,
    purchased_on: "2026-10-01",
    amount,
    store: null,
    memo: null,
    created_at: "2026-10-12T03:00:00Z",
  };
}

/** 削除後に移る一覧画面の代わり。受け取ったメッセージを表示する */
function ListStub() {
  return <p>{`一覧画面 ${useFlashMessage() ?? ""}`}</p>;
}

/** 削除の欄を表示し、「この本を削除する…」を押して確認を開く */
async function openConfirmation() {
  render(
    <MemoryRouter initialEntries={["/books/7"]}>
      <Routes>
        <Route path="/" element={<ListStub />} />
        <Route path="/books/7" element={<DeleteSection book={makeBook({ id: 7 })} />} />
      </Routes>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "この本を削除する…" }));
  return user;
}

describe("DeleteSection", () => {
  afterEach(() => {
    vi.mocked(deleteBook).mockReset();
    vi.mocked(fetchPurchases).mockReset();
  });

  it("確認を開くまでは購入記録を取得しない", () => {
    render(
      <MemoryRouter>
        <DeleteSection book={makeBook()} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/手放した本は、削除せずに/)).toBeInTheDocument();
    expect(fetchPurchases).not.toHaveBeenCalled();
  });

  it("一緒に削除される購入記録の件数と合計金額を示す", async () => {
    vi.mocked(fetchPurchases).mockResolvedValue([purchase(1, 1980), purchase(2, 1980)]);
    await openConfirmation();

    expect(
      await screen.findByText(
        "購入記録 2件（合計 3,960円）も一緒に削除され、書籍費の集計からも消えます。",
      ),
    ).toBeInTheDocument();
    expect(fetchPurchases).toHaveBeenCalledWith(7);
  });

  it("購入記録がなければ、そのことを示す", async () => {
    vi.mocked(fetchPurchases).mockResolvedValue([]);
    await openConfirmation();

    expect(await screen.findByText("購入記録はありません。")).toBeInTheDocument();
  });

  it("削除したら一覧画面に移り、削除したことを伝える", async () => {
    vi.mocked(fetchPurchases).mockResolvedValue([]);
    vi.mocked(deleteBook).mockResolvedValue();
    const user = await openConfirmation();

    await screen.findByText("購入記録はありません。");
    await user.click(screen.getByRole("button", { name: "削除する" }));

    expect(deleteBook).toHaveBeenCalledWith(7);
    expect(await screen.findByText("一覧画面 「テスト書籍」を削除しました")).toBeInTheDocument();
  });

  it("「やめる」で確認を閉じ、削除しない", async () => {
    vi.mocked(fetchPurchases).mockResolvedValue([]);
    const user = await openConfirmation();

    await user.click(screen.getByRole("button", { name: "やめる" }));

    expect(screen.getByRole("button", { name: "この本を削除する…" })).toBeInTheDocument();
    expect(deleteBook).not.toHaveBeenCalled();
  });

  it("購入記録を確認している間と、確認できなかったときは削除できない", async () => {
    vi.mocked(fetchPurchases).mockRejectedValue(
      new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    );
    await openConfirmation();

    expect(screen.getByRole("button", { name: "削除する" })).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "購入記録を確認できないため、削除できません。",
    );
    expect(screen.getByRole("button", { name: "削除する" })).toBeDisabled();
  });

  it("削除に失敗したらエラーを表示し、もう一度押せるようにする", async () => {
    vi.mocked(fetchPurchases).mockResolvedValue([]);
    vi.mocked(deleteBook).mockRejectedValue(
      new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    );
    const user = await openConfirmation();

    await screen.findByText("購入記録はありません。");
    await user.click(screen.getByRole("button", { name: "削除する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
    expect(screen.getByRole("button", { name: "削除する" })).toBeEnabled();
  });
});
