import { GET as handleOAuth } from '../route';

export const runtime = 'nodejs';
export async function GET(request: Request) { return handleOAuth(request); }
