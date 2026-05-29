const { GoogleAuth } = require('google-auth-library');

async function main() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  
  const client = await auth.getClient();
  const projectId = 'gen-lang-client-00224039-a9ae1';
  
  // Get IAM Policy
  let res = await client.request({
    url: `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`,
    method: 'POST',
    data: {}
  });
  
  const policy = res.data;
  
  // Add roles/eventarc.eventReceiver to App Engine Service Account
  const sa = 'serviceAccount:gen-lang-client-00224039-a9ae1@appspot.gserviceaccount.com';
  
  // roles/eventarc.eventReceiver
  let binding = policy.bindings.find(b => b.role === 'roles/eventarc.eventReceiver');
  if (!binding) {
    binding = { role: 'roles/eventarc.eventReceiver', members: [] };
    policy.bindings.push(binding);
  }
  if (!binding.members.includes(sa)) {
    binding.members.push(sa);
  }

  // Also grant roles/datastore.user to the default compute service account just in case!
  const computeSa = 'serviceAccount:480987045009-compute@developer.gserviceaccount.com';
  let dsBinding = policy.bindings.find(b => b.role === 'roles/datastore.user');
  if (!dsBinding) {
    dsBinding = { role: 'roles/datastore.user', members: [] };
    policy.bindings.push(dsBinding);
  }
  if (!dsBinding.members.includes(computeSa)) {
    dsBinding.members.push(computeSa);
  }
  
  // Set IAM Policy
  res = await client.request({
    url: `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`,
    method: 'POST',
    data: {
      policy: policy
    }
  });
  
  console.log('Successfully updated IAM policy!');
}

main().catch(console.error);
