import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

interface LineItem {
  material_description: string;
  quantity: number;
  unit_price: number;
  hsn_sac_code: string;
}

interface InvoicePayload {
  invoex_id: string;
  vendor_name: string;
  vendor_account_number: string;
  gstin: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  line_items: LineItem[];
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  currency: string;
  cost_center?: string;
  gl_account?: string;
}

interface PushToSAPRequest {
  workspaceId: string;
  invoices: InvoicePayload[];
}

interface InvoiceStatusResponse {
  invoex_id: string;
  invoice_number: string;
  vendor_name: string;
  total_amount: number;
  status: 'APPROVED' | 'FAILED' | 'PENDING';
  sap_document_number?: string;
  error_message?: string;
}

export const pushToSAP = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request) => {
    // 1. Authenticate Request
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { workspaceId, invoices } = request.data as PushToSAPRequest;
    if (!workspaceId || !invoices || !Array.isArray(invoices)) {
      throw new HttpsError('invalid-argument', 'Missing workspaceId or invoices payload.');
    }

    // Check workspace membership
    const memberDoc = await db.collection('workspaces').doc(workspaceId).collection('members').doc(request.auth.uid).get();
    if (!memberDoc.exists) {
      throw new HttpsError('permission-denied', 'User is not a member of this workspace.');
    }

    // 2. Fetch Workspace SAP Config
    const sapDoc = await db.collection('workspaces').doc(workspaceId).collection('secrets').doc('sap').get();
    if (!sapDoc.exists) {
      throw new HttpsError('failed-precondition', 'SAP configuration is missing in the workspace secrets.');
    }

    const sapConfig = sapDoc.data();
    if (!sapConfig || !sapConfig.url || !sapConfig.username || !sapConfig.password) {
      throw new HttpsError('failed-precondition', 'SAP configuration is incomplete.');
    }

    const { url: SAP_ODATA_URL, username: SAP_USERNAME, password: SAP_PASSWORD } = sapConfig;

    const responses: InvoiceStatusResponse[] = [];

    // 3. Process each invoice
    for (const invoice of invoices) {
      // Pre-validation checks
      if (!invoice.gstin || invoice.gstin.length < 5) {
        responses.push({
          invoex_id: invoice.invoex_id,
          invoice_number: invoice.invoice_number,
          vendor_name: invoice.vendor_name,
          total_amount: invoice.total_amount,
          status: 'FAILED',
          error_message: 'Validation Error: Invalid or missing GSTIN.',
        });
        continue;
      }

      if (!invoice.cost_center && !invoice.gl_account) {
        invoice.gl_account = '610000'; // Default mock GL Account
      }

      // Map payload to SAP OData format
      const sapPayload = {
        Vendor: invoice.vendor_account_number || invoice.gstin,
        CompanyCode: sapConfig.companyCode || '',
        InvoiceDate: invoice.invoice_date ? `${invoice.invoice_date}T00:00:00` : '',
        ReferenceDocument: invoice.invoice_number,
        GrossAmount: String(invoice.total_amount),
        Currency: invoice.currency || 'INR',
        CostCenter: invoice.cost_center || '',
        GLAccount: invoice.gl_account || '',
        TaxAmount: String((invoice.cgst_amount || 0) + (invoice.sgst_amount || 0) + (invoice.igst_amount || 0)),
        InvoiceItems: invoice.line_items.map((item) => ({
          ItemText: item.material_description || '',
          Quantity: String(item.quantity || 0),
          Amount: String((item.unit_price || 0) * (item.quantity || 0)),
          HSNCode: item.hsn_sac_code || '',
        })),
      };

      try {
        const authHeader = 'Basic ' + Buffer.from(`${SAP_USERNAME}:${SAP_PASSWORD}`).toString('base64');

        // Step A: Get CSRF Token
        const headResp = await fetch(SAP_ODATA_URL, {
          method: 'HEAD',
          headers: {
            'X-CSRF-Token': 'Fetch',
            Authorization: authHeader,
          },
        });

        const csrfToken = headResp.headers.get('x-csrf-token') || '';

        // Step B: POST Invoice Data
        const response = await fetch(SAP_ODATA_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-Token': csrfToken,
            Authorization: authHeader,
          },
          body: JSON.stringify(sapPayload),
        });

        if (response.ok) {
          const data = await response.json();
          const docNum = data?.d?.SAPDocumentNumber || 'UNKNOWN';
          responses.push({
            invoex_id: invoice.invoex_id,
            invoice_number: invoice.invoice_number,
            vendor_name: invoice.vendor_name,
            total_amount: invoice.total_amount,
            status: 'APPROVED',
            sap_document_number: docNum,
          });
        } else {
          const errorText = await response.text();
          responses.push({
            invoex_id: invoice.invoex_id,
            invoice_number: invoice.invoice_number,
            vendor_name: invoice.vendor_name,
            total_amount: invoice.total_amount,
            status: 'FAILED',
            error_message: `SAP Error ${response.status}: ${errorText.substring(0, 100)}`,
          });
        }
      } catch (err: any) {
        responses.push({
          invoex_id: invoice.invoex_id,
          invoice_number: invoice.invoice_number,
          vendor_name: invoice.vendor_name,
          total_amount: invoice.total_amount,
          status: 'FAILED',
          error_message: `Connection Error: Could not reach SAP server at ${SAP_ODATA_URL}. (${err.message})`,
        });
      }
    }

    return responses;
  }
);
