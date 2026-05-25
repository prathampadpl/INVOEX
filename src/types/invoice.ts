export interface LineItem {
  description?: string;
  hsnCode?: string;
  quantity?: number | string;
  unit?: string;
  rate?: number | string;
  discount?: number | string;
  discountType?: 'percent' | 'flat' | 'none';
  gstRate?: number | string;
  amount?: number | string;
  cgst?: number | string;
  sgst?: number | string;
  igst?: number | string;
}

export interface Invoice {
  id?: string;
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  status?: string;
  vendorName?: string;
  vendorAddress?: string;
  vendorGSTIN?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerGSTIN?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  paymentTerms?: string;
  taxableAmount?: number | string;
  cgst?: number | string;
  sgst?: number | string;
  igst?: number | string;
  gstRate?: number | string;
  roundOff?: number | string;
  grandTotal?: number | string;
  advancePaid?: number | string;
  balanceDue?: number | string;
  paymentMode?: string;
  lineItems?: LineItem[];
  confidenceScores?: Record<string, number>;
  doubtfulFields?: string[];
  modelVariant?: string;
  pages?: number[];
  errorDetails?: string;
  validationErrors?: string[];
  uploadedAt?: any; // Allow firebase timestamp
  [key: string]: any; // Allow index signature for dynamic access in component
}
