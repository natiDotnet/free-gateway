export type PaymentStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'incomplete'
  | 'auth_needed'
  | 'blocked';

export interface CustomerInfo {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
}

export interface PaymentRecord {
  id: string;
  merchantReference: string;
  chapaReference?: string;
  amount: number | string;
  currency: string;
  status: PaymentStatus;
  customer: CustomerInfo;
  meta: Record<string, unknown>;
  checkoutUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentInput {
  merchantReference: string;
  amount: number | string;
  currency: string;
  customer?: CustomerInfo;
  meta?: Record<string, unknown>;
  checkoutUrl?: string;
}

export interface PaymentStore {
  create(input: CreatePaymentInput): PaymentRecord;
  findByMerchantReference(merchantReference: string): PaymentRecord | undefined;
  findByChapaReference(chapaReference: string): PaymentRecord | undefined;
  findById(id: string): PaymentRecord | undefined;
  updateStatus(
    id: string,
    status: PaymentStatus,
    patch?: Partial<Pick<PaymentRecord, 'chapaReference'>>
  ): PaymentRecord | undefined;
  list(): PaymentRecord[];
}

export class InMemoryPaymentStore implements PaymentStore {
  private readonly byId = new Map<string, PaymentRecord>();
  private readonly byMerchantReference = new Map<string, string>();
  private readonly byChapaReference = new Map<string, string>();

  create(input: CreatePaymentInput): PaymentRecord {
    const now = new Date().toISOString();
    const id = input.merchantReference;
    const record: PaymentRecord = {
      id,
      merchantReference: input.merchantReference,
      amount: input.amount,
      currency: input.currency,
      status: 'pending',
      customer: input.customer ?? {},
      meta: input.meta ?? {},
      checkoutUrl: input.checkoutUrl,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(id, record);
    this.byMerchantReference.set(input.merchantReference, id);
    return record;
  }

  findByMerchantReference(merchantReference: string): PaymentRecord | undefined {
    const id = this.byMerchantReference.get(merchantReference);
    return id ? this.byId.get(id) : undefined;
  }

  findByChapaReference(chapaReference: string): PaymentRecord | undefined {
    const id = this.byChapaReference.get(chapaReference);
    return id ? this.byId.get(id) : undefined;
  }

  findById(id: string): PaymentRecord | undefined {
    return this.byId.get(id);
  }

  updateStatus(
    id: string,
    status: PaymentStatus,
    patch?: Partial<Pick<PaymentRecord, 'chapaReference'>>
  ): PaymentRecord | undefined {
    const record = this.byId.get(id);
    if (!record) return undefined;

    const updated: PaymentRecord = {
      ...record,
      status,
      updatedAt: new Date().toISOString(),
      ...(patch?.chapaReference ? { chapaReference: patch.chapaReference } : {}),
    };
    this.byId.set(id, updated);
    if (updated.chapaReference) {
      this.byChapaReference.set(updated.chapaReference, id);
    }
    return updated;
  }

  list(): PaymentRecord[] {
    return Array.from(this.byId.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export const paymentStore = new InMemoryPaymentStore();
