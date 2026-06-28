import { execFileSync } from "node:child_process";
import { ProxyAgent, fetch as undiciFetch } from "undici";

type TextResponse = {
  status: number;
  body: string;
  headers?: Record<string, string>;
};

type RequestOptions = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  proxyUrl?: string;
};

type Transport = "fetch" | "powershell";

const fallbackTransportByOrigin = new Map<string, Transport>();
const proxyAgentByUrl = new Map<string, ProxyAgent>();

function splitProxyUrl(proxyUrl?: string) {
  const url = proxyUrl?.trim();
  if (!url) return { uri: "", username: "", password: "" };
  try {
    const parsed = new URL(url);
    const username = parsed.username ? decodeURIComponent(parsed.username) : "";
    const password = parsed.password ? decodeURIComponent(parsed.password) : "";
    parsed.username = "";
    parsed.password = "";
    return { uri: parsed.toString(), username, password };
  } catch {
    return { uri: url, username: "", password: "" };
  }
}

function proxyAgentFor(proxyUrl?: string) {
  const url = proxyUrl?.trim();
  if (!url) return undefined;
  let agent = proxyAgentByUrl.get(url);
  if (!agent) {
    // undici's ProxyAgent does not read credentials embedded in the URI, so we
    // strip user:pass out and pass them explicitly as a Basic auth token.
    // Without this, proxies requiring auth respond with 407.
    const { uri, username, password } = splitProxyUrl(url);
    const token = username ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` : undefined;
    agent = new ProxyAgent(token ? { uri, token } : { uri });
    proxyAgentByUrl.set(url, agent);
  }
  return agent;
}

function base64Json(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function base64Text(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function requestBodyBytes(body?: string) {
  return body === undefined ? undefined : Buffer.from(body, "utf8");
}

function headersWithUtf8JsonCharset(headers?: Record<string, string>) {
  if (!headers) return undefined;
  const normalized = { ...headers };
  const contentTypeKey = Object.keys(normalized).find((key) => key.toLowerCase() === "content-type");
  if (!contentTypeKey) return normalized;

  const contentType = normalized[contentTypeKey];
  if (/^application\/json\b/i.test(contentType) && !/;\s*charset=/i.test(contentType)) {
    normalized[contentTypeKey] = `${contentType}; charset=utf-8`;
  }
  return normalized;
}

function shouldFallback(error: unknown) {
  if (!(error instanceof Error)) return false;
  const cause = "cause" in error ? (error as { cause?: { code?: string } }).cause : undefined;
  return error.name === "AbortError" || error.message === "fetch failed" || cause?.code === "UND_ERR_CONNECT_TIMEOUT";
}

function transportOverride(): Transport | "auto" {
  const value = process.env.S2A_HTTP_TRANSPORT?.toLowerCase();
  if (value === "fetch" || value === "powershell") return value;
  return "auto";
}

function originKey(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function formatRequestError(error: unknown, url: string) {
  if (!(error instanceof Error)) return String(error);
  const target = (() => {
    try {
      const parsed = new URL(url);
      return parsed.origin;
    } catch {
      return url;
    }
  })();
  const cause = "cause" in error ? (error as { cause?: { code?: string; message?: string } }).cause : undefined;

  if (error.name === "AbortError") return `请求 ${target} 超时`;
  if (cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
    return `连接 ${target} 超时。浏览器能访问但管理台连接失败时，通常是 Node 服务端没有走系统代理。请确认 HTTP_PROXY/HTTPS_PROXY，或检查服务器到目标站点的网络。`;
  }
  if (cause?.message) return `${error.message}: ${cause.message}`;
  return error.message;
}

function readPowerShellResponse(options: Required<Omit<RequestOptions, "body" | "proxyUrl">> & { body?: string; proxyUrl?: string }) {
  const timeoutSec = Math.max(1, Math.ceil(options.timeoutMs / 1000));
  const proxyParts = splitProxyUrl(options.proxyUrl);
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$headers = @{}
if ($env:S2A_REQ_HEADERS) {
  $headerJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:S2A_REQ_HEADERS))
  $parsedHeaders = $headerJson | ConvertFrom-Json
  foreach ($property in $parsedHeaders.PSObject.Properties) {
    $headers[$property.Name] = [string]$property.Value
  }
}
$params = @{
  Uri = $env:S2A_REQ_URL
  Method = $env:S2A_REQ_METHOD
  Headers = $headers
  TimeoutSec = [int]$env:S2A_REQ_TIMEOUT_SEC
  UseBasicParsing = $true
}
if ($env:S2A_REQ_PROXY) {
  $params.Proxy = $env:S2A_REQ_PROXY
  if ($env:S2A_REQ_PROXY_USER) {
    # Build the credential without ConvertTo-SecureString, which fails to load
    # on some trimmed PowerShell installs. NetworkCredential exposes a SecureString.
    $netCred = New-Object System.Net.NetworkCredential($env:S2A_REQ_PROXY_USER, $env:S2A_REQ_PROXY_PASS)
    $params.ProxyCredential = New-Object System.Management.Automation.PSCredential($env:S2A_REQ_PROXY_USER, $netCred.SecurePassword)
  }
}
if ($env:S2A_REQ_BODY -and $env:S2A_REQ_METHOD -ne 'GET') {
  $contentType = $headers['Content-Type']
  $headers.Remove('Content-Type')
  $params.Body = [Convert]::FromBase64String($env:S2A_REQ_BODY)
  $params.ContentType = if ($contentType) { $contentType } else { 'application/json; charset=utf-8' }
}
try {
  $response = Invoke-WebRequest @params
  $status = [int]$response.StatusCode
  $body = [string]$response.Content
  $responseHeaders = @{}
  foreach ($key in $response.Headers.Keys) {
    $value = $response.Headers[$key]
    if ($value -is [array]) {
      $responseHeaders[$key] = ($value -join [Environment]::NewLine)
    } else {
      $responseHeaders[$key] = [string]$value
    }
  }
} catch {
  if ($_.Exception.Response) {
    $response = $_.Exception.Response
    $status = [int]$response.StatusCode
    $responseHeaders = @{}
    foreach ($key in $response.Headers.Keys) {
      $value = $response.Headers[$key]
      if ($value -is [array]) {
        $responseHeaders[$key] = ($value -join [Environment]::NewLine)
      } else {
        $responseHeaders[$key] = [string]$value
      }
    }
    try {
      $stream = $response.GetResponseStream()
      $reader = [System.IO.StreamReader]::new($stream, [Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
    } catch {
      $body = $_.Exception.Message
    }
  } else {
    throw
  }
}
@{ status = $status; body = $body; headers = $responseHeaders } | ConvertTo-Json -Compress -Depth 4
`;

  const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      S2A_REQ_URL: options.url,
      S2A_REQ_METHOD: options.method,
      S2A_REQ_HEADERS: base64Json(options.headers),
      S2A_REQ_BODY: options.body ? base64Text(options.body) : "",
      S2A_REQ_TIMEOUT_SEC: String(timeoutSec),
      S2A_REQ_PROXY: proxyParts.uri,
      S2A_REQ_PROXY_USER: proxyParts.username,
      S2A_REQ_PROXY_PASS: proxyParts.password,
    },
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeoutMs + 2000,
  });
  return JSON.parse(output) as TextResponse;
}

