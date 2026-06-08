export async function POST(req) {
  const body = await req.json();
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:4002';

  const res = await fetch(`${backendUrl}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' }
  });
}

