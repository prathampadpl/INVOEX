import { useState, useEffect } from 'react';
import { useAuth } from '@/src/lib/store';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, setDoc, where } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

export default function Settings() {
  const { orgId, user, orgRole } = useAuth();
  const isAdmin = orgRole === 'owner' || orgRole === 'admin';
  const [rules, setRules] = useState<any[]>([]);
  
  const [conditionField, setConditionField] = useState('vendorName');
  const [conditionOperator, setConditionOperator] = useState('contains');
  const [conditionValue, setConditionValue] = useState('');
  const [actionField, setActionField] = useState('gstRate');
  const [actionValue, setActionValue] = useState('');
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);

  useEffect(() => {
    if (!orgId) return;
    const q = query(collection(db, `organizations/${orgId}/rules`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRules(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `organizations/${orgId}/rules`));
    return unsubscribe;
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    const membersQ = query(collection(db, `organizations/${orgId}/members`));
    const unsubscribeMembers = onSnapshot(membersQ, (snapshot) => {
      setMembers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `organizations/${orgId}/members`));
    return unsubscribeMembers;
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    const invitesQ = query(collection(db, 'invites'), where('orgId', '==', orgId));
    const unsubscribeInvites = onSnapshot(invitesQ, (snapshot) => {
      setInvites(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invites'));
    return unsubscribeInvites;
  }, [orgId]);

  const handleAddRule = async () => {
    if (!orgId || !user) return;
    try {
      const docRef = doc(collection(db, `organizations/${orgId}/rules`));
      await setDoc(docRef, {
        orgId,
        conditionField,
        conditionOperator,
        conditionValue,
        actionField,
        actionValue,
        createdBy: user.uid,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setConditionValue('');
      setActionValue('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `organizations/${orgId}/rules`);
    }
  };
  
  const handleDeleteRule = async (id: string) => {
    try {
      await deleteDoc(doc(db, `organizations/${orgId}/rules`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `organizations/${orgId}/rules/${id}`);
    }
  }

  const handleInvite = async () => {
    if (!orgId || !user || !inviteEmail) return;
    try {
      const docRef = doc(collection(db, 'invites'));
      const { orgName: authOrgName } = useAuth.getState();
      await setDoc(docRef, {
        orgId,
        orgName: authOrgName || 'Organization',
        email: inviteEmail.toLowerCase().trim(),
        status: 'pending',
        invitedBy: user.uid,
        createdAt: Date.now()
      });
      setInviteEmail('');
      toast.success("Invite created for " + inviteEmail.trim());
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'invites');
    }
  };

  const handleRemoveMember = async (id: string) => {
    try {
      await deleteDoc(doc(db, `organizations/${orgId}/members`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `organizations/${orgId}/members/${id}`);
    }
  };

  const handleCancelInvite = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'invites', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invites/${id}`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Pricing Plan</CardTitle>
          <p className="text-sm text-neutral-500">Upgrade or manage your billing plan.</p>
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="border border-blue-600 bg-blue-50 rounded-lg p-4">
                 <h3 className="font-bold text-blue-900">Starter</h3>
                 <div className="text-xs text-blue-700 font-medium mb-2">Current Plan</div>
                 <div className="font-bold text-2xl text-blue-900 mb-1">$29<span className="text-sm font-medium text-blue-700">/mo</span></div>
                 <div className="text-sm text-blue-800">Up to 500 invoices/month</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 opacity-75 hover:opacity-100 transition-opacity cursor-pointer flex flex-col justify-between">
                 <div>
                    <h3 className="font-bold text-gray-900">Pro</h3>
                    <div className="font-bold text-2xl text-gray-900 mt-2 mb-1">$99<span className="text-sm font-medium text-gray-500">/mo</span></div>
                    <div className="text-sm text-gray-600">Up to 5,000 invoices/month</div>
                 </div>
                 <Button variant="outline" size="sm" className="w-full mt-4">Upgrade</Button>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 opacity-75 hover:opacity-100 transition-opacity cursor-pointer flex flex-col justify-between">
                 <div>
                    <h3 className="font-bold text-gray-900">Enterprise</h3>
                    <div className="font-bold text-2xl text-gray-900 mt-2 mb-1">Custom</div>
                    <div className="text-sm text-gray-600">Unlimited invoices</div>
                 </div>
                 <Button variant="outline" size="sm" className="w-full mt-4">Contact Sales</Button>
              </div>
           </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extraction Correction Rules</CardTitle>
          <p className="text-sm text-neutral-500">Define rules applied automatically to all uploaded invoices.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-12 gap-4 items-end bg-white p-5 border border-gray-200 rounded-lg shadow-sm">
            <div className="space-y-1.5 md:col-span-3">
              <Label className="text-xs font-semibold text-gray-500 uppercase">When</Label>
              <Select value={conditionField} onValueChange={setConditionField}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendorName">Vendor Name</SelectItem>
                  <SelectItem value="vendorGSTIN">Vendor GSTIN</SelectItem>
                  <SelectItem value="buyerGSTIN">Buyer GSTIN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-semibold text-gray-500 uppercase">Condition</Label>
              <Select value={conditionOperator} onValueChange={setConditionOperator}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="equals">Equals (Exact)</SelectItem>
                  <SelectItem value="startsWith">Starts With</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-7">
              <Label className="text-xs font-semibold text-gray-500 uppercase">Matches</Label>
              <Input value={conditionValue} onChange={e => setConditionValue(e.target.value)} placeholder="e.g. Reliance" />
            </div>
            
            <div className="space-y-1.5 md:col-span-3 mt-2">
              <Label className="text-xs font-semibold text-gray-500 uppercase">Then Set</Label>
              <Select value={actionField} onValueChange={setActionField}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gstRate">GST Rate</SelectItem>
                  <SelectItem value="vendorName">Vendor Name</SelectItem>
                  <SelectItem value="taxableAmount">Taxable Amount</SelectItem>
                  <SelectItem value="cgst">CGST</SelectItem>
                  <SelectItem value="sgst">SGST</SelectItem>
                  <SelectItem value="igst">IGST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-4 mt-2">
               <Label className="text-xs font-semibold text-gray-500 uppercase">To Value</Label>
               <Input value={actionValue} onChange={e => setActionValue(e.target.value)} placeholder="e.g. 18" />
            </div>
            <div className="md:col-span-5 flex justify-end mt-2 h-[40px]">
              <Button onClick={handleAddRule} className="w-full sm:w-auto">Create Rule</Button>
            </div>
          </div>
          
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="font-semibold text-gray-600">Condition</TableHead>
                  <TableHead className="font-semibold text-gray-600">Action</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                       <div className="flex items-center gap-1.5 text-sm">
                          <span className="text-gray-500">If</span>
                          <span className="font-medium bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{r.conditionField}</span>
                          <span className="text-gray-500">{r.conditionOperator}</span>
                          <span className="font-medium">"{r.conditionValue}"</span>
                       </div>
                    </TableCell>
                    <TableCell>
                       <div className="flex items-center gap-1.5 text-sm">
                          <span className="text-gray-500">Set</span>
                          <span className="font-medium bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{r.actionField}</span>
                          <span className="text-gray-500">to</span>
                          <span className="font-medium">"{r.actionValue}"</span>
                       </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors" onClick={() => handleDeleteRule(r.id)}>Remove</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-neutral-500 py-8">No custom rules defined.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team Members & Invites</CardTitle>
          <p className="text-sm text-neutral-500">Invite people to your organization. They will automatically join this organization when they sign up with the matching email.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {isAdmin && (
            <div className="flex gap-4 p-4 border rounded-lg bg-gray-50">
               <div className="flex-1">
                 <Label>Email Address</Label>
                 <Input type="email" placeholder="colleague@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
               </div>
               <div className="flex items-end">
                 <Button onClick={handleInvite}>Send Invite / Generate Link</Button>
               </div>
            </div>
          )}
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Active Members</h3>
              {!isAdmin && <span className="text-xs text-gray-500">Only admins can manage members.</span>}
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="font-semibold text-gray-600">User Email</TableHead>
                    <TableHead className="font-semibold text-gray-600">Role</TableHead>
                    {isAdmin && <TableHead className="text-right"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-gray-900">{m.email || m.id}</TableCell>
                      <TableCell>
                        <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider">{m.role || 'Member'}</span>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                           <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleRemoveMember(m.id)} disabled={m.role === 'owner'}>Remove</Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {members.length === 0 && <TableRow><TableCell colSpan={isAdmin ? 3 : 2} className="text-center text-neutral-500 py-4">No active members found.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Pending Invites</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="font-semibold text-gray-600">Email</TableHead>
                    <TableHead className="font-semibold text-gray-600">Status</TableHead>
                    {isAdmin && <TableHead className="text-right"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map(i => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium text-gray-900">{i.email}</TableCell>
                      <TableCell>
                        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider">Pending</span>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                           <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleCancelInvite(i.id)}>Cancel</Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {invites.length === 0 && <TableRow><TableCell colSpan={isAdmin ? 3 : 2} className="text-center text-neutral-500 py-4">No pending invites.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
