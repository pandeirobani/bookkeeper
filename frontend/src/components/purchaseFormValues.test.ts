import { describe, expect, it } from "vitest";
import { makePurchase } from "../test/fixtures.ts";
import {
  newPurchaseFormValues,
  toPurchaseFormValues,
  toPurchaseInput,
} from "./purchaseFormValues.ts";

describe("newPurchaseFormValues", () => {
  it("購入日だけを今日にし、ほかは空欄にする", () => {
    expect(newPurchaseFormValues("2026-10-12")).toEqual({
      purchased_on: "2026-10-12",
      amount: "",
      store: "",
      memo: "",
    });
  });
});

describe("toPurchaseFormValues", () => {
  it("登録済みの購入記録の値を入力欄の値にし、NULLは空欄にする", () => {
    expect(toPurchaseFormValues(makePurchase({ store: null, memo: null }))).toEqual({
      purchased_on: "2026-10-01",
      amount: "1980",
      store: "",
      memo: "",
    });
  });
});

describe("toPurchaseInput", () => {
  it("金額は整数の入力欄として変換し、ほかは入力したまま送る", () => {
    expect(
      toPurchaseInput({
        purchased_on: "2026-10-01",
        amount: "１９８０",
        store: " 書店 ",
        memo: "",
      }),
    ).toEqual({ purchased_on: "2026-10-01", amount: 1980, store: " 書店 ", memo: "" });
  });

  it("数字だけでない金額は、サーバーのエラーを出すため文字列のまま送る", () => {
    expect(
      toPurchaseInput({ purchased_on: "2026-10-01", amount: "千円", store: "", memo: "" }).amount,
    ).toBe("千円");
  });
});
