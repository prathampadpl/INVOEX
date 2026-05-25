import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Calculator, FileCheck, FileCode, CheckCircle2, Download, UploadCloud, Edit3, Star, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Home() {
  return (
    <div className="w-full flex flex-col min-h-screen">
      {/* Hero Section */}
      <div className="w-full max-w-7xl mx-auto px-6 pt-20 pb-16 lg:pt-32 lg:pb-24 grid lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-8 flex flex-col items-start text-left">
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold text-blue-600 bg-blue-50/50 border-blue-100">
            Built for Indian GST invoices
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-neutral-900 leading-[1.1]">
            200 invoices into Tally. Zero typing. Before the 20th.
          </h1>
          <p className="text-xl text-neutral-600 max-w-lg">
            Upload any GST invoice — handwritten, printed, or scanned. INVOEX extracts everything and exports Tally-ready CSV instantly.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2 w-full sm:w-auto">
            <Link to="/login" className={cn(buttonVariants({ size: "lg" }), "bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm gap-2 text-base px-6 w-full sm:w-auto")}>
              Try Free — No Card Needed <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#how-it-works" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-lg text-base px-6 bg-white w-full sm:w-auto")}>
              See How It Works
            </a>
          </div>

          {/* Stats Bar */}
          <div className="flex flex-wrap divide-x pt-6 w-full">
            <div className="pr-6 sm:pr-10 text-center sm:text-left mb-4 sm:mb-0">
              <div className="text-2xl font-bold font-mono">11 min</div>
              <div className="text-xs sm:text-sm font-medium text-neutral-500 uppercase tracking-wider mt-1">Avg time for 100 invoices</div>
            </div>
            <div className="px-6 sm:px-10 text-center sm:text-left mb-4 sm:mb-0">
              <div className="text-2xl font-bold font-mono">9</div>
              <div className="text-xs sm:text-sm font-medium text-neutral-500 uppercase tracking-wider mt-1">GST compliance checks</div>
            </div>
            <div className="pl-6 sm:pl-10 text-center sm:text-left">
              <div className="text-2xl font-bold font-mono">0</div>
              <div className="text-xs sm:text-sm font-medium text-neutral-500 uppercase tracking-wider mt-1">Manual typing needed</div>
            </div>
          </div>
        </div>

        {/* Hero Decorative Illustration */}
        <div className="relative mx-auto w-full max-w-lg hidden lg:block">
          <div className="w-full absolute inset-0 bg-blue-400 rounded-2xl blur-3xl opacity-10"></div>
          
          <div className="bg-white border rounded-xl shadow-2xl p-6 md:p-8 transform rotate-3 flex flex-col gap-6 relative z-10 w-full">
            <div className="w-24 h-4 bg-slate-900 rounded-full"></div>
            <div className="w-48 h-3 bg-slate-200 rounded-full"></div>

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

      {/* Features Section */}
      <div className="bg-neutral-50 border-t border-b py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12 text-center lg:text-left">
            <h3 className="text-blue-600 font-bold tracking-wider text-xs uppercase mb-3">Why INVOEX?</h3>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-neutral-900 tracking-tight">Built specifically to solve CA headaches.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
             <Card className="shadow-sm border-gray-200 bg-white p-8 space-y-4 rounded-xl flex flex-col items-start text-left">
                <div className="bg-blue-50 w-14 h-14 rounded-lg flex items-center justify-center text-blue-600 mb-2">
                  <Download className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">One Click to Tally</h3>
                  <p className="text-gray-600 leading-relaxed">Exports a CSV your Tally accepts directly. No reformatting, no copy-paste, no junior errors.</p>
                </div>
             </Card>
             <Card className="shadow-sm border-gray-200 bg-white p-8 space-y-4 rounded-xl flex flex-col items-start text-left">
                <div className="bg-blue-50 w-14 h-14 rounded-lg flex items-center justify-center text-blue-600 mb-2">
                  <Calculator className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Zero Penalties</h3>
                  <p className="text-gray-600 leading-relaxed">Catches GST mismatches before you file. 9 auto-checks so you're never liable for vendor errors.</p>
                </div>
             </Card>
             <Card className="shadow-sm border-gray-200 bg-white p-8 space-y-4 rounded-xl flex flex-col items-start text-left">
                <div className="bg-blue-50 w-14 h-14 rounded-lg flex items-center justify-center text-blue-600 mb-2">
                  <FileCheck className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Remembers Your Vendors</h3>
                  <p className="text-gray-600 leading-relaxed">Sharma Traders mapped once, mapped forever. No re-teaching, no repeated corrections.</p>
                </div>
             </Card>
          </div>
        </div>
      </div>

      {/* Workflow Section */}
      <div id="how-it-works" className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16 text-center">
            <h3 className="text-blue-600 font-bold tracking-wider text-xs uppercase mb-3">Core Workflow</h3>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-neutral-900 tracking-tight">From messy bills to clean GST data.</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
             <Card className="shadow-sm border-gray-200 bg-white p-6 rounded-xl relative overflow-hidden flex flex-col items-center text-center">
                <div className="bg-slate-900 text-white w-12 h-12 rounded-full flex items-center justify-center mb-6 shadow-md">
                   <UploadCloud className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-blue-600 mb-2">Step 1</div>
                <div className="font-bold text-gray-900 text-lg mb-1">Upload</div>
                <div className="text-sm text-gray-500">(30 sec)</div>
             </Card>
             <Card className="shadow-sm border-gray-200 bg-white p-6 rounded-xl relative overflow-hidden flex flex-col items-center text-center">
                <div className="bg-slate-900 text-white w-12 h-12 rounded-full flex items-center justify-center mb-6 shadow-md">
                   <FileCode className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-blue-600 mb-2">Step 2</div>
                <div className="font-bold text-gray-900 text-lg mb-1">AI Extracts</div>
                <div className="text-sm text-gray-500">(45 sec)</div>
             </Card>
             <Card className="shadow-sm border-gray-200 bg-white p-6 rounded-xl relative overflow-hidden flex flex-col items-center text-center ring-2 ring-blue-100">
                <div className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center mb-6 shadow-md">
                   <Edit3 className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-blue-600 mb-2">Step 3</div>
                <div className="font-bold text-gray-900 text-lg mb-1">You verify</div>
                <div className="text-sm text-gray-500">(2 min)</div>
             </Card>
             <Card className="shadow-sm border-gray-200 bg-white p-6 rounded-xl relative overflow-hidden flex flex-col items-center text-center">
                <div className="bg-slate-900 text-white w-12 h-12 rounded-full flex items-center justify-center mb-6 shadow-md">
                   <Download className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-blue-600 mb-2">Step 4</div>
                <div className="font-bold text-gray-900 text-lg mb-1">Export</div>
                <div className="text-sm text-gray-500">Tally CSV ready</div>
             </Card>
          </div>
          
          <div className="mt-10 text-center">
            <p className="text-sm text-neutral-500 font-medium bg-neutral-100 inline-block px-4 py-2 rounded-full">
              <span className="text-blue-600 font-bold">AI catches 94.5% automatically.</span> You confirm the rest. You're always in control.
            </p>
          </div>
        </div>
      </div>

      {/* Social Proof Section */}
      <div className="bg-neutral-900 text-white py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-neutral-300 tracking-tight mb-12">Trusted by CA firms across India</h2>
          
          <div className="bg-neutral-800/50 border border-neutral-700 p-8 md:p-12 rounded-2xl relative">
            <div className="flex justify-center gap-1 mb-6 text-amber-400">
              <Star className="w-6 h-6 fill-current" />
              <Star className="w-6 h-6 fill-current" />
              <Star className="w-6 h-6 fill-current" />
              <Star className="w-6 h-6 fill-current" />
              <Star className="w-6 h-6 fill-current" />
            </div>
            <blockquote className="text-2xl md:text-3xl font-medium leading-tight mb-8">
              "We process 3x more clients now without hiring anyone. INVOEX took our most painful bottleneck and eliminated it."
            </blockquote>
            <div className="flex flex-col items-center">
              <div className="font-bold text-lg blur-[3px] select-none text-neutral-300">Gupta & Associates</div>
              <div className="text-neutral-500 text-sm blur-[2px] select-none">Chartered Accountants, Mumbai</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div className="bg-white py-24 border-b">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl lg:text-4xl font-extrabold text-neutral-900 tracking-tight">Simple Pricing. No Surprises.</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Starter */}
            <Card className="shadow-sm border-gray-200 bg-white flex flex-col rounded-2xl">
              <CardContent className="p-8 flex flex-col h-full">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Starter</h3>
                  <div className="mt-4 flex items-baseline text-4xl font-extrabold text-gray-900">
                    Free
                  </div>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> 20 invoices/month</li>
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> Basic GST extraction</li>
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> CSV export</li>
                </ul>
                <Link to="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full rounded-lg text-base")}>
                  Start Free
                </Link>
              </CardContent>
            </Card>

            {/* CA Professional */}
            <Card className="shadow-xl border-blue-600 bg-white flex flex-col rounded-2xl relative transform md:-translate-y-4">
              <div className="absolute top-0 inset-x-0 transform -translate-y-1/2 flex justify-center">
                <span className="bg-blue-600 text-white text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full">
                  Most Popular
                </span>
              </div>
              <CardContent className="p-8 flex flex-col h-full">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900">CA Professional</h3>
                  <div className="mt-4 flex items-baseline text-4xl font-extrabold text-gray-900">
                    ₹2,000
                    <span className="ml-1 text-xl font-medium text-gray-500">/month</span>
                  </div>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  <li className="flex items-center gap-3 text-gray-900 font-medium"><CheckCircle2 className="w-5 h-5 text-blue-600" /> Unlimited invoices</li>
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> All 9 GST checks</li>
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> Tally-ready export</li>
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> Math validation</li>
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> Priority support</li>
                </ul>
                <Link to="/login" className={cn(buttonVariants({ size: "lg" }), "w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base shadow-md")}>
                  Start Free Trial →
                </Link>
              </CardContent>
            </Card>

            {/* Firm Plan */}
            <Card className="shadow-sm border-gray-200 bg-white flex flex-col rounded-2xl">
              <CardContent className="p-8 flex flex-col h-full">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Firm Plan</h3>
                  <div className="mt-4 flex items-baseline text-4xl font-extrabold text-gray-900">
                    ₹6,000
                    <span className="ml-1 text-xl font-medium text-gray-500">/month</span>
                  </div>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> Everything in Professional</li>
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> 5 team members</li>
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> API access</li>
                  <li className="flex items-center gap-3 text-gray-500"><CheckCircle2 className="w-5 h-5 text-gray-300" /> SAP/ERP integration (coming soon)</li>
                  <li className="flex items-center gap-3 text-gray-600"><CheckCircle2 className="w-5 h-5 text-blue-600" /> Dedicated support</li>
                </ul>
                <a href="mailto:hello@invoex.com" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full rounded-lg text-base")}>
                  Talk to Us
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Trust Signals Bar */}
      <div className="bg-neutral-50 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap justify-center items-center gap-x-8 gap-y-4 text-sm font-medium text-neutral-500 text-center">
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-600" /> GST compliant</div>
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-600" /> Data encrypted</div>
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-600" /> Hosted in India</div>
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-600" /> Used by CAs filing ₹10Cr+ monthly</div>
        </div>
      </div>
    </div>
  );
}
