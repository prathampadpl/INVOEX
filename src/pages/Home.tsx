import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ArrowRight, Calculator, FileCheck, FileCode, CheckCircle2, ChevronRight, Download, UploadCloud, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Home() {
  return (
    <div className="w-full">
      {/* Hero Section */}
      <div className="w-full max-w-7xl mx-auto px-6 pt-20 pb-16 lg:pt-32 lg:pb-24 grid lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-8 flex flex-col items-start text-left">
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold text-blue-600 bg-blue-50/50 border-blue-100">
            Built for Indian GST invoices
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-neutral-900 leading-[1.1]">
            AI-Powered Invoice Extraction for Indian Businesses
          </h1>
          <p className="text-xl text-neutral-600 max-w-lg">
            Upload handwritten, printed, or digital GST invoices. Get structured data in seconds.
          </p>
          <div className="flex items-center gap-4 pt-2">
            <Link to="/login" className={cn(buttonVariants({ size: "lg" }), "bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm gap-2 text-base px-6")}>
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-lg text-base px-6 bg-white")}>
              View Dashboard
            </Link>
          </div>

          <div className="flex divide-x pt-6">
            <div className="pr-10 text-center">
              <div className="text-2xl font-bold font-mono">100</div>
              <div className="text-sm font-medium text-neutral-500 uppercase tracking-wider mt-1">bills batch</div>
            </div>
            <div className="px-10 text-center">
              <div className="text-2xl font-bold font-mono">9</div>
              <div className="text-sm font-medium text-neutral-500 uppercase tracking-wider mt-1">GST checks</div>
            </div>
            <div className="pl-10 text-center">
              <div className="text-2xl font-bold font-mono">CSV</div>
              <div className="text-sm font-medium text-neutral-500 uppercase tracking-wider mt-1">Tally-ready</div>
            </div>
          </div>
        </div>

        {/* Hero Decorative Illustration */}
        <div className="relative mx-auto w-full max-w-lg">
          <div className="w-full absolute inset-0 bg-blue-400 rounded-2xl blur-3xl opacity-10"></div>
          
          <div className="bg-white border rounded-xl shadow-2xl p-6 md:p-8 transform rotate-3 flex flex-col gap-6 relative z-10 w-full">
            <div className="w-24 h-4 bg-slate-900 rounded-full"></div>
            <div className="w-48 h-3 bg-slate-200 rounded-full"></div>
            
            <div className="absolute top-6 right-6 border border-green-200 bg-green-50 text-green-700 font-medium px-3 py-1 rounded-full text-sm">
              94.5%
            </div>

            <div className="space-y-4 pt-4">
               <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                 <span>Vendor GSTIN</span>
                 <div className="w-40 h-8 bg-slate-100 rounded"></div>
               </div>
               <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                 <span>Invoice Number</span>
                 <div className="w-40 h-8 bg-slate-100 rounded"></div>
               </div>
               <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                 <span>CGST + SGST</span>
                 <div className="w-40 h-8 bg-slate-100 rounded"></div>
               </div>
               <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                 <span>Grand Total</span>
                 <div className="w-40 h-8 bg-slate-100 rounded"></div>
               </div>
            </div>

            <div className="mt-4 border border-green-200 bg-green-50 text-green-700 font-medium p-4 rounded-lg flex items-center gap-3">
              Math checks passed 9/9
            </div>
          </div>

          <div className="absolute -bottom-10 -right-10 bg-orange-50 border border-orange-200 rounded-xl p-4 shadow-lg flex flex-col gap-2 transform -rotate-2 z-20 max-w-[240px]">
            <div className="flex items-center gap-2 text-orange-700 font-semibold text-sm">
              <Edit3 className="w-4 h-4" />
              Handwriting lesson saved
            </div>
            <p className="text-orange-900/80 text-xs">Digit 7 looks like 1 in this vendor's rate column.</p>
          </div>
        </div>
      </div>

      {/* Workflow Section */}
      <div className="bg-white border-t py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12">
            <h3 className="text-blue-600 font-bold tracking-wider text-xs uppercase mb-3">Core Workflow</h3>
            <h2 className="text-4xl font-extrabold text-neutral-900 tracking-tight">From messy bills to clean GST data.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-6">
             <Card className="shadow-sm border-gray-200 bg-white p-6 space-y-4 rounded-xl">
                <div className="bg-blue-50 w-12 h-12 rounded-lg flex items-center justify-center text-blue-600">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Math Validation</h3>
                  <p className="text-gray-500 text-sm">Catch errors before they reach your accountant</p>
                </div>
             </Card>
             <Card className="shadow-sm border-gray-200 bg-white p-6 space-y-4 rounded-xl">
                <div className="bg-blue-50 w-12 h-12 rounded-lg flex items-center justify-center text-blue-600">
                  <FileCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Self-Learning</h3>
                  <p className="text-gray-500 text-sm">Gets smarter with every correction. No retraining needed.</p>
                </div>
             </Card>
             <Card className="shadow-sm border-gray-200 bg-white p-6 space-y-4 rounded-xl">
                <div className="bg-blue-50 w-12 h-12 rounded-lg flex items-center justify-center text-blue-600">
                  <Download className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Tally-Ready Export</h3>
                  <p className="text-gray-500 text-sm">One-click CSV export for Tally and Excel</p>
                </div>
             </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
             <Card className="shadow-sm border-gray-200 bg-white p-6 pr-12 rounded-xl relative overflow-hidden">
                <div className="bg-slate-900 text-white w-10 h-10 rounded-lg flex items-center justify-center mb-12">
                   <UploadCloud className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-gray-500 mb-1">Step 1</div>
                <div className="font-bold text-gray-900 text-lg">Upload</div>
             </Card>
             <Card className="shadow-sm border-gray-200 bg-white p-6 pr-12 rounded-xl relative overflow-hidden">
                <div className="bg-slate-900 text-white w-10 h-10 rounded-lg flex items-center justify-center mb-12">
                   <FileCode className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-gray-500 mb-1">Step 2</div>
                <div className="font-bold text-gray-900 text-lg">AI Extracts</div>
             </Card>
             <Card className="shadow-sm border-gray-200 bg-white p-6 pr-12 rounded-xl relative overflow-hidden">
                <div className="bg-slate-900 text-white w-10 h-10 rounded-lg flex items-center justify-center mb-12">
                   <Edit3 className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-gray-500 mb-1">Step 3</div>
                <div className="font-bold text-gray-900 text-lg">Review & Correct</div>
             </Card>
             <Card className="shadow-sm border-gray-200 bg-white p-6 pr-12 rounded-xl relative overflow-hidden">
                <div className="bg-slate-900 text-white w-10 h-10 rounded-lg flex items-center justify-center mb-12">
                   <Download className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-gray-500 mb-1">Step 4</div>
                <div className="font-bold text-gray-900 text-lg">Export</div>
             </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
