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
  const { workspaceId, user, workspaceRole } = useAuth();
  const isAdmin = workspaceRole === 'owner' || workspaceRole === 'admin';
  const [rules, setRules] = useState<any[]>([]);
  
  const [conditionField, setConditionField] = useState('vendorName');
  const [conditionOperator, setConditionOperator] = useState('contains');
  const [conditionValue, setConditionValue] = useState('');
  const [actionField, setActionField] = useState('gstRate');
  const [actionValue, setActionValue] = useState('');
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);

  const [sapUrl, setSapUrl] = useState('');
  const [sapUsername, setSapUsername] = useState('');
  const [sapPassword, setSapPassword] = useState('');
  const [sapCompanyCode, setSapCompanyCode] = useState('');
  const [isSavingSap, setIsSavingSap] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    if (!isAdmin) return;
    const unsubscribe = onSnapshot(doc(db, `workspaces/${workspaceId}/secrets`, 'sap'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data) {
          setSapUrl(data.url || '');
          setSapUsername(data.username || '');
          setSapPassword(data.password || '');
          setSapCompanyCode(data.companyCode || '');
        }
      }
    }, (error) => console.error(error));
    return unsubscribe;
  }, [workspaceId, isAdmin]);

  useEffect(() => {
    if (!workspaceId) return;
    const q = query(collection(db, `workspaces/${workspaceId}/rules`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRules(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `workspaces/${workspaceId}/rules`));
    return unsubscribe;
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const membersQ = query(collection(db, `workspaces/${workspaceId}/members`));
    const unsubscribeMembers = onSnapshot(membersQ, (snapshot) => {
      setMembers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `workspaces/${workspaceId}/members`));
    return unsubscribeMembers;
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const invitesQ = query(collection(db, 'invites'), where('workspaceId', '==', workspaceId));
    const unsubscribeInvites = onSnapshot(invitesQ, (snapshot) => {
      setInvites(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invites'));
    return unsubscribeInvites;
  }, [workspaceId]);

  const handleAddRule = async () => {
    if (!workspaceId || !user) return;
    if (!conditionValue.trim() || !actionValue.trim()) {
      toast.error('Please enter both a match condition and an action value.');
      return;
    }
    
    try {
      await addDoc(collection(db, `workspaces/${workspaceId}/rules`), {
        workspaceId,
        conditionField,
        conditionOperator,
        conditionValue: conditionValue.trim(),
        actionField,
        actionValue: actionValue.trim(),
        createdBy: user.uid,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setConditionValue('');
      setActionValue('');
      toast.success("Rule created successfully!");
    } catch (error: any) {
      console.error("Failed to add rule", error);
      toast.error(error?.message || "Failed to create rule");
      handleFirestoreError(error, OperationType.CREATE, `workspaces/${workspaceId}/rules`);
    }
  };
  
  const handleDeleteRule = async (id: string) => {
    try {
      await deleteDoc(doc(db, `workspaces/${workspaceId}/rules`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `workspaces/${workspaceId}/rules/${id}`);
    }
  }

  const handleSaveSapConfig = async () => {
    if (!workspaceId) return;
    setIsSavingSap(true);
    try {
      await setDoc(doc(db, `workspaces/${workspaceId}/secrets`, 'sap'), {
        url: sapUrl,
        username: sapUsername,
        password: sapPassword,
        companyCode: sapCompanyCode
      }, { merge: true });
      toast.success("SAP credentials saved successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${workspaceId}/secrets/sap`);
    } finally {
      setIsSavingSap(false);
    }
  };

  const handleInvite = async () => {
    if (!workspaceId || !user || !inviteEmail) return;
    try {
      const { workspaceName: authOrgName } = useAuth.getState();
      await addDoc(collection(db, 'invites'), {
        workspaceId,
        workspaceName: authOrgName || 'Workspace',
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
      await deleteDoc(doc(db, `workspaces/${workspaceId}/members`, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `workspaces/${workspaceId}/members/${id}`);
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
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Workspace Settings</h1>

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
              <Button onClick={handleAddRule} className="w-full sm:w-auto" disabled={!isAdmin}>Create Rule</Button>
            </div>
          </div>
          
          <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white shadow-sm">
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
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors" onClick={() => handleDeleteRule(r.id)} disabled={!isAdmin}>Remove</Button>
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
          <CardTitle>SAP Integration</CardTitle>
          <p className="text-sm text-neutral-500">Configure your SAP ERP connection details to push verified invoices directly to your SAP system.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4 max-w-2xl">
            <div className="space-y-1.5">
              <Label>SAP OData URL</Label>
              <Input 
                value={sapUrl} 
                onChange={e => setSapUrl(e.target.value)} 
                placeholder="https://your-sap-host:port/sap/opu/odata/..." 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input 
                  value={sapUsername} 
                  onChange={e => setSapUsername(e.target.value)} 
                  placeholder="SAP Username" 
                />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input 
                  type="password"
                  value={sapPassword} 
                  onChange={e => setSapPassword(e.target.value)} 
                  placeholder="••••••••" 
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Company Code (Optional)</Label>
              <Input 
                value={sapCompanyCode} 
                onChange={e => setSapCompanyCode(e.target.value)} 
                placeholder="e.g. 1000" 
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveSapConfig} disabled={isSavingSap || !isAdmin}>
                {isSavingSap ? "Saving..." : "Save SAP Credentials"}
              </Button>
            </div>
            {!isAdmin && (
              <p className="text-xs text-amber-600 text-right mt-1">Only workspace admins can modify SAP credentials.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team Members & Invites</CardTitle>
          <p className="text-sm text-neutral-500">Invite people to your workspace. They will automatically join this workspace when they sign up with the matching email.</p>
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
            <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white shadow-sm">
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
            <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white shadow-sm">
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
