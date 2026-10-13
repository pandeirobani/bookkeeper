import { z } from "zod";
import { apiRequest } from "./client.ts";

// バックエンドの YearlyExpenseResponse（backend/app/schemas.py）と同じ形
const yearlyExpenseSchema = z.object({
  year: z.number().int(),
  /** 購入記録の金額の合計（円） */
  total: z.number().int(),
  /** 購入記録の件数 */
  count: z.number().int(),
});

export type YearlyExpense = z.infer<typeof yearlyExpenseSchema>;

// バックエンドの MonthlyExpenseResponse と同じ形
const monthlyExpenseSchema = z.object({
  month: z.number().int(),
  total: z.number().int(),
  count: z.number().int(),
});

export type MonthlyExpense = z.infer<typeof monthlyExpenseSchema>;

// バックエンドの YearExpenseDetailResponse と同じ形
const yearExpenseDetailSchema = z.object({
  year: z.number().int(),
  total: z.number().int(),
  count: z.number().int(),
  /** 1月から12月まで、購入のない月も含めて必ず12か月分 */
  months: z.array(monthlyExpenseSchema),
});

export type YearExpenseDetail = z.infer<typeof yearExpenseDetailSchema>;

// バックエンドの ExpensePurchaseResponse と同じ形
const expensePurchaseSchema = z.object({
  id: z.number().int(),
  purchased_on: z.iso.date(),
  amount: z.number().int(),
  store: z.string().nullable(),
  memo: z.string().nullable(),
  book: z.object({
    id: z.number().int(),
    title: z.string(),
    author: z.string().nullable(),
  }),
});

export type ExpensePurchase = z.infer<typeof expensePurchaseSchema>;

// バックエンドの MonthExpenseDetailResponse と同じ形
const monthExpenseDetailSchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  total: z.number().int(),
  count: z.number().int(),
  /** 購入日の古い順。同じ日の中は記録した順 */
  purchases: z.array(expensePurchaseSchema),
});

export type MonthExpenseDetail = z.infer<typeof monthExpenseDetailSchema>;

/** 購入記録のある年ごとの書籍費を、新しい年から順に取得する */
export function fetchYearlyExpenses(): Promise<YearlyExpense[]> {
  return apiRequest("/expenses/yearly", z.array(yearlyExpenseSchema));
}

/** 1年分の書籍費を、月ごとの内訳と一緒に取得する。購入記録のない年は全部0 */
export function fetchYearExpenses(year: number): Promise<YearExpenseDetail> {
  return apiRequest(`/expenses/yearly/${year}`, yearExpenseDetailSchema);
}

/** 1か月分の書籍費を、購入記録の明細と一緒に取得する。購入記録のない月は明細が空 */
export function fetchMonthExpenses(year: number, month: number): Promise<MonthExpenseDetail> {
  return apiRequest(`/expenses/yearly/${year}/months/${month}`, monthExpenseDetailSchema);
}
