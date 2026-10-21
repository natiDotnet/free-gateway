export type ChapaCurrency = 'USD' | 'UGX' | 'ETB' | 'DJF';

export interface ChapaCustomer {
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
}

export interface ChapaMeta {
  order_id?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface InitializeHostedPaymentRequest {
  amount: number | string;
  currency: ChapaCurrency;
  customer?: ChapaCustomer;
  merchant_reference?: string;
  preferred_payment_methods?: string[];
  subaccounts?: Array<{
    id: string;
    percentage?: number;
    amount?: number;
  }>;
  meta?: ChapaMeta;
  return_url?: string;
  cancel_url?: string;
  notification_url?: string;
}

export interface InitializeHostedPaymentResponse {
  status: string;
  message: string;
  data: {
    checkout_url: string;
    created_at: string;
    expires_at: string;
  };
}

export interface VerifyPaymentResponse {
  status: string;
  message: string;
  data: {
    reference: string;
    chapa_reference: string;
    amount: string | number;
    currency: string;
    status: string;
    customer: Record<string, unknown>;
    meta: Record<string, unknown>;
    created_at: string;
  };
}

export type ChapaEventType =
  | 'payment.success'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'payment.incomplete'
  | 'payment.auth_needed'
  | 'payment.blocked';

export interface ChapaWebhookEvent {
  event: ChapaEventType;
  data: {
    reference: string;
    chapa_reference: string;
    amount: string | number;
    currency: string;
    status: string;
    customer: Record<string, unknown>;
    meta: Record<string, unknown>;
  };
}

export interface ChapaClientConfig {
  secretKey: string;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://api.chapa.global';

export class ChapaClient {
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(config: ChapaClientConfig) {
    if (!config.secretKey) {
      throw new Error('CHAPA_SECRET_KEY is required');
    }
    this.secretKey = config.secretKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Initialize a hosted checkout session and receive a checkout_url.
   * POST /v2/payments/hosted
   */
  async initializeHostedPayment(
    request: InitializeHostedPaymentRequest
  ): Promise<InitializeHostedPaymentResponse> {
    const res = await fetch(`${this.baseUrl}/v2/payments/hosted`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(request),
    });

    const body = (await res.json()) as any;

    if (!res.ok) {
      throw new Error(
        body?.message ?? `Chapa initialization failed (${res.status})`
      );
    }

    return body as InitializeHostedPaymentResponse;
  }

  /**
   * Verify a transaction server-side.
   * GET /v2/payments/{reference}/verify
   */
  async verifyPayment(reference: string): Promise<VerifyPaymentResponse> {
    const res = await fetch(
      `${this.baseUrl}/v2/payments/${encodeURIComponent(reference)}/verify`,
      {
        method: 'GET',
        headers: this.headers(),
      }
    );

    const body = (await res.json()) as any;

    if (!res.ok) {
      throw new Error(
        body?.message ?? `Chapa verification failed (${res.status})`
      );
    }

    return body as VerifyPaymentResponse;
  }
}

/**
 * Build a ChapaClient from environment variables.
 * Reads CHAPA_SECRET_KEY (and optionally CHAPA_BASE_URL).
 */
export function createChapaClientFromEnv(): ChapaClient {
  return new ChapaClient({
    secretKey: process.env.CHAPA_SECRET_KEY ?? '',
    baseUrl: process.env.CHAPA_BASE_URL,
  });
}
