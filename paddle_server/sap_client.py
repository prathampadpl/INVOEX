import os
import requests
from requests.auth import HTTPBasicAuth
from sap_models import Invoice, InvoiceStatusResponse

# Load from environment variables, typically set in .env or cloud config
SAP_ODATA_URL = os.environ.get("SAP_ODATA_URL", "https://your-sap-server.com/sap/opu/odata/sap/Z_INVOICE_SRV/Invoices")
SAP_USERNAME = os.environ.get("SAP_USERNAME", "sap_user")
SAP_PASSWORD = os.environ.get("SAP_PASSWORD", "sap_password")

def push_invoice_to_sap(invoice: Invoice) -> InvoiceStatusResponse:
    """
    Real implementation pushing an invoice to SAP via OData REST API.
    """
    # 1. Pre-validation checks
    if not invoice.gstin or len(invoice.gstin) < 5:
        return InvoiceStatusResponse(
            invoex_id=invoice.invoex_id,
            invoice_number=invoice.invoice_number,
            vendor_name=invoice.vendor_name,
            total_amount=invoice.total_amount,
            status="FAILED",
            error_message="Validation Error: Invalid or missing GSTIN."
        )

    if not invoice.cost_center and not invoice.gl_account:
        return InvoiceStatusResponse(
            invoex_id=invoice.invoex_id,
            invoice_number=invoice.invoice_number,
            vendor_name=invoice.vendor_name,
            total_amount=invoice.total_amount,
            status="FAILED",
            error_message="Validation Error: Must provide either Cost Center or GL Account."
        )
        
    # 2. Map payload to SAP OData format
    # This structure depends on your actual SAP Gateway OData Service definition
    sap_payload = {
        "Vendor": invoice.gstin, # Or a mapped SAP Vendor Code
        "InvoiceDate": invoice.invoice_date.isoformat() + "T00:00:00",
        "ReferenceDocument": invoice.invoice_number,
        "GrossAmount": str(invoice.total_amount),
        "Currency": invoice.currency,
        "CostCenter": invoice.cost_center or "",
        "GLAccount": invoice.gl_account or "",
        "TaxAmount": str(invoice.cgst_amount + invoice.sgst_amount + invoice.igst_amount),
        "InvoiceItems": [
            {
                "ItemText": item.material_description,
                "Quantity": str(item.quantity),
                "Amount": str(item.unit_price * item.quantity),
                "HSNCode": item.hsn_sac_code
            } for item in invoice.line_items
        ]
    }
    
    # 3. HTTP Request to SAP
    try:
        # Note: In real SAP OData, you usually need to fetch a CSRF token first using a GET request.
        # For brevity, assuming direct POST or token is handled by a middleware/proxy, 
        # or we fetch it here:
        session = requests.Session()
        session.auth = HTTPBasicAuth(SAP_USERNAME, SAP_PASSWORD)
        
        # Step A: Get CSRF Token
        head_resp = session.head(SAP_ODATA_URL, headers={"X-CSRF-Token": "Fetch"})
        csrf_token = head_resp.headers.get("X-CSRF-Token", "")
        
        # Step B: POST Invoice Data
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-CSRF-Token": csrf_token
        }
        
        # NOTE: For demonstration when SAP is not actually reachable, we catch ConnectionError
        # and return a simulated failure rather than crashing.
        response = session.post(SAP_ODATA_URL, json=sap_payload, headers=headers, timeout=10)
        
        if response.status_code in (200, 201):
            data = response.json()
            # Extract document number from SAP response
            doc_num = data.get("d", {}).get("SAPDocumentNumber", "UNKNOWN")
            return InvoiceStatusResponse(
                invoex_id=invoice.invoex_id,
                invoice_number=invoice.invoice_number,
                vendor_name=invoice.vendor_name,
                total_amount=invoice.total_amount,
                status="APPROVED",
                sap_document_number=doc_num
            )
        else:
            return InvoiceStatusResponse(
                invoex_id=invoice.invoex_id,
                invoice_number=invoice.invoice_number,
                vendor_name=invoice.vendor_name,
                total_amount=invoice.total_amount,
                status="FAILED",
                error_message=f"SAP Error {response.status_code}: {response.text[:100]}"
            )
            
    except requests.exceptions.RequestException as e:
        # If SAP is offline or connection fails (e.g. testing locally without VPN)
        # We simulate a specific network error message
        return InvoiceStatusResponse(
            invoex_id=invoice.invoex_id,
            invoice_number=invoice.invoice_number,
            vendor_name=invoice.vendor_name,
            total_amount=invoice.total_amount,
            status="FAILED",
            error_message=f"Connection Error: Could not reach SAP server at {SAP_ODATA_URL}. ({type(e).__name__})"
        )
