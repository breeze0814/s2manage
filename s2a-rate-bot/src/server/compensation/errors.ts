export class CompensationOrderConflictError extends Error {
  readonly status = 409;

  constructor(tradeNumber: string) {
    super(`订单 ${tradeNumber} 已兑换或正在处理，不能重复兑换`);
    this.name = "CompensationOrderConflictError";
  }
}
