import type { CompensationAssessment, CompensationRule, CompensationSummary } from "../../core/compensation.ts";

export type LiandongCredentials = Readonly<{ username: string; password: string }>;

export type CompensationOrderSource = "json" | "url";

export type LiandongMerchantProfile = Readonly<{
  id: number;
  username: string;
  nickname: string;
  sellCount: number;
}>;

export type LiandongOrder = Readonly<{
  tradeNo: string;
  goodsName: string;
  quantity: number;
  totalAmount: number;
  status: number;
  createTime: number;
  successTime: number | null;
  userId: number;
  sendout: number;
  parentId: number;
  parentAmount: number;
  identity: string;
  goods: Readonly<{
    id: number;
    goodsType: string;
    goodsKey: string;
    name: string;
    description: string;
    link: string;
  }>;
}>;

export type CompensationSettings = Readonly<{
  enabled: boolean;
  activityName: string;
  description: string;
  orderSource: CompensationOrderSource;
  baseUrl: string;
  username: string;
  password: string;
  rules: readonly CompensationRule[];
  updatedAt: string | null;
}>;

export type PublicCompensationSettings = Omit<CompensationSettings, "baseUrl" | "username" | "password">;
export type AdminCompensationSettings = Omit<CompensationSettings, "password"> & { readonly passwordConfigured: boolean };

export type CompensationOrderSourceCheck = Readonly<{
  source: CompensationOrderSource;
  name: string;
  orderCount: number | null;
}>;

export type CompensationResult = Readonly<{
  lineNumber: number;
  requestedTradeNo: string;
  status: "found" | "not_found" | "error";
  order?: Pick<LiandongOrder, "tradeNo" | "goodsName" | "totalAmount" | "createTime">;
  compensation?: CompensationAssessment;
  message?: string;
}>;

export type CompensationClaim = Readonly<{
  id: string;
  srcHost: string;
  sub2apiUserId: string;
  maskedEmail: string;
  storeName: string;
  status: "pending" | "completed" | "failed";
  results: readonly CompensationResult[];
  summary: CompensationSummary;
  redemptionCode: string | null;
  rewardCodeId: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type LiandongSession = Readonly<{
  merchantToken: string;
  profile: LiandongMerchantProfile;
}>;
