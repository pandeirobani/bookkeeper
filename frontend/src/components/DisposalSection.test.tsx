import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateDisposal } from "../api/books.ts";
import { ApiError } from "../api/client.ts";
import { makeBook } from "../test/fixtures.ts";
import DisposalSection from "./DisposalSection.tsx";

vi.mock("../api/books.ts", () => ({
  updateDisposal: vi.fn(),
}));

describe("DisposalSection", () => {
  beforeEach(() => {
    // 「今日」を固定する。日付の入力欄の初期値に使う
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 12, 8, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(updateDisposal).mockReset();
  });

  it("手元にある本は、今日の日付を入れた入力欄を表示する", () => {
    render(<DisposalSection book={makeBook()} onChanged={vi.fn()} />);

    expect(screen.getByLabelText("手放した日", { selector: "input" })).toHaveValue("2026-10-12");
    expect(screen.getByRole("button", { name: "手放したことを記録する" })).toBeInTheDocument();
  });

  it("手放した日を送り、記録したことを伝えて本を取り直す", async () => {
    vi.mocked(updateDisposal).mockResolvedValue(makeBook({ disposed_on: "2026-10-01" }));
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<DisposalSection book={makeBook({ id: 7 })} onChanged={onChanged} />);

    const input = screen.getByLabelText("手放した日", { selector: "input" });
    await user.clear(input);
    await user.type(input, "2026-10-01");
    await user.click(screen.getByRole("button", { name: "手放したことを記録する" }));

    expect(updateDisposal).toHaveBeenCalledWith(7, "2026-10-01");
    expect(await screen.findByRole("status")).toHaveTextContent("手放した日を記録しました");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("手放した本は手放した日と「手元に戻す」ボタンを表示し、null を送って戻す", async () => {
    vi.mocked(updateDisposal).mockResolvedValue(makeBook());
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(
      <DisposalSection
        book={makeBook({ id: 7, disposed_on: "2026-10-01" })}
        onChanged={onChanged}
      />,
    );

    expect(screen.getByText("2026/10/01 に手放しました。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "手元に戻す" }));

    expect(updateDisposal).toHaveBeenCalledWith(7, null);
    expect(await screen.findByRole("status")).toHaveTextContent("手元に戻しました");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("記録した後に本を取り直しても、記録したことを伝え続ける", async () => {
    vi.mocked(updateDisposal).mockResolvedValue(makeBook({ disposed_on: "2026-10-01" }));
    const user = userEvent.setup();
    const { rerender } = render(<DisposalSection book={makeBook()} onChanged={vi.fn()} />);

    const input = screen.getByLabelText("手放した日", { selector: "input" });
    await user.clear(input);
    await user.type(input, "2026-10-01");
    await user.click(screen.getByRole("button", { name: "手放したことを記録する" }));
    await screen.findByRole("status");
    rerender(
      <DisposalSection book={makeBook({ disposed_on: "2026-10-01" })} onChanged={vi.fn()} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("手放した日を記録しました");
  });

  it("記録した後に、購入記録の追加などで手元に戻ったら、記録したことの表示を消す", async () => {
    vi.mocked(updateDisposal).mockResolvedValue(makeBook({ disposed_on: "2026-10-01" }));
    const user = userEvent.setup();
    const { rerender } = render(<DisposalSection book={makeBook()} onChanged={vi.fn()} />);

    const input = screen.getByLabelText("手放した日", { selector: "input" });
    await user.clear(input);
    await user.type(input, "2026-10-01");
    await user.click(screen.getByRole("button", { name: "手放したことを記録する" }));
    await screen.findByRole("status");
    rerender(
      <DisposalSection book={makeBook({ disposed_on: "2026-10-01" })} onChanged={vi.fn()} />,
    );
    rerender(<DisposalSection book={makeBook({ disposed_on: null })} onChanged={vi.fn()} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "手放したことを記録する" })).toBeInTheDocument();
  });

  it("日付のエラーは入力欄の下に表示し、本は取り直さない", async () => {
    vi.mocked(updateDisposal).mockRejectedValue(
      new ApiError(422, [
        {
          type: "date_from_datetime_parsing",
          loc: ["body", "disposed_on"],
          msg: "手放した日はYYYY-MM-DDの形式で入力してください",
        },
      ]),
    );
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<DisposalSection book={makeBook()} onChanged={onChanged} />);

    await user.clear(screen.getByLabelText("手放した日", { selector: "input" }));
    await user.click(screen.getByRole("button", { name: "手放したことを記録する" }));

    // 空欄は null（手元に戻す）ではなく、空文字のまま送る
    expect(updateDisposal).toHaveBeenCalledWith(1, "");
    expect(
      await screen.findByLabelText("手放した日", { selector: "input" }),
    ).toHaveAccessibleDescription("手放した日はYYYY-MM-DDの形式で入力してください");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
