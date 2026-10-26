import openNextWorker from "./.open-next/worker";
import { handleRealtimeRequest, type RealtimeBindings } from "./src/server/realtime-handler";

export { DocumentSession } from "./src/document-session";

export default {
  ...openNextWorker,
  async fetch(request: Request, env: RealtimeBindings, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname === "/api/realtime") {
      return handleRealtimeRequest(request, env);
    }
    return openNextWorker.fetch(request, env, ctx);
  },
};