import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const db = getFirestore();

export const assistantChat = onCall({ region: 'us-central1', secrets: ['GEMINI_API_KEY'], timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to chat.');
  }

  const { messages } = request.data;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpsError('invalid-argument', 'Expected messages array.');
  }

  const uid = request.auth.uid;
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User not found.');
  }

  const userData = userDoc.data();
  const workspaceId = userData?.activeWorkspaceId;
  const plan = userData?.plan || 'free';
  const userName = userData?.displayName || request.auth.token?.email || 'User';

  if (!workspaceId) {
    throw new HttpsError('failed-precondition', 'No active workspace.');
  }

  // Get workspace context
  const workspaceDoc = await db.collection('workspaces').doc(workspaceId).get();
  const memberDoc = await db.collection(`workspaces/${workspaceId}/members`).doc(uid).get();
  const role = memberDoc.exists ? memberDoc.data()?.role : 'viewer';

  // Fetch some recent context
  const rulesSnap = await db.collection(`workspaces/${workspaceId}/rules`).get();
  const rules = rulesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const sapDoc = await db.collection(`workspaces/${workspaceId}/secrets`).doc('sap').get();
  const isSapConnected = sapDoc.exists && !!sapDoc.data()?.url;

  // Recent invoices count
  const invoicesSnap = await db.collection(`workspaces/${workspaceId}/invoices`)
    .orderBy('uploadedAt', 'desc')
    .limit(10)
    .get();
  const recentInvoices = invoicesSnap.docs.map(d => {
    const data = d.data();
    return { status: data.status, vendor: data.vendorName, amount: data.grandTotal };
  });

  const systemInstruction = `
You are INVOEX Assistant, an intelligent support chatbot embedded inside INVOEX — an AI-powered invoice processing and management platform for Indian businesses.

You have two core responsibilities:
1. Answer user questions about how INVOEX works
2. Help users make preference and configuration changes to their workspace

---

## YOUR CAPABILITIES

You can help users with:

### Understanding the Platform
- How invoice uploading, AI extraction, and review works
- What confidence scores and doubtful fields mean
- How the self-learning corrections system works
- How GST calculations (CGST, SGST, IGST, interstate vs intrastate) are handled
- How to read the dashboard, analytics, and export pages
- How multi-page PDFs and batch uploads are processed

### Workspace Preferences & Configuration
When a user asks to change something, collect the needed details and confirm before acting. Changes you can help with:
- Adding or modifying extraction rules (e.g. "always set GST rate to 18% for vendor X")
- Inviting or removing team members
- Changing a member's role (viewer -> admin)
- Updating SAP integration settings
- Configuring export preferences (CSV format, field mapping)
- Setting vendor-level correction preferences

### Troubleshooting
- Invoice stuck in "Extracting" or "Queued" status
- Wrong vendor name, GSTIN, or amounts being extracted
- Why a rule isn't applying
- Export not showing expected invoices
- SAP push failures and what the error codes mean

---

## HOW TO HANDLE CHANGE REQUESTS

When a user wants to make a configuration change, follow this pattern:

1. **Understand** — Ask one clarifying question if the request is ambiguous
2. **Confirm** — Summarize exactly what will change before doing anything
3. **Act** — Execute the change via the available tools
4. **Verify** — Confirm the change was applied and explain what happens next

---

## TONE & STYLE

- Be concise and direct — users are busy finance/ops professionals
- Use Indian business context naturally (GST, GSTIN, HSN codes, bilty, LR number are normal terms)
- When showing amounts, always format in INR (₹)
- Never ask more than one question at a time
- If you don't know something, say so clearly rather than guessing
- For destructive actions (deleting rules, removing members), always ask for explicit confirmation

---

## BOUNDARIES

- Do not discuss competitor products
- Do not make up invoice data or fabricate extraction results
- Do not perform actions the user's role doesn't permit (viewers cannot change rules or invite members)
- If a user asks about something outside INVOEX (general accounting advice, legal tax guidance), politely note you're focused on INVOEX-specific help and suggest they consult a CA

---

## CURRENT USER CONTEXT

Workspace ID: ${workspaceId}
User role: ${role}
User name: ${userName}
Plan: ${plan}
Connected integrations: SAP (${isSapConnected ? 'Connected' : 'Not Connected'})

Current Rules (${rules.length}):
${JSON.stringify(rules.slice(0, 5))}

Recent Invoices (${recentInvoices.length}):
${JSON.stringify(recentInvoices)}
  `.trim();

  // Initialize Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new HttpsError('internal', 'GEMINI_API_KEY is missing');
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const tools: any[] = [
    {
      functionDeclarations: [
        {
          name: "addExtractionRule",
          description: "Adds a new extraction rule for the workspace to automate data correction. E.g. Set GST to 18% when vendor name contains 'Reliance'.",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              conditionField: { type: SchemaType.STRING, description: "The field to check (e.g., 'vendorName', 'vendorGSTIN', 'buyerGSTIN')." },
              conditionOperator: { type: SchemaType.STRING, description: "The operator to use ('contains', 'equals', 'startsWith')." },
              conditionValue: { type: SchemaType.STRING, description: "The value to match against." },
              actionField: { type: SchemaType.STRING, description: "The field to set/modify (e.g., 'gstRate', 'taxableAmount', 'vendorName', 'cgst')." },
              actionValue: { type: SchemaType.STRING, description: "The value to set." }
            },
            required: ["conditionField", "conditionOperator", "conditionValue", "actionField", "actionValue"]
          }
        },
        {
          name: "inviteTeamMember",
          description: "Invites a new team member to the workspace via email.",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              email: { type: SchemaType.STRING, description: "The email address of the user to invite." },
              role: { type: SchemaType.STRING, description: "The role to assign ('admin', 'owner', or 'member')." }
            },
            required: ["email", "role"]
          }
        }
      ]
    }
  ];

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
    tools
  });

  // Split history up to the last message
  const history = messages.slice(0, -1);
  const chat = model.startChat({ history });

  const lastMessage = messages[messages.length - 1];
  let result;
  
  try {
    result = await chat.sendMessage(lastMessage.parts);
  } catch (err: any) {
    console.error("Gemini Chat Error:", err);
    throw new HttpsError('internal', "Failed to communicate with AI model.");
  }

  // Function calling loop
  let responseText = '';
  let attemptCount = 0;

  while (attemptCount < 5) {
    attemptCount++;
    const functionCalls = result.response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      let toolResponse: any = {};
      
      try {
        if (role !== 'admin' && role !== 'owner') {
           throw new Error("Permission Denied: Only admins and owners can perform configuration changes.");
        }

        if (call.name === 'addExtractionRule') {
           const args = call.args as any;
           await db.collection(`workspaces/${workspaceId}/rules`).add({
             workspaceId,
             ...args,
             createdBy: uid,
             createdAt: Date.now(),
             updatedAt: Date.now()
           });
           toolResponse = { success: true, message: "Rule successfully added to the workspace." };
        } else if (call.name === 'inviteTeamMember') {
           const args = call.args as any;
           const orgName = workspaceDoc.data()?.name || 'Workspace';
           await db.collection('invites').add({
             workspaceId,
             workspaceName: orgName,
             email: String(args.email).toLowerCase().trim(),
             role: args.role,
             status: 'pending',
             invitedBy: uid,
             createdAt: Date.now(),
             expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
           });
           toolResponse = { success: true, message: `Invite sent to ${args.email}.` };
        } else {
           toolResponse = { error: "Unknown function called." };
        }
      } catch (err: any) {
        toolResponse = { error: err.message };
      }

      // Send the result back to the model
      result = await chat.sendMessage([{
        functionResponse: {
          name: call.name,
          response: toolResponse
        }
      }]);
    } else {
      responseText = result.response.text();
      break;
    }
  }

  return { text: responseText };
});
