import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BookInput } from "../api/books.ts";
import { ApiError } from "../api/client.ts";
import { type IsbnLookupResult, lookupIsbn } from "../api/isbnLookup.ts";
import { makeBook } from "../test/fixtures.ts";
import BookForm from "./BookForm.tsx";
import { type BookFormValues, toBookFormValues } from "./bookFormValues.ts";

vi.mock("../api/isbnLookup.ts", () => ({
  lookupIsbn: vi.fn(),
}));

// 登録・編集の送信そのものは BookCreatePage.test.tsx・BookEditPage.test.tsx で確かめる。
// ここでは ISBNからの取得を確かめる

const RESULT: IsbnLookupResult = {
  isbn: "9784480683212",
  title: "９９％の人が速くなる走り方",
  author: "平岩時雄",
  publisher: "筑摩書房",
  published_date: "2018-05-08",
  list_price: 924,
  cover_image_url: "https://cover.openbd.jp/9784480683212.jpg",
};

const SUCCESS_MESSAGE = "書誌情報を取得しました。内容を確認してください";

function renderForm({
  initialValues,
  onSubmit = vi.fn<(input: BookInput) => Promise<void>>().mockResolvedValue(undefined),
}: {
  initialValues?: BookFormValues;
  onSubmit?: (input: BookInput) => Promise<void>;
} = {}) {
  render(
    <MemoryRouter>
      <BookForm
        initialValues={initialValues}
        submitLabel="登録する"
        submittingLabel="登録中…"
        onSubmit={onSubmit}
      />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

function lookupButton() {
  return screen.getByRole("button", { name: "ISBNから取得" });
}

/** 結果を返すまで待たせる取得。取得中の表示を確かめるのに使う */
function deferLookup() {
  let resolve: (result: IsbnLookupResult) => void = () => {};
  vi.mocked(lookupIsbn).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  return (result: IsbnLookupResult) => resolve(result);
}

describe("BookForm の ISBNからの取得", () => {
  afterEach(() => {
    vi.mocked(lookupIsbn).mockReset();
  });

  it("ISBN欄に入力したままの値で取得し、結果を入力欄に入れる", async () => {
    vi.mocked(lookupIsbn).mockResolvedValue(RESULT);
    const user = renderForm();

    await user.type(screen.getByLabelText("ISBN"), "4-480-68321-6");
    await user.click(lookupButton());

    expect(lookupIsbn).toHaveBeenCalledWith("4-480-68321-6");
    expect(await screen.findByRole("status")).toHaveTextContent(SUCCESS_MESSAGE);
    // ISBN は ISBN-13 にそろえた値になる
    expect(screen.getByLabelText("ISBN")).toHaveValue("9784480683212");
    expect(screen.getByLabelText(/書名/)).toHaveValue("９９％の人が速くなる走り方");
    expect(screen.getByLabelText("著者")).toHaveValue("平岩時雄");
    expect(screen.getByLabelText("出版社")).toHaveValue("筑摩書房");
    expect(screen.getByLabelText("出版日")).toHaveValue("2018-05-08");
    expect(screen.getByLabelText("定価（税込・円）")).toHaveValue("924");
    expect(screen.getByLabelText("表紙画像のURL")).toHaveValue(
      "https://cover.openbd.jp/9784480683212.jpg",
    );
  });

  it("取得できなかった項目は、入力済みの値を残す", async () => {
    vi.mocked(lookupIsbn).mockResolvedValue({
      ...RESULT,
      list_price: null,
      cover_image_url: null,
    });
    const user = renderForm({ initialValues: toBookFormValues(makeBook()) });

    await user.click(lookupButton());

    expect(await screen.findByRole("status")).toHaveTextContent(SUCCESS_MESSAGE);
    expect(screen.getByLabelText(/書名/)).toHaveValue("９９％の人が速くなる走り方");
    expect(screen.getByLabelText("定価（税込・円）")).toHaveValue("1980");
    expect(screen.getByLabelText("表紙画像のURL")).toHaveValue("https://example.com/cover.jpg");
  });

  it("取得のボタンではフォームを送信しない", async () => {
    vi.mocked(lookupIsbn).mockResolvedValue(RESULT);
    const onSubmit = vi.fn<(input: BookInput) => Promise<void>>();
    const user = renderForm({ onSubmit });

    await user.click(lookupButton());

    await screen.findByRole("status");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("取得中は「取得中…」と表示し、取得も送信もできない", async () => {
    const resolveLookup = deferLookup();
    const user = renderForm();

    await user.click(lookupButton());

    expect(screen.getByRole("button", { name: "取得中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "登録する" })).toBeDisabled();

    resolveLookup(RESULT);

    expect(await screen.findByRole("status")).toHaveTextContent(SUCCESS_MESSAGE);
    expect(lookupButton()).toBeEnabled();
    expect(screen.getByRole("button", { name: "登録する" })).toBeEnabled();
  });

  it("送信中は取得できない", async () => {
    const onSubmit = vi
      .fn<(input: BookInput) => Promise<void>>()
      .mockReturnValue(new Promise(() => {}));
    const user = renderForm({ onSubmit });

    await user.type(screen.getByLabelText(/書名/), "テスト書籍");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(lookupButton()).toBeDisabled();
  });

  it("取得中に書き換えた入力欄のうち、取得できなかった項目は書き換えた値を残す", async () => {
    const resolveLookup = deferLookup();
    const user = renderForm();

    await user.click(lookupButton());
    await user.type(screen.getByLabelText("表紙画像のURL"), "https://example.com/mine.jpg");
    resolveLookup({ ...RESULT, cover_image_url: null });

    expect(await screen.findByRole("status")).toHaveTextContent(SUCCESS_MESSAGE);
    expect(screen.getByLabelText(/書名/)).toHaveValue("９９％の人が速くなる走り方");
    expect(screen.getByLabelText("表紙画像のURL")).toHaveValue("https://example.com/mine.jpg");
  });

  it.each([
    {
      description: "該当なし",
      error: new ApiError(404, [
        {
          type: "not_found",
          loc: ["query", "isbn"],
          msg: "このISBNの本は見つかりませんでした。書誌情報を手動で入力してください",
        },
      ]),
    },
    {
      description: "ISBNの誤り",
      error: new ApiError(422, [
        {
          type: "value_error",
          loc: ["query", "isbn"],
          msg: "ISBNが正しくありません。番号に入力ミスがないか確認してください",
        },
      ]),
    },
    {
      description: "取得の失敗",
      error: new ApiError(502, [
        {
          type: "lookup_failed",
          loc: [],
          msg: "書誌情報を取得できませんでした。時間をおいて試すか、手動で入力してください",
        },
      ]),
    },
    {
      description: "サーバーに接続できない",
      error: new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    },
  ])("$description のときはメッセージを出し、入力欄を変えない", async ({ error }) => {
    vi.mocked(lookupIsbn).mockRejectedValue(error);
    const initialValues = toBookFormValues(makeBook());
    const user = renderForm({ initialValues });

    await user.click(lookupButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(error.details[0].msg);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("ISBN")).toHaveValue(initialValues.isbn);
    expect(screen.getByLabelText(/書名/)).toHaveValue(initialValues.title);
    expect(lookupButton()).toBeEnabled();
  });

  it("取得し直すと、前回の取得のメッセージを消す", async () => {
    vi.mocked(lookupIsbn).mockResolvedValueOnce(RESULT);
    const user = renderForm();

    await user.click(lookupButton());
    await screen.findByRole("status");

    vi.mocked(lookupIsbn).mockRejectedValueOnce(
      new ApiError(0, [{ type: "network_error", loc: [], msg: "サーバーに接続できません" }]),
    );
    await user.click(lookupButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバーに接続できません");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("取得できたら、前回の送信のエラーを消す", async () => {
    const onSubmit = vi
      .fn<(input: BookInput) => Promise<void>>()
      .mockRejectedValue(
        new ApiError(422, [
          { type: "value_error", loc: ["body", "title"], msg: "書名を入力してください" },
        ]),
      );
    vi.mocked(lookupIsbn).mockResolvedValue(RESULT);
    const user = renderForm({ onSubmit });

    await user.click(screen.getByRole("button", { name: "登録する" }));
    expect(await screen.findByText("書名を入力してください")).toBeInTheDocument();

    await user.click(lookupButton());

    await screen.findByRole("status");
    expect(screen.queryByText("書名を入力してください")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/書名/)).toHaveAttribute("aria-invalid", "false");
  });
});