export async function requestText(options: RequestOptions): Promise<TextResponse> {
  const timeoutMs = options.timeoutMs ?? 25_000;
  const origin = originKey(options.url);
  const override = transportOverride();
  const headers = headersWithUtf8JsonCharset(options.headers);
  const powerShellOptions = {
    method: options.method,
    url: options.url,
    headers: headers ?? {},
    body: options.body,
    timeoutMs,
    proxyUrl: options.proxyUrl,
  };

  if (process.platform === "win32" && (override === "powershell" || fallbackTransportByOrigin.get(origin) === "powershell")) {
    try {
      return readPowerShellResponse(powerShellOptions);
    } catch (error) {
      fallbackTransportByOrigin.delete(origin);
      if (override === "powershell") throw new Error(formatRequestError(error, options.url));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const dispatcher = proxyAgentFor(options.proxyUrl);
  try {
    // When a proxy is set, use undici's own fetch so it matches the installed
    // ProxyAgent. Node's global fetch is bound to its built-in undici and
    // rejects a dispatcher from the standalone package ("invalid onRequestStart").
    const res = dispatcher
      ? await undiciFetch(options.url, {
          method: options.method,
          headers,
          body: requestBodyBytes(options.body),
          signal: controller.signal,
          dispatcher,
        })
      : await fetch(options.url, {
          method: options.method,
          headers,
          body: requestBodyBytes(options.body),
          signal: controller.signal,
        });
    return { status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
  } catch (error) {
    if (override !== "fetch" && process.platform === "win32" && shouldFallback(error)) {
      try {
        const response = readPowerShellResponse(powerShellOptions);
        fallbackTransportByOrigin.set(origin, "powershell");
        return response;
      } catch (fallbackError) {
        throw new Error(formatRequestError(fallbackError, options.url));
      }
    }
    throw new Error(formatRequestError(error, options.url));
  } finally {
    clearTimeout(timer);
  }
}
