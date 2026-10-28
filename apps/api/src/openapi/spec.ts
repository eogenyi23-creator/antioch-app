/**
 * OpenAPI 3.0 specification for the Antioch API.
 * Served at GET /docs via swagger-ui-express.
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Antioch API',
    version: '1.0.0',
    description:
      'Non-custodial USDC giving platform on Stellar. Builds unsigned Soroban transactions for client-side signing.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
        },
      },
      CampaignStatus: {
        type: 'string',
        enum: ['draft', 'published', 'active', 'completed', 'expired'],
      },
      DonationStatus: {
        type: 'string',
        enum: ['pending', 'confirmed', 'failed'],
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/challenge': {
      post: {
        tags: ['Auth'],
        summary: 'Request a sign challenge',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['stellarAddress'],
                properties: {
                  stellarAddress: { type: 'string', example: 'GDONER...' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Challenge issued' },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify signed challenge and issue tokens',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['stellarAddress', 'signedXdr'],
                properties: {
                  stellarAddress: { type: 'string' },
                  signedXdr: { type: 'string', description: 'Base64 XDR of signed challenge transaction' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'JWT tokens issued' },
          401: { description: 'Invalid signature or expired challenge' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate refresh token',
        security: [],
        responses: { 200: { description: 'New token pair' } },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout (client discards tokens)',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/campaigns': {
      get: {
        tags: ['Campaigns'],
        summary: 'List active campaigns',
        security: [],
        responses: { 200: { description: 'Array of campaigns' } },
      },
      post: {
        tags: ['Campaigns'],
        summary: 'Create a draft campaign (applicant)',
        responses: { 201: { description: 'Campaign created' } },
      },
    },
    '/campaigns/{id}': {
      get: {
        tags: ['Campaigns'],
        summary: 'Get campaign detail with on-chain state',
        security: [],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Campaign' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Campaigns'],
        summary: 'Update a draft campaign',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Updated campaign' } },
      },
    },
    '/campaigns/{id}/publish': {
      post: {
        tags: ['Campaigns'],
        summary: 'Publish campaign — deploys escrow contract (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Campaign published with contract ID' },
          422: { description: 'Trustline missing or invalid campaign' },
        },
      },
    },
    '/campaigns/{id}/transparency': {
      get: {
        tags: ['Campaigns'],
        summary: 'Public transparency page: all donations, approvals, releases',
        security: [],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Full on-chain history' } },
      },
    },
    '/campaigns/{id}/milestones': {
      get: {
        tags: ['Milestones'],
        summary: 'List milestones with on-chain approval counts',
        security: [],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Milestones' } },
      },
    },
    '/campaigns/{id}/milestones/{index}/evidence': {
      post: {
        tags: ['Milestones'],
        summary: 'Submit evidence for a milestone (applicant/beneficiary)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'index', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { 201: { description: 'Evidence recorded' } },
      },
      get: {
        tags: ['Milestones'],
        summary: 'View evidence and verifier assessment (approver/admin)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'index', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Evidence list' } },
      },
    },
    '/campaigns/{id}/milestones/{index}/approve': {
      post: {
        tags: ['Approvals'],
        summary: 'Build unsigned approve_milestone XDR (approver)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'index', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Unsigned XDR' } },
      },
    },
    '/campaigns/{id}/milestones/{index}/approve/submit': {
      post: {
        tags: ['Approvals'],
        summary: 'Record approval transaction hash',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'index', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Approval recorded' } },
      },
    },
    '/campaigns/{id}/milestones/{index}/release': {
      post: {
        tags: ['Approvals'],
        summary: 'Build unsigned release_milestone XDR (anyone — "Release now" button)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'index', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Unsigned XDR' } },
      },
    },
    '/campaigns/{id}/refund/init': {
      post: {
        tags: ['Refunds'],
        summary: 'Build unsigned refund XDR (donor, after expiry)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Unsigned XDR + estimated refund amount' } },
      },
    },
    '/campaigns/{id}/refund/submit': {
      post: {
        tags: ['Refunds'],
        summary: 'Record refund transaction hash',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/me/donations': {
      get: {
        tags: ['Me'],
        summary: 'Personal donation history',
        responses: { 200: { description: 'Array of donations' } },
      },
    },
    '/me/donations/export': {
      get: {
        tags: ['Me'],
        summary: 'Download donation history as CSV',
        responses: { 200: { description: 'CSV file' } },
      },
    },
    '/me/donations/{id}/receipt': {
      get: {
        tags: ['Me'],
        summary: 'Single donation receipt',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Receipt JSON' } },
      },
    },
    '/admin/campaigns': {
      get: {
        tags: ['Admin'],
        summary: 'All campaigns including drafts',
        responses: { 200: { description: 'Campaigns' } },
      },
    },
    '/admin/audit-log': {
      get: {
        tags: ['Admin'],
        summary: 'Audit log',
        responses: { 200: { description: 'Audit entries' } },
      },
    },
    '/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'User list',
        responses: { 200: { description: 'Users' } },
      },
    },
    '/admin/users/{id}/role': {
      patch: {
        tags: ['Admin'],
        summary: 'Change user role',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Updated user' } },
      },
    },
  },
};
