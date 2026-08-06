import type { JsonTransport } from "./http.ts";
import type { LiandongOrder } from "./types.ts";

const ORDER_LIST_PATH = "/merchantApi/order/list";
const SUCCESS_CODE = 1;
const ALL_ORDER_STATUS = 999;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

type JsonRecord = Record<string, unknown>;

export async function findLiandongOrder(input: Readonly<{
  baseUrl: string;
  merchantToken: string;
  tradeNo: string;
  transport: JsonTransport;
}>): Promise<LiandongOrder | null> {
  const payload = await input.transport.request({
    url: orderEndpoint(input.baseUrl),
    headers: protocolHeaders(input.merchantToken),
    body: orderQuery(input.tradeNo),
  });
  const page = parseLiandongOrderPage(payload, { allowDataOnly: false });
  if (page.total === 0) return null;
  const order = page.list.find((item) => item.tradeNo === input.tradeNo);
  if (!order) throw new Error("接口返回了结果，但没有与输入订单号精确匹配的记录");
  return order;
}

function orderQuery(tradeNo: string) {
  return Object.freeze({
    current: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
    status: ALL_ORDER_STATUS,
    trade_no: tradeNo.trim(),
    contact: "",
    card_no: "",
    start_time: 0,
    end_time: 0,
    agent_id: null,
    parent_id: null,
  });
}

function protocolHeaders(merchantToken: string) {
  const token = merchantToken.trim();
  if (!token) throw new Error("merchantToken 不能为空");
  return Object.freeze({
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "content-type": "application/json",
    "merchant-token": token,
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
}

function orderEndpoint(baseUrl: string) {
  const url = new URL(baseUrl.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("联动小铺地址必须使用 HTTP 或 HTTPS");
  return new URL(ORDER_LIST_PATH, `${url.origin}/`).toString();
}

export function parseLiandongOrderPage(
  payload: unknown,
  options: Readonly<{ allowDataOnly?: boolean }> = {},
) {
  const response = record(payload, "响应");
  const allowDataOnly = options.allowDataOnly ?? true;
  const hasCode = Object.prototype.hasOwnProperty.call(response, "code");
  if (hasCode && response.code !== SUCCESS_CODE) {
    throw new Error(optionalText(response.msg) || `订单查询失败，code=${String(response.code)}`);
  }
  if (!hasCode && !allowDataOnly) throw new Error("联动订单接口响应缺少 code 字段");
  if (!hasCode && !Object.prototype.hasOwnProperty.call(response, "data")) {
    throw new Error("订单快照响应缺少 data 字段");
  }
  const data = record(response.data, "响应 data");
  if (!Array.isArray(data.list)) throw new Error("订单查询响应 data.list 不是数组");
  return Object.freeze({
    total: nonNegativeNumber(data.total, "data.total"),
    list: Object.freeze(data.list.map(parseOrder)),
  });
}

function parseOrder(value: unknown): LiandongOrder {
  const order = record(value, "订单");
  return Object.freeze({
    tradeNo: requiredText(order.trade_no, "trade_no"),
    goodsName: requiredText(order.goods_name, "goods_name"),
    quantity: nonNegativeNumber(order.quantity, "quantity"),
    totalAmount: finiteNumber(order.total_amount, "total_amount"),
    status: finiteNumber(order.status, "status"),
    createTime: nonNegativeNumber(order.create_time, "create_time"),
    successTime: optionalNumber(order.success_time, "success_time"),
    userId: nonNegativeNumber(order.user_id, "user_id"),
    sendout: finiteNumber(order.sendout, "sendout"),
    parentId: nonNegativeNumber(order.parent_id, "parent_id"),
    parentAmount: finiteNumber(order.parent_amount, "parent_amount"),
    identity: stringValue(order.identity, "identity"),
    goods: parseGoods(order.goods),
  });
}

function parseGoods(value: unknown) {
  const goods = record(value, "goods");
  return Object.freeze({
    id: nonNegativeNumber(goods.id, "goods.id"),
    goodsType: stringValue(goods.goods_type, "goods.goods_type"),
    goodsKey: stringValue(goods.goods_key, "goods.goods_key"),
    name: stringValue(goods.name, "goods.name"),
    description: stringValue(goods.description, "goods.description"),
    link: stringValue(goods.link, "goods.link"),
  });
}

function record(value: unknown, field: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} 不是对象`);
  return value as JsonRecord;
}

function requiredText(value: unknown, field: string) {
  const result = stringValue(value, field);
  if (!result) throw new Error(`订单字段 ${field} 不能为空`);
  return result;
}

function stringValue(value: unknown, field: string) {
  if (typeof value !== "string") throw new Error(`${field} 不是字符串`);
  return value;
}

function optionalText(value: unknown) { return typeof value === "string" ? value : ""; }

function finiteNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} 不是有效数字`);
  return value;
}

function nonNegativeNumber(value: unknown, field: string) {
  const result = finiteNumber(value, field);
  if (result < 0) throw new Error(`${field} 不能小于 0`);
  return result;
}

function optionalNumber(value: unknown, field: string) {
  return value === null || value === undefined || value === "" ? null : finiteNumber(value, field);
}
