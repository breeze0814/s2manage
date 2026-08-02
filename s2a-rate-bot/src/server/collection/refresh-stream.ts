import type { CollectionRefreshProgressEvent, CollectionService } from "./service.ts";

export function createCollectionRefreshStream(service: CollectionService) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void service.refreshAllWithProgress((event) => controller.enqueue(encoder.encode(encodeEvent(event))))
        .then(() => controller.close())
        .catch((error) => controller.error(error));
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}

function encodeEvent(event: CollectionRefreshProgressEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
