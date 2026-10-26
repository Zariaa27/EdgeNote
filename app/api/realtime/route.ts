import { handleRealtimeRequest } from "../../../src/server/realtime-handler";

export async function GET(request: Request): Promise<Response> {
  return handleRealtimeRequest(request);
}