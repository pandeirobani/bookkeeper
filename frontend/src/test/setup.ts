import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals を無効にしているため、各テスト後の DOM 片付けを明示的に登録する
afterEach(() => {
  cleanup();
});
