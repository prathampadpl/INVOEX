from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date

class InvoiceLineItem(BaseModel):
    material_description: str
    quantity: float
    unit_price: float
    hsn_sac_code: str

class Invoice(BaseModel):
    invoex_id: str
    vendor_name: str
    gstin: str
    invoice_number: str
    invoice_date: date
    due_date: Optional[date] = None
    line_items: List[InvoiceLineItem]
    cgst_amount: float = 0.0
    sgst_amount: float = 0.0
    igst_amount: float = 0.0
    total_amount: float
    currency: str = "INR"
    cost_center: Optional[str] = None
    gl_account: Optional[str] = None

class BatchInvoiceRequest(BaseModel):
    invoices: List[Invoice]

class InvoiceStatusResponse(BaseModel):
    invoex_id: str
    invoice_number: str
    vendor_name: str
    total_amount: float
    status: str  # "APPROVED", "PENDING", "FAILED"
    sap_document_number: Optional[str] = None
    error_message: Optional[str] = None
