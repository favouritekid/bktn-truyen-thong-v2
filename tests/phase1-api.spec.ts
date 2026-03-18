import { test, expect } from '@playwright/test';

test.describe('API - Channels', () => {
  test('GET /api/channels returns channels', async ({ request }) => {
    const res = await request.get('/api/channels');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.channels).toBeDefined();
    expect(Array.isArray(body.channels)).toBe(true);
    expect(body.channels.length).toBeGreaterThan(0);

    // Check channel structure
    const ch = body.channels[0];
    expect(ch).toHaveProperty('id');
    expect(ch).toHaveProperty('name');
    expect(ch).toHaveProperty('status');
    expect(ch).toHaveProperty('created_at');
  });

  test('POST /api/channels creates a channel', async ({ request }) => {
    const name = `API Test Channel ${Date.now()}`;
    const res = await request.post('/api/channels', {
      data: { name, description: 'Created by API test' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.channel.name).toBe(name);
    expect(body.channel.status).toBe('active');
  });

  test('POST /api/channels rejects empty name', async ({ request }) => {
    const res = await request.post('/api/channels', {
      data: { name: '', description: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/channels rejects duplicate name', async ({ request }) => {
    const res = await request.post('/api/channels', {
      data: { name: 'Facebook', description: '' },
    });
    expect(res.status()).toBe(409);
  });
});

test.describe('API - Campaigns', () => {
  test('GET /api/campaigns returns campaigns', async ({ request }) => {
    const res = await request.get('/api/campaigns');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.campaigns).toBeDefined();
    expect(Array.isArray(body.campaigns)).toBe(true);
  });

  test('POST /api/campaigns creates a campaign', async ({ request }) => {
    const name = `API Test Campaign ${Date.now()}`;
    const res = await request.post('/api/campaigns', {
      data: {
        name,
        description: 'Created by API test',
        channel_ids: [],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.campaign.name).toBe(name);
    expect(body.campaign.status).toBe('draft');
    expect(body.campaign.code).toMatch(/^C-\d{8}-\d{4}$/);
  });

  test('POST /api/campaigns rejects empty name', async ({ request }) => {
    const res = await request.post('/api/campaigns', {
      data: { name: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('PATCH /api/campaigns/:id status transition draft→active', async ({ request }) => {
    // Create a campaign first
    const createRes = await request.post('/api/campaigns', {
      data: { name: `Transition Test ${Date.now()}`, channel_ids: [] },
    });
    const { campaign } = await createRes.json();

    // Activate it
    const res = await request.patch(`/api/campaigns/${campaign.id}`, {
      data: { status: 'active' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.campaign.status).toBe('active');
  });

  test('PATCH /api/campaigns/:id rejects invalid transition', async ({ request }) => {
    // Create a draft campaign
    const createRes = await request.post('/api/campaigns', {
      data: { name: `Invalid Transition ${Date.now()}`, channel_ids: [] },
    });
    const { campaign } = await createRes.json();

    // Try to go from draft→ended (invalid)
    const res = await request.patch(`/api/campaigns/${campaign.id}`, {
      data: { status: 'ended' },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('API - Link Labels', () => {
  test('GET /api/link-labels returns labels', async ({ request }) => {
    const res = await request.get('/api/link-labels');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.link_labels).toBeDefined();
    expect(Array.isArray(body.link_labels)).toBe(true);
    expect(body.link_labels.length).toBeGreaterThan(0);
  });

  test('POST /api/link-labels creates a label', async ({ request }) => {
    const name = `API Test Label ${Date.now()}`;
    const res = await request.post('/api/link-labels', {
      data: { name },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.link_label.name).toBe(name);
    expect(body.link_label.is_active).toBe(true);
  });

  test('POST /api/link-labels rejects empty name', async ({ request }) => {
    const res = await request.post('/api/link-labels', {
      data: { name: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('PATCH /api/link-labels/:id toggles active', async ({ request }) => {
    // Create a label
    const createRes = await request.post('/api/link-labels', {
      data: { name: `Toggle Test ${Date.now()}` },
    });
    const { link_label } = await createRes.json();

    // Deactivate
    const res = await request.patch(`/api/link-labels/${link_label.id}`, {
      data: { is_active: false },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.link_label.is_active).toBe(false);
  });
});
